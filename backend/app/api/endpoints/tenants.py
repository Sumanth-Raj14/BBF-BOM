"""Tenant management API — CRUD for tenants and user assignment."""

import json
import re
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_middleware import write_audit_entry
from app.core.deps import get_current_superuser
from app.core.pagination import PageParams, get_page_params
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter(dependencies=[Depends(get_current_superuser)])


class TenantCreate(BaseModel):
    tenant_name: str
    tenant_code: str
    domain: Optional[str] = None
    plan: str = "free"
    max_users: int = 5
    max_storage_gb: int = 1

    @field_validator("tenant_code")
    @classmethod
    def validate_code(cls, v):
        if not re.match(r"^[a-z0-9_]{2,50}$", v):
            raise ValueError("Code must be 2-50 chars: lowercase, digits, underscores")
        return v

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, v):
        allowed = {"free", "starter", "professional", "enterprise"}
        if v not in allowed:
            raise ValueError(f"Plan must be one of: {', '.join(sorted(allowed))}")
        return v


class TenantUpdate(BaseModel):
    tenant_name: Optional[str] = None
    domain: Optional[str] = None
    plan: Optional[str] = None
    status: Optional[str] = None
    max_users: Optional[int] = None
    max_storage_gb: Optional[int] = None

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, v):
        if v is not None:
            allowed = {"free", "starter", "professional", "enterprise"}
            if v not in allowed:
                raise ValueError(f"Plan must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None:
            allowed = {"active", "inactive", "suspended"}
            if v not in allowed:
                raise ValueError(f"Status must be one of: {', '.join(sorted(allowed))}")
        return v


class TenantResponse(BaseModel):
    id: int
    tenant_name: str
    tenant_code: str
    domain: Optional[str] = None
    plan: str
    status: str
    max_users: int
    max_storage_gb: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TenantListResponse(BaseModel):
    items: list[TenantResponse]
    total: int
    page: int
    size: int
    pages: int


class TenantUserInvite(BaseModel):
    email: str
    username: Optional[str] = None
    fullName: Optional[str] = None
    isSuperuser: bool = False


@router.get("/", response_model=TenantListResponse)
async def list_tenants(
    page: PageParams = Depends(get_page_params),
    search: Optional[str] = None,
    status: Optional[str] = None,
    plan: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Tenant)
    count_query = select(func.count()).select_from(Tenant)
    where = []
    if search:
        like = f"%{search}%"
        where.append(
            or_(
                Tenant.tenant_name.ilike(like),
                Tenant.tenant_code.ilike(like),
                Tenant.domain.ilike(like),
            )
        )
    if status:
        where.append(Tenant.status == status)
    if plan:
        where.append(Tenant.plan == plan)
    if where:
        query = query.where(*where)
        count_query = count_query.where(*where)
    total = (await db.execute(count_query)).scalar() or 0
    query = (
        query.order_by(Tenant.id.desc())
        .offset((page.page - 1) * page.per_page)
        .limit(page.per_page)
    )
    result = await db.execute(query)
    items = result.scalars().all()
    pages = max(1, (total + page.per_page - 1) // page.per_page)
    return {
        "items": [TenantResponse.model_validate(t) for t in items],
        "total": total,
        "page": page.page,
        "size": page.per_page,
        "pages": pages,
    }


@router.post("/", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    tenant: TenantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    existing = await db.execute(select(Tenant).where(Tenant.tenant_code == tenant.tenant_code))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tenant code '{tenant.tenant_code}' already exists",
        )
    if tenant.domain:
        existing_domain = await db.execute(select(Tenant).where(Tenant.domain == tenant.domain))
        if existing_domain.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Domain '{tenant.domain}' is already registered",
            )
    db_tenant = Tenant(**tenant.model_dump())
    db.add(db_tenant)
    await db.commit()
    await db.refresh(db_tenant)
    await write_audit_entry(
        {
            "action": "tenant.created",
            "entityType": "tenant",
            "entityId": db_tenant.id,
            "userId": current_user.id,
            "userEmail": current_user.email,
            "changes": json.dumps({"tenant_code": tenant.tenant_code, "plan": tenant.plan}),
            "createdAt": datetime.now(UTC).isoformat(),
        }
    )
    return db_tenant


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with ID {tenant_id} not found",
        )
    return tenant


