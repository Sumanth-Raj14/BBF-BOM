"""Smoke tests for the Zoho Books BACKEND FOUNDATION (spec §2/§3/§5/§6).

Proves, on a fresh SQLite DB:
  * migration 041 applies cleanly on top of head 040 (head -> new);
  * all new models import and register;
  * a tenant-aware ZohoSyncState row auto-populates tenantId;
  * the region -> URL data-center map is correct;
  * /integrations test-connection returns an HONEST failure (not_configured)
    for provider='zoho_books' when no credentials exist.

The migration test uses its OWN temp DB + isolated event loop (a thread) so it
never collides with the conftest session-scoped engine (which builds the full
schema via Base.metadata.create_all).
"""

import os
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, inspect, text

from app.db.base import Base

ALEMBIC_CFG = Path(__file__).resolve().parents[2] / "alembic.ini"
_ZOHO_TABLES = {"zoho_sync_state", "zoho_sync_cursor", "zoho_sync_log"}


def test_migration_head_to_new_applies_on_fresh_sqlite(tmp_path):
    from alembic import command
    from alembic.config import Config

    import app.models  # noqa: F401 — ensure every table is registered on the metadata

    db_file = tmp_path / "zoho_migration.db"
    sync_url = f"sqlite:///{db_file.as_posix()}"
    async_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"

    # 1) Materialize the schema as it exists AT head 040 — everything except the
    #    three new tables — so migration 041 genuinely creates them on top.
    sync_engine = create_engine(sync_url)
    try:
        pre = [t for t in Base.metadata.sorted_tables if t.name not in _ZOHO_TABLES]
        Base.metadata.create_all(sync_engine, tables=pre)
    finally:
        sync_engine.dispose()

    cfg = Config(str(ALEMBIC_CFG))
    cfg.set_main_option("sqlalchemy.url", async_url)

    # 2) Stamp at 040 (prior head), then upgrade to head (runs ONLY 041).
    #    alembic env.py uses an async engine (asyncio.run); run it in a thread so
    #    it gets a clean event loop and never disturbs pytest-asyncio's loop.
    prev = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = async_url
    err: dict = {}

    def _run():
        try:
            command.stamp(cfg, "040_postgres_rls_tenant_isolation")
            command.upgrade(cfg, "head")
        except BaseException as e:  # noqa: BLE001 — re-raised on the main thread
            err["e"] = e

    t = threading.Thread(target=_run)
    t.start()
    t.join()

    if prev is None:
        os.environ.pop("DATABASE_URL", None)
    else:
        os.environ["DATABASE_URL"] = prev
    if "e" in err:
        raise err["e"]

    # 3) Verify the migration's effects.
    insp_engine = create_engine(sync_url)
    try:
        insp = inspect(insp_engine)
        tables = set(insp.get_table_names())
        assert _ZOHO_TABLES <= tables, f"missing new tables: {_ZOHO_TABLES - tables}"

        state_idx = {i["name"] for i in insp.get_indexes("zoho_sync_state")}
        assert "uq_zoho_state_ext" in state_idx, state_idx

        ext_idx = {i["name"] for i in insp.get_indexes("integration_external_links")}
        assert "idx_extlink_reverse" in ext_idx, ext_idx

        with insp_engine.connect() as c:
            ver = c.execute(text("SELECT version_num FROM alembic_version")).scalar()
        assert ver == "041_zoho_books_sync_tables", ver
    finally:
        insp_engine.dispose()


def test_all_new_models_and_services_import():
    from app.integrations import zoho_oauth  # noqa: F401
    from app.integrations.zoho_client import ZohoBooksClient  # noqa: F401
    from app.models.zoho_sync import ZohoSyncCursor, ZohoSyncLog, ZohoSyncState

    assert ZohoSyncState.__tablename__ == "zoho_sync_state"
    assert ZohoSyncCursor.__tablename__ == "zoho_sync_cursor"
    assert ZohoSyncLog.__tablename__ == "zoho_sync_log"


def test_region_url_map_is_correct():
    from app.integrations.zoho_oauth import (
        accounts_host,
        api_domain_for_region,
        books_base,
    )

    expected = {
        "us": ("https://accounts.zoho.com", "https://www.zohoapis.com"),
        "eu": ("https://accounts.zoho.eu", "https://www.zohoapis.eu"),
        "in": ("https://accounts.zoho.in", "https://www.zohoapis.in"),
        "au": ("https://accounts.zoho.com.au", "https://www.zohoapis.com.au"),
        "jp": ("https://accounts.zoho.jp", "https://www.zohoapis.jp"),
        "ca": ("https://accounts.zohocloud.ca", "https://www.zohoapis.ca"),
        "sa": ("https://accounts.zoho.sa", "https://www.zohoapis.sa"),
    }
    for region, (acc, api) in expected.items():
        assert accounts_host(region) == acc, region
        assert api_domain_for_region(region) == api, region

    assert books_base("https://www.zohoapis.com") == "https://www.zohoapis.com/books/v3"
    # Unknown/empty region falls back to the US default, never crashes.
    assert accounts_host("zz") == "https://accounts.zoho.com"
    assert accounts_host(None) == "https://accounts.zoho.com"


@pytest.mark.asyncio
async def test_zoho_sync_state_autopopulates_tenant(db_session, test_tenant, tenant_id):
    from app.models.zoho_sync import ZohoSyncState

    row = ZohoSyncState(entity_type="part", entity_id=123, status="pending_out")
    db_session.add(row)  # tenantId intentionally omitted
    await db_session.commit()
    await db_session.refresh(row)

    assert row.tenantId == tenant_id  # set by the tenant-isolation before_insert listener


@pytest.mark.asyncio
async def test_test_connection_honest_failure_when_no_creds(db_session):
    """provider='zoho_books' is now dispatchable, and with no stored credentials
    the endpoint reports not_configured — never a fabricated success."""
    from app.api.endpoints.integrations import test_connection

    body = await test_connection(
        "zoho_books", db=db_session, user=SimpleNamespace(tenantId=1)
    )
    assert body["ok"] is False
    assert body["reason"] == "not_configured"
