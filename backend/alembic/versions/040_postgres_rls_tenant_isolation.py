"""Postgres Row-Level Security: opt-in defense-in-depth on tenant-scoped tables.

Guarded to the postgresql dialect AND `settings.ENABLE_RLS` -- a complete
no-op on SQLite (the default test/dev DB), on any other dialect, and on
Postgres itself unless the app has *also* opted in via the `ENABLE_RLS`
flag at the moment this migration runs. This matters because a routine
CI/CD pipeline normally runs `alembic upgrade head` as an unconditional
deploy step, decoupled from flipping application env vars/config. Gating
upgrade() on the dialect alone would mean *every* ordinary Postgres
deploy -- even with `ENABLE_RLS` left at its default False forever --
forces RLS on every tenant table with no code ever setting
`app.current_tenant`, which fails closed (zero rows, for everyone) the
moment the migration lands. Reading `settings.ENABLE_RLS` at migration
time keeps the standard/default Postgres path (flag untouched) truly
inert: `alembic upgrade head` is then a no-op for this revision until an
operator has explicitly turned the flag on for that deploy.

This is a defense-in-depth LAYER, not a replacement: the app-layer tenant
isolation in `app.core.tenant_events` (auto-filter SELECT, guard
UPDATE/DELETE, auto-populate tenantId on INSERT) remains the enforcement
mechanism of record and is completely unaffected by this migration, on
either dialect.

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

Auth-bootstrap escape hatch: `users`, `api_keys`, and `user_mfa` are
themselves tenant-scoped (and therefore RLS-protected) tables, but they
are exactly the tables that must be read to discover which tenant a
request belongs to in the first place -- a plain `tenant_isolation`
policy alone creates a chicken-and-egg where the identity-resolution
query can never see its own row (see `app.db.rls` for the full
explanation and how `app.core.deps` uses it). To break that cycle, this
migration additionally installs a second, `FOR SELECT`-only *permissive*
policy on exactly those three tables (Postgres OR's multiple permissive
policies together for the same command), scoped narrowly to a dedicated
`app.rls_bootstrap` transaction-local flag that the app sets only around
the identity-resolution reads and clears immediately after:

    FOR SELECT USING (current_setting('app.rls_bootstrap', true) = 'on')

Downgrade drops both policies and disables RLS on each table, restoring
the pre-migration (fully app-layer-only) state. Downgrade remains gated
on dialect only (not the flag) so it can always cleanly undo whatever
upgrade() may have applied, even if the flag's value changed in between.

Operational note: because this revision no-ops when `ENABLE_RLS` is False
at migration time, an operator who later wants to turn RLS on after
already being at/past this head must re-apply it explicitly for that
change to take effect (e.g. `alembic downgrade 039_bom_closure_table`
then `alembic upgrade head` with `ENABLE_RLS=True` set for that run) --
`alembic upgrade head` alone will not retroactively enable it, since
alembic does not re-run a revision it already considers applied.

Revision ID: 040_postgres_rls_tenant_isolation
Revises: 039_bom_closure_table
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "040_postgres_rls_tenant_isolation"
down_revision: str | None = "039_bom_closure_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_POLICY_NAME = "tenant_isolation"
_BOOTSTRAP_POLICY_NAME = "tenant_isolation_auth_bootstrap"
# Identity-resolution tables that must be readable before the tenant is
# known (see app.db.rls / app.core.deps). Kept as a small explicit list
# (not dynamically discovered) since the bootstrap escape hatch is
# deliberately narrow -- widening it to arbitrary future tenant tables
# would defeat the point of RLS as a defense-in-depth backstop.
_AUTH_BOOTSTRAP_TABLES = ("users", "api_keys", "user_mfa")

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
    if not settings.ENABLE_RLS:
        return  # no-op unless the app has also opted in for this deploy

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
        if table in _AUTH_BOOTSTRAP_TABLES:
            bind.execute(
                sa.text(f'DROP POLICY IF EXISTS {_BOOTSTRAP_POLICY_NAME} ON "{table}"')
            )
            bind.execute(
                sa.text(
                    f'CREATE POLICY {_BOOTSTRAP_POLICY_NAME} ON "{table}" '
                    f"FOR SELECT USING "
                    f"(current_setting('app.rls_bootstrap', true) = 'on')"
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return  # no-op outside Postgres

    tables = [row[0] for row in bind.execute(_TENANT_TABLES_SQL).fetchall()]
    for table in tables:
        bind.execute(sa.text(f'DROP POLICY IF EXISTS {_POLICY_NAME} ON "{table}"'))
        if table in _AUTH_BOOTSTRAP_TABLES:
            bind.execute(
                sa.text(f'DROP POLICY IF EXISTS {_BOOTSTRAP_POLICY_NAME} ON "{table}"')
            )
        bind.execute(sa.text(f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY'))
        bind.execute(sa.text(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY'))