@router.put("/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: int,
    tenant_update: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    db_tenant = result.scalar_one_or_none()
    if not db_tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with ID {tenant_id} not found",
        )
    update_data = tenant_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_tenant, field, value)
    await db.commit()
    await db.refresh(db_tenant)
    await write_audit_entry(
        {
            "action": "tenant.updated",
            "entityType": "tenant",
            "entityId": tenant_id,
            "userId": current_user.id,
            "userEmail": current_user.email,
            "changes": json.dumps(update_data),
            "createdAt": datetime.now(UTC).isoformat(),
        }
    )
    return db_tenant


@router.patch("/{tenant_id}", response_model=TenantResponse)
async def patch_tenant(
    tenant_id: int,
    tenant_update: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    return await update_tenant(tenant_id, tenant_update, db, current_user)


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    db_tenant = result.scalar_one_or_none()
    if not db_tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with ID {tenant_id} not found",
        )
    user_count = await db.execute(
        select(func.count()).select_from(User).where(User.tenantId == tenant_id)
    )
    if user_count.scalar() or 0 > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete tenant with active users. Remove users first.",
        )
    await db.delete(db_tenant)
    await db.commit()
    await write_audit_entry(
        {
            "action": "tenant.deleted",
            "entityType": "tenant",
            "entityId": tenant_id,
            "userId": current_user.id,
            "userEmail": current_user.email,
            "changes": "{}",
            "createdAt": datetime.now(UTC).isoformat(),
        }
    )


@router.get("/{tenant_id}/users")
async def list_tenant_users(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with ID {tenant_id} not found",
        )
    users_result = await db.execute(
        select(User).where(User.tenantId == tenant_id).order_by(User.id)
    )
    users = users_result.scalars().all()
    return {
        "items": [
            {
                "id": u.id,
                "email": u.email,
                "username": u.username,
                "fullName": u.fullName,
                "isActive": u.isActive,
                "isSuperuser": u.isSuperuser,
                "createdAt": u.createdAt.isoformat() if u.createdAt else None,
                "lastLoginAt": u.lastLoginAt.isoformat() if u.lastLoginAt else None,
            }
            for u in users
        ],
        "total": len(users),
    }


@router.post("/{tenant_id}/users", status_code=status.HTTP_201_CREATED)
async def invite_tenant_user(
    tenant_id: int,
    invite: TenantUserInvite,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with ID {tenant_id} not found",
        )
    if tenant.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add users to a non-active tenant",
        )
    user_count = await db.execute(
        select(func.count()).select_from(User).where(User.tenantId == tenant_id)
    )
    if (user_count.scalar() or 0) >= tenant.max_users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tenant has reached max user limit ({tenant.max_users})",
        )
    existing_email = await db.execute(select(User).where(User.email == invite.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    import secrets
    import string

    temp_password = "".join(
        secrets.choice(string.ascii_letters + string.digits + "!@#$%") for _ in range(16)
    )
    username = invite.username or invite.email.split("@")[0]
    db_user = User(
        email=invite.email,
        username=username,
        fullName=invite.fullName or "",
        hashedPassword=get_password_hash(temp_password),
        isActive=True,
        isSuperuser=invite.isSuperuser,
        tenantId=tenant_id,
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    await write_audit_entry(
        {
            "action": "tenant.user_invited",
            "entityType": "user",
            "entityId": db_user.id,
            "userId": current_user.id,
            "userEmail": current_user.email,
            "changes": json.dumps({"tenant_id": tenant_id, "email": invite.email}),
            "createdAt": datetime.now(UTC).isoformat(),
        }
    )
    return {
        "id": db_user.id,
        "email": db_user.email,
        "username": db_user.username,
        "fullName": db_user.fullName,
        "isActive": db_user.isActive,
        "isSuperuser": db_user.isSuperuser,
        "tenantId": db_user.tenantId,
        "temp_password": temp_password,
    }


@router.put("/{tenant_id}/users/{user_id}/transfer", response_model=dict)
async def transfer_user_tenant(
    tenant_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    if not tenant_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with ID {tenant_id} not found",
        )
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )
    old_tenant_id = user.tenantId
    user.tenantId = tenant_id
    await db.commit()
    await write_audit_entry(
        {
            "action": "tenant.user_transferred",
            "entityType": "user",
            "entityId": user_id,
            "userId": current_user.id,
            "userEmail": current_user.email,
            "changes": json.dumps({"from_tenant": old_tenant_id, "to_tenant": tenant_id}),
            "createdAt": datetime.now(UTC).isoformat(),
        }
    )
    return {"message": f"User {user.email} transferred to tenant {tenant_id}"}
