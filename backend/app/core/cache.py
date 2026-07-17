"""Redis caching layer for expensive operations and token blacklist."""

import hashlib
import json
import logging
import os
import time
from collections.abc import Callable
from datetime import UTC
from typing import Any, Optional

logger = logging.getLogger(__name__)

_redis_pool = None
_redis_last_fail = 0.0
# After a failed connect, don't retry on every call — that stalls each request
# by the connect timeout and, since a request makes several Redis calls
# (blacklist + revocation + rate limit), the delays stack into a hang. Back off.
_REDIS_RETRY_COOLDOWN = 30.0


async def get_redis():
    global _redis_pool, _redis_last_fail
    if _redis_pool is None:
        if time.monotonic() - _redis_last_fail < _REDIS_RETRY_COOLDOWN:
            return None  # still in cooldown after a recent failure — fail fast
        try:
            import redis.asyncio as aioredis

            from app.core.config import settings

            _redis_pool = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            await _redis_pool.ping()
            logger.info("Redis cache connected")
        except Exception as e:
            logger.warning("Redis unavailable, cache disabled: %s", e)
            _redis_pool = None
            _redis_last_fail = time.monotonic()
    return _redis_pool


async def close_redis():
    global _redis_pool
    if _redis_pool:
        await _redis_pool.close()
        _redis_pool = None


def _make_cache_key(prefix: str, *args, **kwargs) -> str:
    raw = f"{prefix}:{json.dumps(args, sort_keys=True, default=str)}:{json.dumps(kwargs, sort_keys=True, default=str)}"
    return f"bom:{prefix}:{hashlib.sha256(raw.encode()).hexdigest()[:32]}"


async def cache_get(key: str) -> Optional[Any]:
    try:
        r = await get_redis()
        if r is None:
            return None
        data = await r.get(key)
        if data:
            return json.loads(data)
    except Exception as e:
        logger.debug("Cache get failed: %s", e)
    return None


async def cache_set(key: str, value: Any, ttl: int = 300):
    try:
        r = await get_redis()
        if r is None:
            return
        await r.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.debug("Cache set failed: %s", e)


async def cache_invalidate(pattern: str):
    try:
        r = await get_redis()
        if r is None:
            return
        cursor = 0
        while True:
            cursor, keys = await r.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                await r.delete(*keys)
            if cursor == 0:
                break
    except Exception as e:
        logger.debug("Cache invalidate failed: %s", e)


async def cached(
    prefix: str,
    ttl: int = 300,
    key_args: Optional[list] = None,
    key_kwargs: Optional[dict] = None,
):
    def decorator(func: Callable):
        async def wrapper(*args, **kwargs):
            cache_key = _make_cache_key(
                prefix,
                *(key_args or list(args)[1:]),
                **(key_kwargs or {}),
            )
            cached_data = await cache_get(cache_key)
            if cached_data is not None:
                return cached_data
            result = await func(*args, **kwargs)
            await cache_set(cache_key, result, ttl=ttl)
            return result

        return wrapper

    return decorator


# ---- Per-user bulk revocation ("revoke all sessions") ----

_REVOKED_BEFORE_PREFIX = "bom:revoked_before:"


async def set_user_revoked_before(user_id, revoked_before_ts: float, ttl_seconds: int) -> bool:
    """Record that all tokens for `user_id` issued before `revoked_before_ts`
    (a UNIX timestamp) are revoked. TTL should cover the longest token lifetime."""
    try:
        r = await get_redis()
        if r is not None:
            key = f"{_REVOKED_BEFORE_PREFIX}{user_id}"
            await r.setex(key, ttl_seconds, str(revoked_before_ts))
            return True
    except Exception as e:
        logger.error("Failed to set revoked_before for user %s: %s", user_id, e)
    return False


async def get_user_revoked_before(user_id) -> Optional[float]:
    """Return the revoked-before timestamp for a user, or None if not set."""
    try:
        r = await get_redis()
        if r is not None:
            key = f"{_REVOKED_BEFORE_PREFIX}{user_id}"
            val = await r.get(key)
            if val is not None:
                return float(val)
    except Exception as e:
        logger.debug("Failed to read revoked_before for user %s: %s", user_id, e)
    return None


# ---- Token Blacklist ----

_BLACKLIST_PREFIX = "bom:blacklist:"


async def blacklist_token(jti: str, expires_in_seconds: int) -> bool:
    """Blacklist a token JTI. Falls back to database when Redis is unavailable."""
    if os.environ.get("DISABLE_CACHE_DB_FALLBACK", "").lower() in ("1", "true", "yes"):
        return False
    try:
        r = await get_redis()
        if r is not None:
            key = f"{_BLACKLIST_PREFIX}{jti}"
            await r.setex(key, expires_in_seconds, "1")
            return True
    except Exception as e:
        logger.error("Redis blacklist failed, falling back to DB: %s", e)

    try:
        from datetime import datetime, timedelta

        from sqlalchemy import select

        from app.db.session import get_session_maker
        from app.models.token_blacklist import TokenBlacklist

        async with (await get_session_maker())() as db:
            existing = await db.execute(select(TokenBlacklist).where(TokenBlacklist.jti == jti))
            if existing.scalar_one_or_none():
                return True
            entry = TokenBlacklist(
                jti=jti,
                expiresAt=datetime.now(UTC) + timedelta(seconds=expires_in_seconds),
            )
            db.add(entry)
            await db.commit()
        return True
    except Exception as e2:
        logger.error("DB token blacklist fallback failed: %s", e2)
        return False


async def is_token_blacklisted(jti: str) -> bool:
    """Check if a token JTI is blacklisted. Falls back to database when Redis is unavailable."""
    if os.environ.get("DISABLE_CACHE_DB_FALLBACK", "").lower() in ("1", "true", "yes"):
        return False
    try:
        r = await get_redis()
        if r is not None:
            key = f"{_BLACKLIST_PREFIX}{jti}"
            return await r.exists(key) == 1
    except Exception as e:
        logger.error("Redis blacklist check failed, falling back to DB: %s", e)

    try:
        from datetime import datetime

        from sqlalchemy import select

        from app.db.session import get_session_maker
        from app.models.token_blacklist import TokenBlacklist

        async with (await get_session_maker())() as db:
            result = await db.execute(
                select(TokenBlacklist).where(
                    TokenBlacklist.jti == jti,
                    TokenBlacklist.expiresAt > datetime.now(UTC),
                )
            )
            return result.scalar_one_or_none() is not None
    except Exception as e2:
        logger.error("DB token blacklist check fallback failed: %s", e2)
        return False
