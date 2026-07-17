"""Test configuration with PostgreSQL support."""

import os

os.environ["RATE_LIMIT_PER_MINUTE"] = "100000"
os.environ["RATE_LIMIT_AUTH_PER_MINUTE"] = "100000"

import asyncio
import warnings
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.main import app


# Disable lifespan to prevent real PostgreSQL connection during tests
@asynccontextmanager
async def noop_lifespan(app: FastAPI):
    yield


app.lifespan = noop_lifespan

from sqlalchemy import select

import app.db.session as db_session_module
from app.db.base import Base
from app.db.session import get_db
from app.models import *

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    pg_server = os.environ.get("POSTGRES_SERVER", os.environ.get("CI") and "localhost")
    pg_user = os.environ.get("POSTGRES_USER", "bom_user")
    pg_pass = os.environ.get("POSTGRES_PASSWORD", "bom_test_password")
    pg_db = os.environ.get("POSTGRES_DB", "bom_test_db")
    pg_port = os.environ.get("POSTGRES_PORT", "5433" if not os.environ.get("CI") else "5432")
    if pg_server:
        TEST_DATABASE_URL = (
            f"postgresql+asyncpg://{pg_user}:{pg_pass}@{pg_server}:{pg_port}/{pg_db}"
        )
    else:
        TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"
        warnings.warn(
            "Running tests against SQLite — PostgreSQL-specific features will NOT be tested. "
            "Set TEST_DATABASE_URL to a PostgreSQL connection string, "
            "or run: docker compose -f docker-compose.test.yml up -d",
            stacklevel=2,
        )
_IS_SQLITE = "sqlite" in TEST_DATABASE_URL


def pytest_collection_modifyitems(items):
    """Skip tests marked as 'requires_postgres' when running on SQLite."""
    if not _IS_SQLITE:
        return
    for item in items:
        if item.get_closest_marker("requires_postgres"):
            item.add_marker(
                pytest.mark.skip(
                    reason="PostgreSQL-specific test — skipped on SQLite. Set TEST_DATABASE_URL to a PostgreSQL connection string, or run: docker compose -f docker-compose.test.yml up -d"
                )
            )


engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
from app.core.tenant_events import register_tenant_listeners

register_tenant_listeners()
db_session_module._session_maker = TestSessionLocal
db_session_module.AsyncSessionLocal = TestSessionLocal


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    from app.models.permission import Permission
    from app.models.role import Role, role_permissions
    from app.models.tenant import Tenant

    async with TestSessionLocal() as session:
        result = await session.execute(select(Tenant).limit(1))
        tenant = result.scalar_one_or_none()
        if not tenant:
            tenant = Tenant(tenant_name="Default Test Tenant", tenant_code="test_default")
            session.add(tenant)
            await session.flush()

        result = await session.execute(select(Role).limit(1))
        if not result.scalar_one_or_none():
            perms_data = [
                {"name": "parts:read", "resource": "parts", "action": "read"},
                {"name": "parts:write", "resource": "parts", "action": "write"},
                {"name": "parts:delete", "resource": "parts", "action": "delete"},
                {"name": "projects:read", "resource": "projects", "action": "read"},
                {"name": "projects:write", "resource": "projects", "action": "write"},
                {"name": "vendors:read", "resource": "vendors", "action": "read"},
                {"name": "vendors:write", "resource": "vendors", "action": "write"},
            ]
            perm_map = {}
            for pd in perms_data:
                p = Permission(
                    name=pd["name"],
                    resource=pd["resource"],
                    action=pd["action"],
                    tenantId=tenant.id,
                )
                session.add(p)
                await session.flush()
                perm_map[p.name] = p.id

            role_names = ["admin", "engineering", "procurement", "finance", "viewer"]
            role_map = {}
            for rn in role_names:
                r = Role(name=rn, description=f"{rn} role", tenantId=tenant.id)
                session.add(r)
                await session.flush()
                role_map[rn] = r.id

            role_perm_map = {
                "admin": [
                    "parts:read",
                    "parts:write",
                    "parts:delete",
                    "projects:read",
                    "projects:write",
                    "vendors:read",
                    "vendors:write",
                ],
                "engineering": [
                    "parts:read",
                    "parts:write",
                    "parts:delete",
                    "projects:read",
                    "projects:write",
                    "vendors:read",
                    "vendors:write",
                ],
                "procurement": ["parts:read", "vendors:read", "vendors:write"],
                "finance": ["parts:read", "projects:read", "vendors:read"],
                "viewer": ["parts:read", "projects:read", "vendors:read"],
            }
            for rn, perm_names in role_perm_map.items():
                for pn in perm_names:
                    await session.execute(
                        role_permissions.insert().values(
                            role_id=role_map[rn], permission_id=perm_map[pn]
                        )
                    )
        await session.commit()
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session
