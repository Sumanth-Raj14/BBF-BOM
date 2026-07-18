"""TDD for flagged Postgres Row-Level Security (opt-in, staged defense-in-depth).

RLS is layered ON TOP of the existing app-layer tenant isolation
(app.core.tenant_events — auto-filter SELECT, guard UPDATE/DELETE,
auto-populate tenantId on INSERT), which remains the enforcement mechanism
of record and is completely unaffected by this feature.

Two things must hold:
1. With settings.ENABLE_RLS False (the default) — and always on SQLite,
   regardless of the flag — the app behaves exactly as it does today: the
   RLS `SET LOCAL app.current_tenant` guard is never invoked, and existing
   tenant-isolation / request behavior is unchanged.
2. The guard that decides whether to issue the Postgres `SET LOCAL
   app.current_tenant` call is invoked ONLY when
   (settings.ENABLE_RLS is True) AND (session dialect == "postgresql").
   Every other combination (flag off, or flag on but dialect sqlite) is a
   verified no-op — exercised here without needing a live Postgres server,
   by inspecting dialect name / mocking session.execute.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.config import settings
from app.db.rls import apply_rls_tenant_context


def _make_fake_session(dialect_name: str) -> MagicMock:
    session = MagicMock()
    bind = MagicMock()
    bind.dialect.name = dialect_name
    session.get_bind.return_value = bind
    session.execute = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_rls_noop_when_flag_disabled_even_on_postgres_dialect(monkeypatch):
    """Default (ENABLE_RLS=False): never issues SET LOCAL, on ANY dialect."""
    monkeypatch.setattr(settings, "ENABLE_RLS", False)
    session = _make_fake_session("postgresql")

    applied = await apply_rls_tenant_context(session, tenant_id=42)

    assert applied is False
    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_rls_noop_on_sqlite_even_when_flag_enabled(monkeypatch):
    """ENABLE_RLS=True but dialect is sqlite (the default test/dev path): no-op."""
    monkeypatch.setattr(settings, "ENABLE_RLS", True)
    session = _make_fake_session("sqlite")

    applied = await apply_rls_tenant_context(session, tenant_id=42)

    assert applied is False
    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_rls_noop_when_tenant_id_is_none(monkeypatch):
    """Even with everything else enabled, no tenant context means nothing to set."""
    monkeypatch.setattr(settings, "ENABLE_RLS", True)
    session = _make_fake_session("postgresql")

    applied = await apply_rls_tenant_context(session, tenant_id=None)

    assert applied is False
    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_rls_applies_set_local_only_when_flag_on_and_postgres(monkeypatch):
    """The ONE combination that actually issues the guard: flag True + postgresql."""
    monkeypatch.setattr(settings, "ENABLE_RLS", True)
    session = _make_fake_session("postgresql")

    applied = await apply_rls_tenant_context(session, tenant_id=42)

    assert applied is True
    session.execute.assert_awaited_once()
    (stmt, params), _kwargs = session.execute.call_args
    compiled = str(stmt)
    assert "app.current_tenant" in compiled
    assert params == {"tenant_id": "42"}


@pytest.mark.asyncio
async def test_rls_flag_default_is_false():
    """Default posture: RLS is opt-in — must be False unless explicitly enabled."""
    from app.core.config import Settings

    assert Settings.model_fields["ENABLE_RLS"].default is False


@pytest.mark.asyncio
async def test_existing_tenant_isolation_unaffected_when_flag_default(
    client, test_tenant, test_user, auth_headers, db_session
):
    """End-to-end: with ENABLE_RLS at its default (False) on SQLite, ordinary
    authenticated requests behave exactly as before — app-layer tenant
    isolation (tenant_events.py) keeps doing the enforcement, unrelated to RLS.
    """
    assert settings.ENABLE_RLS is False

    resp = await client.get("/api/v1/parts", headers=auth_headers)
    # Route responds normally (200/307-redirect/404-not-registered-here) — the
    # key assertion is the ABSENCE of a 500 from any RLS-related crash.
    assert resp.status_code in (200, 307, 404)
