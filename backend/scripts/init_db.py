"""Idempotent database schema bootstrap.

Why this exists
---------------
The historical Alembic chain cannot build a database from base on its own:
early migrations (004+) reference tables (e.g. ``po_headers`` and ~73 others)
that only ever existed via ``Base.metadata.create_all()`` and were not
formalized into migrations until revision 022. So ``alembic upgrade head`` on a
fresh Postgres fails at migration 004.

Strategy
--------
* **Greenfield DB** (no ``alembic_version`` table): build the full current
  schema directly from the ORM models via ``Base.metadata.create_all()``, then
  ``alembic stamp head`` to record the latest revision WITHOUT replaying the
  broken chain. The models are the source of truth for the current schema.
* **Existing managed DB** (``alembic_version`` present): run
  ``alembic upgrade head`` to apply pending migrations incrementally.

This is idempotent and safe to re-run.

Caveat: opt-in Postgres RLS policies live in migration 040's raw SQL, which a
greenfield ``create_all`` path does not execute. RLS is off by default
(``ENABLE_RLS=False``); deployments that enable it must apply the RLS policies
separately. App-layer tenant isolation (the primary mechanism) is unaffected.

Usage
-----
    cd backend && python -m scripts.init_db
Honors ``DATABASE_URL`` / ``DATABASE_URI`` if set, else uses the app's
``settings.DATABASE_URI`` (from .env).
"""
import asyncio
import os
import sys

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models import *  # noqa: E402,F401,F403  (populate Base.metadata with every model)


def _resolve_url() -> str:
    return os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_URI") or settings.DATABASE_URI


def _alembic_config(url: str) -> Config:
    cfg = Config(os.path.join(_BACKEND_DIR, "alembic.ini"))
    # alembic/env.py reads DATABASE_URL; keep it aligned with our target.
    os.environ["DATABASE_URL"] = url
    return cfg


async def _prepare(url: str) -> bool:
    """Return True if the DB is already Alembic-managed; else create_all first."""
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            managed = await conn.run_sync(lambda c: inspect(c).has_table("alembic_version"))
        if not managed:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        return managed
    finally:
        await engine.dispose()


def bootstrap_database() -> str:
    url = _resolve_url()
    managed = asyncio.run(_prepare(url))  # runs + closes its own event loop
    cfg = _alembic_config(url)            # command.* below spin up their own loop via env.py
    if managed:
        command.upgrade(cfg, "head")
        return "existing DB: alembic upgrade head"
    command.stamp(cfg, "head")
    return "greenfield DB: Base.metadata.create_all + alembic stamp head"


if __name__ == "__main__":
    print(f"[init_db] {bootstrap_database()}")
