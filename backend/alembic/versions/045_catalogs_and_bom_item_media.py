"""Catalogs + BOM line-item media/visibility (OpenBOM-parity batch).

Adds two tenant-scoped tables and three nullable BOM line-item columns:

  * ``catalogs`` — tenant-scoped grouping of parts (column shape mirrors the
    TenantAwareMixin peers such as ``warehouses``). UniqueConstraint(tenantId,
    catalog_code).
  * ``part_catalogs`` — tenant-scoped M2M association between parts and
    catalogs. UniqueConstraint(tenantId, part_id, catalog_id).
  * ``bom_items_master``: image_document_id (FK documents.id ON DELETE SET
    NULL), thumbnail_path, exclude_from_bom (Boolean, server_default false).

Chains after the current single head (041_zoho_books_sync_tables) to keep one
linear Alembic head. Boolean server defaults use ``sa.false()`` so they render
dialect-appropriately (``false`` on Postgres, ``0`` on SQLite). No raw
CheckConstraint SQL is emitted, so there are no camelCase-folding hazards.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "045_catalogs_and_bom_item_media"
down_revision: str | None = "041_zoho_books_sync_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _enable_rls(table: str) -> None:
    """Install the same tenant_isolation RLS policy that migration 040 applies
    to every tenant-scoped table. 040 discovers tables dynamically AT THE TIME
    IT RUNS, so tables created by later revisions (like the ones below) are
    never covered by it — and `alembic upgrade head` does not re-run 040. Absent
    this, on an ENABLE_RLS=True deployment these tables would have NO RLS
    backstop and rely solely on app-layer filtering. Guarded to Postgres +
    settings.ENABLE_RLS (a complete no-op on SQLite / when RLS is not opted in),
    exactly like 040.
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
        "catalogs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("catalog_code", sa.String(), nullable=False),
        sa.Column("catalog_name", sa.String(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "tenantId", "catalog_code", name="uq_catalogs_tenant_catalog_code"
        ),
    )
    op.create_index("ix_catalogs_tenantId", "catalogs", ["tenantId"])

    op.create_table(
        "part_catalogs",
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
        sa.Column(
            "catalog_id",
            sa.Integer(),
            sa.ForeignKey("catalogs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "tenantId",
            "part_id",
            "catalog_id",
            name="uq_part_catalogs_tenant_part_catalog",
        ),
    )
    op.create_index("ix_part_catalogs_tenantId", "part_catalogs", ["tenantId"])
    op.create_index("ix_part_catalogs_part_id", "part_catalogs", ["part_id"])
    op.create_index("ix_part_catalogs_catalog_id", "part_catalogs", ["catalog_id"])

    # BOM line-item media / visibility columns (all nullable / defaulted, so the
    # ALTER is a no-op-safe add on existing rows for both Postgres and SQLite).
    with op.batch_alter_table("bom_items_master") as batch:
        batch.add_column(
            sa.Column(
                "image_document_id",
                sa.Integer(),
                sa.ForeignKey("documents.id", ondelete="SET NULL"),
                nullable=True,
            )
        )
        batch.add_column(sa.Column("thumbnail_path", sa.String(), nullable=True))
        batch.add_column(
            sa.Column(
                "exclude_from_bom",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
    op.create_index(
        "ix_bom_items_master_image_document_id",
        "bom_items_master",
        ["image_document_id"],
    )

    # RLS backstop for the two new tenant-scoped tables (see _enable_rls).
    _enable_rls("catalogs")
    _enable_rls("part_catalogs")


def downgrade() -> None:
    op.drop_index("ix_bom_items_master_image_document_id", table_name="bom_items_master")
    with op.batch_alter_table("bom_items_master") as batch:
        batch.drop_column("exclude_from_bom")
        batch.drop_column("thumbnail_path")
        batch.drop_column("image_document_id")

    op.drop_index("ix_part_catalogs_catalog_id", table_name="part_catalogs")
    op.drop_index("ix_part_catalogs_part_id", table_name="part_catalogs")
    op.drop_index("ix_part_catalogs_tenantId", table_name="part_catalogs")
    op.drop_table("part_catalogs")

    op.drop_index("ix_catalogs_tenantId", table_name="catalogs")
    op.drop_table("catalogs")
