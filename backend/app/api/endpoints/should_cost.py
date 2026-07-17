from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_read, require_parts_write
from app.db.session import get_db
from app.models.should_cost import ShouldCostModel
from app.models.user import User
from app.schemas.should_cost import (
    ShouldCostCreate,
    ShouldCostResponse,
    ShouldCostUpdate,
)

router = APIRouter(
    dependencies=[Depends(get_current_user)],
)


@router.get("/")
async def list_models(
    page: PageParams = Depends(get_page_params),
    partId: Optional[int] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(ShouldCostModel)
    if partId:
        stmt = stmt.where(ShouldCostModel.partId == partId)
    if status:
        stmt = stmt.where(ShouldCostModel.status == status)
    stmt = stmt.order_by(ShouldCostModel.id)
    return await paginate(db, stmt, page)


@router.get("/{model_id}", response_model=ShouldCostResponse)
async def get_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    result = await db.execute(select(ShouldCostModel).where(ShouldCostModel.id == model_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Should-cost model not found")
    return item


@router.post("/", response_model=ShouldCostResponse, status_code=201)
async def create_model(
    payload: ShouldCostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    material_total = payload.rawMaterialCost * (1 + payload.materialWastePct / 100)
    labor_total = payload.laborHours * payload.laborRatePerHour
    overhead_total = labor_total * payload.overheadPct / 100
    tooling_per_unit = (
        payload.toolingCost / payload.toolingAmortizedQty if payload.toolingAmortizedQty else 0
    )
    subtotal = material_total + labor_total + overhead_total + tooling_per_unit
    profit_amount = subtotal * payload.profitMarginPct / 100
    should_cost = subtotal + profit_amount
    variance = ((payload.actualVendorPrice - should_cost) / should_cost * 100) if should_cost else 0

    obj = ShouldCostModel(
        **payload.model_dump(
            exclude={
                "materialTotal",
                "laborTotal",
                "overheadTotal",
                "toolingPerUnit",
                "profitAmount",
                "shouldCostPerUnit",
                "variancePct",
                "assumptions",
            }
        ),
        materialTotal=material_total,
        laborTotal=labor_total,
        overheadTotal=overhead_total,
        toolingPerUnit=tooling_per_unit,
        profitAmount=profit_amount,
        shouldCostPerUnit=should_cost,
        variancePct=variance,
        Assumptions=payload.assumptions,
        createdBy=current_user.id,
        tenantId=current_user.tenantId,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/{model_id}", response_model=ShouldCostResponse)
async def update_model(
    model_id: int,
    payload: ShouldCostUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(ShouldCostModel).where(ShouldCostModel.id == model_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Should-cost model not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    obj.materialTotal = obj.rawMaterialCost * (1 + obj.materialWastePct / 100)
    obj.laborTotal = obj.laborHours * obj.laborRatePerHour
    obj.overheadTotal = obj.laborTotal * obj.overheadPct / 100
    obj.toolingPerUnit = obj.toolingCost / obj.toolingAmortizedQty if obj.toolingAmortizedQty else 0
    subtotal = obj.materialTotal + obj.laborTotal + obj.overheadTotal + obj.toolingPerUnit
    obj.profitAmount = subtotal * obj.profitMarginPct / 100
    obj.shouldCostPerUnit = subtotal + obj.profitAmount
    obj.variancePct = (
        ((obj.actualVendorPrice - obj.shouldCostPerUnit) / obj.shouldCostPerUnit * 100)
        if obj.shouldCostPerUnit
        else 0
    )
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{model_id}", response_model=ShouldCostResponse)
async def patch_model(
    model_id: int,
    payload: ShouldCostUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_model(model_id, payload, db, current_user)


@router.delete("/{model_id}")
async def delete_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(ShouldCostModel).where(ShouldCostModel.id == model_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Should-cost model not found")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Should-cost model deleted"}
