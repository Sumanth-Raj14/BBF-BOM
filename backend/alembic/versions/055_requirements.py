"""Requirements management.

Adds `requirements` (tenant-scoped requirement records with a parent_id
hierarchy) plus two traceability link tables: `requirement_part_links`
(which parts satisfy a requirement) and `requirement_bom_links` (which BOMs
implement it). The link tables are what make this more than a to-do list —
they back the "which parts satisfy this requirement" / "which requirements
does this part serve" / uncovered-requirements coverage queries.

Revision ID: 055_requirements
Revises: 054_uom_conversion
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "055_requirements"
down_revision: str | None = "054_uom_conversion"
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
        "requirements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("type", sa.String(), nullable=False, server_default="functional"),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("priority", sa.String(), nullable=True, server_default="medium"),
        sa.Column("version", sa.Integer(), nullable=True, server_default="1"),
        sa.Column(
            "parent_id",
            sa.Integer(),
            sa.ForeignKey("requirements.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "createdBy", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True
        ),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenantId", "key", name="uq_requirements_tenant_key"),
        sa.CheckConstraint(
            "type IN ('functional', 'performance', 'regulatory', 'interface')",
            name="ck_requirements_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'approved', 'obsolete')", name="ck_requirements_status"
        ),
    )
    op.create_index("idx_requirements_tenant_status", "requirements", ["tenantId", "status"])
    op.create_index("idx_requirements_tenant_type", "requirements", ["tenantId", "type"])
    op.create_index("ix_requirements_parent_id", "requirements", ["parent_id"])

    op.create_table(
        "requirement_part_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "requirement_id",
            sa.Integer(),
            sa.ForeignKey("requirements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "createdBy", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True
        ),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenantId", "requirement_id", "part_id", name="uq_req_part_link"),
    )
    op.create_index(
        "idx_req_part_links_requirement", "requirement_part_links", ["requirement_id"]
    )
    op.create_index("idx_req_part_links_part", "requirement_part_links", ["part_id"])

    op.create_table(
        "requirement_bom_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "requirement_id",
            sa.Integer(),
            sa.ForeignKey("requirements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "bom_id", sa.Integer(), sa.ForeignKey("boms.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "createdBy", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True
        ),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenantId", "requirement_id", "bom_id", name="uq_req_bom_link"),
    )
    op.create_index("idx_req_bom_links_requirement", "requirement_bom_links", ["requirement_id"])
    op.create_index("idx_req_bom_links_bom", "requirement_bom_links", ["bom_id"])

    _enable_rls("requirements")
    _enable_rls("requirement_part_links")
    _enable_rls("requirement_bom_links")


def downgrade() -> None:
    op.drop_index("idx_req_bom_links_bom", table_name="requirement_bom_links")
    op.drop_index("idx_req_bom_links_requirement", table_name="requirement_bom_links")
    op.drop_table("requirement_bom_links")

    op.drop_index("idx_req_part_links_part", table_name="requirement_part_links")
    op.drop_index("idx_req_part_links_requirement", table_name="requirement_part_links")
    op.drop_table("requirement_part_links")

    op.drop_index("ix_requirements_parent_id", table_name="requirements")
    op.drop_index("idx_requirements_tenant_type", table_name="requirements")
    op.drop_index("idx_requirements_tenant_status", table_name="requirements")
    op.drop_table("requirements")
