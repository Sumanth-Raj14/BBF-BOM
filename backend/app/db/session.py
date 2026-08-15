"""Database session management with retry-on-startup for Docker resilience."""

import asyncio
import logging
import os
import re
import sys
import time
from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.monitoring.metrics import metrics

logger = logging.getLogger(__name__)

_RETRY_ATTEMPTS = 5
_RETRY_DELAYS = [1, 2, 4, 8, 16]

_engine = None
_session_maker = None

_module = sys.modules[__name__]


_query_timings: dict = {}


def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info["query_start_time"] = time.time()


def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    start = conn.info.pop("query_start_time", None)
    if start:
        duration = time.time() - start
        metrics.record_db_query(duration)


pool_size = getattr(settings, "DB_POOL_SIZE", 10)
max_overflow = getattr(settings, "DB_MAX_OVERFLOW", 20)

_url_logged = False


def redact_url(url: str) -> str:
    """Strip a password out of a DB URL for safe logging, e.g. in error/log text."""
    return re.sub(r"://([^:/@]+):[^@/]*@", r"://\1:***@", url)


def resolve_database_url() -> str:
    """Single source of truth for which database this process talks to.

    Precedence (highest first): TEST_DATABASE_URL > DATABASE_URL > settings.DATABASE_URI.

    INCIDENT (2026-08-09): this used to be `str(settings.DATABASE_URI)` only, so
    every app code path (API server, seed scripts) ignored DATABASE_URL and
    TEST_DATABASE_URL entirely and silently fell through to the live Postgres
    DB from .env — even when an operator had deliberately pointed those vars at
    a throwaway sqlite file. scripts/init_db.py *did* honour them, so the
    sqlite file really did get created, making the divergence invisible until
    test fixtures and a password reset landed in production. TEST_DATABASE_URL
    is checked first because it's the variable the test suite/CI (see
    app/tests/conftest.py) already treats as authoritative — do not reorder
    this without fixing that convention too.
    """
    global _url_logged
    url = (
        os.environ.get("TEST_DATABASE_URL")
        or os.environ.get("DATABASE_URL")
        or str(settings.DATABASE_URI)
    )
    if not _url_logged:
        logger.info("Database URL resolved to %s", redact_url(url))
        _url_logged = True
    return url


async def init_engine() -> "AsyncEngine":
    global _engine, _session_maker
    uri = resolve_database_url()
    last_exc = None
    for attempt in range(1, _RETRY_ATTEMPTS + 1):
        try:
            engine = create_async_engine(
                uri,
                echo=False,
                future=True,
                pool_size=pool_size,
                max_overflow=max_overflow,
                pool_pre_ping=True,
                pool_recycle=3600,
            )
            async with engine.connect() as conn:
                from sqlalchemy import text

                await conn.execute(text("SELECT 1"))
            logger.info("Database connection established")
            event.listen(engine.sync_engine, "before_cursor_execute", _before_cursor_execute)
            event.listen(engine.sync_engine, "after_cursor_execute", _after_cursor_execute)
            _engine = engine
            _session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
            _module.AsyncSessionLocal = _session_maker
            return engine
        except Exception as e:
            last_exc = e
            if attempt < _RETRY_ATTEMPTS:
                delay = _RETRY_DELAYS[attempt - 1]
                logger.warning(
                    "DB connection attempt %d/%d failed: %s. Retrying in %ds...",
                    attempt,
                    _RETRY_ATTEMPTS,
                    e,
                    delay,
                )
                await asyncio.sleep(delay)
            else:
                logger.error(
                    "All %d DB connection attempts failed: %s",
                    _RETRY_ATTEMPTS,
                    e,
                )
    raise last_exc


def get_engine():
    if _engine is None:
        raise RuntimeError("Database engine not initialized. Call init_engine() first.")
    return _engine


# Placeholder — replaced by init_engine()
AsyncSessionLocal = None


async def get_session_maker():
    if _session_maker is None:
        await init_engine()
    return _session_maker


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    maker = await get_session_maker()
    async with maker() as session:
        try:
            yield session
        finally:
            await session.close()
