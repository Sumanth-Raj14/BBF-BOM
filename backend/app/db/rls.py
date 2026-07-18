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
"""

from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

_RLS_SET_CONFIG_SQL = text("SELECT set_config('app.current_tenant', :tenant_id, true)")


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

    bind = session.get_bind()
    dialect_name = getattr(getattr(bind, "dialect", None), "name", None)
    if dialect_name != "postgresql":
        return False

    await session.execute(_RLS_SET_CONFIG_SQL, {"tenant_id": str(tenant_id)})
    return True
