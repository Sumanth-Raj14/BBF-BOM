import logging
import time
from datetime import UTC, datetime
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import verify_password, verify_token_with_blacklist
from app.core.tenant_context import set_tenant_id
from app.db.session import get_db
from app.models.api_key import ApiKey
from app.models.digital_signature import UserMfa
from app.models.user import User

logger = logging.getLogger(__name__)

_REDIS_RATE_LIMIT_WINDOW = 60


async def _check_redis_rate_limit(key: str, max_requests: int, window: int = 60) -> bool:
    try:
        from app.core.cache import get_redis

        r = await get_redis()
        if r is not None:
            now = int(time.time())
            window_start = now - window
            pipe = r.pipeline()
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, window)
            results = await pipe.execute()
            count = results[1]
            return not count >= max_requests
    except Exception as e:
        logger.debug("Redis rate limit unavailable, using in-memory: %s", e)
    return None  # Signal to use in-memory fallback


# Per-API-key rate limiting (in-memory with LRU eviction, fallback when Redis unavailable)
_api_key_rate_limits: dict[str, list[float]] = {}
_API_KEY_RATE_LIMIT_MAX = 5000
_API_KEY_RATE_LIMIT_PER_MINUTE = 120
_API_KEY_RATE_LIMIT_WINDOW = 60.0


async def _check_api_key_rate_limit(key_prefix: str) -> bool:
    redis_result = await _check_redis_rate_limit(
        f"ratelimit:apikey:{key_prefix}", _API_KEY_RATE_LIMIT_PER_MINUTE
    )
    if redis_result is not None:
        return redis_result
    now = time.time()
    window_start = now - _API_KEY_RATE_LIMIT_WINDOW
    if key_prefix not in _api_key_rate_limits:
        if len(_api_key_rate_limits) >= _API_KEY_RATE_LIMIT_MAX:
            _api_key_rate_limits.pop(next(iter(_api_key_rate_limits)), None)
        _api_key_rate_limits[key_prefix] = []
    timestamps = _api_key_rate_limits[key_prefix]
    _api_key_rate_limits[key_prefix] = [t for t in timestamps if t > window_start]
    if len(_api_key_rate_limits[key_prefix]) >= _API_KEY_RATE_LIMIT_PER_MINUTE:
        return False
    _api_key_rate_limits[key_prefix].append(now)
    return True


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def _authenticate_by_api_key(request: Request, db: AsyncSession) -> Optional[User]:
    api_key_header = request.headers.get("X-API-Key")
    if not api_key_header or "_" not in api_key_header:
        return None

    # Use key prefix for indexed lookup instead of O(n) enumeration
    key_prefix = api_key_header.split("_")[0]
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.is_active,
            ApiKey.key_prefix == key_prefix,
        )
    )
    api_key = result.scalar_one_or_none()
    if not api_key or not verify_password(api_key_header, api_key.key_hash):
        return None

    if api_key.expires_at and api_key.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        return None

    # Per-API-key rate limiting
    if not await _check_api_key_rate_limit(key_prefix):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="API key rate limit exceeded (120 req/min per key)",
            headers={"Retry-After": "60"},
        )

    api_key.last_used_at = datetime.now(UTC)
    await db.commit()

    result = await db.execute(select(User).where(User.id == api_key.user_id))
    user = result.scalar_one_or_none()
    if not user or not user.isActive:
        return None

    # MFA enforcement for superusers via API key
    if user.isSuperuser and settings.IS_PRODUCTION:
        result = await db.execute(
            select(UserMfa).where(UserMfa.user_id == user.id, UserMfa.is_enabled)
        )
        if not result.scalar_one_or_none():
            return None

    set_tenant_id(user.effective_tenant_id)
    return user


# Per-user rate limiting (token-authenticated users)
_user_rate_limits: dict[int, list[float]] = {}
_USER_RATE_LIMIT_MAX = 10000
_USER_RATE_LIMIT_PER_MINUTE = 300
_USER_RATE_LIMIT_WINDOW = 60.0


async def _check_user_rate_limit(user_id: int) -> bool:
    redis_result = await _check_redis_rate_limit(
        f"ratelimit:user:{user_id}", _USER_RATE_LIMIT_PER_MINUTE
    )
    if redis_result is not None:
        return redis_result
    now = time.time()
    window_start = now - _USER_RATE_LIMIT_WINDOW
    if user_id not in _user_rate_limits:
        if len(_user_rate_limits) >= _USER_RATE_LIMIT_MAX:
            _user_rate_limits.pop(next(iter(_user_rate_limits)), None)
        _user_rate_limits[user_id] = []
    timestamps = _user_rate_limits[user_id]
    _user_rate_limits[user_id] = [t for t in timestamps if t > window_start]
    if len(_user_rate_limits[user_id]) >= _USER_RATE_LIMIT_PER_MINUTE:
        return False
    _user_rate_limits[user_id].append(now)
    return True


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    api_user = await _authenticate_by_api_key(request, db)
    if api_user:
        return api_user

    actual_token = request.cookies.get("access_token") or token
    if not actual_token:
        raise credentials_exception

    payload = await verify_token_with_blacklist(actual_token)
    if payload is None:
        raise credentials_exception

    sub = payload.get("sub")
    if sub is None:
        raise credentials_exception

    try:
        user_id = int(sub)
    except (ValueError, TypeError):
        raise credentials_exception

    # Per-user rate limiting
    if not await _check_user_rate_limit(user_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="User rate limit exceeded (300 req/min)",
            headers={"Retry-After": "60"},
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    # Set tenant context for multi-tenancy
    set_tenant_id(user.effective_tenant_id)

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Get the current active user
    """
    if not current_user.isActive:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
    return current_user


async def get_current_superuser(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Get the current superuser. In production, requires MFA to be enabled.
    """
    if not current_user.isSuperuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    if settings.IS_PRODUCTION:
        result = await db.execute(
            select(UserMfa).where(UserMfa.user_id == current_user.id, UserMfa.is_enabled)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="MFA is required for superuser accounts. Configure MFA in your profile.",
            )
    return current_user
