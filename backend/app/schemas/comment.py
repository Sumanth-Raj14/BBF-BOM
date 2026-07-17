from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CommentBase(BaseModel):
    content: str
    entityType: str
    entityId: int
    mentions: Optional[list[int]] = None


class CommentCreate(CommentBase):
    pass


class CommentUpdate(BaseModel):
    content: Optional[str] = None


class CommentResponse(CommentBase):
    id: int
    userId: int
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
