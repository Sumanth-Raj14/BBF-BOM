from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_read, require_parts_write
from app.db.session import get_db
from app.models.kanban import KanbanTrigger
from app.models.user import User
from app.schemas.kanban import (
    KanbanTriggerCreate,
    KanbanTriggerResponse,
    KanbanTriggerUpdate,
)

router = APIRouter(
    dependencies=[Depends(get_current_user)],
)


@router.get("/")
async def list_triggers(
    page: PageParams = Depends(get_page_params),
    status: Optional[str] = None,
    active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(KanbanTrigger)
    if status:
        stmt = stmt.where(KanbanTrigger.status == status)
    if active is not None:
        stmt = stmt.where(KanbanTrigger.active == active)
    stmt = stmt.order_by(KanbanTrigger.id)
    return await paginate(db, stmt, page)


@router.get("/{trigger_id}", response_model=KanbanTriggerResponse)
async def get_trigger(
    trigger_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    result = await db.execute(select(KanbanTrigger).where(KanbanTrigger.id == trigger_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Kanban trigger not found")
    return item


@router.post("/", response_model=KanbanTriggerResponse, status_code=201)
async def create_trigger(
    payload: KanbanTriggerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    status = "Normal"
    if payload.currentStock <= payload.safetyStock:
        status = "Critical"
    elif payload.currentStock <= payload.minStock:
        status = "Low"
    elif payload.currentStock >= payload.maxStock:
        status = "Overstock"

    obj = KanbanTrigger(
        **payload.model_dump(exclude={"status"}),
        status=status,
        createdBy=current_user.id,
        tenantId=current_user.tenantId,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/{trigger_id}", response_model=KanbanTriggerResponse)
async def update_trigger(
    trigger_id: int,
    payload: KanbanTriggerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(KanbanTrigger).where(KanbanTrigger.id == trigger_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Kanban trigger not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    if obj.currentStock <= obj.safetyStock:
        obj.status = "Critical"
    elif obj.currentStock <= obj.minStock:
        obj.status = "Low"
    elif obj.currentStock >= obj.maxStock:
        obj.status = "Overstock"
    else:
        obj.status = "Normal"
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{trigger_id}", response_model=KanbanTriggerResponse)
async def patch_trigger(
    trigger_id: int,
    payload: KanbanTriggerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_trigger(trigger_id, payload, db, current_user)


@router.delete("/{trigger_id}")
async def delete_trigger(
    trigger_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(KanbanTrigger).where(KanbanTrigger.id == trigger_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Kanban trigger not found")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Kanban trigger deleted"}


@router.get("/alerts/low-stock")
async def low_stock_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    result = await db.execute(
        select(KanbanTrigger).where(
            KanbanTrigger.active,
            KanbanTrigger.status.in_(["Low", "Critical"]),
        )
    )
    items = result.scalars().all()
    return [
        {
            "id": item.id,
            "partId": item.partId,
            "currentStock": item.currentStock,
            "minStock": item.minStock,
            "status": item.status,
            "reorderQuantity": item.reorderQuantity,
        }
        for item in items
    ]


@router.post("/{trigger_id}/update-stock")
async def update_stock(
    trigger_id: int,
    quantityChange: int = Query(..., description="Positive = receive, negative = consume"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(KanbanTrigger).where(KanbanTrigger.id == trigger_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Kanban trigger not found")
    obj.currentStock += quantityChange
    if obj.currentStock <= obj.safetyStock:
        obj.status = "Critical"
    elif obj.currentStock <= obj.minStock:
        obj.status = "Low"
    elif obj.currentStock >= obj.maxStock:
        obj.status = "Overstock"
    else:
        obj.status = "Normal"
    await db.commit()
    return {"currentStock": obj.currentStock, "status": obj.status}
