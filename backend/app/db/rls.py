"""Postgres Row-Level Security: opt-in defense-in-depth on top of app-layer isolation.

This module is entirely additive. The enforcement mechanism of record for
multi-tenancy remains the app-layer tenant isolation in
`app.core.tenant_events` (auto-filter every SELECT, guard UPDATE/DELETE,
auto-populate tenantId on INSERT) — that behavior is untouched by this file
and keeps working identically whether RLS is enabled or not, on SQLite or
Postgres.

When `settings.ENABLE_RLS` is True AND the active session is bound to a
PostgreSQL dialect, `apply_rls_tenant_context` issues the Postgres-native
per-transaction tenant pin (`SET LOCAL app.current_tenant = <tenant_id>`,
via the parameterized `set_config(..., true)` equivalent so the value is
never string-interpolated into SQL) so that a Postgres `tenant_isolation`
RLS policy (installed by alembic migration 040, itself guarded to the
postgresql dialect) can enforce isolation at the database level too.
`set_config(name, value, true)` is functionally identical to
`SET LOCAL name = value` — the `true` third argument makes it
transaction-local exactly like SET LOCAL, and it composes with pgbouncer
transaction pooling since it does not require session-level state.

In every other case — flag off (the default), SQLite (the default
test/dev DB), or no tenant in context — this is a complete no-op: nothing
new is executed, and the app behaves exactly as it did before RLS existed.

Auth bootstrap (chicken-and-egg fix)
-------------------------------------
`users`, `api_keys`, and `user_mfa` are themselves `TenantAwareMixin`
(RLS-protected) tables, but they are exactly the tables that must be
*read* during authentication in order to discover which tenant a request
belongs to in the first place. With FORCE ROW LEVEL SECURITY, a query
against one of these tables issued before `app.current_tenant` is known
matches zero rows -- a request can never bootstrap its own identity.

Two complementary fixes are used (see `app/core/deps.py`):

1. For bearer-token auth, the tenant is already carried, signed, in the
   JWT claims (`tenantId`/`isSuperuser`, set at token issuance in
   `create_tokens_for_user`) -- since the signature is verified before any
   DB access, that claim can seed `app.current_tenant` *before* the
   `User` row is even selected, with no bootstrap window needed at all.
2. For API-key auth there is no such pre-verified claim (the key's owner
   is only known after the DB lookup), so `apply_rls_auth_bootstrap` /
   `clear_rls_auth_bootstrap` pin a narrow, transaction-local
   `app.rls_bootstrap` flag around *only* the identity-resolution
   SELECTs (`api_keys` by `key_prefix`, `users` by id, `user_mfa` by
   `user_id`). Migration 040 installs an additional permissive,
   `FOR SELECT`-only policy on exactly those three tables that allows
   reads while that flag is 'on'. The flag must be cleared as soon as the
   real tenant is known (or the transaction is done) so it never leaks
   into the request's subsequent business-logic queries.
"""

from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

_RLS_SET_CONFIG_SQL = text("SELECT set_config('app.current_tenant', :tenant_id, true)")
_RLS_BOOTSTRAP_ON_SQL = text("SELECT set_config('app.rls_bootstrap', 'on', true)")
_RLS_BOOTSTRAP_OFF_SQL = text("SELECT set_config('app.rls_bootstrap', 'off', true)")


def _is_postgres(session: AsyncSession) -> bool:
    bind = session.get_bind()
    dialect_name = getattr(getattr(bind, "dialect", None), "name", None)
    return dialect_name == "postgresql"


async def apply_rls_tenant_context(session: AsyncSession, tenant_id: Optional[int]) -> bool:
    """Pin the current transaction's tenant for Postgres RLS, if applicable.

    Returns True if the `SET LOCAL`-equivalent was actually issued, False if
    this was a no-op (flag disabled, non-postgres dialect, or no tenant_id).
    Safe to call unconditionally on every request — the guard makes the
    common (non-Postgres, or flag-off) path a cheap no-op.
    """
    if not settings.ENABLE_RLS:
        return False
    if tenant_id is None:
        return False
    if not _is_postgres(session):
        return False

    await session.execute(_RLS_SET_CONFIG_SQL, {"tenant_id": str(tenant_id)})
    return True


async def apply_rls_auth_bootstrap(session: AsyncSession) -> bool:
    """Open the narrow auth-bootstrap escape hatch for identity-resolution
    reads (`api_keys`, `users`, `user_mfa`) issued before the tenant is
    known. No-op unless ENABLE_RLS + Postgres, exactly like
    `apply_rls_tenant_context`. Must be paired with
    `clear_rls_auth_bootstrap` as soon as the tenant is resolved (or auth
    fails) so the escape hatch never applies to later queries.
    """
    if not settings.ENABLE_RLS:
        return False
    if not _is_postgres(session):
        return False

    await session.execute(_RLS_BOOTSTRAP_ON_SQL)
    return True


async def clear_rls_auth_bootstrap(session: AsyncSession) -> bool:
    """Close the auth-bootstrap escape hatch opened by
    `apply_rls_auth_bootstrap`. Safe/no-op to call even if it was never
    opened (flag off or non-Postgres)."""
    if not settings.ENABLE_RLS:
        return False
    if not _is_postgres(session):
        return False

    await session.execute(_RLS_BOOTSTRAP_OFF_SQL)
    return True
