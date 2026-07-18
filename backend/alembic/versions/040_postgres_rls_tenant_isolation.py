"""Postgres Row-Level Security: opt-in defense-in-depth on tenant-scoped tables.

Guarded to the postgresql dialect ONLY — a complete no-op on SQLite (the
default test/dev DB) and on any other dialect. Running `alembic upgrade` /
`alembic downgrade` against SQLite for this revision does nothing at all.

This is a defense-in-depth LAYER, not a replacement: the app-layer tenant
isolation in `app.core.tenant_events` (auto-filter SELECT, guard
UPDATE/DELETE, auto-populate tenantId on INSERT) remains the enforcement
mechanism of record and is completely unaffected by this migration, on
either dialect. RLS only ever engages at all when `settings.ENABLE_RLS` is
also True (see `app.core.config` / `app.db.rls`) — a Postgres deployment
that leaves the flag at its default False has RLS enabled at the database
level here but nothing ever sets `app.current_tenant`, so
`current_setting('app.current_tenant', true)` is NULL and the policy
(`"tenantId" = NULL`) matches zero rows — i.e. FORCE ROW LEVEL SECURITY
without the app also opting in would fail-closed (block all access), NOT
fail-open. Operators must flip `ENABLE_RLS=True` together with shipping
this migration, not one before the other.

For every table that carries a `tenantId` column (i.e. every
`TenantAwareMixin` model — discovered dynamically via
`information_schema.columns` rather than a static list, so newly added
mixin tables are automatically covered by any future re-run/backfill),
this enables and forces RLS and installs a `tenant_isolation` policy:

    USING ("tenantId" = current_setting('app.current_tenant', true)::int)

`current_setting(..., true)` (the `true` = missing_ok) returns NULL rather
than raising when `app.current_tenant` was never set for the session/
transaction — matching the "RLS engages only when the app opts in via
SET LOCAL" behavior described above.

Downgrade drops the `tenant_isolation` policy and disables RLS on each
table, restoring the pre-migration (fully app-layer-only) state.

Revision ID: 040_postgres_rls_tenant_isolation
Revises: 039_bom_closure_table
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "040_postgres_rls_tenant_isolation"
down_revision: str | None = "039_bom_closure_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_POLICY_NAME = "tenant_isolation"

_TENANT_TABLES_SQL = sa.text(
    """
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenantId'
    ORDER BY table_name
    """
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return  # no-op outside Postgres — RLS is Postgres-only, opt-in, additive

    tables = [row[0] for row in bind.execute(_TENANT_TABLES_SQL).fetchall()]
    for table in tables:
        bind.execute(sa.text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))
        bind.execute(sa.text(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY'))
        bind.execute(
            sa.text(
                f'DROP POLICY IF EXISTS {_POLICY_NAME} ON "{table}"'
            )
        )
        bind.execute(
            sa.text(
                f'CREATE POLICY {_POLICY_NAME} ON "{table}" '
                f'USING ("tenantId" = current_setting(\'app.current_tenant\', true)::int)'
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return  # no-op outside Postgres

    tables = [row[0] for row in bind.execute(_TENANT_TABLES_SQL).fetchall()]
    for table in tables:
        bind.execute(sa.text(f'DROP POLICY IF EXISTS {_POLICY_NAME} ON "{table}"'))
        bind.execute(sa.text(f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY'))
        bind.execute(sa.text(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY'))
