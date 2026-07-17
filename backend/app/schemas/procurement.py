from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ProcurementBase(BaseModel):
    partId: int
    quantity: int
    unitPrice: Optional[float] = None
    vendor: Optional[str] = None
    status: Optional[str] = "Not Ordered"
    dueDate: Optional[datetime] = None


class ProcurementCreate(ProcurementBase):
    pass


class ProcurementUpdate(BaseModel):
    partId: Optional[int] = None
    quantity: Optional[int] = None
    unitPrice: Optional[float] = None
    vendor: Optional[str] = None
    status: Optional[str] = None
    dueDate: Optional[datetime] = None


class ProcurementResponse(ProcurementBase):
    id: int
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
