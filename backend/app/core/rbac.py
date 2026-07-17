"""RBAC Middleware - Role-based access control dependencies."""

from datetime import UTC

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.permission import Permission
from app.models.role import Role
from app.models.user import User

# Role hierarchy - higher roles inherit permissions from lower ones
ROLE_HIERARCHY = {
    "superadmin": ["admin", "engineering", "procurement", "finance", "viewer"],
    "admin": ["engineering", "procurement", "finance", "viewer"],
    "engineering": ["viewer"],
    "procurement": ["viewer"],
    "finance": ["viewer"],
    "viewer": [],
}


class RoleChecker:
    """Dependency class for checking user roles."""

    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    async def __call__(
        self,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        # Superusers bypass all role checks
        if current_user.isSuperuser:
            return current_user

        # Check user's roles
        result = await db.execute(
            select(Role).join(Role.users).where(Role.users.any(id=current_user.id))
        )
        user_roles = [r.name for r in result.scalars().all()]

        # Check if any of user's roles are in allowed_roles
        for role_name in user_roles:
            if role_name in self.allowed_roles:
                return current_user
            # Check role hierarchy
            inherited = ROLE_HIERARCHY.get(role_name, [])
            for inherited_role in inherited:
                if inherited_role in self.allowed_roles:
                    return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions. Required roles: {', '.join(self.allowed_roles)}",
        )


class PermissionChecker:
    """Dependency class for checking specific permissions."""

    def __init__(self, required_permissions: list[str]):
        self.required_permissions = required_permissions

    async def __call__(
        self,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        # Superusers bypass all permission checks
        if current_user.isSuperuser:
            return current_user

        # Get user's permissions through roles
        result = await db.execute(
            select(Permission)
            .join(Permission.roles)
            .where(Permission.roles.any(Role.users.any(id=current_user.id)))
        )
        user_permissions = [p.name for p in result.scalars().all()]

        # Check if user has all required permissions
        for perm in self.required_permissions:
            if perm not in user_permissions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing required permission: {perm}",
                )

        return current_user


# Pre-built role checkers for common use cases
require_admin = RoleChecker(["admin", "superadmin"])
require_engineering = RoleChecker(["admin", "engineering", "superadmin"])
require_procurement = RoleChecker(["admin", "procurement", "superadmin"])
require_finance = RoleChecker(["admin", "finance", "superadmin"])
require_viewer = RoleChecker(
    ["admin", "engineering", "procurement", "finance", "viewer", "superadmin"]
)


async def user_has_any_role(db: AsyncSession, user: User, allowed_roles: list[str]) -> bool:
    """Non-raising role check usable from service-layer code that isn't
    wired through FastAPI's dependency injection (e.g. a single guardrail
    branch inside a multi-action endpoint). Mirrors RoleChecker's role +
    hierarchy resolution without raising HTTPException.
    """
    if user.isSuperuser:
        return True
    result = await db.execute(
        select(Role).join(Role.users).where(Role.users.any(id=user.id))
    )
    held_roles = [r.name for r in result.scalars().all()]
    for role_name in held_roles:
        if role_name in allowed_roles:
            return True
        inherited = ROLE_HIERARCHY.get(role_name, [])
        if any(r in allowed_roles for r in inherited):
            return True
    return False


# R8 (ECO change control): the designated-approver gate. Approving an ECO is
# stricter than the general `require_engineering` gate used for
# submit/reject/implement/close — any engineer can create/submit an ECO, but
# only an admin-level, designated approver may approve one. This closes the
# "any engineer can approve any ECO" gap (only self-approval was previously
# blocked).
ECO_APPROVER_ROLES = ["admin", "superadmin"]


# Pre-built permission checkers
require_parts_read = PermissionChecker(["parts:read"])
require_parts_write = PermissionChecker(["parts:write"])
require_parts_delete = PermissionChecker(["parts:delete"])
require_projects_read = PermissionChecker(["projects:read"])
require_projects_write = PermissionChecker(["projects:write"])
require_vendors_read = PermissionChecker(["vendors:read"])
require_vendors_write = PermissionChecker(["vendors:write"])
require_procurement_read = PermissionChecker(["procurement:read"])
require_procurement_write = PermissionChecker(["procurement:write"])
require_documents_read = PermissionChecker(["documents:read"])
require_documents_write = PermissionChecker(["documents:write"])
require_admin_access = PermissionChecker(["admin:access"])


def log_audit_action(
    action: str,
    entity_type: str,
    entity_id: int = None,
    entity_name: str = None,
    changes: dict = None,
):
    """Helper to create audit log entries."""
    import json
    from datetime import datetime

    return {
        "action": action,
        "entityType": entity_type,
        "entityId": entity_id,
        "entityName": entity_name,
        "changes": json.dumps(changes) if changes else None,
        "timestamp": datetime.now(UTC).isoformat(),
    }
