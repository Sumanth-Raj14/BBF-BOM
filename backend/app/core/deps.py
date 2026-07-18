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
from app.db.rls import (
    apply_rls_auth_bootstrap,
    apply_rls_tenant_context,
    clear_rls_auth_bootstrap,
)
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

    # Postgres RLS defense-in-depth (opt-in, no-op unless ENABLE_RLS +
    # postgresql): api_keys/users/user_mfa are themselves RLS-protected
    # tenant tables, but the tenant is not yet known -- that's exactly what
    # the reads below are discovering. Open the narrow, transaction-local
    # auth-bootstrap escape hatch (see app.db.rls / migration 040) BEFORE
    # issuing any of those reads, and close it the moment we're done with
    # them (every return path below), so it never applies to later,
    # tenant-scoped business-logic queries.
    await apply_rls_auth_bootstrap(db)

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
        await clear_rls_auth_bootstrap(db)
        return None

    if api_key.expires_at and api_key.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        await clear_rls_auth_bootstrap(db)
        return None

    # Per-API-key rate limiting
    if not await _check_api_key_rate_limit(key_prefix):
        await clear_rls_auth_bootstrap(db)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="API key rate limit exceeded (120 req/min per key)",
            headers={"Retry-After": "60"},
        )

    api_key.last_used_at = datetime.now(UTC)
    # NOTE: db.commit() ends the current transaction, which resets any
    # `SET LOCAL`/transaction-local GUC (including the bootstrap flag just
    # set above) -- so it must be re-opened for the reads that follow.
    await db.commit()
    await apply_rls_auth_bootstrap(db)

    result = await db.execute(select(User).where(User.id == api_key.user_id))
    user = result.scalar_one_or_none()
    if not user or not user.isActive:
        await clear_rls_auth_bootstrap(db)
        return None

    # MFA enforcement for superusers via API key
    if user.isSuperuser and settings.IS_PRODUCTION:
        result = await db.execute(
            select(UserMfa).where(UserMfa.user_id == user.id, UserMfa.is_enabled)
        )
        if not result.scalar_one_or_none():
            await clear_rls_auth_bootstrap(db)
            return None

    await clear_rls_auth_bootstrap(db)
    set_tenant_id(user.effective_tenant_id)
    # Postgres RLS defense-in-depth (opt-in, no-op unless ENABLE_RLS + postgresql):
    # see app.db.rls for details. App-layer isolation above is unaffected either way.
    # Use the row's own (always-present) tenantId rather than
    # effective_tenant_id here: RLS is pinning *this transaction* so the
    # user's own row (and their own user_mfa row) stay visible for the
    # remainder of the request, including for superusers, whose
    # effective_tenant_id is None (a value apply_rls_tenant_context always
    # treats as a no-op). Known staged limitation: this means a superuser's
    # cross-tenant business-logic reads are, once ENABLE_RLS is on, still
    # additionally scoped by RLS to their own home tenant -- full
    # superuser-cross-tenant RLS bypass is out of scope for this pass.
    await apply_rls_tenant_context(db, _rls_pin_tenant_id(user))
    return user


def _rls_pin_tenant_id(user: User) -> Optional[int]:
    """The tenant to pin for RLS purposes once auth has resolved: always
    the user's own concrete `tenantId` (never None), even for superusers --
    see the comment above each call site for why this differs from
    `effective_tenant_id` (which app-layer `set_tenant_id` still uses
    unchanged, for both auth paths).
    """
    return user.tenantId


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

    # Postgres RLS defense-in-depth (opt-in, no-op unless ENABLE_RLS +
    # postgresql): `users` is itself an RLS-protected tenant table, but the
    # SELECT below is exactly how we discover the tenant. Unlike the
    # API-key path, the bearer token already carries a *signed and
    # verified* tenantId/isSuperuser claim (set at issuance in
    # create_tokens_for_user) -- verify_token_with_blacklist above has
    # already validated the signature, so it's safe to seed the RLS
    # tenant pin from those claims BEFORE the User row is selected,
    # avoiding any bootstrap escape hatch for this path entirely.
    claimed_tenant_id = payload.get("tenantId")
    set_tenant_id(None if payload.get("isSuperuser") else claimed_tenant_id)
    await apply_rls_tenant_context(db, claimed_tenant_id)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    # Re-pin using the freshly-loaded, authoritative row (covers tenant
    # reassignment/superuser promotion that may have happened since the
    # token was issued) for the remainder of the request.
    set_tenant_id(user.effective_tenant_id)
    # See _rls_pin_tenant_id: RLS is pinned to the row's own concrete
    # tenantId (not effective_tenant_id) so the user's own row -- and, for
    # superusers, their own user_mfa row checked in get_current_superuser
    # right after this dependency resolves -- stay visible.
    await apply_rls_tenant_context(db, _rls_pin_tenant_id(user))

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
