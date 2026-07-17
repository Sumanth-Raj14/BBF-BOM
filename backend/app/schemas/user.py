from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    username: str
    fullName: Optional[str] = None
    department: Optional[str] = None
    jobTitle: Optional[str] = None
    avatarUrl: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    fullName: Optional[str] = None
    department: Optional[str] = None
    jobTitle: Optional[str] = None
    avatarUrl: Optional[str] = None
    isActive: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    isActive: bool
    isSuperuser: bool
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
