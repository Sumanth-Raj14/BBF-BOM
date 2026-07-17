import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_superuser, get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.security import get_password_hash
from app.core.tenant_context import get_tenant_id
from app.db.session import get_db
from app.models.user import User

router = APIRouter()


class UserBase(BaseModel):
    email: EmailStr
    username: str
    fullName: Optional[str] = None
    department: Optional[str] = None
    jobTitle: Optional[str] = None
    avatarUrl: Optional[str] = None


class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\;'/`~]", v):
            raise ValueError("Password must contain at least one special character")
        return v


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


@router.get("/")
async def get_users(
    page: PageParams = Depends(get_page_params),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id = get_tenant_id()
    query = select(User)

    # Superusers see all users; regular users scoped to their tenant
    if not current_user.isSuperuser and tenant_id is not None:
        query = query.where(User.tenantId == tenant_id)

    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%"))
            | (User.username.ilike(f"%{search}%"))
            | (User.fullName.ilike(f"%{search}%"))
        )

    query = query.order_by(User.id)
    return await paginate(db, query, page)


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    """
    Create a new user (superuser only)
    """
    # Check if email already exists
    result = await db.execute(select(User).where(User.email == user.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # Check if username already exists
    result = await db.execute(select(User).where(User.username == user.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken"
        )

    db_user = User(
        email=user.email,
        username=user.username,
        fullName=user.fullName,
        department=user.department,
        jobTitle=user.jobTitle,
        avatarUrl=user.avatarUrl,
        hashedPassword=get_password_hash(user.password),
        tenantId=current_user.tenantId,
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific user by ID
    """
    tenant_id = get_tenant_id()
    query = select(User).where(User.id == user_id)

    # Superusers can access any user; regular users scoped to their tenant
    if not current_user.isSuperuser and tenant_id is not None:
        query = query.where(User.tenantId == tenant_id)

    result = await db.execute(query)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    """
    Update a user (superuser only)
    """
    tenant_id = get_tenant_id()
    query = select(User).where(User.id == user_id)

    # Superusers can update any user; regular superusers scoped to their tenant
    if tenant_id is not None:
        query = query.where(User.tenantId == tenant_id)

    result = await db.execute(query)
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    update_data = user_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_user, field, value)

    await db.commit()
    await db.refresh(db_user)
    return db_user


@router.patch("/{user_id}", response_model=UserResponse)
async def patch_user(
    user_id: int,
    user_update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    tenant_id = get_tenant_id()
    query = select(User).where(User.id == user_id)

    # Superusers can update any user; regular superusers scoped to their tenant
    if tenant_id is not None:
        query = query.where(User.tenantId == tenant_id)

    result = await db.execute(query)
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    update_data = user_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_user, field, value)

    await db.commit()
    await db.refresh(db_user)
    return db_user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    """
    Delete a user (superuser only)
    """
    tenant_id = get_tenant_id()
    query = select(User).where(User.id == user_id)

    if tenant_id is not None:
        query = query.where(User.tenantId == tenant_id)

    result = await db.execute(query)
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    await db.delete(db_user)
    await db.commit()
    return None
