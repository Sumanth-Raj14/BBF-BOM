"""Regression tests for the 2026-08-09 DB-mistargeting incident.

Covers:
  - app.db.session.resolve_database_url() precedence
  - scripts._db_guard.require_non_production_db() refusal/allow rules
  - the five follow-up chokepoints an adversarial re-audit found still
    bypassing both of the above: seed_po.py, fix_columns.py, seed_rbac.py,
    alembic/env.py, scripts/init_db.py -- plus the other seed scripts
    (seed_db.py, seed_extra.py, seed_enterprise_data.py, load_bom_data.py,
    scripts/consolidate_po.py) the same audit swept up.

No real connections are opened here — every URL used below points at an
unresolvable host, so even if a guard failed to fire, nothing could reach a
real server. These only test string resolution and guard refusal.
"""
import asyncio
import importlib
import os
import sys

import pytest

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.db import session as db_session  # noqa: E402
from scripts._db_guard import require_non_production_db  # noqa: E402

# A Postgres-shaped URL that can never resolve to a real server, and whose
# database name carries no test/e2e/scratch/sweep marker -- i.e. exactly the
# shape require_non_production_db() must refuse.
_LIVE_LOOKING_URL = "postgresql+asyncpg://bom_user:s3cr3t@nonexistent.invalid:5432/bom_db"


@pytest.fixture(autouse=True)
def _reset_log_flag(monkeypatch):
    # resolve_database_url() only logs once; don't let one test's call suppress
    # another's assertions about behavior (logging isn't under test here).
    monkeypatch.setattr(db_session, "_url_logged", True)


def test_test_database_url_wins_over_everything(monkeypatch):
    monkeypatch.setenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///./scratch_wins.db")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@unresolvable-host/other_db")
    monkeypatch.setattr(db_session.settings, "DATABASE_URI", "postgresql+asyncpg://u:p@unresolvable-host/bom_db")
    assert db_session.resolve_database_url() == "sqlite+aiosqlite:///./scratch_wins.db"


def test_database_url_wins_over_settings(monkeypatch):
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@unresolvable-host/other_db")
    monkeypatch.setattr(db_session.settings, "DATABASE_URI", "postgresql+asyncpg://u:p@unresolvable-host/bom_db")
    assert db_session.resolve_database_url() == "postgresql+asyncpg://u:p@unresolvable-host/other_db"


def test_falls_back_to_settings_when_neither_env_var_set(monkeypatch):
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(db_session.settings, "DATABASE_URI", "postgresql+asyncpg://u:p@unresolvable-host/bom_db")
    assert db_session.resolve_database_url() == "postgresql+asyncpg://u:p@unresolvable-host/bom_db"


def test_redact_url_hides_password():
    redacted = db_session.redact_url("postgresql+asyncpg://bom_user:s3cr3t@host:5432/bom_db")
    assert "s3cr3t" not in redacted
    assert "bom_user" in redacted
    assert "bom_db" in redacted


def test_guard_refuses_live_looking_postgres_url():
    with pytest.raises(RuntimeError, match="Refusing"):
        require_non_production_db("postgresql+asyncpg://bom_user:s3cr3t@unresolvable-host/bom_db")


def test_guard_refusal_message_redacts_password():
    with pytest.raises(RuntimeError) as exc_info:
        require_non_production_db("postgresql+asyncpg://bom_user:s3cr3t@unresolvable-host/bom_db")
    assert "s3cr3t" not in str(exc_info.value)


def test_guard_allows_sqlite():
    url = require_non_production_db("sqlite+aiosqlite:///./scratch_anything.db")
    assert url == "sqlite+aiosqlite:///./scratch_anything.db"


def test_guard_allows_test_named_database():
    url = require_non_production_db("postgresql+asyncpg://u:p@unresolvable-host/bom_test_db")
    assert url == "postgresql+asyncpg://u:p@unresolvable-host/bom_test_db"


def test_guard_allows_explicit_override(monkeypatch):
    monkeypatch.setenv("ALLOW_SEED_ON_LIVE_DB", "true")
    url = require_non_production_db("postgresql+asyncpg://u:p@unresolvable-host/bom_db")
    assert url == "postgresql+asyncpg://u:p@unresolvable-host/bom_db"


def test_guard_override_requires_truthy_value(monkeypatch):
    monkeypatch.setenv("ALLOW_SEED_ON_LIVE_DB", "false")
    with pytest.raises(RuntimeError, match="Refusing"):
        require_non_production_db("postgresql+asyncpg://u:p@unresolvable-host/bom_db")


# ---------------------------------------------------------------------------
# alembic/env.py: TEST_DATABASE_URL precedence (Finding 4)
# ---------------------------------------------------------------------------


def _resolve_alembic_env_url(monkeypatch, **env_vars):
    """Execute the actual URL-resolution block of backend/alembic/env.py in
    isolation and return the sqlalchemy.url it picked.

    We can't just `import` alembic/env.py: it's designed to run inside an
    alembic EnvironmentContext (it reaches `context.is_offline_mode()` /
    `run_migrations_online()` at module scope), which would require a full
    alembic Config + ScriptDirectory + a live migration run to even set up
    `context.config`. Instead we slice out the exact source block that does
    the env-var precedence work and exec it against a fake `config` stand-in
    that only implements `set_main_option`/`config_file_name` -- exercising
    the real code, not a re-implementation of it, without touching alembic's
    EnvironmentContext machinery or opening any connection.
    """
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URI", raising=False)
    for key, value in env_vars.items():
        monkeypatch.setenv(key, value)

    env_py_path = os.path.join(_BACKEND_DIR, "alembic", "env.py")
    with open(env_py_path, encoding="utf-8") as f:
        source = f.read()

    start = source.index("# Override sqlalchemy.url")
    end = source.index("\n# Interpret the config file")
    snippet = source[start:end]

    class _FakeConfig:
        def __init__(self):
            self.url = None

        def set_main_option(self, key, value):
            assert key == "sqlalchemy.url"
            self.url = value

    fake_config = _FakeConfig()
    exec(compile(snippet, env_py_path, "exec"), {"config": fake_config})  # noqa: S102
    return fake_config.url


