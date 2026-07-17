from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DocumentBase(BaseModel):
    name: str
    description: Optional[str] = None
    filePath: str
    fileType: Optional[str] = None
    fileSize: Optional[int] = None
    version: Optional[str] = "1.0"
    accessLevel: Optional[str] = "private"


class DocumentCreate(DocumentBase):
    pass


class DocumentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    filePath: Optional[str] = None
    fileType: Optional[str] = None
    fileSize: Optional[int] = None
    version: Optional[str] = None
    accessLevel: Optional[str] = None


class DocumentResponse(DocumentBase):
    id: int
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
