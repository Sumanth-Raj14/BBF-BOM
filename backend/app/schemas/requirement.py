from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class RequirementBase(BaseModel):
    key: str
    title: str
    description: Optional[str] = None
    type: str = "functional"
    status: str = "draft"
    priority: Optional[str] = "medium"
    version: int = 1
    parent_id: Optional[int] = None


class RequirementCreate(RequirementBase):
    pass


class RequirementUpdate(BaseModel):
    key: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    version: Optional[int] = None
    parent_id: Optional[int] = None


class RequirementResponse(RequirementBase):
    id: int
    createdBy: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class RequirementPartLinkCreate(BaseModel):
    partId: int


class RequirementPartLinkResponse(BaseModel):
    id: int
    requirement_id: int
    part_id: int
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)


class RequirementBomLinkCreate(BaseModel):
    bomId: int


class RequirementBomLinkResponse(BaseModel):
    id: int
    requirement_id: int
    bom_id: int
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)