def test_alembic_env_explicit_database_url_wins_over_test_database_url(monkeypatch):
    """Alembic's precedence is deliberately the REVERSE of the app's.

    app.db.session.resolve_database_url() puts TEST_DATABASE_URL first, because
    the app must never escape the test database. Alembic is different: it is a
    CLI aimed at one specific target, and callers run it as a subprocess with
    DATABASE_URL set to a particular throwaway file while TEST_DATABASE_URL
    still names the pytest *session* database (see
    test_regulated_foundation.py / test_zoho_books_foundation.py, which stamp a
    fresh sqlite file then upgrade it).

    Preferring TEST_DATABASE_URL here made those upgrades run against the
    session DB that conftest had already create_all()'d, failing with
    "table substance_groups already exists". So an explicit DATABASE_URL — the
    more specific, deliberate instruction — wins for the CLI.
    """
    monkeypatch.setattr(
        db_session.settings, "DATABASE_URI", "postgresql+asyncpg://u:p@nonexistent.invalid/bom_db"
    )
    url = _resolve_alembic_env_url(
        monkeypatch,
        TEST_DATABASE_URL="sqlite+aiosqlite:///./session.db",
        DATABASE_URL="sqlite+aiosqlite:///./explicit_target.db",
    )
    assert url == "sqlite+aiosqlite:///./explicit_target.db"


def test_alembic_env_uses_test_database_url_when_no_database_url(monkeypatch):
    """The safety half of the incident fix still holds: with only
    TEST_DATABASE_URL set, alembic migrates the test DB rather than falling
    through to live Postgres from settings."""
    monkeypatch.setattr(
        db_session.settings, "DATABASE_URI", "postgresql+asyncpg://u:p@nonexistent.invalid/bom_db"
    )
    url = _resolve_alembic_env_url(
        monkeypatch, TEST_DATABASE_URL="sqlite+aiosqlite:///./scratch_alembic.db"
    )
    assert url == "sqlite+aiosqlite:///./scratch_alembic.db"


def test_alembic_env_database_url_wins_over_settings(monkeypatch):
    monkeypatch.setattr(
        db_session.settings, "DATABASE_URI", "postgresql+asyncpg://u:p@nonexistent.invalid/bom_db"
    )
    url = _resolve_alembic_env_url(
        monkeypatch, DATABASE_URL="postgresql+asyncpg://u:p@nonexistent.invalid/other_db"
    )
    assert url == "postgresql+asyncpg://u:p@nonexistent.invalid/other_db"


def test_alembic_env_falls_back_to_settings(monkeypatch):
    monkeypatch.setattr(
        db_session.settings, "DATABASE_URI", "postgresql+asyncpg://u:p@nonexistent.invalid/bom_db"
    )
    url = _resolve_alembic_env_url(monkeypatch)
    assert url == "postgresql+asyncpg://u:p@nonexistent.invalid/bom_db"


# ---------------------------------------------------------------------------
# scripts/init_db.py: TEST_DATABASE_URL precedence (Finding 5)
# ---------------------------------------------------------------------------


def test_init_db_resolve_url_honours_test_database_url(monkeypatch):
    from scripts import init_db

    monkeypatch.setenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///./scratch_init_db.db")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@nonexistent.invalid/other_db")
    assert init_db._resolve_url() == "sqlite+aiosqlite:///./scratch_init_db.db"


# ---------------------------------------------------------------------------
# Destructive/seed scripts: each must refuse a live-looking URL BEFORE
# connecting (Findings 1-3 plus the round-1-missed root/scripts scan).
# ---------------------------------------------------------------------------


def _run_guarded_entrypoint(monkeypatch, module_name, attr, args=(), kwargs=None):
    # The guard reads env vars at call time, not at import time, so it's fine
    # if the module is already cached in sys.modules from an earlier test.
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("TEST_DATABASE_URL", _LIVE_LOOKING_URL)
    module = importlib.import_module(module_name)
    fn = getattr(module, attr)
    asyncio.run(fn(*args, **(kwargs or {})))


@pytest.mark.parametrize(
    "module_name, attr",
    [
        ("seed_po", "seed"),
        ("fix_columns", "run"),
        ("seed_rbac", "seed"),
        ("seed_db", "seed_database"),
        ("seed_extra", "main"),
        ("seed_enterprise_data", "seed"),
        ("load_bom_data", "load_bom_data"),
    ],
)
def test_seed_script_refuses_live_looking_url_before_connecting(monkeypatch, module_name, attr):
    with pytest.raises(RuntimeError, match="Refusing"):
        _run_guarded_entrypoint(monkeypatch, module_name, attr)


def test_consolidate_po_refuses_live_looking_url_before_connecting(monkeypatch):
    with pytest.raises(RuntimeError, match="Refusing"):
        _run_guarded_entrypoint(
            monkeypatch, "scripts.consolidate_po", "run_consolidation", kwargs={"dry_run": False}
        )
