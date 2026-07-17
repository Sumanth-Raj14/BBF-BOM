"""Rate limiting with Redis-backed distributed storage.

Falls back to in-memory when Redis is unavailable.
"""

import logging
from typing import Optional

from fastapi import Request
from slowapi import Limiter

from app.core.client_ip import get_client_ip
from app.core.config import settings

logger = logging.getLogger(__name__)


def _get_client_ip(request: Request) -> str:
    """Rate-limit key function. Honors X-Forwarded-For only behind a trusted proxy."""
    return get_client_ip(request)


_limiter_instance: Optional[Limiter] = None


async def _check_redis_available(redis_url: str) -> bool:
    """Check if Redis is reachable. Returns True if available."""
    if "127.0.0.1" not in redis_url and "localhost" not in redis_url:
        return True
    try:
        import redis.asyncio as async_redis

        r = async_redis.from_url(redis_url, socket_connect_timeout=2)
        await r.ping()
        await r.close()
        return True
    except Exception:
        logger.warning("Redis unavailable for rate limiting, falling back to in-memory")
        return False


async def init_limiter() -> Limiter:
    """Initialize the rate limiter with Redis-backed storage when available."""
    global _limiter_instance
    redis_url = settings.REDIS_URL
    storage_uri = "memory://"
    if redis_url:
        redis_ok = await _check_redis_available(redis_url)
        if redis_ok:
            storage_uri = redis_url
    _limiter_instance = Limiter(
        key_func=_get_client_ip,
        default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"],
        storage_uri=storage_uri,
    )
    logger.info("Rate limiter initialized with storage: %s", storage_uri)
    return _limiter_instance


def get_limiter() -> Limiter:
    """Get the current limiter instance. Must call init_limiter() first during startup."""
    global _limiter_instance
    if _limiter_instance is None:
        raise RuntimeError("Rate limiter not initialized. Call init_limiter() during app startup.")
    return _limiter_instance


# Backward-compatible module-level limiter (in-memory default)
# Will be replaced during app startup if Redis is available.
limiter = Limiter(
    key_func=_get_client_ip,
    default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"],
)
