"""Database session management with retry-on-startup for Docker resilience."""

import asyncio
import logging
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


async def init_engine() -> "AsyncEngine":
    global _engine, _session_maker
    uri = str(settings.DATABASE_URI)
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
