"""Backup system + Schema fixes + Performance indexes.

Revision ID: 009_backup_and_schema_fixes
Revises: 008_enterprise_fixes
Create Date: 2026-06-14
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "009_backup_and_schema_fixes"
down_revision = "008_enterprise_fixes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "backup_history",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("backup_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column(
            "started_at", sa.DateTime, server_default=sa.func.current_timestamp()
        ),
        sa.Column("completed_at", sa.DateTime),
        sa.Column("size_bytes", sa.BigInteger),
        sa.Column("storage_path", sa.Text),
        sa.Column("storage_type", sa.String(20), server_default="local"),
        sa.Column("error_message", sa.Text),
        sa.Column("verified_at", sa.DateTime),
        sa.Column("verification_status", sa.String(20)),
        sa.Column("retention_tier", sa.String(20)),
        sa.Column("metadata", JSONB, server_default="'{}'::jsonb"),
        sa.Column(
            "created_at", sa.DateTime, server_default=sa.func.current_timestamp()
        ),
    )

    op.execute(
        "ALTER TABLE backup_history ALTER COLUMN id SET DEFAULT nextval('backup_history_id_seq'::regclass)"
    )
    op.create_index(
        "idx_backup_history_started_at",
        "backup_history",
        ["started_at"],
        postgresql_using="btree",
    )
    op.create_index("idx_backup_history_status", "backup_history", ["status"])
    op.create_index(
        "idx_backup_history_retention",
        "backup_history",
        ["retention_tier", "started_at"],
    )

    op.execute("ALTER TABLE po_headers ADD COLUMN IF NOT EXISTS vendor_id INTEGER")
    op.execute(
        "ALTER TABLE po_headers ADD CONSTRAINT IF NOT EXISTS fk_po_headers_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id)"
    )
    op.create_index("idx_po_headers_vendor_id", "po_headers", ["vendor_id"])

    op.execute(
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_type VARCHAR(20) DEFAULT 's3'"
    )
    op.execute(
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS local_fallback_path TEXT"
    )
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS checksum VARCHAR(64)")
    op.create_index("idx_documents_storage_type", "documents", ["storage_type"])

    op.execute(
        "ALTER TABLE parts ADD COLUMN IF NOT EXISTS primary_vendor_id INTEGER REFERENCES vendors(id)"
    )
    op.create_index("idx_parts_primary_vendor", "parts", ["primary_vendor_id"])

    op.execute(
        "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS migrated_to_po_headers BOOLEAN DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_header_id INTEGER REFERENCES po_headers(id)"
    )

    op.create_index("idx_parts_status_category", "parts", ["status", "category"])
    op.create_index("idx_parts_vendor_category", "parts", ["vendor", "category"])
    op.create_index(
        "idx_purchase_orders_migrated", "purchase_orders", ["migrated_to_po_headers"]
    )


def downgrade() -> None:
    op.drop_table("backup_history")
    op.execute("ALTER TABLE po_headers DROP CONSTRAINT IF EXISTS fk_po_headers_vendor")
    op.execute("ALTER TABLE po_headers DROP COLUMN IF EXISTS vendor_id")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS storage_type")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS local_fallback_path")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS checksum")
    op.execute("ALTER TABLE parts DROP COLUMN IF EXISTS primary_vendor_id")
    op.execute(
        "ALTER TABLE purchase_orders DROP COLUMN IF EXISTS migrated_to_po_headers"
    )
    op.execute("ALTER TABLE purchase_orders DROP COLUMN IF EXISTS po_header_id")
