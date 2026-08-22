"""Public read-only BOM share links.

The authenticated half (create / list / revoke) is ordinary tenant-scoped CRUD.
The PUBLIC half is the whole risk surface, so everything it does is deliberate:

  * It runs with NO tenant context — a supplier has no JWT, so the ORM
    auto-filter in tenant_events.py is inactive. Every query below therefore
    carries an EXPLICIT tenantId predicate taken from the resolved share row,
    and the tenant context is pinned to that tenant for the rest of the handler
    as a second, independent guard.
  * Unknown, expired, revoked and wrong-password all return the byte-identical
    404 below, so the endpoint cannot be used to probe which tokens exist.
  * The payload is built field-by-field. No cost, no user identity, no tenant,
    no database ids — hierarchy is expressed with payload-local line numbers.
"""

import secrets
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.rbac import require_parts_write
from app.core.security import get_password_hash, verify_password
from app.core.tenant_context import TenantContext
from app.db.session import get_db
from app.models.bom_item import BomItem
from app.models.bom_share import BomShareLink
from app.models.bom_template import BomTemplate
from app.models.user import User

router = APIRouter()


def _invalid() -> HTTPException:
    """One response for every failure mode. Do not add a "password required" or
    "expired" variant: the whole point is that a probe learns nothing."""
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Share link not found, expired, or revoked.",
    )


class ShareCreate(BaseModel):
    bom_id: int
    expires_at: Optional[datetime] = None
    password: Optional[str] = None


class ShareResponse(BaseModel):
    id: int
    token: str
    bom_id: int
    expires_at: Optional[datetime] = None
    has_password: bool
    revoked: bool
    access_count: int
    last_accessed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


def _as_response(s: BomShareLink) -> ShareResponse:
    return ShareResponse(
        id=s.id,
        token=s.token,
        bom_id=s.bom_id,
        expires_at=s.expires_at,
        has_password=s.password_hash is not None,
        revoked=bool(s.revoked),
        access_count=s.access_count or 0,
        last_accessed_at=s.last_accessed_at,
        created_at=s.created_at,
    )


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite hands back naive datetimes for DateTime(timezone=True); comparing
    one to an aware now() raises TypeError. Treat naive as UTC (how it was
    stored) so expiry behaves identically on SQLite and Postgres."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


# ---------------------------------------------------------------------------
# PUBLIC — registered FIRST: Starlette matches in declaration order, so this
# literal segment must be seen before any /{param} route below.
# ---------------------------------------------------------------------------


