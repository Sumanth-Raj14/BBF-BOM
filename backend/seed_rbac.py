"""Seed database with default roles and permissions for Phase 2."""

import asyncio
import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.db.base import Base
from app.models.permission import Permission
from app.models.role import Role, role_permissions

DATABASE_URL = (
    os.environ.get("DATABASE_URL")
    or os.environ.get("DATABASE_URI")
    or "postgresql+asyncpg://bom_user:bom_password@127.0.0.1:5432/bom_db"
)

# Default roles
DEFAULT_ROLES = [
    {"name": "superadmin", "description": "Full system access - bypasses all checks"},
    {
        "name": "admin",
        "description": "Administrative access - manages users, roles, settings",
    },
    {
        "name": "engineering",
        "description": "Engineering team - manage BOMs, parts, CAD, documents",
    },
    {
        "name": "procurement",
        "description": "Procurement team - manage POs, vendors, RFQs",
    },
    {"name": "finance", "description": "Finance team - view reports, approve budgets"},
    {"name": "viewer", "description": "Read-only access to all modules"},
]

# Default permissions (resource:action format)
DEFAULT_PERMISSIONS = [
    # Parts
    {
        "name": "parts:read",
        "resource": "parts",
        "action": "read",
        "description": "View parts",
    },
    {
        "name": "parts:write",
        "resource": "parts",
        "action": "write",
        "description": "Create/edit parts",
    },
    {
        "name": "parts:delete",
        "resource": "parts",
        "action": "delete",
        "description": "Delete parts",
    },
    # Projects
    {
        "name": "projects:read",
        "resource": "projects",
        "action": "read",
        "description": "View projects",
    },
    {
        "name": "projects:write",
        "resource": "projects",
        "action": "write",
        "description": "Create/edit projects",
    },
    {
        "name": "projects:delete",
        "resource": "projects",
        "action": "delete",
        "description": "Delete projects",
    },
    # Vendors
    {
        "name": "vendors:read",
        "resource": "vendors",
        "action": "read",
        "description": "View vendors",
    },
    {
        "name": "vendors:write",
        "resource": "vendors",
        "action": "write",
        "description": "Create/edit vendors",
    },
    {
        "name": "vendors:delete",
        "resource": "vendors",
        "action": "delete",
        "description": "Delete vendors",
    },
    # Procurement
    {
        "name": "procurement:read",
        "resource": "procurement",
        "action": "read",
        "description": "View POs",
    },
    {
        "name": "procurement:write",
        "resource": "procurement",
        "action": "write",
        "description": "Create/edit POs",
    },
    {
        "name": "procurement:approve",
        "resource": "procurement",
        "action": "approve",
        "description": "Approve POs",
    },
    # Documents
    {
        "name": "documents:read",
        "resource": "documents",
        "action": "read",
        "description": "View documents",
    },
    {
        "name": "documents:write",
        "resource": "documents",
        "action": "write",
        "description": "Upload/edit documents",
    },
    {
        "name": "documents:delete",
        "resource": "documents",
        "action": "delete",
        "description": "Delete documents",
    },
    # Analytics
    {
        "name": "analytics:read",
        "resource": "analytics",
        "action": "read",
        "description": "View analytics",
    },
    {
        "name": "analytics:export",
        "resource": "analytics",
        "action": "export",
        "description": "Export analytics",
    },
    # Admin
    {
        "name": "admin:access",
        "resource": "admin",
        "action": "access",
        "description": "Access admin panel",
    },
    {
        "name": "admin:users",
        "resource": "admin",
        "action": "users",
        "description": "Manage users",
    },
    {
        "name": "admin:roles",
        "resource": "admin",
        "action": "roles",
        "description": "Manage roles",
    },
    {
        "name": "admin:settings",
        "resource": "admin",
        "action": "settings",
        "description": "Manage settings",
    },
    # CAD
    {
        "name": "cad:read",
        "resource": "cad",
        "action": "read",
        "description": "View CAD files",
    },
    {
        "name": "cad:write",
        "resource": "cad",
        "action": "write",
        "description": "Upload/edit CAD files",
    },
    {
        "name": "cad:sync",
        "resource": "cad",
        "action": "sync",
        "description": "Sync with CAD",
    },
    # Scraping
    {
        "name": "scraping:use",
        "resource": "scraping",
        "action": "use",
        "description": "Use scraping engine",
    },
]

