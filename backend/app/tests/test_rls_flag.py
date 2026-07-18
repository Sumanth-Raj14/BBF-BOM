"""TDD for flagged Postgres Row-Level Security (opt-in, staged defense-in-depth).

Follow-up (review-fix) coverage added below the original suite:

- The auth-bootstrap escape hatch (`apply_rls_auth_bootstrap` /
  `clear_rls_auth_bootstrap`) that breaks the chicken-and-egg where
  identity-resolution reads (`api_keys`, `users`, `user_mfa`) are
  themselves RLS-protected tenant tables.
- Ordering: `app.core.deps` must pin the RLS tenant context BEFORE the
  RLS-protected SELECTs it uses to resolve identity, not after.
- Migration 040's `upgrade()` must stay a no-op on Postgres unless
  `settings.ENABLE_RLS` is ALSO True at migration time (not gated on
  dialect alone), so a routine `alembic upgrade head` never forces RLS
  on an otherwise-untouched deployment.

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


# ---------------------------------------------------------------------------
# Review-fix coverage: auth-bootstrap escape hatch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auth_bootstrap_noop_when_flag_disabled(monkeypatch):
    from app.db.rls import apply_rls_auth_bootstrap, clear_rls_auth_bootstrap

    monkeypatch.setattr(settings, "ENABLE_RLS", False)
    session = _make_fake_session("postgresql")

    assert await apply_rls_auth_bootstrap(session) is False
    assert await clear_rls_auth_bootstrap(session) is False
    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_auth_bootstrap_noop_on_sqlite_even_when_flag_enabled(monkeypatch):
    from app.db.rls import apply_rls_auth_bootstrap, clear_rls_auth_bootstrap

    monkeypatch.setattr(settings, "ENABLE_RLS", True)
    session = _make_fake_session("sqlite")

    assert await apply_rls_auth_bootstrap(session) is False
    assert await clear_rls_auth_bootstrap(session) is False
    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_auth_bootstrap_sets_and_clears_flag_on_postgres(monkeypatch):
    from app.db.rls import apply_rls_auth_bootstrap, clear_rls_auth_bootstrap

    monkeypatch.setattr(settings, "ENABLE_RLS", True)
    session = _make_fake_session("postgresql")

    assert await apply_rls_auth_bootstrap(session) is True
    (on_stmt,), _ = session.execute.call_args
    assert "app.rls_bootstrap" in str(on_stmt)
    assert "'on'" in str(on_stmt)

    assert await clear_rls_auth_bootstrap(session) is True
    (off_stmt,), _ = session.execute.call_args
    assert "app.rls_bootstrap" in str(off_stmt)
    assert "'off'" in str(off_stmt)


# ---------------------------------------------------------------------------
# Review-fix coverage: deps.py ordering (critical finding #1)
# ---------------------------------------------------------------------------


class _FakeUser:
    def __init__(self, id, tenantId, isActive=True, isSuperuser=False):
        self.id = id
        self.tenantId = tenantId
        self.isActive = isActive
        self.isSuperuser = isSuperuser

    @property
    def effective_tenant_id(self):
        return None if self.isSuperuser else self.tenantId


@pytest.mark.asyncio
async def test_get_current_user_pins_rls_tenant_before_user_select(monkeypatch):
    """The RLS tenant pin (derived from the already-signature-verified JWT
    claims) must be applied BEFORE `select(User)...` runs — `users` is
    itself RLS-protected, so selecting it first would see zero rows once
    ENABLE_RLS is on against Postgres (critical finding #1)."""
    from app.core import deps

    call_order = []
    fake_user = _FakeUser(id=1, tenantId=7)

    async def fake_verify_token_with_blacklist(token, expected_type=None):
        return {"sub": "1", "tenantId": 7, "isSuperuser": False}

    async def fake_apply_rls_tenant_context(session, tenant_id):
        call_order.append(("apply_rls", tenant_id))
        return True

    async def fake_execute(*args, **kwargs):
        call_order.append("execute_user")
        result = MagicMock()
        result.scalar_one_or_none.return_value = fake_user
        return result

    monkeypatch.setattr(deps, "verify_token_with_blacklist", fake_verify_token_with_blacklist)
    monkeypatch.setattr(deps, "apply_rls_tenant_context", fake_apply_rls_tenant_context)
    monkeypatch.setattr(deps, "_check_user_rate_limit", AsyncMock(return_value=True))

    request = MagicMock()
    request.headers.get.return_value = None  # no X-API-Key -> bearer path
    request.cookies.get.return_value = None

    db = MagicMock()
    db.execute = AsyncMock(side_effect=fake_execute)

    user = await deps.get_current_user(request=request, token="tok", db=db)

    assert user is fake_user
    first_apply_index = call_order.index(("apply_rls", 7))
    execute_index = call_order.index("execute_user")
    assert first_apply_index < execute_index, (
        f"RLS tenant pin must precede the User SELECT, got order: {call_order}"
    )


@pytest.mark.asyncio
async def test_authenticate_by_api_key_bootstraps_before_lookups(monkeypatch):
    """The narrow auth-bootstrap escape hatch must open before BOTH
    RLS-protected identity-resolution reads (api_keys, then users), close
    once identity is resolved, and only then pin the real tenant — and the
    per-transaction bootstrap flag must be re-opened after the mid-flow
    `db.commit()`, since commit ends the transaction and resets any
    `SET LOCAL`-style GUC (critical finding #1)."""
    from app.core import deps

    call_order = []

    async def fake_bootstrap(session):
        call_order.append("bootstrap_on")
        return True

    async def fake_clear(session):
        call_order.append("bootstrap_off")
        return True

    async def fake_apply_tenant(session, tenant_id):
        call_order.append(("apply_tenant", tenant_id))
        return True

    fake_api_key = MagicMock()
    fake_api_key.is_active = True
    fake_api_key.key_hash = "hash"
    fake_api_key.expires_at = None
    fake_api_key.user_id = 1

    fake_user = _FakeUser(id=1, tenantId=9, isSuperuser=False)
    execute_calls: list[int] = []

    async def fake_execute(*args, **kwargs):
        execute_calls.append(len(execute_calls) + 1)
        call_order.append(f"execute_{execute_calls[-1]}")
        result = MagicMock()
        if len(execute_calls) == 1:
            result.scalar_one_or_none.return_value = fake_api_key
        else:
            result.scalar_one_or_none.return_value = fake_user
        return result

    monkeypatch.setattr(deps, "apply_rls_auth_bootstrap", fake_bootstrap)
    monkeypatch.setattr(deps, "clear_rls_auth_bootstrap", fake_clear)
    monkeypatch.setattr(deps, "apply_rls_tenant_context", fake_apply_tenant)
    monkeypatch.setattr(deps, "verify_password", lambda raw, hashed: True)
    monkeypatch.setattr(deps, "_check_api_key_rate_limit", AsyncMock(return_value=True))

    request = MagicMock()
    request.headers.get.return_value = "prefix_secret"

    db = MagicMock()
    db.execute = AsyncMock(side_effect=fake_execute)
    db.commit = AsyncMock()

    user = await deps._authenticate_by_api_key(request, db)

    assert user is fake_user
    assert call_order == [
        "bootstrap_on",
        "execute_1",
        "bootstrap_on",
        "execute_2",
        "bootstrap_off",
        ("apply_tenant", 9),
    ], call_order


# ---------------------------------------------------------------------------
# Review-fix coverage: migration 040 gated on settings.ENABLE_RLS too
# (critical finding #2)
# ---------------------------------------------------------------------------


def _load_migration_040():
    import importlib.util
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[2]
        / "alembic"
        / "versions"
        / "040_postgres_rls_tenant_isolation.py"
    )
    spec = importlib.util.spec_from_file_location("rls_migration_040_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_040_noop_on_postgres_when_enable_rls_false(monkeypatch):
    """A routine `alembic upgrade head` against a real Postgres deployment
    that has never touched ENABLE_RLS (default False) must NOT force RLS —
    otherwise every ordinary deploy fails closed for everyone."""
    monkeypatch.setattr(settings, "ENABLE_RLS", False)
    mod = _load_migration_040()

    fake_bind = MagicMock()
    fake_bind.dialect.name = "postgresql"
    fake_op = MagicMock()
    fake_op.get_bind.return_value = fake_bind
    monkeypatch.setattr(mod, "op", fake_op)

    mod.upgrade()

    fake_bind.execute.assert_not_called()


def test_migration_040_applies_when_enable_rls_true_on_postgres(monkeypatch):
    """When an operator DOES opt in (ENABLE_RLS=True at migration time) on
    Postgres, the migration installs both the tenant policy and, on the
    auth-bootstrap tables, the SELECT-only bootstrap policy."""
    monkeypatch.setattr(settings, "ENABLE_RLS", True)
    mod = _load_migration_040()

    fake_bind = MagicMock()
    fake_bind.dialect.name = "postgresql"
    fake_bind.execute.return_value.fetchall.return_value = [("users",), ("parts",)]
    fake_op = MagicMock()
    fake_op.get_bind.return_value = fake_bind
    monkeypatch.setattr(mod, "op", fake_op)

    mod.upgrade()

    executed_sql = " ".join(str(c.args[0]) for c in fake_bind.execute.call_args_list)
    assert "ENABLE ROW LEVEL SECURITY" in executed_sql
    assert "FORCE ROW LEVEL SECURITY" in executed_sql
    assert "tenant_isolation_auth_bootstrap" in executed_sql
    assert executed_sql.count("tenant_isolation_auth_bootstrap") >= 2  # DROP + CREATE, for "users" only


def test_migration_040_downgrade_always_gated_on_dialect_only(monkeypatch):
    """downgrade() must remain able to clean up regardless of the current
    flag value (e.g. flag flipped off after having been on)."""
    monkeypatch.setattr(settings, "ENABLE_RLS", False)
    mod = _load_migration_040()

    fake_bind = MagicMock()
    fake_bind.dialect.name = "postgresql"
    fake_bind.execute.return_value.fetchall.return_value = [("users",)]
    fake_op = MagicMock()
    fake_op.get_bind.return_value = fake_bind
    monkeypatch.setattr(mod, "op", fake_op)

    mod.downgrade()

    executed_sql = " ".join(str(c.args[0]) for c in fake_bind.execute.call_args_list)
    assert "DISABLE ROW LEVEL SECURITY" in executed_sql
    assert "tenant_isolation_auth_bootstrap" in executed_sql
