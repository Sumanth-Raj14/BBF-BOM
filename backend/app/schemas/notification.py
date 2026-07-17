from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class NotificationBase(BaseModel):
    title: str
    message: str
    type: Optional[str] = "info"
    status: Optional[str] = "unread"
    entityType: Optional[str] = None
    entityId: Optional[int] = None
    userId: int


class NotificationCreate(NotificationBase):
    pass


class NotificationUpdate(BaseModel):
    status: Optional[str] = None


class NotificationResponse(NotificationBase):
    id: int
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)
