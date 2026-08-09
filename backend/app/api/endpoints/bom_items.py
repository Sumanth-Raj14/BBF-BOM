from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_write
from app.core.tenant_context import get_tenant_id
from app.db.session import get_db
from app.models.bom_item import BomItem
from app.models.bom_template import BomTemplate
from app.models.user import User
from app.schemas.bom_item import (
    BomItemBulkCreate,
    BomItemCreate,
    BomItemResponse,
    BomItemUpdate,
)
from app.services import bom_effectivity_service, derivative_service

router = APIRouter()


async def _check_effectivity(
    db: AsyncSession,
    tenant_id: int,
    bom_template_id: int,
    parent_item_id: Optional[int],
    part_id: int,
    effective_from,
    effective_to,
    effective_serial_from,
    effective_serial_to,
    effective_lot,
    exclude_id: Optional[int] = None,
) -> None:
    """Shared validation for create/update/bulk-create: raises HTTPException
    400 on an invalid from>to combo, a multi-axis line, or an overlap with a
    sibling line for the same part in the same parent."""
    try:
        bom_effectivity_service.validate_effectivity_fields(
            effective_from, effective_to, effective_serial_from, effective_serial_to, effective_lot
        )
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    conflict = await bom_effectivity_service.find_overlapping_sibling(
        db,
        tenant_id,
        bom_template_id,
        parent_item_id,
        part_id,
        exclude_id,
        effective_from,
        effective_to,
        effective_serial_from,
        effective_serial_to,
        effective_lot,
    )
    if conflict is not None:
        conflict_id = conflict.id  # read before rollback expires the instance
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=(
                f"Effectivity overlaps existing line {conflict_id} "
                "for the same part in this parent"
            ),
        )


@router.get("/")
async def get_bom_items(
    page: PageParams = Depends(get_page_params),
    bomTemplateId: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(BomItem)
    if bomTemplateId:
        query = query.where(BomItem.bomTemplateId == bomTemplateId)
    query = query.order_by(BomItem.sortOrder, BomItem.id)
    return await paginate(db, query, page)


@router.post("/", response_model=BomItemResponse, status_code=status.HTTP_201_CREATED)
async def create_bom_item(
    item: BomItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(BomTemplate).where(BomTemplate.id == item.bomTemplateId))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="BOM template not found")

    await _check_effectivity(
        db,
        current_user.tenantId,
        item.bomTemplateId,
        item.parentItemId,
        item.partId,
        item.effectiveFrom,
        item.effectiveTo,
        item.effectiveSerialFrom,
        item.effectiveSerialTo,
        item.effectiveLot,
    )

    db_item = BomItem(**item.model_dump(), tenantId=current_user.tenantId)
    db.add(db_item)

    template.partCount = (template.partCount or 0) + 1
    await db.commit()
    await db.refresh(db_item)
    return db_item


