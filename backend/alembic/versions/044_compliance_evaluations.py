"""RoHS/REACH persisted evaluation + REACH obligation caches (tenant-owned).

Creates ``compliance_evaluations`` and ``reach_obligations`` (spec 2.4).
Version-stamped (regulation_version_id + evaluated_at) for reproducibility.
SELF rows (bom_id NULL) dedupe per part; ROLLUP rows are per-(part, bom);
both uniqueness keys are PARTIAL unique indexes (spec P2). REACH obligations
union upward independent of the status lattice (spec 4.4) and dedupe with a
COALESCE(bom_id, 0) sentinel so the nullable context column still enforces
uniqueness.

RLS (spec 3): per-table policy block on each tenant-owned table, gated
identically to 040/041/043 (``postgresql and settings.ENABLE_RLS``; no-op
otherwise). ``downgrade()`` drops policies gated on dialect only.

Revision ID: 044_compliance_evaluations
Revises: 043_part_composition_declarations
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "044_compliance_evaluations"
down_revision: str | None = "043_part_composition_declarations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_POLICY_NAME = "tenant_isolation"
_TENANT_TABLES = ["compliance_evaluations", "reach_obligations"]


def upgrade() -> None:
    op.create_table(
        "compliance_evaluations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "regulation_version_id",
            sa.Integer(),
            sa.ForeignKey("regulation_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("bom_id", sa.Integer(), sa.ForeignKey("boms.id", ondelete="CASCADE")),
        sa.Column("bom_rev", sa.String()),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("basis", sa.String(), nullable=False),
        sa.Column("exceedance", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("data_fidelity", sa.String()),
        sa.Column("driving_child_part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="SET NULL")),
        sa.Column("driving_substance_id", sa.Integer(), sa.ForeignKey("substances.id", ondelete="SET NULL")),
        sa.Column(
            "applied_exemption_id", sa.Integer(), sa.ForeignKey("rohs_exemptions.id", ondelete="SET NULL")
        ),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("is_stale", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_compliance_evaluations_tenantId", "compliance_evaluations", ["tenantId"])
    op.create_index("ix_compliance_evaluations_part_id", "compliance_evaluations", ["part_id"])
    op.create_index(
        "ix_compliance_evaluations_reg_version",
        "compliance_evaluations",
        ["regulation_version_id"],
    )
    op.create_index("idx_eval_tenant_part", "compliance_evaluations", ["tenantId", "part_id"])
    op.create_index("idx_eval_tenant_bom", "compliance_evaluations", ["tenantId", "bom_id"])
    # SELF rows deduped per part; ROLLUP rows per (part, bom) — partial unique indexes (P2).
    op.create_index(
        "uq_eval_self",
        "compliance_evaluations",
        ["tenantId", "part_id", "regulation_version_id"],
        unique=True,
        sqlite_where=sa.text("basis = 'SELF' AND bom_id IS NULL"),
        postgresql_where=sa.text("basis = 'SELF' AND bom_id IS NULL"),
    )
    op.create_index(
        "uq_eval_rollup",
        "compliance_evaluations",
        ["tenantId", "part_id", "regulation_version_id", "bom_id"],
        unique=True,
        sqlite_where=sa.text("basis = 'ROLLUP'"),
        postgresql_where=sa.text("basis = 'ROLLUP'"),
    )

    op.create_table(
        "reach_obligations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "article_part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "substance_id", sa.Integer(), sa.ForeignKey("substances.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "regulation_version_id",
            sa.Integer(),
            sa.ForeignKey("regulation_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("bom_id", sa.Integer(), sa.ForeignKey("boms.id", ondelete="CASCADE")),
        sa.Column("concentration_ppm", sa.Numeric(12, 4)),
        sa.Column("scip_ref", sa.String()),
    )
    op.create_index("ix_reach_obligations_tenantId", "reach_obligations", ["tenantId"])
    op.create_index("ix_reach_obligations_part_id", "reach_obligations", ["part_id"])
    op.create_index("idx_reach_obligations_tenant_part", "reach_obligations", ["tenantId", "part_id"])
    # COALESCE(bom_id, 0) sentinel so the nullable context column still enforces uniqueness (P2).
    op.create_index(
        "uq_reach_obligations_dedup",
        "reach_obligations",
        [
            "tenantId",
            "part_id",
            "article_part_id",
            "substance_id",
            "regulation_version_id",
            sa.text("COALESCE(bom_id, 0)"),
        ],
        unique=True,
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql" and settings.ENABLE_RLS:
        for table in _TENANT_TABLES:
            bind.execute(sa.text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))
            bind.execute(sa.text(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY'))
            bind.execute(sa.text(f'DROP POLICY IF EXISTS {_POLICY_NAME} ON "{table}"'))
            bind.execute(
                sa.text(
                    f'CREATE POLICY {_POLICY_NAME} ON "{table}" '
                    f'USING ("tenantId" = current_setting(\'app.current_tenant\', true)::int)'
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for table in _TENANT_TABLES:
            bind.execute(sa.text(f'DROP POLICY IF EXISTS {_POLICY_NAME} ON "{table}"'))
            bind.execute(sa.text(f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY'))
            bind.execute(sa.text(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY'))

    op.drop_table("reach_obligations")
    op.drop_table("compliance_evaluations")
