from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class CAPABase(BaseModel):
    capaNumber: str = Field(..., json_schema_extra={"example": "CAPA-2026-001"})
    title: str
    type: str = Field(..., json_schema_extra={"example": "Corrective"})
    source: Optional[str] = None

    problemDescription: str
    immediateAction: Optional[str] = None

    rootCauseMethod: Optional[str] = None
    rootCause: Optional[str] = None

    correctiveAction: Optional[str] = None
    preventiveAction: Optional[str] = None
    actionOwner: Optional[str] = None
    targetDate: Optional[datetime] = None

    verificationMethod: Optional[str] = None
    verificationResult: Optional[str] = None

    status: str = "Open"

    effectivenessCheckDate: Optional[datetime] = None
    effectivenessResult: Optional[str] = None

    partId: Optional[int] = None
    projectId: Optional[int] = None
    vendorId: Optional[int] = None
    attachments: Optional[list[dict[str, Any]]] = Field(default_factory=list)


class CAPACreate(CAPABase):
    pass


class CAPAUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    source: Optional[str] = None
    problemDescription: Optional[str] = None
    immediateAction: Optional[str] = None
    rootCauseMethod: Optional[str] = None
    rootCause: Optional[str] = None
    correctiveAction: Optional[str] = None
    preventiveAction: Optional[str] = None
    actionOwner: Optional[str] = None
    targetDate: Optional[datetime] = None
    verificationMethod: Optional[str] = None
    verificationResult: Optional[str] = None
    status: Optional[str] = None
    effectivenessCheckDate: Optional[datetime] = None
    effectivenessResult: Optional[str] = None


class CAPAResponse(CAPABase):
    id: int
    verifiedBy: Optional[int] = None
    createdBy: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
