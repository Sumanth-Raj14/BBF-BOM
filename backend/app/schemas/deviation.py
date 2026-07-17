from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class DeviationBase(BaseModel):
    deviationNumber: str = Field(..., json_schema_extra={"example": "DEV-2026-001"})
    title: str
    type: str = Field(..., json_schema_extra={"example": "Deviation"})

    partId: Optional[int] = None
    projectId: Optional[int] = None
    specification: Optional[str] = None
    deviationDescription: str

    impactAssessment: Optional[str] = None
    riskLevel: Optional[str] = None

    affectedQuantity: int = 0
    affectedLotNumbers: Optional[list[str]] = Field(default_factory=list)

    requestType: Optional[str] = None
    expirationDate: Optional[datetime] = None

    engineeringApproval: Optional[str] = None
    qualityApproval: Optional[str] = None
    customerApproval: Optional[str] = None
    allApprovalsReceived: str = "No"

    disposition: Optional[str] = None

    status: str = "Draft"

    capaId: Optional[int] = None
    attachments: Optional[list[dict[str, Any]]] = Field(default_factory=list)


class DeviationCreate(DeviationBase):
    pass


class DeviationUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    partId: Optional[int] = None
    projectId: Optional[int] = None
    specification: Optional[str] = None
    deviationDescription: Optional[str] = None
    impactAssessment: Optional[str] = None
    riskLevel: Optional[str] = None
    affectedQuantity: Optional[int] = None
    affectedLotNumbers: Optional[list[str]] = None
    requestType: Optional[str] = None
    expirationDate: Optional[datetime] = None
    engineeringApproval: Optional[str] = None
    qualityApproval: Optional[str] = None
    customerApproval: Optional[str] = None
    allApprovalsReceived: Optional[str] = None
    disposition: Optional[str] = None
    status: Optional[str] = None


class DeviationResponse(DeviationBase):
    id: int
    createdBy: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
