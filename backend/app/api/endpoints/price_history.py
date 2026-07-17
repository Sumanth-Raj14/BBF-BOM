from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.db.session import get_db
from app.models.part import Part
from app.models.price_history import PriceHistory
from app.models.user import User

router = APIRouter()


class PriceHistoryBase(BaseModel):
    partId: int
    vendorId: Optional[int] = None
    price: float
    currency: Optional[str] = "USD"
    effectiveDate: Optional[datetime] = None
    source: Optional[str] = None
    sourceReference: Optional[str] = None


class PriceHistoryCreate(PriceHistoryBase):
    pass


class PriceHistoryResponse(PriceHistoryBase):
    id: int
    recordedAt: datetime

    model_config = ConfigDict(from_attributes=True)


class LandedCostRequest(BaseModel):
    partId: int
    quantity: int = 1
    freight: Optional[float] = 0.0
    tax: Optional[float] = 0.0
    dutyRate: Optional[float] = 0.0
    insurance: Optional[float] = 0.0
    handling: Optional[float] = 0.0


class LandedCostResponse(BaseModel):
    partId: int
    unitPrice: float
    quantity: int
    subtotal: float
    freight: float
    tax: float
    duty: float
    insurance: float
    handling: float
    totalLandedCost: float
    unitLandedCost: float


@router.get("/")
async def get_price_history(
    page: PageParams = Depends(get_page_params),
    partId: Optional[int] = None,
    vendorId: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(PriceHistory)
    if partId:
        query = query.where(PriceHistory.partId == partId)
    if vendorId:
        query = query.where(PriceHistory.vendorId == vendorId)
    query = query.order_by(PriceHistory.id)
    return await paginate(db, query, page)


@router.post("/", response_model=PriceHistoryResponse, status_code=status.HTTP_201_CREATED)
async def create_price_history(
    price: PriceHistoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_price = PriceHistory(**price.model_dump(), tenantId=current_user.tenantId)
    db.add(db_price)
    await db.commit()
    await db.refresh(db_price)
    return db_price


@router.post("/landed-cost", response_model=LandedCostResponse)
async def calculate_landed_cost(
    req: LandedCostRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Part).where(Part.id == req.partId))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail=f"Part {req.partId} not found")

    unit_price = part.cost or 0.0
    subtotal = unit_price * req.quantity
    duty = subtotal * req.dutyRate
    total = subtotal + req.freight + req.tax + duty + req.insurance + req.handling
    unit_landed = total / req.quantity if req.quantity > 0 else 0

    return LandedCostResponse(
        partId=req.partId,
        unitPrice=unit_price,
        quantity=req.quantity,
        subtotal=round(subtotal, 2),
        freight=round(req.freight, 2),
        tax=round(req.tax, 2),
        duty=round(duty, 2),
        insurance=round(req.insurance, 2),
        handling=round(req.handling, 2),
        totalLandedCost=round(total, 2),
        unitLandedCost=round(unit_landed, 2),
    )
