"""Zoho Books two-way sync tables (spec §3).

Creates the three tenant-owned sync tables (zoho_sync_state, zoho_sync_cursor,
zoho_sync_log), the partial-unique index for zoho_sync_state's nullable
external_id key, and the reverse-lookup index on integration_external_links used
for inbound (external_id -> local entity) resolution. Credentials / id
cross-reference / outbox all REUSE the existing WS3 integration tables
(migration 031) — no schema change there beyond the reverse index.

Per-table RLS for the three new tenant tables mirrors migration 040 EXACTLY:
gated on `postgresql` dialect AND `settings.ENABLE_RLS` (so a routine
`alembic upgrade head` on a Postgres deploy that never opted in stays a
complete no-op, and SQLite/other dialects are always a no-op). 040 already
discovers tenant tables dynamically via information_schema, so a future re-run
would cover these too; enrolling them here is belt-and-suspenders for deploys
already past 040 under ENABLE_RLS=True. The three tables are NOT auth-bootstrap
tables, so there is no FOR SELECT bootstrap policy. Downgrade is gated on
dialect only so it can always cleanly undo whatever upgrade applied.

The optional POHeader money-column widening (spec §10-H) is intentionally NOT
performed: those are push-only totals Zoho recomputes server-side, not part of
any two-way monetary compare; the load-bearing fix is canonical-decimal+epsilon
comparison in the sync engine, not column width.

Revision ID: 041_zoho_books_sync_tables
Revises: 040_postgres_rls_tenant_isolation
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "041_zoho_books_sync_tables"
# Relinked during merge to master: chains after regulated's 044_compliance_evaluations
# (the head at merge time) to keep a single linear Alembic head.
down_revision: str | None = "044_compliance_evaluations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_TENANT_TABLES = ("zoho_sync_state", "zoho_sync_cursor", "zoho_sync_log")
_POLICY_NAME = "tenant_isolation"


def upgrade() -> None:
    op.create_table(
        "zoho_sync_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True)),
        sa.Column("last_direction", sa.String(10)),
        sa.Column("local_checksum", sa.String(64)),
        sa.Column("zoho_last_modified_time", sa.String(40)),
        sa.Column("last_cost", sa.Numeric(18, 4)),
        sa.Column("last_price", sa.Numeric(18, 4)),
        sa.Column("sync_lock", sa.String(20), nullable=True),
        sa.Column("status", sa.String(20), server_default="pending_out"),
        sa.Column("last_error", sa.Text()),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("tenantId", "entity_type", "entity_id", name="uq_zoho_state_local"),
    )
    op.create_index("ix_zoho_sync_state_tenantId", "zoho_sync_state", ["tenantId"])
    op.create_index(
        "uq_zoho_state_ext",
        "zoho_sync_state",
        ["tenantId", "entity_type", "external_id"],
        unique=True,
        sqlite_where=sa.text("external_id IS NOT NULL"),
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )

    op.create_table(
        "zoho_sync_cursor",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("high_water", sa.String(40)),
        sa.Column("last_run_at", sa.DateTime(timezone=True)),
        sa.Column("last_run_status", sa.String(20)),
        sa.Column("records_seen", sa.Integer(), server_default="0"),
        sa.Column("last_error", sa.Text()),
        sa.UniqueConstraint("tenantId", "entity_type", name="uq_zoho_cursor"),
    )
    op.create_index("ix_zoho_sync_cursor_tenantId", "zoho_sync_cursor", ["tenantId"])

    op.create_table(
        "zoho_sync_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("external_id", sa.String(100), nullable=True),
        sa.Column("direction", sa.String(10)),
        sa.Column("event", sa.String(30)),
        sa.Column("status", sa.String(20)),
        sa.Column("field_diffs", sa.JSON()),
        sa.Column("actor", sa.String(40)),
        sa.Column("resolution", sa.String(20), nullable=True),
        sa.Column(
            "resolved_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("message", sa.Text()),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_zoho_sync_log_tenantId", "zoho_sync_log", ["tenantId"])
    op.create_index("ix_zoho_sync_log_resolved_by", "zoho_sync_log", ["resolved_by"])
    op.create_index(
        "idx_zoho_log_tenant_status", "zoho_sync_log", ["tenantId", "entity_type", "status"]
    )

    # Reverse-lookup index for inbound resolution (external_id -> local entity),
    # per spec §3. Added to the existing integration_external_links table.
    op.create_index(
        "idx_extlink_reverse",
        "integration_external_links",
        ["tenantId", "provider", "entity_type", "external_id"],
    )

    _apply_rls()


def _apply_rls() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return  # SQLite/others: no-op — RLS is Postgres-only, opt-in, additive
    if not settings.ENABLE_RLS:
        return  # no-op unless the app has also opted in for this deploy
    for table in _NEW_TENANT_TABLES:
        bind.execute(sa.text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))
        bind.execute(sa.text(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY'))
        bind.execute(sa.text(f'DROP POLICY IF EXISTS {_POLICY_NAME} ON "{table}"'))
        bind.execute(
            sa.text(
                f'CREATE POLICY {_POLICY_NAME} ON "{table}" '
                f"USING (\"tenantId\" = current_setting('app.current_tenant', true)::int)"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":  # dialect-only gate (mirrors 040)
        for table in _NEW_TENANT_TABLES:
            bind.execute(sa.text(f'DROP POLICY IF EXISTS {_POLICY_NAME} ON "{table}"'))
            bind.execute(sa.text(f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY'))
            bind.execute(sa.text(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY'))

    op.drop_index("idx_extlink_reverse", table_name="integration_external_links")
    op.drop_index("idx_zoho_log_tenant_status", table_name="zoho_sync_log")
    op.drop_index("ix_zoho_sync_log_resolved_by", table_name="zoho_sync_log")
    op.drop_index("ix_zoho_sync_log_tenantId", table_name="zoho_sync_log")
    op.drop_table("zoho_sync_log")
    op.drop_index("ix_zoho_sync_cursor_tenantId", table_name="zoho_sync_cursor")
    op.drop_table("zoho_sync_cursor")
    op.drop_index("uq_zoho_state_ext", table_name="zoho_sync_state")
    op.drop_index("ix_zoho_sync_state_tenantId", table_name="zoho_sync_state")
    op.drop_table("zoho_sync_state")
