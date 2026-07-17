from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class VendorBase(BaseModel):
    name: str
    country: Optional[str] = None
    leadTime: Optional[int] = None
    moq: Optional[int] = None
    terms: Optional[str] = None
    reliabilityRating: Optional[float] = None


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    country: Optional[str] = None
    leadTime: Optional[int] = None
    moq: Optional[int] = None
    terms: Optional[str] = None
    reliabilityRating: Optional[float] = None


class VendorResponse(VendorBase):
    id: int
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
