"""Shared idempotency check utility — prevents duplicate request processing."""

from typing import Optional

from app.core.cache import get_redis


async def check_idempotency(idempotency_key: Optional[str] = None) -> bool:
    if not idempotency_key:
        return True
    r = await get_redis()
    if r is None:
        return True
    key = f"idempotency:{idempotency_key}"
    # Atomic set-if-not-exists with TTL. Returns truthy only when the key was
    # actually created; a falsy result means the key already existed, i.e. a
    # duplicate request. This avoids the check-then-set race.
    was_set = await r.set(key, "1", nx=True, ex=86400)
    return bool(was_set)
