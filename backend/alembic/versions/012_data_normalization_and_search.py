"""Normalize JSON columns into proper tables, add full-text search indexes.

Revision ID: 012_data_normalization_and_search
Revises: 011_user_data_sync
Create Date: 2026-06-16
"""

import sqlalchemy as sa

from alembic import op

revision = "012_data_normalization_and_search"
down_revision = "011_user_data_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Part country history (normalize from JSON) ──
    op.create_table(
        "part_country_history",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "part_id",
            sa.Integer,
            sa.ForeignKey("parts.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("country", sa.String(100), nullable=False),
        sa.Column("date_from", sa.DateTime),
        sa.Column("date_to", sa.DateTime),
        sa.Column("reason", sa.String(255)),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.current_timestamp()),
    )
    op.create_index(
        "idx_part_country_history_part",
        "part_country_history",
        ["part_id", sa.text("date_from DESC")],
    )

    # ── Part vendor prices (normalize from JSON) ──
    op.create_table(
        "part_vendor_prices",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "part_id",
            sa.Integer,
            sa.ForeignKey("parts.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("vendor_id", sa.Integer, sa.ForeignKey("vendors.id", ondelete="SET NULL")),
        sa.Column("vendor_name", sa.String(255)),
        sa.Column("price", sa.Float, nullable=False),
        sa.Column("currency", sa.String(3), server_default="USD"),
        sa.Column("quantity_break", sa.Integer, server_default="1"),
        sa.Column("date_quoted", sa.DateTime),
        sa.Column("date_valid_until", sa.DateTime),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.current_timestamp()),
    )
    op.create_index(
        "idx_part_vendor_prices_part",
        "part_vendor_prices",
        ["part_id", "vendor_id", sa.text("date_quoted DESC")],
    )
    op.create_index("idx_part_vendor_prices_vendor", "part_vendor_prices", ["vendor_id"])

    # ── Full-text search indexes ──
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_parts_fts
        ON parts
        USING gin(
            to_tsvector('english',
                coalesce(pn, '') || ' ' ||
                coalesce(name, '') || ' ' ||
                coalesce(description, '') || ' ' ||
                coalesce(mpn, '')
            )
        )
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_projects_fts
        ON projects
        USING gin(
            to_tsvector('english',
                coalesce(code, '') || ' ' ||
                coalesce(name, '') || ' ' ||
                coalesce(description, '')
            )
        )
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_vendors_fts
        ON vendors
        USING gin(
            to_tsvector('english',
                coalesce(name, '') || ' ' ||
                coalesce(country, '') || ' ' ||
                coalesce(contactEmail, '')
            )
        )
        """
    )

    # ── Composite indexes for common query patterns ──
    op.create_index("idx_parts_category_status", "parts", ["category", "status"])
    op.create_index("idx_parts_vendor_status", "parts", ["vendor", "status"])
    op.create_index("idx_parts_created_at", "parts", [sa.text("created_at DESC")])

    # ── Indexes on audit_logs for faster queries ──
    op.create_index("idx_audit_logs_timestamp", "audit_logs", [sa.text("created_at DESC")])
    op.create_index(
        "idx_audit_logs_action_timestamp", "audit_logs", ["action", sa.text("created_at DESC")]
    )

    # ── Indexes on notifications ──
    op.create_index(
        "idx_notifications_user_read",
        "notifications",
        ["user_id", "is_read", sa.text("created_at DESC")],
    )

    # ── Indexes on work orders ──
    op.create_index(
        "idx_work_orders_status_due", "work_orders", ["status", sa.text("due_date ASC")]
    )
    op.create_index("idx_work_orders_assigned", "work_orders", ["assigned_to", "status"])

    # ── Indexes on BOM items ──
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bom_items_master_bom_part
        ON bom_items_master(bom_id, part_id)
        """
    )

    # ── Indexes on PO headers ──
    op.create_index("idx_po_headers_vendor_status", "po_headers", ["vendor_id", "status"])
    op.create_index("idx_po_headers_created", "po_headers", [sa.text("created_at DESC")])

    # ── Add conversion_rate to user_preferences if not present ──
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'user_preferences' AND column_name = 'conversion_rate'
            ) THEN
                ALTER TABLE user_preferences ADD COLUMN conversion_rate INTEGER DEFAULT 83;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.drop_table("part_vendor_prices")
    op.drop_table("part_country_history")

    op.execute("DROP INDEX IF EXISTS idx_parts_fts")
    op.execute("DROP INDEX IF EXISTS idx_projects_fts")
    op.execute("DROP INDEX IF EXISTS idx_vendors_fts")

    op.drop_index("idx_parts_category_status", table_name="parts")
    op.drop_index("idx_parts_vendor_status", table_name="parts")
    op.drop_index("idx_parts_created_at", table_name="parts")
    op.drop_index("idx_audit_logs_timestamp", table_name="audit_logs")
    op.drop_index("idx_audit_logs_action_timestamp", table_name="audit_logs")
    op.drop_index("idx_notifications_user_read", table_name="notifications")
    op.drop_index("idx_work_orders_status_due", table_name="work_orders")
    op.drop_index("idx_work_orders_assigned", table_name="work_orders")
    op.execute("DROP INDEX IF EXISTS idx_bom_items_master_bom_part")
    op.drop_index("idx_po_headers_vendor_status", table_name="po_headers")
    op.drop_index("idx_po_headers_created", table_name="po_headers")
