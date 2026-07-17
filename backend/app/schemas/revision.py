from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class RevisionBase(BaseModel):
    entityType: Optional[str] = None
    entityId: int
    revisionNumber: str
    revisionLabel: Optional[str] = None
    description: Optional[str] = None
    bomSnapshot: Optional[dict[str, Any]] = None


class RevisionCreate(RevisionBase):
    pass


class RevisionResponse(RevisionBase):
    id: int
    createdById: int
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)