# shared_limit, not limit: slowapi's default key_style is "url", so a plain
# @limiter.limit on a path with a variable segment buckets EVERY token
# separately — an enumerator would get 20/minute per guess, i.e. no limit at
# all, on the one route where enumeration is the attack. A fixed scope buckets
# per client IP across all tokens, which is the thing worth limiting.
@router.get("/public/{token}")
@limiter.shared_limit("20/minute", scope="bom_share_public")
async def resolve_public_share(
    request: Request,
    token: str,
    x_share_password: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a share token to exactly one read-only BOM. No authentication.

    The password travels in a header, not the query string, so it does not land
    in access logs / browser history the way ?password= would.
    """
    ctx = TenantContext.set(None)  # a public caller belongs to no tenant
    try:
        share = (
            await db.execute(select(BomShareLink).where(BomShareLink.token == token))
        ).scalar_one_or_none()

        # ponytail: an unknown token skips bcrypt, so a wrong password answers
        # slower than a bad token. Meaningless against a 256-bit token behind a
        # 20/min limit; add a dummy verify if that ever stops being true.
        if (
            share is None
            or share.revoked
            or (share.expires_at is not None and _aware(share.expires_at) <= datetime.now(UTC))
            or (
                share.password_hash is not None
                and not (
                    x_share_password and verify_password(x_share_password, share.password_hash)
                )
            )
        ):
            raise _invalid()

        tenant_id = share.tenantId
        TenantContext.set(tenant_id)  # second guard behind the explicit filters

        bom = (
            await db.execute(
                select(BomTemplate).where(
                    BomTemplate.id == share.bom_id,
                    BomTemplate.tenantId == tenant_id,
                )
            )
        ).scalar_one_or_none()
        if bom is None:
            raise _invalid()

        items = (
            (
                await db.execute(
                    select(BomItem)
                    .where(
                        BomItem.bomTemplateId == bom.id,
                        BomItem.tenantId == tenant_id,
                    )
                    .options(selectinload(BomItem.part))
                    .order_by(BomItem.sortOrder, BomItem.id)
                )
            )
            .scalars()
            .all()
        )

        # Hierarchy without leaking row ids: 1-based positions in this payload.
        line_of = {item.id: n for n, item in enumerate(items, start=1)}
        lines = []
        for n, item in enumerate(items, start=1):
            part = item.part
            lines.append(
                {
                    "line": n,
                    "parentLine": line_of.get(item.parentItemId),
                    "partNumber": part.pn if part else None,
                    "partName": part.name if part else None,
                    "description": part.description if part else None,
                    "manufacturer": part.manufacturer if part else None,
                    "mpn": part.mpn if part else None,
                    "uom": part.uom if part else None,
                    # Decimal is not JSON-serialisable — coerce.
                    "quantity": float(item.quantity) if item.quantity is not None else None,
                    "referenceDesignator": item.referenceDesignator,
                    "notes": item.notes,
                }
            )

        share.access_count = (share.access_count or 0) + 1
        share.last_accessed_at = datetime.now(UTC)
        await db.commit()

        return {
            "readOnly": True,
            "bom": {
                "name": bom.name,
                "description": bom.description,
                "projectCode": bom.projectCode,
                "lineCount": len(lines),
            },
            "items": lines,
            "expiresAt": _aware(share.expires_at),
        }
    finally:
        TenantContext.reset(ctx)


# ---------------------------------------------------------------------------
# Authenticated, tenant-scoped management
# ---------------------------------------------------------------------------


@router.post("/", response_model=ShareResponse, status_code=status.HTTP_201_CREATED)
async def create_share(
    body: ShareCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    bom = (
        await db.execute(
            select(BomTemplate).where(
                BomTemplate.id == body.bom_id,
                BomTemplate.tenantId == current_user.tenantId,
            )
        )
    ).scalar_one_or_none()
    if bom is None:
        raise HTTPException(status_code=404, detail=f"BOM {body.bom_id} not found")

    if body.expires_at is not None and _aware(body.expires_at) <= datetime.now(UTC):
        raise HTTPException(status_code=400, detail="expires_at must be in the future")

    share = BomShareLink(
        token=secrets.token_urlsafe(32),
        bom_id=bom.id,
        created_by=current_user.id,
        tenantId=current_user.tenantId,
        expires_at=body.expires_at,
        password_hash=get_password_hash(body.password) if body.password else None,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)
    return _as_response(share)


@router.get("/", response_model=list[ShareResponse])
async def list_shares(
    bom_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(BomShareLink).where(BomShareLink.tenantId == current_user.tenantId)
    if bom_id is not None:
        q = q.where(BomShareLink.bom_id == bom_id)
    rows = (await db.execute(q.order_by(BomShareLink.id))).scalars().all()
    return [_as_response(s) for s in rows]


@router.post("/{share_id}/revoke", response_model=ShareResponse)
async def revoke_share(
    share_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    share = (
        await db.execute(
            select(BomShareLink).where(
                BomShareLink.id == share_id,
                BomShareLink.tenantId == current_user.tenantId,
            )
        )
    ).scalar_one_or_none()
    if share is None:
        raise HTTPException(status_code=404, detail=f"Share {share_id} not found")
    share.revoked = True
    await db.commit()
    await db.refresh(share)
    return _as_response(share)
