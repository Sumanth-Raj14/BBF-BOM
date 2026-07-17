import os

# Test environment overrides — set BEFORE any app imports
os.environ["RATE_LIMIT_PER_MINUTE"] = "100000"
os.environ["RATE_LIMIT_AUTH_PER_MINUTE"] = "100000"
os.environ["DISABLE_AUDIT_LOG"] = "1"
os.environ["DISABLE_CACHE_DB_FALLBACK"] = "1"
os.environ["ALLOWED_HOSTS"] = '["localhost","127.0.0.1","testserver",".blackbox-bom.com"]'

import asyncio
import warnings
from contextlib import asynccontextmanager

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.db.session as db_session_module
from app.core.security import get_password_hash
from app.core.tenant_context import TenantContext
from app.core.tenant_events import register_tenant_listeners
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import *  # noqa: F401, F403 — register ALL models with Base.metadata before create_all
from app.models.tenant import Tenant
from app.models.user import User


@asynccontextmanager
async def noop_lifespan(app):
    yield


app.lifespan = noop_lifespan


# NOTE: PostgreSQL is the production database. Tests should run against PostgreSQL
# for full fidelity. SQLite fallback is only for environments without Docker.
#
# To run tests against PostgreSQL locally:
#   1. Start the test DB: docker compose -f docker-compose.test.yml up -d
#   2. Set env vars: SET TEST_DATABASE_URL=postgresql+asyncpg://bom_user:bom_test_password@localhost:5433/bom_test_db
#      Or: SET CI=true (auto-detect)
#   3. Run tests: python -m pytest app/tests/ -v
#
# The CI pipeline (GitHub Actions) always runs tests against PostgreSQL.
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


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    db_session_module._session_maker = session_factory
    db_session_module.AsyncSessionLocal = session_factory
    register_tenant_listeners()
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine):
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(autouse=True)
async def clean_db(test_engine):
    yield
    async with test_engine.begin() as conn:
        await conn.exec_driver_sql("PRAGMA foreign_keys = OFF")
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())
        await conn.exec_driver_sql("PRAGMA foreign_keys = ON")


@pytest.fixture(autouse=True)
def reset_rate_limit_caches():
    """Clear module-level rate limit caches between tests to prevent state pollution."""
    import app.core.deps as deps_mod
    import app.services.auth_service as auth_svc

    auth_svc._FAILED_LOGIN_IPS.clear()
    deps_mod._user_rate_limits.clear()
    deps_mod._api_key_rate_limits.clear()
    yield
    auth_svc._FAILED_LOGIN_IPS.clear()
    deps_mod._user_rate_limits.clear()
    deps_mod._api_key_rate_limits.clear()


@pytest_asyncio.fixture(scope="session")
def tenant_id():
    return 1


@pytest_asyncio.fixture(autouse=True)
async def setup_tenant_context(tenant_id):
    token = TenantContext.set(tenant_id=tenant_id)
    yield
    TenantContext.reset(token)


@pytest_asyncio.fixture
async def test_tenant(db_session, tenant_id):
    tenant = Tenant(id=tenant_id, tenant_name="Test Tenant", tenant_code="TEST")
    db_session.add(tenant)
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture
async def test_user(db_session, test_tenant, tenant_id):
    user = User(
        email="test@example.com",
        username="testuser",
        fullName="Test User",
        hashedPassword=get_password_hash("testpass123"),
        isActive=True,
        isSuperuser=True,
        tenantId=tenant_id,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_headers(client, test_user):
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "testpass123"},
    )
    token = resp.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    csrf_cookie = client.cookies.get("csrf_token")
    if csrf_cookie:
        headers["X-CSRF-Token"] = csrf_cookie.split(".")[0]
    return headers
