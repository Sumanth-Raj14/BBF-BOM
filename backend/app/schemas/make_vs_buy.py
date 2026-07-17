from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class MakeVsBuyBase(BaseModel):
    partId: int
    projectId: Optional[int] = None
    decision: str = Field(default="TBD", json_schema_extra={"example": "Make"})

    makeMaterialCost: float = 0.0
    makeLaborCost: float = 0.0
    makeOverheadCost: float = 0.0
    makeToolingCost: float = 0.0
    makeTotalCost: float = 0.0

    buyUnitPrice: float = 0.0
    buyNreCost: float = 0.0
    buyTotalCost: float = 0.0

    qualityScore: int = 5
    leadTimeDays: int = 0
    capacityScore: int = 5
    ipRiskScore: int = 5
    supplyRiskScore: int = 5

    recommendation: Optional[str] = None
    rationale: Optional[str] = None
    status: str = "Draft"
    attachments: Optional[list[dict[str, Any]]] = Field(default_factory=list)


class MakeVsBuyCreate(MakeVsBuyBase):
    pass


class MakeVsBuyUpdate(BaseModel):
    decision: Optional[str] = None
    makeMaterialCost: Optional[float] = None
    makeLaborCost: Optional[float] = None
    makeOverheadCost: Optional[float] = None
    makeToolingCost: Optional[float] = None
    makeTotalCost: Optional[float] = None
    buyUnitPrice: Optional[float] = None
    buyNreCost: Optional[float] = None
    buyTotalCost: Optional[float] = None
    qualityScore: Optional[int] = None
    leadTimeDays: Optional[int] = None
    capacityScore: Optional[int] = None
    ipRiskScore: Optional[int] = None
    supplyRiskScore: Optional[int] = None
    recommendation: Optional[str] = None
    rationale: Optional[str] = None
    status: Optional[str] = None


class MakeVsBuyResponse(MakeVsBuyBase):
    id: int
    createdBy: Optional[int] = None
    approvedBy: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
