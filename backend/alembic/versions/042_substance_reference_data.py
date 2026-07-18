"""RoHS/REACH GLOBAL regulatory reference data.

Creates the five **global** (system-owned, no ``tenantId``, no RLS)
reference tables shared by every tenant (spec 2.2, P1):

    substance_groups, substances, regulation_versions,
    restricted_substance_entries, rohs_exemptions

then runs an **idempotent** data step (upsert on natural keys) that seeds
the bundled, versioned local-first snapshot from ``app/data/reference/*.json``
via ``app.services.reference_seed.seed_reference_data`` — the same loader the
``POST /compliance/reference/seed`` endpoint reuses at tenant creation. Because
these rows are global, the seed runs with NO tenant in context and stays
correct for tenants created after this migration. NO network access.

Unlike 040/041/043/044, these tables are global, so this migration installs
**NO** row-level-security policy.

Revision ID: 042_substance_reference_data
Revises: 041_part11_esignatures
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "042_substance_reference_data"
down_revision: str | None = "041_part11_esignatures"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- substance_groups (frozen scope, spec 10.8) ---
    op.create_table(
        "substance_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.UniqueConstraint("code", name="uq_substance_groups_code"),
    )

    # --- substances (one row per CAS) ---
    op.create_table(
        "substances",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cas_number", sa.String(), nullable=False),
        sa.Column("ec_number", sa.String()),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "substance_group_id",
            sa.Integer(),
            sa.ForeignKey("substance_groups.id", ondelete="SET NULL"),
        ),
        sa.UniqueConstraint("cas_number", name="uq_substances_cas"),
    )
    op.create_index("ix_substances_cas_number", "substances", ["cas_number"])
    op.create_index("ix_substances_substance_group_id", "substances", ["substance_group_id"])

    # --- regulation_versions ---
    op.create_table(
        "regulation_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("regulation_code", sa.String(), nullable=False),
        sa.Column("version_label", sa.String(), nullable=False),
        sa.Column("effective_date", sa.Date()),
        sa.Column("source", sa.String(), nullable=False, server_default="BUNDLED"),
        sa.Column("entry_count", sa.Integer()),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint(
            "regulation_code", "version_label", name="uq_regulation_versions_code_label"
        ),
    )
    op.create_index("ix_regulation_versions_regulation_code", "regulation_versions", ["regulation_code"])
    # At most one current version per regulation_code (partial unique index, spec 2.2).
    op.create_index(
        "uq_regulation_versions_current",
        "regulation_versions",
        ["regulation_code"],
        unique=True,
        sqlite_where=sa.text("is_current"),
        postgresql_where=sa.text("is_current"),
    )

    # --- restricted_substance_entries ---
    op.create_table(
        "restricted_substance_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "regulation_version_id",
            sa.Integer(),
            sa.ForeignKey("regulation_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("substance_id", sa.Integer(), sa.ForeignKey("substances.id", ondelete="CASCADE")),
        sa.Column(
            "substance_group_id",
            sa.Integer(),
            sa.ForeignKey("substance_groups.id", ondelete="CASCADE"),
        ),
        sa.Column("threshold_ppm", sa.Numeric(12, 4), nullable=False),
        sa.Column("threshold_basis", sa.String(), nullable=False),
        sa.Column("applicability", sa.JSON()),
        sa.CheckConstraint(
            "(CASE WHEN substance_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN substance_group_id IS NULL THEN 0 ELSE 1 END) = 1",
            name="ck_restricted_entry_one_target",
        ),
    )
    op.create_index(
        "ix_restricted_entries_version",
        "restricted_substance_entries",
        ["regulation_version_id"],
    )
    # Nullable-key uniqueness → partial unique indexes (spec P2).
    op.create_index(
        "uq_restricted_entry_version_substance",
        "restricted_substance_entries",
        ["regulation_version_id", "substance_id"],
        unique=True,
        sqlite_where=sa.text("substance_id IS NOT NULL"),
        postgresql_where=sa.text("substance_id IS NOT NULL"),
    )
    op.create_index(
        "uq_restricted_entry_version_group",
        "restricted_substance_entries",
        ["regulation_version_id", "substance_group_id"],
        unique=True,
        sqlite_where=sa.text("substance_group_id IS NOT NULL"),
        postgresql_where=sa.text("substance_group_id IS NOT NULL"),
    )

    # --- rohs_exemptions ---
    op.create_table(
        "rohs_exemptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("annex", sa.String(), nullable=False),
        sa.Column("substance_id", sa.Integer(), sa.ForeignKey("substances.id", ondelete="SET NULL")),
        sa.Column(
            "substance_group_id",
            sa.Integer(),
            sa.ForeignKey("substance_groups.id", ondelete="SET NULL"),
        ),
        sa.Column("application_scope", sa.Text()),
        sa.Column("applicable_eee_categories", sa.JSON()),
        sa.Column("valid_until", sa.Date()),
        sa.Column("category_validity", sa.JSON()),
        sa.Column("status", sa.String(), nullable=False, server_default="ACTIVE"),
        sa.UniqueConstraint("code", name="uq_rohs_exemptions_code"),
    )

    # --- idempotent seed of the bundled local-first snapshot (no network) ---
    from app.services.reference_seed import seed_reference_data

    seed_reference_data(op.get_bind())


def downgrade() -> None:
    op.drop_table("rohs_exemptions")
    op.drop_index("uq_restricted_entry_version_group", table_name="restricted_substance_entries")
    op.drop_index("uq_restricted_entry_version_substance", table_name="restricted_substance_entries")
    op.drop_index("ix_restricted_entries_version", table_name="restricted_substance_entries")
    op.drop_table("restricted_substance_entries")
    op.drop_index("uq_regulation_versions_current", table_name="regulation_versions")
    op.drop_index("ix_regulation_versions_regulation_code", table_name="regulation_versions")
    op.drop_table("regulation_versions")
    op.drop_index("ix_substances_substance_group_id", table_name="substances")
    op.drop_index("ix_substances_cas_number", table_name="substances")
    op.drop_table("substances")
    op.drop_table("substance_groups")