@router.post("/bulk", response_model=list[BomItemResponse], status_code=status.HTTP_201_CREATED)
async def bulk_create_bom_items(
    payload: BomItemBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    created = []
    for item_data in payload.items:
        await _check_effectivity(
            db,
            current_user.tenantId,
            item_data.bomTemplateId,
            item_data.parentItemId,
            item_data.partId,
            item_data.effectiveFrom,
            item_data.effectiveTo,
            item_data.effectiveSerialFrom,
            item_data.effectiveSerialTo,
            item_data.effectiveLot,
        )
        db_item = BomItem(**item_data.model_dump(), tenantId=current_user.tenantId)
        db.add(db_item)
        created.append(db_item)

    if created:
        result = await db.execute(
            select(BomTemplate).where(BomTemplate.id == created[0].bomTemplateId)
        )
        template = result.scalar_one_or_none()
        if template:
            template.partCount = (template.partCount or 0) + len(created)

    await db.commit()
    for item in created:
        await db.refresh(item)
    return created


@router.get("/resolved", response_model=list[BomItemResponse])
async def get_resolved_bom_items(
    bomTemplateId: int,
    asOfDate: Optional[date] = None,
    asOfSerial: Optional[str] = None,
    asOfLot: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The point of storing effectivity: "give me the BOM as of X". Returns
    only the lines of `bomTemplateId` effective at the given date / serial /
    lot. With no as-of param at all, defaults to today's date (lines gated
    on serial or lot are excluded in that default, since neither can be
    inferred — pass asOfSerial/asOfLot explicitly to resolve those axes).
    Registered ahead of /{item_id} so "resolved" isn't swallowed as an id.
    """
    if asOfDate is None and asOfSerial is None and asOfLot is None:
        asOfDate = date.today()

    result = await db.execute(
        select(BomItem)
        .where(BomItem.bomTemplateId == bomTemplateId)
        .order_by(BomItem.sortOrder, BomItem.id)
    )
    items = result.scalars().all()
    return bom_effectivity_service.resolve_effective_items(
        items, as_of_date=asOfDate, as_of_serial=asOfSerial, as_of_lot=asOfLot
    )


@router.get("/{item_id}", response_model=BomItemResponse)
async def get_bom_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(BomItem).where(BomItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail=f"BOM item {item_id} not found")
    derivatives = await derivative_service.list_derivatives(
        db, current_user.tenantId, item.partId
    )
    item.derivatives = [derivative_service.to_response(d) for d in derivatives]
    return item


@router.put("/{item_id}", response_model=BomItemResponse)
async def update_bom_item(
    item_id: int,
    update: BomItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(BomItem).where(BomItem.id == item_id))
    db_item = result.scalar_one_or_none()
    if not db_item:
        raise HTTPException(status_code=404, detail=f"BOM item {item_id} not found")

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(db_item, field, value)

    await _check_effectivity(
        db,
        db_item.tenantId,
        db_item.bomTemplateId,
        db_item.parentItemId,
        db_item.partId,
        db_item.effectiveFrom,
        db_item.effectiveTo,
        db_item.effectiveSerialFrom,
        db_item.effectiveSerialTo,
        db_item.effectiveLot,
        exclude_id=db_item.id,
    )

    await db.commit()
    await db.refresh(db_item)
    return db_item


@router.patch("/{item_id}", response_model=BomItemResponse)
async def patch_bom_item(
    item_id: int,
    update: BomItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_bom_item(item_id, update, db, current_user)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bom_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(BomItem).where(BomItem.id == item_id))
    db_item = result.scalar_one_or_none()
    if not db_item:
        raise HTTPException(status_code=404, detail=f"BOM item {item_id} not found")

    template_id = db_item.bomTemplateId
    await db.delete(db_item)

    result = await db.execute(select(BomTemplate).where(BomTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if template and (template.partCount or 0) > 0:
        template.partCount -= 1

    await db.commit()
    return None


class BulkDeleteRequest(BaseModel):
    ids: list[int]


@router.post("/bulk-delete")
async def bulk_delete_bom_items(
    req: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    # tenant-security: Core delete() bypasses the ORM before_flush tenant
    # guard in tenant_events.py, so it must scope by tenant explicitly here.
    stmt = delete(BomItem).where(BomItem.id.in_(req.ids))
    tenant_id = get_tenant_id()
    if tenant_id is not None:
        stmt = stmt.where(BomItem.tenantId == tenant_id)
    result = await db.execute(stmt)
    deleted = result.rowcount
    if deleted and req.ids:
        first = await db.execute(select(BomItem.bomTemplateId).where(BomItem.id == req.ids[0]))
        template_id = first.scalar()
        if template_id:
            count = await db.execute(select(BomTemplate).where(BomTemplate.id == template_id))
            template = count.scalar_one_or_none()
            if template:
                template.partCount = max(0, (template.partCount or 0) - deleted)
    await db.commit()
    return {"deleted": deleted}


@router.post("/{template_id}/reorder")
async def reorder_bom_items(
    template_id: int,
    item_ids: list[int],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    for idx, item_id in enumerate(item_ids):
        result = await db.execute(
            select(BomItem).where(BomItem.id == item_id, BomItem.bomTemplateId == template_id)
        )
        item = result.scalar_one_or_none()
        if item:
            item.sortOrder = idx

    await db.commit()
    return {"status": "reordered", "count": len(item_ids)}
