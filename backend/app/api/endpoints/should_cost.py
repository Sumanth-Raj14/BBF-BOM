import decimal
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


def _dec(value) -> decimal.Decimal:
    """Coerce a Numeric-column value (Decimal, float, int, or None) to Decimal.

    Numeric(18,4) cost columns round-trip as Decimal, while the non-monetary
    percentage/hours columns stay Float, and incoming request payloads are
    plain floats (Pydantic schema fields are typed float). Mixing Decimal
    and float in arithmetic raises TypeError, so every operand is normalized
    to Decimal before any add/multiply/divide.
    """
    if value is None:
        return decimal.Decimal("0")
    if isinstance(value, decimal.Decimal):
        return value
    return decimal.Decimal(str(value))


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
    material_total = _dec(payload.rawMaterialCost) * (1 + _dec(payload.materialWastePct) / 100)
    labor_total = _dec(payload.laborHours) * _dec(payload.laborRatePerHour)
    overhead_total = labor_total * _dec(payload.overheadPct) / 100
    tooling_per_unit = (
        _dec(payload.toolingCost) / payload.toolingAmortizedQty
        if payload.toolingAmortizedQty
        else decimal.Decimal("0")
    )
    subtotal = material_total + labor_total + overhead_total + tooling_per_unit
    profit_amount = subtotal * _dec(payload.profitMarginPct) / 100
    should_cost = subtotal + profit_amount
    variance = (
        ((_dec(payload.actualVendorPrice) - should_cost) / should_cost * 100)
        if should_cost
        else decimal.Decimal("0")
    )

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
        variancePct=float(variance),
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
    obj.materialTotal = _dec(obj.rawMaterialCost) * (1 + _dec(obj.materialWastePct) / 100)
    obj.laborTotal = _dec(obj.laborHours) * _dec(obj.laborRatePerHour)
    obj.overheadTotal = obj.laborTotal * _dec(obj.overheadPct) / 100
    obj.toolingPerUnit = (
        _dec(obj.toolingCost) / obj.toolingAmortizedQty
        if obj.toolingAmortizedQty
        else decimal.Decimal("0")
    )
    subtotal = obj.materialTotal + obj.laborTotal + obj.overheadTotal + obj.toolingPerUnit
    obj.profitAmount = subtotal * _dec(obj.profitMarginPct) / 100
    obj.shouldCostPerUnit = subtotal + obj.profitAmount
    obj.variancePct = float(
        ((_dec(obj.actualVendorPrice) - obj.shouldCostPerUnit) / obj.shouldCostPerUnit * 100)
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
