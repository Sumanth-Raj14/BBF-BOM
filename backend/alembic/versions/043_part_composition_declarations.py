"""RoHS/REACH tenant-owned composition, declarations & exemption claims.

- ALTER ``parts`` ADD ``is_article`` / ``eee_category`` / ``part_kind``
  (STEP 0/P13: no existing parts column carries the procurement/structural
  kind, so ``part_kind`` is added; the enum is validated at the service layer
  — no DB CHECK, to keep the ALTER SQLite-compatible without a table rebuild).
- Create the TENANT-OWNED tables ``part_materials``,
  ``substance_declarations``, ``part_material_substances`` and
  ``exemption_claims`` (spec 2.3). Nullable-key uniqueness uses PARTIAL
  unique indexes (spec P2).
- Cold-start backfill (spec P4): derive ``part_kind`` from the existing
  ``assembly`` flag / ``category`` and set ``is_article=False`` for
  ASSEMBLY/PHANTOM (True for leaf/purchased). Composition is intentionally
  left empty — the resulting all-UNKNOWN baseline is triaged by the bulk
  importer + dashboard banner, not shipped as an unexplained wall of gray.

RLS (spec 3): each of the four tenant-owned tables gets its own per-table
policy block (040's one-time information_schema scan cannot see tables
created later, so an explicit block per table is required — 041's template).
Gated identically to 040/041: applied only when
``bind.dialect.name == "postgresql" and settings.ENABLE_RLS`` (a no-op on
SQLite / other dialects / Postgres-without-flag). ``downgrade()`` drops the
policies gated on **dialect only**, not the flag.

Revision ID: 043_part_composition_declarations
Revises: 042_substance_reference_data
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "043_part_composition_declarations"
down_revision: str | None = "042_substance_reference_data"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_POLICY_NAME = "tenant_isolation"
_TENANT_TABLES = [
    "part_materials",
    "part_material_substances",
    "substance_declarations",
    "exemption_claims",
]


def upgrade() -> None:
    # --- 1. Extend parts ---
    op.add_column("parts", sa.Column("is_article", sa.Boolean()))
    op.add_column("parts", sa.Column("eee_category", sa.SmallInteger()))
    op.add_column("parts", sa.Column("part_kind", sa.String()))
    op.create_index("ix_parts_part_kind", "parts", ["part_kind"])

    # --- 2. Tenant-owned tables (FK-safe creation order) ---
    op.create_table(
        "part_materials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("material_class", sa.String()),
        sa.Column("mass_g", sa.Numeric(10, 4)),
        sa.Column("mass_fraction", sa.Numeric(10, 4)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "mass_g IS NOT NULL OR mass_fraction IS NOT NULL",
            name="ck_part_materials_mass_present",
        ),
        sa.UniqueConstraint("tenantId", "part_id", "name", name="uq_part_materials_tenant_part_name"),
    )
    op.create_index("ix_part_materials_tenantId", "part_materials", ["tenantId"])
    op.create_index("ix_part_materials_part_id", "part_materials", ["part_id"])
    op.create_index("idx_part_materials_tenant_part", "part_materials", ["tenantId", "part_id"])

    op.create_table(
        "substance_declarations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="SET NULL")),
        sa.Column("standard", sa.String()),
        sa.Column("disclosure_class", sa.String()),
        sa.Column("data_fidelity", sa.String()),
        sa.Column("declared_regulations", sa.JSON()),
        sa.Column("signing_authority", sa.String()),
        sa.Column("signed_date", sa.Date()),
        sa.Column("valid_from", sa.Date()),
        sa.Column("valid_until", sa.Date()),
        sa.Column("revision_of_part", sa.String()),
        sa.Column(
            "assessed_regulation_version_id",
            sa.Integer(),
            sa.ForeignKey("regulation_versions.id", ondelete="SET NULL"),
        ),
        sa.Column("document_uri", sa.String()),
        sa.Column("content_hash", sa.String(64)),
        sa.Column("status", sa.String(), nullable=False, server_default="RECEIVED"),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_substance_declarations_tenantId", "substance_declarations", ["tenantId"])
    op.create_index("ix_substance_declarations_part_id", "substance_declarations", ["part_id"])
    op.create_index("idx_declarations_tenant_part", "substance_declarations", ["tenantId", "part_id"])
    # content_hash is NULL before document upload → partial unique index (P2).
    op.create_index(
        "uq_declarations_tenant_part_hash",
        "substance_declarations",
        ["tenantId", "part_id", "content_hash"],
        unique=True,
        sqlite_where=sa.text("content_hash IS NOT NULL"),
        postgresql_where=sa.text("content_hash IS NOT NULL"),
    )

    op.create_table(
        "part_material_substances",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "part_material_id",
            sa.Integer(),
            sa.ForeignKey("part_materials.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "substance_id", sa.Integer(), sa.ForeignKey("substances.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("concentration_ppm", sa.Numeric(12, 4), nullable=False),
        sa.Column("mass_g", sa.Numeric(10, 4)),
        sa.Column(
            "source_declaration_id",
            sa.Integer(),
            sa.ForeignKey("substance_declarations.id", ondelete="SET NULL"),
        ),
        sa.UniqueConstraint(
            "tenantId", "part_material_id", "substance_id", name="uq_pms_tenant_material_substance"
        ),
    )
    op.create_index("ix_pms_tenantId", "part_material_substances", ["tenantId"])
    op.create_index("ix_pms_part_material_id", "part_material_substances", ["part_material_id"])
    op.create_index("ix_pms_substance_id", "part_material_substances", ["substance_id"])
    op.create_index("idx_pms_tenant_material", "part_material_substances", ["tenantId", "part_material_id"])

    op.create_table(
        "exemption_claims",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "part_material_id", sa.Integer(), sa.ForeignKey("part_materials.id", ondelete="CASCADE")
        ),
        sa.Column(
            "exemption_id",
            sa.Integer(),
            sa.ForeignKey("rohs_exemptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("substance_id", sa.Integer(), sa.ForeignKey("substances.id", ondelete="CASCADE")),
        sa.Column(
            "substance_group_id", sa.Integer(), sa.ForeignKey("substance_groups.id", ondelete="CASCADE")
        ),
        sa.Column("justification", sa.Text()),
        sa.Column(
            "source_declaration_id",
            sa.Integer(),
            sa.ForeignKey("substance_declarations.id", ondelete="SET NULL"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_exemption_claims_tenantId", "exemption_claims", ["tenantId"])
    op.create_index("ix_exemption_claims_part_id", "exemption_claims", ["part_id"])
    op.create_index("ix_exemption_claims_exemption_id", "exemption_claims", ["exemption_id"])
    op.create_index(
        "uq_exemption_claims_substance",
        "exemption_claims",
        ["tenantId", "part_id", "exemption_id", "substance_id"],
        unique=True,
        sqlite_where=sa.text("substance_id IS NOT NULL"),
        postgresql_where=sa.text("substance_id IS NOT NULL"),
    )
    op.create_index(
        "uq_exemption_claims_group",
        "exemption_claims",
        ["tenantId", "part_id", "exemption_id", "substance_group_id"],
        unique=True,
        sqlite_where=sa.text("substance_group_id IS NOT NULL"),
        postgresql_where=sa.text("substance_group_id IS NOT NULL"),
    )

    # --- 3. Cold-start backfill (spec P4) ---
    bind = op.get_bind()
    # Derive part_kind from existing signals (assembly flag / discipline category).
    bind.execute(
        sa.text(
            "UPDATE parts SET part_kind = 'ASSEMBLY' "
            "WHERE part_kind IS NULL AND (assembly = :truthy OR category = 'Assembly')"
        ),
        {"truthy": True},
    )
    bind.execute(
        sa.text(
            "UPDATE parts SET part_kind = 'RAW_MATERIAL' "
            "WHERE part_kind IS NULL AND category = 'Raw Material'"
        )
    )
    bind.execute(sa.text("UPDATE parts SET part_kind = 'PURCHASED' WHERE part_kind IS NULL"))
    # is_article: False for ASSEMBLY/PHANTOM, True otherwise (no blanket default=True, P4).
    bind.execute(
        sa.text(
            "UPDATE parts SET is_article = :falsy "
            "WHERE is_article IS NULL AND part_kind IN ('ASSEMBLY', 'PHANTOM')"
        ),
        {"falsy": False},
    )
    bind.execute(
        sa.text("UPDATE parts SET is_article = :truthy WHERE is_article IS NULL"),
        {"truthy": True},
    )
    # eee_category is left NULL — not derivable from existing data; it is set on
    # top-level assemblies via the importer/UI and inherited down the branch at rollup (P3).

    # --- 4. Per-table RLS (tenant-owned tables only) ---
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

    op.drop_table("exemption_claims")
    op.drop_table("part_material_substances")
    op.drop_table("substance_declarations")
    op.drop_table("part_materials")

    op.drop_index("ix_parts_part_kind", table_name="parts")
    op.drop_column("parts", "part_kind")
    op.drop_column("parts", "eee_category")
    op.drop_column("parts", "is_article")
