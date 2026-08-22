"""Object-level permission enforcement — the per-object half of authorization.

COMPOSES WITH app/core/rbac.py, DOES NOT REPLACE IT. The role check answers
"may this user edit BOMs at all"; the grant check answers "…this one?". An
endpoint keeps its existing `require_engineering` / `require_viewer` and adds
`Depends(require_bom_edit)` — both must pass.

DEFAULT IS OPEN, AND THAT IS LOAD-BEARING. An object with zero grant rows
behaves exactly as it did before this feature existed: the role check alone
decides. Grants only ever NARROW access, and only for the specific object that
has them. Anything else would revoke every user's access to every BOM the
moment this deploys. `test_object_permissions.py` pins that.

Bypasses (both narrow, both deliberate):
  - isSuperuser — same escape hatch every other checker in this codebase has.
  - the BOM's own created_by — otherwise the first `POST /grants` a user makes
    locks them out of the BOM they just created.

Only "bom" is wired. Adding a resource type = pass a different string; do not
build a registry for it until there are three.
"""

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.bom import BOM
from app.models.resource_grant import GRANT_LEVELS, ResourceGrant
from app.models.team import TeamMember
from app.models.user import User


async def get_object_grants(
    db: AsyncSession, resource_type: str, resource_id: int
) -> list[ResourceGrant]:
    """Every grant on one object. Tenant-scoped automatically (ORM select)."""
    result = await db.execute(
        select(ResourceGrant).where(
            ResourceGrant.resourceType == resource_type,
            ResourceGrant.resourceId == resource_id,
        )
    )
    return list(result.scalars().all())


async def _user_team_ids(db: AsyncSession, user_id: int) -> set[int]:
    result = await db.execute(select(TeamMember.teamId).where(TeamMember.userId == user_id))
    return set(result.scalars().all())


async def grants_allow(
    db: AsyncSession, user: User, grants: list[ResourceGrant], required: str
) -> bool:
    """True if any of `grants` gives `user` (directly or via a team) >= required."""
    need = GRANT_LEVELS[required]
    team_ids = None
    for g in grants:
        if GRANT_LEVELS.get(g.level, 0) < need:
            continue
        if g.granteeType == "user" and g.granteeId == user.id:
            return True
        if g.granteeType == "team":
            if team_ids is None:
                team_ids = await _user_team_ids(db, user.id)
            if g.granteeId in team_ids:
                return True
    return False


async def user_has_object_level(
    db: AsyncSession, user: User, resource_type: str, resource_id: int, required: str
) -> bool:
    """True if `user` may act at `required` level on this object.

    True when the object is UNRESTRICTED (no grants) — see module docstring.
    """
    if user.isSuperuser:
        return True
    grants = await get_object_grants(db, resource_type, resource_id)
    return not grants or await grants_allow(db, user, grants, required)


class RequireBomLevel:
    """Dependency: the current user holds at least `level` on this BOM.

    Reads `bom_id` straight out of the path, so it drops into any
    `/{bom_id}/...` route as a decorator dependency with no signature change.
    """

    def __init__(self, level: str):
        assert level in GRANT_LEVELS
        self.level = level

    async def __call__(
        self,
        bom_id: int,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.isSuperuser:
            return current_user

        grants = await get_object_grants(db, "bom", bom_id)
        if not grants:
            # Unrestricted BOM — pre-feature behaviour, role check governs.
            # Deliberately no 404 here: a missing BOM stays the endpoint's/
            # service's job to report, exactly as before.
            return current_user

        bom = (await db.execute(select(BOM).where(BOM.id == bom_id))).scalar_one_or_none()
        if bom is not None and bom.created_by == current_user.id:
            return current_user

        if await grants_allow(db, current_user, grants, self.level):
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No '{self.level}' grant on BOM {bom_id}",
        )


require_bom_edit = RequireBomLevel("edit")
require_bom_manage = RequireBomLevel("manage")
