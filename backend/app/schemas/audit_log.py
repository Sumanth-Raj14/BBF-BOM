from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class AuditLogBase(BaseModel):
    action: str
    entityType: str
    entityId: Optional[int] = None
    changes: Optional[dict[str, Any]] = None
    userId: int


class AuditLogCreate(AuditLogBase):
    pass


class AuditLogResponse(AuditLogBase):
    id: int
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)
