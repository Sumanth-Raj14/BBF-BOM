from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_write
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

router = APIRouter()


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
    result = await db.execute(delete(BomItem).where(BomItem.id.in_(req.ids)))
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
