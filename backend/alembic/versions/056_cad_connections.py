"""CAD connector framework — per-tenant, per-vendor connections.

Adds `cad_connections`: one row per tenant per configured CAD integration
(Onshape today; Fusion 360/Altium register themselves later with no schema
change, see app.integrations.cad.registry). `credentials` is a Fernet-
encrypted JSON blob (never plaintext) written by the SQLAlchemy event
listeners on `app.models.cad_connection.CadConnection`.

Revision ID: 056_cad_connections
Revises: 055_requirements
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "056_cad_connections"
down_revision: str | None = "055_requirements"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _enable_rls(table: str) -> None:
    """Install migration 040's tenant_isolation RLS policy on a table created
    by this later revision. Guarded to Postgres + settings.ENABLE_RLS — a
    no-op on SQLite / when RLS is not opted in. See 045/046 for full rationale.
    """
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    from app.core.config import settings

    if not settings.ENABLE_RLS:
        return
    bind.execute(sa.text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))
    bind.execute(sa.text(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY'))
    bind.execute(sa.text(f'DROP POLICY IF EXISTS tenant_isolation ON "{table}"'))
    bind.execute(
        sa.text(
            f'CREATE POLICY tenant_isolation ON "{table}" '
            f'USING ("tenantId" = current_setting(\'app.current_tenant\', true)::int)'
        )
    )


def upgrade() -> None:
    op.create_table(
        "cad_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("connector_type", sa.String(), nullable=False),
        sa.Column("credentials", sa.Text(), nullable=True),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="unconfigured"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenantId", "name", name="uq_cad_connections_tenant_name"),
    )
    op.create_index(
        "idx_cad_connections_tenant_type", "cad_connections", ["tenantId", "connector_type"]
    )

    _enable_rls("cad_connections")


def downgrade() -> None:
    op.drop_index("idx_cad_connections_tenant_type", table_name="cad_connections")
    op.drop_table("cad_connections")
