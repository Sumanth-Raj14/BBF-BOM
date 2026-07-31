"""Business logic for Part CAD derivative links (part_derivatives table).

A derivative is a typed (kind, url) pointer to something a CAD/PLM pipeline
produced from a Part's geometry — a released PDF drawing, a STEP/DWG/DXF
export, etc. Actual geometry -> drawing generation requires a CAD kernel and
is out of scope here; this module only stores + serves links produced
elsewhere (see app/models/part_derivative.py).

Attaching a derivative of a (tenant, part, kind) that already exists upserts
the url/drawing_status in place rather than raising a uniqueness conflict —
this lets an external pipeline re-push a regenerated export without first
looking up the existing row id (matches the intent of the
uq_part_derivatives_tenant_part_kind constraint).

Every query here is explicitly scoped by tenantId: this table is exercised
under SQLite in tests (no Postgres RLS backstop there), so tenant isolation
has to be enforced at the query level, not just relied on at the DB layer.
"""

from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams, paginate
from app.models.part import Part
from app.models.part_derivative import PartDerivative
from app.schemas.part_derivative import ALLOWED_DERIVATIVE_KINDS, PartDerivativeResponse


def to_response(derivative: PartDerivative) -> PartDerivativeResponse:
    return PartDerivativeResponse(
        id=derivative.id,
        partId=derivative.part_id,
        kind=derivative.kind,
        url=derivative.url,
        drawingStatus=derivative.drawing_status,
        createdAt=derivative.created_at,
    )


async def _get_tenant_part(db: AsyncSession, tenant_id: int, part_id: int) -> Part:
    result = await db.execute(select(Part).where(Part.id == part_id, Part.tenantId == tenant_id))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Part {part_id} not found")
    return part


async def list_derivatives(
    db: AsyncSession, tenant_id: int, part_id: Optional[int] = None
) -> list[PartDerivative]:
    query = select(PartDerivative).where(PartDerivative.tenantId == tenant_id)
    if part_id is not None:
        query = query.where(PartDerivative.part_id == part_id)
    query = query.order_by(PartDerivative.part_id, PartDerivative.id)
    result = await db.execute(query)
    return list(result.scalars().all())


async def list_derivatives_paginated(
    db: AsyncSession, tenant_id: int, page: PageParams, part_id: Optional[int] = None
) -> dict:
    query = select(PartDerivative).where(PartDerivative.tenantId == tenant_id)
    if part_id is not None:
        query = query.where(PartDerivative.part_id == part_id)
    query = query.order_by(PartDerivative.part_id, PartDerivative.id)
    result = await paginate(db, query, page)
    result["items"] = [to_response(d) for d in result["items"]]
    return result


async def get_derivatives_for_parts(
    db: AsyncSession, tenant_id: int, part_ids: list[int]
) -> dict[int, list[PartDerivative]]:
    """Bulk-fetch derivatives for many parts at once (BOM-line surfacing)."""
    if not part_ids:
        return {}
    result = await db.execute(
        select(PartDerivative)
        .where(PartDerivative.tenantId == tenant_id, PartDerivative.part_id.in_(part_ids))
        .order_by(PartDerivative.part_id, PartDerivative.id)
    )
    grouped: dict[int, list[PartDerivative]] = {}
    for d in result.scalars().all():
        grouped.setdefault(d.part_id, []).append(d)
    return grouped


async def attach_derivative(
    db: AsyncSession,
    tenant_id: int,
    part_id: int,
    kind: str,
    url: str,
    drawing_status: Optional[str] = None,
) -> PartDerivative:
    normalized_kind = (kind or "").strip().lower()
    if normalized_kind not in ALLOWED_DERIVATIVE_KINDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"kind must be one of {list(ALLOWED_DERIVATIVE_KINDS)}",
        )
    if not (url or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="url is required")

    await _get_tenant_part(db, tenant_id, part_id)

    result = await db.execute(
        select(PartDerivative).where(
            PartDerivative.tenantId == tenant_id,
            PartDerivative.part_id == part_id,
            PartDerivative.kind == normalized_kind,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.url = url
        existing.drawing_status = drawing_status
        await db.commit()
        await db.refresh(existing)
        return existing

    derivative = PartDerivative(
        tenantId=tenant_id,
        part_id=part_id,
        kind=normalized_kind,
        url=url,
        drawing_status=drawing_status,
    )
    db.add(derivative)
    await db.commit()
    await db.refresh(derivative)
    return derivative


async def remove_derivative(db: AsyncSession, tenant_id: int, derivative_id: int) -> None:
    result = await db.execute(
        select(PartDerivative).where(
            PartDerivative.id == derivative_id, PartDerivative.tenantId == tenant_id
        )
    )
    derivative = result.scalar_one_or_none()
    if not derivative:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Derivative not found")
    await db.delete(derivative)
    await db.commit()
