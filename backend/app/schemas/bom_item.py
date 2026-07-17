from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class BomItemBase(BaseModel):
    partId: int
    quantity: int = Field(default=1, ge=1)
    referenceDesignator: Optional[str] = None
    notes: Optional[str] = None
    sortOrder: int = 0
    parentItemId: Optional[int] = None
    unitCostSnapshot: Optional[float] = None
    extendedCost: Optional[float] = None


class BomItemCreate(BomItemBase):
    bomTemplateId: int


class BomItemUpdate(BaseModel):
    partId: Optional[int] = None
    quantity: Optional[int] = None
    referenceDesignator: Optional[str] = None
    notes: Optional[str] = None
    sortOrder: Optional[int] = None
    parentItemId: Optional[int] = None


class BomItemResponse(BomItemBase):
    id: int
    bomTemplateId: int
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)


class BomItemBulkCreate(BaseModel):
    items: list[BomItemCreate]
