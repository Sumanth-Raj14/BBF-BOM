"""finding: infra-secrets-health #2 - /health/detailed had no auth and leaked
internal row counts/system info, plus hardcoded/fabricated security status fields.
Proves the endpoint now requires auth (401 without, 200 with) and no longer
echoes the fabricated "security"/"authentication" blocks.
"""

import pytest


@pytest.mark.asyncio
async def test_detailed_health_requires_auth(client):
    resp = await client.get("/api/v1/health/detailed")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_detailed_health_ok_with_auth(client, auth_headers):
    resp = await client.get("/api/v1/health/detailed", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "database" in data
    # fabricated hardcoded status blocks must not be echoed as fact
    assert "security" not in data
    assert "authentication" not in data


@pytest.mark.asyncio
async def test_plain_health_stays_unauth(client):
    # liveness probe must stay open (no auth) - only /detailed is locked down
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_create_admin_uses_real_session_maker(monkeypatch, test_engine, test_user):
    """finding: infra-secrets-health #3 - create_admin.py imported the AsyncSessionLocal
    None placeholder directly (only init_engine()/get_session_maker() ever populate it),
    so `async with AsyncSessionLocal() as db:` crashed with "'NoneType' object is not
    callable" before running any query. Prove main() now gets a real session maker: it
    reaches the existing-user check and exits(0) cleanly instead of crashing.
    """
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.scripts import create_admin

    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async def fake_get_session_maker():
        return session_factory

    monkeypatch.setattr(create_admin, "get_session_maker", fake_get_session_maker)
    monkeypatch.setenv("ADMIN_EMAIL", test_user.email)
    monkeypatch.setenv("ADMIN_USERNAME", test_user.username)
    monkeypatch.setenv("ADMIN_PASSWORD", "Sm0ke-Test-Pass!1")

    with pytest.raises(SystemExit) as exc_info:
        await create_admin.main()
    assert exc_info.value.code == 0  # hit "already exists" branch, not a NoneType crash
