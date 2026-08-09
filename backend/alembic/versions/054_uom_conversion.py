"""Units of Measure + conversion (multi-UOM support).

Adds two tenant-scoped tables, modeled on Currency/ExchangeRate
(app/models/enterprise_extensions.py):

    uom_units       — code, name, dimension (length/mass/count/volume), is_base
    uom_conversions — from_uom -> to_uom (always the dimension's base) with a
                      factor: qty_in_to_uom = qty_in_from_uom * factor

Data step seeds the standard 12-unit set (EA, M, CM, MM, FT, IN, KG, G, LB,
OZ, L, ML) plus their base-unit conversion factors for every tenant that
already exists — same STANDARD_UNITS/STANDARD_CONVERSIONS constants
app/services/uom_service.py uses at runtime, so the data lives in one place.
A tenant created AFTER this migration needs the same seeding; see the
feature writeup for the one-line call site (out of scope for this
migration, which only handles tenants that exist right now).

Revision ID: 054_uom_conversion
Revises: 053_bom_effectivity
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "054_uom_conversion"
down_revision: str | None = "053_bom_effectivity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _enable_rls(table: str) -> None:
    """Same guarded RLS install as migration 051 — Postgres + ENABLE_RLS only."""
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
        "uom_units",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(10), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("dimension", sa.String(20), nullable=False),
        sa.Column("is_base", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenantId", "code", name="uq_uom_units_tenant_code"),
    )
    op.create_index("idx_uom_units_tenant_dimension", "uom_units", ["tenantId", "dimension"])

    op.create_table(
        "uom_conversions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("from_uom", sa.String(10), nullable=False),
        sa.Column("to_uom", sa.String(10), nullable=False),
        sa.Column("factor", sa.Numeric(24, 12), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenantId", "from_uom", "to_uom", name="uq_uom_conversions_tenant_pair"),
    )
    op.create_index("idx_uom_conversions_tenant_from", "uom_conversions", ["tenantId", "from_uom"])

    _enable_rls("uom_units")
    _enable_rls("uom_conversions")

    # --- seed the standard set for every tenant that exists today ---
    from app.services.uom_service import STANDARD_CONVERSIONS, STANDARD_UNITS

    bind = op.get_bind()
    tenant_ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM tenants")).fetchall()]

    uom_units_t = sa.table(
        "uom_units",
        sa.column("tenantId"),
        sa.column("code"),
        sa.column("name"),
        sa.column("dimension"),
        sa.column("is_base"),
    )
    uom_conversions_t = sa.table(
        "uom_conversions",
        sa.column("tenantId"),
        sa.column("from_uom"),
        sa.column("to_uom"),
        # Typed explicitly (unlike the other sa.column() calls above) — an
        # untyped column hands the raw Decimal straight to the DBAPI driver,
        # and sqlite3 refuses to bind decimal.Decimal at all. Numeric(24, 12)
        # matches the real column type from create_table above and lets
        # SQLAlchemy's type layer adapt it correctly for either dialect.
        sa.column("factor", sa.Numeric(24, 12)),
    )

    for tid in tenant_ids:
        bind.execute(
            uom_units_t.insert(),
            [
                {"tenantId": tid, "code": code, "name": name, "dimension": dim, "is_base": is_base}
                for code, name, dim, is_base in STANDARD_UNITS
            ],
        )
        bind.execute(
            uom_conversions_t.insert(),
            [
                {"tenantId": tid, "from_uom": f, "to_uom": t, "factor": factor}
                for f, t, factor in STANDARD_CONVERSIONS
            ],
        )


def downgrade() -> None:
    op.drop_index("idx_uom_conversions_tenant_from", table_name="uom_conversions")
    op.drop_table("uom_conversions")
    op.drop_index("idx_uom_units_tenant_dimension", table_name="uom_units")
    op.drop_table("uom_units")
