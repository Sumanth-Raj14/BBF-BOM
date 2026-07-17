from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PriceHistoryBase(BaseModel):
    partId: int
    vendor: str
    price: float
    currency: Optional[str] = "USD"
    quantity: Optional[int] = None
    notes: Optional[str] = None


class PriceHistoryCreate(PriceHistoryBase):
    pass


class PriceHistoryResponse(PriceHistoryBase):
    id: int
    recordedAt: datetime

    model_config = ConfigDict(from_attributes=True)