# Role-permission mappings
ROLE_PERMISSION_MAP = {
    "superadmin": [p["name"] for p in DEFAULT_PERMISSIONS],  # All permissions
    "admin": [
        "parts:read",
        "parts:write",
        "parts:delete",
        "projects:read",
        "projects:write",
        "projects:delete",
        "vendors:read",
        "vendors:write",
        "vendors:delete",
        "procurement:read",
        "procurement:write",
        "procurement:approve",
        "documents:read",
        "documents:write",
        "documents:delete",
        "analytics:read",
        "analytics:export",
        "admin:access",
        "admin:users",
        "admin:roles",
        "admin:settings",
        "cad:read",
        "cad:write",
        "cad:sync",
        "scraping:use",
    ],
    "engineering": [
        "parts:read",
        "parts:write",
        "projects:read",
        "projects:write",
        "vendors:read",
        "documents:read",
        "documents:write",
        "analytics:read",
        "cad:read",
        "cad:write",
        "cad:sync",
    ],
    "procurement": [
        "parts:read",
        "projects:read",
        "vendors:read",
        "vendors:write",
        "procurement:read",
        "procurement:write",
        "procurement:approve",
        "documents:read",
        "documents:write",
        "analytics:read",
        "scraping:use",
    ],
    "finance": [
        "parts:read",
        "projects:read",
        "vendors:read",
        "procurement:read",
        "documents:read",
        "analytics:read",
        "analytics:export",
    ],
    "viewer": [
        "parts:read",
        "projects:read",
        "vendors:read",
        "procurement:read",
        "documents:read",
        "analytics:read",
        "cad:read",
    ],
}


async def seed():
    engine = create_async_engine(DATABASE_URL)

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = AsyncSession(engine, expire_on_commit=False)

    async with async_session as session:
        async with session.begin():
            # Clear existing
            await session.execute(text("DELETE FROM role_permissions"))
            await session.execute(text("DELETE FROM user_roles"))
            await session.execute(text("DELETE FROM permissions"))
            await session.execute(text("DELETE FROM roles"))

            # Create permissions
            perm_map = {}
            for perm_data in DEFAULT_PERMISSIONS:
                perm = Permission(
                    name=perm_data["name"],
                    resource=perm_data["resource"],
                    action=perm_data["action"],
                    description=perm_data["description"],
                )
                session.add(perm)
                await session.flush()
                perm_map[perm.name] = perm.id

            # Create roles
            role_map = {}
            for role_data in DEFAULT_ROLES:
                role = Role(name=role_data["name"], description=role_data["description"])
                session.add(role)
                await session.flush()
                role_map[role.name] = role.id

            # Assign permissions to roles
            for role_name, perm_names in ROLE_PERMISSION_MAP.items():
                role_id = role_map.get(role_name)
                if not role_id:
                    continue
                for perm_name in perm_names:
                    perm_id = perm_map.get(perm_name)
                    if perm_id:
                        await session.execute(
                            role_permissions.insert().values(role_id=role_id, permission_id=perm_id)
                        )

        # Verify
        result = await session.execute(text("SELECT COUNT(*) FROM roles"))
        role_count = result.scalar()
        result = await session.execute(text("SELECT COUNT(*) FROM permissions"))
        perm_count = result.scalar()
        result = await session.execute(text("SELECT COUNT(*) FROM role_permissions"))
        mapping_count = result.scalar()
        print(
            f"Created {role_count} roles, {perm_count} permissions, {mapping_count} role-permission mappings"
        )

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
