from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ShouldCostBase(BaseModel):
    partId: int

    rawMaterialCost: float = 0.0
    materialWastePct: float = 5.0
    materialTotal: float = 0.0

    laborHours: float = 0.0
    laborRatePerHour: float = 0.0
    laborTotal: float = 0.0

    overheadPct: float = 30.0
    overheadTotal: float = 0.0

    toolingCost: float = 0.0
    toolingAmortizedQty: int = 1000
    toolingPerUnit: float = 0.0

    profitMarginPct: float = 15.0
    profitAmount: float = 0.0

    shouldCostPerUnit: float = 0.0
    actualVendorPrice: float = 0.0
    variancePct: float = 0.0

    notes: Optional[str] = None
    assumptions: Optional[str] = None
    status: str = "Draft"


class ShouldCostCreate(ShouldCostBase):
    pass


class ShouldCostUpdate(BaseModel):
    rawMaterialCost: Optional[float] = None
    materialWastePct: Optional[float] = None
    materialTotal: Optional[float] = None
    laborHours: Optional[float] = None
    laborRatePerHour: Optional[float] = None
    laborTotal: Optional[float] = None
    overheadPct: Optional[float] = None
    overheadTotal: Optional[float] = None
    toolingCost: Optional[float] = None
    toolingAmortizedQty: Optional[int] = None
    toolingPerUnit: Optional[float] = None
    profitMarginPct: Optional[float] = None
    profitAmount: Optional[float] = None
    shouldCostPerUnit: Optional[float] = None
    actualVendorPrice: Optional[float] = None
    variancePct: Optional[float] = None
    notes: Optional[str] = None
    assumptions: Optional[str] = None
    status: Optional[str] = None


class ShouldCostResponse(ShouldCostBase):
    id: int
    createdBy: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
