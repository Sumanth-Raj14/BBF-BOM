"""Roles and Permissions CRUD endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params
from app.core.rbac import require_admin
from app.db.session import get_db
from app.models.user import User
from app.services import roles_service

router = APIRouter(dependencies=[Depends(get_current_user)])


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    isActive: Optional[bool] = None


class RoleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    isActive: bool
    userCount: int = 0
    permissionCount: int = 0
    createdAt: Optional[str] = None


class PermissionCreate(BaseModel):
    name: str
    resource: Optional[str] = None
    action: Optional[str] = None
    description: Optional[str] = None


class PermissionResponse(BaseModel):
    id: int
    name: str
    resource: Optional[str]
    action: Optional[str]
    description: Optional[str]
    isActive: bool


class UserRoleAssign(BaseModel):
    userId: int
    roleId: int


class RolePermissionAssign(BaseModel):
    roleId: int
    permissionId: int


@router.get("/roles", response_model=list[RoleResponse])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    items = await roles_service.list_roles(db)
    return [RoleResponse(**item) for item in items]


@router.post("/roles", response_model=RoleResponse, status_code=201)
async def create_role(
    role_data: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await roles_service.create_role(db, role_data.name, role_data.description)
    result["userCount"] = 0
    result["permissionCount"] = 0
    return RoleResponse(**result)


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: int,
    role_data: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await roles_service.update_role(db, role_id, role_data.model_dump(exclude_unset=True))
    return RoleResponse(**result)


@router.patch("/roles/{role_id}", response_model=RoleResponse)
async def patch_role(
    role_id: int,
    role_data: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return await update_role(role_id, role_data, db, current_user)


@router.delete("/roles/{role_id}", status_code=204)
async def delete_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    await roles_service.delete_role(db, role_id)
    return None


@router.get("/permissions")
async def list_permissions(
    page: PageParams = Depends(get_page_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return await roles_service.list_permissions(db, page)


@router.post("/permissions", response_model=PermissionResponse, status_code=201)
async def create_permission(
    perm_data: PermissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await roles_service.create_permission(
        db, perm_data.name, perm_data.resource, perm_data.action, perm_data.description
    )
    return PermissionResponse(**result)


@router.post("/roles/assign-user")
async def assign_user_to_role(
    assignment: UserRoleAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    message = await roles_service.assign_user_role(db, assignment.userId, assignment.roleId)
    return {"message": message}


@router.post("/roles/unassign-user")
async def unassign_user_from_role(
    assignment: UserRoleAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    message = await roles_service.unassign_user_role(db, assignment.userId, assignment.roleId)
    return {"message": message}


@router.post("/roles/assign-permission")
async def assign_permission_to_role(
    assignment: RolePermissionAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    message = await roles_service.assign_role_permission(
        db, assignment.roleId, assignment.permissionId
    )
    return {"message": message}


@router.get("/roles/{role_id}/users")
async def get_role_users(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return await roles_service.get_role_users(db, role_id)


@router.get("/roles/{role_id}/permissions")
async def get_role_permissions(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return await roles_service.get_role_permissions(db, role_id)
