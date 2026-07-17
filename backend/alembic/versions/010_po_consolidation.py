"""PO consolidation — enhance po_headers with full enterprise fields.

Revision ID: 010_po_consolidation
Revises: 009_backup_and_schema_fixes
Create Date: 2026-06-14
"""

import sqlalchemy as sa

from alembic import op

revision = "010_po_consolidation"
down_revision = "009_backup_and_schema_fixes"
branch_labels = None
depends_on = None


def _add_col(table, col_def):
    op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col_def}")


def upgrade() -> None:
    _add_col("po_headers", "notes TEXT")
    _add_col("po_headers", "shipping_address TEXT")
    _add_col("po_headers", "billing_address TEXT")
    _add_col("po_headers", "payment_terms VARCHAR(100)")
    _add_col("po_headers", "shipping_method VARCHAR(100)")
    _add_col("po_headers", "currency VARCHAR(3) DEFAULT 'USD'")
    _add_col("po_headers", "approved_by INTEGER REFERENCES users(id)")
    _add_col("po_headers", "approved_at TIMESTAMP")
    _add_col("po_headers", "subtotal NUMERIC(12,2)")
    _add_col("po_headers", "tax_total NUMERIC(12,2)")
    _add_col("po_headers", "freight_total NUMERIC(12,2)")
    _add_col("po_headers", "line_count INTEGER")
    _add_col("po_headers", "requested_by INTEGER REFERENCES users(id)")
    _add_col("po_headers", "project_id INTEGER REFERENCES projects(id)")

    op.create_table(
        "po_line_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "headerId", sa.Integer, sa.ForeignKey("po_headers.id"), nullable=False
        ),
        sa.Column("itemName", sa.Text, nullable=False),
        sa.Column("itemDesc", sa.Text),
        sa.Column("quantity", sa.Integer, server_default="1"),
        sa.Column("itemPrice", sa.Float, server_default="0"),
        sa.Column("amount", sa.Float, server_default="0"),
        sa.Column("gst", sa.Float, server_default="0"),
        sa.Column("total", sa.Float, server_default="0"),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )
    op.create_index("idx_po_line_items_header", "po_line_items", ["headerId"])


def downgrade() -> None:
    cols = [
        "notes",
        "shipping_address",
        "billing_address",
        "payment_terms",
        "shipping_method",
        "currency",
        "approved_by",
        "approved_at",
        "subtotal",
        "tax_total",
        "freight_total",
        "line_count",
        "requested_by",
        "project_id",
    ]
    for c in cols:
        op.execute(f"ALTER TABLE po_headers DROP COLUMN IF EXISTS {c}")
    op.drop_table("po_line_items")
