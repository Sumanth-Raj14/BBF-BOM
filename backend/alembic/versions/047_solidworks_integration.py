"""SolidWorks integration + part derivatives + computed custom attributes.

Adds three new tenant-scoped tables and two additive columns:

- ``sw_property_mappings`` — SolidWorks custom-property -> Part field mapping
  rules with an include/exclude flag. Unique per (tenantId, sw_property).
- ``sw_pending_changes`` — outbox of changes queued to be written back INTO
  SolidWorks. part_id is nullable (SET NULL) so queued changes survive a part
  delete.
- ``part_derivatives`` — typed CAD derivative links (pdf|step|dwg|dxf|other)
  for a Part, unique per (tenantId, part_id, kind).
- ``custom_attribute_definitions`` gains ``formula`` (Text) and ``is_computed``
  (Boolean) to support calculated/derived attributes.

Chains after 046_bom_item_custom_values to keep one linear Alembic head.

Revision ID: 047_solidworks_integration
Revises: 046_bom_item_custom_values
Create Date: 2026-07-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "047_solidworks_integration"
down_revision: str | None = "046_bom_item_custom_values"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _enable_rls(table: str) -> None:
    """Install migration 040's tenant_isolation RLS policy on a table created
    by this later revision (040's dynamic table discovery runs once and is not
    re-run by `alembic upgrade head`). Guarded to Postgres + settings.ENABLE_RLS
    — a no-op on SQLite / when RLS is not opted in. See 045/046 for rationale.
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
    # ------------------------------------------------------------------ #
    # 1. sw_property_mappings
    # ------------------------------------------------------------------ #
    op.create_table(
        "sw_property_mappings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sw_property", sa.String(length=255), nullable=False),
        sa.Column("target_field", sa.String(length=255), nullable=False),
        sa.Column(
            "is_excluded", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "tenantId", "sw_property", name="uq_sw_property_mappings_tenant_prop"
        ),
    )
    op.create_index(
        "ix_sw_property_mappings_tenantId", "sw_property_mappings", ["tenantId"]
    )

    # ------------------------------------------------------------------ #
    # 2. sw_pending_changes
    # ------------------------------------------------------------------ #
    op.create_table(
        "sw_pending_changes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "part_id",
            sa.Integer(),
            sa.ForeignKey("parts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("model_name", sa.String(length=255)),
        sa.Column("change_type", sa.String(length=100), nullable=False),
        sa.Column("payload", sa.JSON()),
        sa.Column(
            "status",
            sa.String(length=50),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_sw_pending_changes_tenantId", "sw_pending_changes", ["tenantId"]
    )
    op.create_index(
        "ix_sw_pending_changes_part_id", "sw_pending_changes", ["part_id"]
    )

    # ------------------------------------------------------------------ #
    # 3. part_derivatives
    # ------------------------------------------------------------------ #
    op.create_table(
        "part_derivatives",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "part_id",
            sa.Integer(),
            sa.ForeignKey("parts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("drawing_status", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "tenantId", "part_id", "kind", name="uq_part_derivatives_tenant_part_kind"
        ),
        sa.CheckConstraint(
            "kind IN ('pdf', 'step', 'dwg', 'dxf', 'other')",
            name="ck_part_derivatives_kind",
        ),
    )
    op.create_index("ix_part_derivatives_tenantId", "part_derivatives", ["tenantId"])
    op.create_index("ix_part_derivatives_part_id", "part_derivatives", ["part_id"])

    # ------------------------------------------------------------------ #
    # 4. custom_attribute_definitions: calculated-field columns
    # ------------------------------------------------------------------ #
    with op.batch_alter_table("custom_attribute_definitions") as batch_op:
        batch_op.add_column(sa.Column("formula", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "is_computed",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )

    # RLS backstop for the new tenant-scoped tables (see _enable_rls).
    _enable_rls("sw_property_mappings")
    _enable_rls("sw_pending_changes")
    _enable_rls("part_derivatives")


def downgrade() -> None:
    with op.batch_alter_table("custom_attribute_definitions") as batch_op:
        batch_op.drop_column("is_computed")
        batch_op.drop_column("formula")

    op.drop_index("ix_part_derivatives_part_id", table_name="part_derivatives")
    op.drop_index("ix_part_derivatives_tenantId", table_name="part_derivatives")
    op.drop_table("part_derivatives")

    op.drop_index("ix_sw_pending_changes_part_id", table_name="sw_pending_changes")
    op.drop_index("ix_sw_pending_changes_tenantId", table_name="sw_pending_changes")
    op.drop_table("sw_pending_changes")

    op.drop_index("ix_sw_property_mappings_tenantId", table_name="sw_property_mappings")
    op.drop_table("sw_property_mappings")
