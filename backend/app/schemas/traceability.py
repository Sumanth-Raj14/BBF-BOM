from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class SerialNumberBase(BaseModel):
    serialNumber: str
    partId: int
    lotBatchNumber: Optional[str] = None
    poId: Optional[int] = None

    status: str = "In Stock"
    currentLocation: Optional[str] = None
    installedOnAsset: Optional[str] = None
    installationDate: Optional[datetime] = None

    statusHistory: Optional[list[dict[str, Any]]] = Field(default_factory=list)

    incomingInspectionResult: Optional[str] = None
    certificationUrl: Optional[str] = None

    manufactureDate: Optional[datetime] = None
    expirationDate: Optional[datetime] = None
    receivedDate: Optional[datetime] = None


class SerialNumberCreate(SerialNumberBase):
    pass


class SerialNumberUpdate(BaseModel):
    status: Optional[str] = None
    currentLocation: Optional[str] = None
    installedOnAsset: Optional[str] = None
    installationDate: Optional[datetime] = None
    incomingInspectionResult: Optional[str] = None


class SerialNumberResponse(SerialNumberBase):
    id: int
    createdBy: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LotBatchBase(BaseModel):
    lotBatchNumber: str
    partId: int
    vendorId: Optional[int] = None
    poId: Optional[int] = None

    quantityReceived: int = 0
    quantityInspected: int = 0
    quantityAccepted: int = 0
    quantityRejected: int = 0

    manufactureDate: Optional[datetime] = None
    receivedDate: Optional[datetime] = None
    expirationDate: Optional[datetime] = None

    incomingInspectionResult: Optional[str] = None
    certificationUrl: Optional[str] = None

    status: str = "Received"


class LotBatchCreate(LotBatchBase):
    pass


class LotBatchUpdate(BaseModel):
    quantityInspected: Optional[int] = None
    quantityAccepted: Optional[int] = None
    quantityRejected: Optional[int] = None
    incomingInspectionResult: Optional[str] = None
    status: Optional[str] = None


class LotBatchResponse(LotBatchBase):
    id: int
    createdBy: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
