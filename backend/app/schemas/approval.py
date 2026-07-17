from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ApprovalBase(BaseModel):
    type: str
    title: str
    description: Optional[str] = None
    entityType: str
    entityId: int
    status: Optional[str] = "pending"


class ApprovalCreate(ApprovalBase):
    pass


class ApprovalUpdate(BaseModel):
    status: Optional[str] = None
    comments: Optional[str] = None


class ApprovalResponse(ApprovalBase):
    id: int
    requesterId: int
    approverId: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
