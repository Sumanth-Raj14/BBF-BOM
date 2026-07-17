from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class BomTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    partCount: Optional[int] = 0
    projectCode: Optional[str] = None


class BomTemplateCreate(BomTemplateBase):
    pass


class BomTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    partCount: Optional[int] = None
    projectCode: Optional[str] = None


class BomTemplateResponse(BomTemplateBase):
    id: int
    createdById: int
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
