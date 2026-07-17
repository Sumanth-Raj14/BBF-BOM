from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class SupplierScorecardBase(BaseModel):
    vendorId: int
    period: str = Field(..., json_schema_extra={"example": "2026-Q1"})
    year: int
    quarter: Optional[int] = None

    qualityScore: float = 0.0
    deliveryScore: float = 0.0
    costScore: float = 0.0
    responsivenessScore: float = 0.0
    complianceScore: float = 0.0

    qualityWeight: float = 0.30
    deliveryWeight: float = 0.25
    costWeight: float = 0.20
    responsivenessWeight: float = 0.15
    complianceWeight: float = 0.10

    weightedScore: float = 0.0
    grade: Optional[str] = None

    totalOrders: int = 0
    onTimeDeliveries: int = 0
    defectCount: int = 0
    totalUnitsReceived: int = 0
    avgLeadTimeDays: float = 0.0
    avgResponseTimeHours: float = 0.0

    trend: Optional[str] = None
    notes: Optional[str] = None


class SupplierScorecardCreate(SupplierScorecardBase):
    pass


class SupplierScorecardUpdate(BaseModel):
    qualityScore: Optional[float] = None
    deliveryScore: Optional[float] = None
    costScore: Optional[float] = None
    responsivenessScore: Optional[float] = None
    complianceScore: Optional[float] = None
    qualityWeight: Optional[float] = None
    deliveryWeight: Optional[float] = None
    costWeight: Optional[float] = None
    responsivenessWeight: Optional[float] = None
    complianceWeight: Optional[float] = None
    weightedScore: Optional[float] = None
    grade: Optional[str] = None
    totalOrders: Optional[int] = None
    onTimeDeliveries: Optional[int] = None
    defectCount: Optional[int] = None
    totalUnitsReceived: Optional[int] = None
    avgLeadTimeDays: Optional[float] = None
    avgResponseTimeHours: Optional[float] = None
    trend: Optional[str] = None
    notes: Optional[str] = None


class SupplierScorecardResponse(SupplierScorecardBase):
    id: int
    createdBy: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
