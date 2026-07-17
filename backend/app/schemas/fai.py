from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class FAIReportBase(BaseModel):
    faiNumber: str = Field(..., json_schema_extra={"example": "FAI-2026-001"})
    partId: int
    projectId: Optional[int] = None

    partName: Optional[str] = None
    partNumber: Optional[str] = None
    partRevision: Optional[str] = None
    serialNumber: Optional[str] = None
    lotBatchNumber: Optional[str] = None

    rawMaterial: Optional[str] = None
    specialProcessSource: Optional[str] = None

    characteristics: Optional[list[dict[str, Any]]] = Field(default_factory=list)

    totalCharacteristics: int = 0
    passedCharacteristics: int = 0
    failedCharacteristics: int = 0
    result: Optional[str] = None

    inspectorName: Optional[str] = None

    status: str = "Draft"
    notes: Optional[str] = None
    deviations: Optional[str] = None
    attachments: Optional[list[dict[str, Any]]] = Field(default_factory=list)


class FAIReportCreate(FAIReportBase):
    pass


class FAIReportUpdate(BaseModel):
    partName: Optional[str] = None
    partNumber: Optional[str] = None
    partRevision: Optional[str] = None
    serialNumber: Optional[str] = None
    lotBatchNumber: Optional[str] = None
    rawMaterial: Optional[str] = None
    specialProcessSource: Optional[str] = None
    characteristics: Optional[list[dict[str, Any]]] = None
    totalCharacteristics: Optional[int] = None
    passedCharacteristics: Optional[int] = None
    failedCharacteristics: Optional[int] = None
    result: Optional[str] = None
    inspectorName: Optional[str] = None
    inspectorApprovalDate: Optional[datetime] = None
    qualityApprovalDate: Optional[datetime] = None
    customerApprovalDate: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    deviations: Optional[str] = None


class FAIReportResponse(FAIReportBase):
    id: int
    inspectorApprovalDate: Optional[datetime] = None
    qualityApprovalDate: Optional[datetime] = None
    customerApprovalDate: Optional[datetime] = None
    createdBy: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
