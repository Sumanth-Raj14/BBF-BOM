"""BOM line-item custom-attribute VALUES.

`custom_attribute_definitions` (entity_type free-form, added long before this
migration) already lets a tenant define an ad-hoc attribute scoped to
entity_type='bom_item' with zero schema change. This migration adds the
missing piece: `bom_item_custom_values`, which stores the actual per-line
value for one of those definitions — pairing (bom_item_id,
attribute_definition_id) -> value, tenant-scoped and unique per pair.

Chains after 045_catalogs_and_bom_item_media to keep one linear Alembic head.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "046_bom_item_custom_values"
down_revision: str | None = "045_catalogs_and_bom_item_media"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _enable_rls(table: str) -> None:
    """Install migration 040's tenant_isolation RLS policy on a table created
    by this later revision (040's dynamic table discovery runs once and is not
    re-run by `alembic upgrade head`). Guarded to Postgres + settings.ENABLE_RLS
    — a no-op on SQLite / when RLS is not opted in. See 045 for full rationale.
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
        "bom_item_custom_values",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "bom_item_id",
            sa.Integer(),
            sa.ForeignKey("bom_items_master.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "attribute_definition_id",
            sa.Integer(),
            sa.ForeignKey("custom_attribute_definitions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("value", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "tenantId",
            "bom_item_id",
            "attribute_definition_id",
            name="uq_bom_item_custom_values_tenant_item_attr",
        ),
    )
    op.create_index("ix_bom_item_custom_values_tenantId", "bom_item_custom_values", ["tenantId"])
    op.create_index(
        "ix_bom_item_custom_values_bom_item_id", "bom_item_custom_values", ["bom_item_id"]
    )
    op.create_index(
        "ix_bom_item_custom_values_attribute_definition_id",
        "bom_item_custom_values",
        ["attribute_definition_id"],
    )

    # RLS backstop for this new tenant-scoped table (see _enable_rls).
    _enable_rls("bom_item_custom_values")


def downgrade() -> None:
    op.drop_index(
        "ix_bom_item_custom_values_attribute_definition_id",
        table_name="bom_item_custom_values",
    )
    op.drop_index("ix_bom_item_custom_values_bom_item_id", table_name="bom_item_custom_values")
    op.drop_index("ix_bom_item_custom_values_tenantId", table_name="bom_item_custom_values")
    op.drop_table("bom_item_custom_values")
