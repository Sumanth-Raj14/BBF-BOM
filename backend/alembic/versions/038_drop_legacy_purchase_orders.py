"""Drop legacy purchase_orders table (PurchaseOrder model removed).

Per DECISIONS.md, POHeader/POLineItem (`po_headers`/`po_line_items`) are the
canonical purchase-order tables. The legacy `purchase_orders` table (backing
the now-removed `app.models.procurement.PurchaseOrder` ORM model) has no
runtime writers left — `procurement_service` (the only service that creates
POs) already writes exclusively to `po_headers`/`po_line_items`. A repo audit
found zero remaining ORM references to the old model.

Three FKs still point at `purchase_orders(id)` from the original (never
retargeted) migrations 002_phase3 and 013_enterprise_audit_fixes:
`documents.purchaseOrderId`, `serial_numbers.poId`, `lot_batches.poId` — even
though their SQLAlchemy models (document.py, traceability.py) have long
declared these as FKs to `po_headers.id`. Postgres would refuse to drop
`purchase_orders` while those constraints reference it, so this migration
first retargets each one (matched by introspecting the actual referred table,
since the live constraint names/column casing don't necessarily follow the
app's naming convention — see 035_tenant_scoped_unique_keys for the same
pattern) to point at `po_headers(id) ON DELETE CASCADE`, matching the models,
then drops `purchase_orders` (guarded with IF EXISTS / checkfirst so this is
safe to run against an environment where the table is already gone).

If a real Postgres environment has orphaned rows in `purchase_orders`
predating procurement_service's switch to po_headers/po_line_items, run
`python -m scripts.consolidate_po --dry-run` (and then for real) BEFORE this
migration ships — see that script's module docstring.

Revision ID: 038_drop_legacy_purchase_orders
Revises: 037_bom_item_find_number
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "038_drop_legacy_purchase_orders"
down_revision: str | None = "037_bom_item_find_number"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, ondelete) — every table with a live FK into purchase_orders(id) that
# must be retargeted at po_headers(id) before the old table can be dropped.
_RETARGET_TABLES: list[tuple[str, str]] = [
    ("documents", "CASCADE"),
    ("serial_numbers", "CASCADE"),
    ("lot_batches", "CASCADE"),
]


def _retarget_fks_off_purchase_orders(inspector, old_table: str, new_table: str) -> None:
    for table, ondelete in _RETARGET_TABLES:
        for fk in inspector.get_foreign_keys(table):
            if fk.get("referred_table") == old_table:
                name = fk.get("name")
                cols = fk["constrained_columns"]
                if name:
                    op.drop_constraint(name, table, type_="foreignkey")
                op.create_foreign_key(
                    f"{table}_{cols[0].lower()}_fkey",
                    table,
                    new_table,
                    cols,
                    ["id"],
                    ondelete=ondelete,
                )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    _retarget_fks_off_purchase_orders(inspector, "purchase_orders", "po_headers")

    op.execute("DROP TABLE IF EXISTS purchase_orders")


def downgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        "purchase_orders",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenantId", sa.Integer, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("poNumber", sa.String, index=True, nullable=False),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("vendorId", sa.Integer, sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("qty", sa.Integer, nullable=False),
        sa.Column("eta", sa.String),
        sa.Column("status", sa.String, server_default="Not Ordered"),
        sa.Column("unitCost", sa.Numeric(18, 4)),
        sa.Column("totalCost", sa.Numeric(18, 4)),
        sa.Column("taxCost", sa.Numeric(18, 4)),
        sa.Column("freightCost", sa.Numeric(18, 4)),
        sa.Column("migrated_to_po_headers", sa.Boolean, server_default=sa.false()),
        sa.Column("po_header_id", sa.Integer, sa.ForeignKey("po_headers.id", ondelete="CASCADE"), index=True),
        sa.Column("poReference", sa.String),
        sa.Column("invoiceReference", sa.String),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("tenantId", "poNumber", name="uq_purchase_orders_tenant_poNumber"),
    )
    op.create_index("idx_purchase_orders_tenant_status", "purchase_orders", ["tenantId", "status"])

    inspector = sa.inspect(bind)
    for table, ondelete in _RETARGET_TABLES:
        for fk in inspector.get_foreign_keys(table):
            if fk.get("referred_table") == "po_headers" and fk.get("name", "").endswith("_fkey"):
                cols = fk["constrained_columns"]
                # Only retarget the FK this migration created (matches our naming).
                if fk.get("name") == f"{table}_{cols[0].lower()}_fkey":
                    op.drop_constraint(fk["name"], table, type_="foreignkey")
                    op.create_foreign_key(
                        fk["name"], table, "purchase_orders", cols, ["id"], ondelete=ondelete
                    )
