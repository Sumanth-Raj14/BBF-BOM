from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class KanbanTriggerBase(BaseModel):
    partId: int
    minStock: int
    maxStock: int
    reorderQuantity: int
    safetyStock: int = 0

    currentStock: int = 0
    openOrderQty: int = 0

    autoReorder: bool = False
    preferredVendorId: Optional[int] = None
    preferredPoTemplate: Optional[str] = None

    status: str = "Normal"
    active: bool = True


class KanbanTriggerCreate(KanbanTriggerBase):
    pass


class KanbanTriggerUpdate(BaseModel):
    minStock: Optional[int] = None
    maxStock: Optional[int] = None
    reorderQuantity: Optional[int] = None
    safetyStock: Optional[int] = None
    currentStock: Optional[int] = None
    openOrderQty: Optional[int] = None
    autoReorder: Optional[bool] = None
    preferredVendorId: Optional[int] = None
    preferredPoTemplate: Optional[str] = None
    status: Optional[str] = None
    active: Optional[bool] = None


class KanbanTriggerResponse(KanbanTriggerBase):
    id: int
    lastTriggeredAt: Optional[datetime] = None
    lastPoCreated: Optional[str] = None
    createdBy: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
