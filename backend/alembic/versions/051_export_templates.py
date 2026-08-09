"""Saved export templates (shared export API contract).

Adds `export_templates`: a tenant-scoped, named, reusable export config
(entity + JSON config = the POST /api/v1/export body minus entity/bom_id).
Backs GET/POST /api/v1/export/templates and DELETE .../templates/{id}.

Revision ID: 051_export_templates
Revises: 050_rfq_headers_created_by_nullable
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "051_export_templates"
down_revision: str | None = "050_rfq_headers_created_by_nullable"
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
        "export_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("entity", sa.String(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_export_templates_tenant_entity", "export_templates", ["tenantId", "entity"]
    )

    _enable_rls("export_templates")


def downgrade() -> None:
    op.drop_index("idx_export_templates_tenant_entity", table_name="export_templates")
    op.drop_table("export_templates")
