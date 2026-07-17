"""Roles and permissions service layer — business logic for RBAC management."""

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams, paginate
from app.models.permission import Permission
from app.models.role import Role, role_permissions, user_roles
from app.models.user import User

# ============ Roles ============


async def list_roles(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(Role))
    roles = result.scalars().all()

    responses = []
    for role in roles:
        user_count = len(
            (
                await db.execute(
                    select(user_roles.c.user_id).where(user_roles.c.role_id == role.id)
                )
            ).fetchall()
        )
        perm_count = len(
            (
                await db.execute(
                    select(role_permissions.c.permission_id).where(
                        role_permissions.c.role_id == role.id
                    )
                )
            ).fetchall()
        )
        responses.append(
            {
                "id": role.id,
                "name": role.name,
                "description": role.description,
                "isActive": role.isActive,
                "userCount": user_count,
                "permissionCount": perm_count,
                "createdAt": str(role.createdAt) if role.createdAt else None,
            }
        )
    return responses


async def create_role(db: AsyncSession, name: str, description: Optional[str] = None) -> dict:
    result = await db.execute(select(Role).where(Role.name == name))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Role name already exists")

    role = Role(name=name, description=description)
    db.add(role)
    await db.commit()
    await db.refresh(role)

    return {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "isActive": role.isActive,
        "createdAt": str(role.createdAt) if role.createdAt else None,
    }


async def update_role(db: AsyncSession, role_id: int, data: dict) -> dict:
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    for field, value in data.items():
        if hasattr(role, field):
            setattr(role, field, value)

    await db.commit()
    await db.refresh(role)

    return {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "isActive": role.isActive,
        "createdAt": str(role.createdAt) if role.createdAt else None,
    }


async def delete_role(db: AsyncSession, role_id: int) -> None:
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    await db.execute(role_permissions.delete().where(role_permissions.c.role_id == role_id))
    await db.execute(user_roles.delete().where(user_roles.c.role_id == role_id))
    await db.delete(role)
    await db.commit()


# ============ Permissions ============


async def list_permissions(db: AsyncSession, page: PageParams) -> dict:
    query = select(Permission).order_by(Permission.id)
    result = await paginate(db, query, page)
    result["items"] = [
        {
            "id": p.id,
            "name": p.name,
            "resource": p.resource,
            "action": p.action,
            "description": p.description,
            "isActive": p.isActive,
        }
        for p in result["items"]
    ]
    return result


async def create_permission(
    db: AsyncSession,
    name: str,
    resource: Optional[str] = None,
    action: Optional[str] = None,
    description: Optional[str] = None,
) -> dict:
    result = await db.execute(select(Permission).where(Permission.name == name))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Permission name already exists")

    perm = Permission(name=name, resource=resource, action=action, description=description)
    db.add(perm)
    await db.commit()
    await db.refresh(perm)

    return {
        "id": perm.id,
        "name": perm.name,
        "resource": perm.resource,
        "action": perm.action,
        "description": perm.description,
        "isActive": perm.isActive,
    }


# ============ Assignments ============


async def assign_user_role(db: AsyncSession, user_id: int, role_id: int) -> str:
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")
    role_result = await db.execute(select(Role).where(Role.id == role_id))
    if not role_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Role not found")

    existing = await db.execute(
        select(user_roles).where(
            (user_roles.c.user_id == user_id) & (user_roles.c.role_id == role_id)
        )
    )
    if existing.scalar_one_or_none():
        return "User already has this role"

    await db.execute(user_roles.insert().values(user_id=user_id, role_id=role_id))
    await db.commit()
    return "User assigned to role successfully"


async def unassign_user_role(db: AsyncSession, user_id: int, role_id: int) -> str:
    await db.execute(
        user_roles.delete().where(
            (user_roles.c.user_id == user_id) & (user_roles.c.role_id == role_id)
        )
    )
    await db.commit()
    return "User removed from role successfully"


async def assign_role_permission(db: AsyncSession, role_id: int, permission_id: int) -> str:
    role_result = await db.execute(select(Role).where(Role.id == role_id))
    if not role_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Role not found")
    perm_result = await db.execute(select(Permission).where(Permission.id == permission_id))
    if not perm_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Permission not found")

    existing = await db.execute(
        select(role_permissions).where(
            (role_permissions.c.role_id == role_id)
            & (role_permissions.c.permission_id == permission_id)
        )
    )
    if existing.scalar_one_or_none():
        return "Role already has this permission"

    await db.execute(role_permissions.insert().values(role_id=role_id, permission_id=permission_id))
    await db.commit()
    return "Permission assigned to role successfully"


async def get_role_users(db: AsyncSession, role_id: int) -> list[dict]:
    result = await db.execute(select(User).join(user_roles).where(user_roles.c.role_id == role_id))
    users = result.scalars().all()
    return [
        {"id": u.id, "email": u.email, "username": u.username, "fullName": u.fullName}
        for u in users
    ]


async def get_role_permissions(db: AsyncSession, role_id: int) -> list[dict]:
    result = await db.execute(
        select(Permission).join(role_permissions).where(role_permissions.c.role_id == role_id)
    )
    permissions = result.scalars().all()
    return [
        {"id": p.id, "name": p.name, "resource": p.resource, "action": p.action}
        for p in permissions
    ]
