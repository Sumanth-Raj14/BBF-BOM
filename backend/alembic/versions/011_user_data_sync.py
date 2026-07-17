"""User data sync tables — localStorage bridge to PostgreSQL.

Revision ID: 011_user_data_sync
Revises: 010_po_consolidation
Create Date: 2026-06-14
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "011_user_data_sync"
down_revision = "010_po_consolidation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_data_store",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("data_key", sa.String(100), nullable=False),
        sa.Column("data_value", JSONB, nullable=False, server_default="'{}'::jsonb"),
        sa.Column("data_version", sa.Integer, nullable=False, server_default="1"),
        sa.Column(
            "created_at", sa.DateTime, server_default=sa.func.current_timestamp()
        ),
        sa.Column(
            "updated_at", sa.DateTime, server_default=sa.func.current_timestamp()
        ),
        sa.UniqueConstraint("user_id", "data_key"),
    )
    op.create_index("idx_user_data_store_user", "user_data_store", ["user_id"])
    op.create_index("idx_user_data_store_key", "user_data_store", ["data_key"])

    op.create_table(
        "user_preferences",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("pref_key", sa.String(100), nullable=False),
        sa.Column("pref_value", sa.Text),
        sa.Column("pref_type", sa.String(20), server_default="string"),
        sa.Column(
            "created_at", sa.DateTime, server_default=sa.func.current_timestamp()
        ),
        sa.Column(
            "updated_at", sa.DateTime, server_default=sa.func.current_timestamp()
        ),
        sa.UniqueConstraint("user_id", "pref_key"),
    )
    op.create_index("idx_user_preferences_user", "user_preferences", ["user_id"])

    op.create_table(
        "user_checklist_progress",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "completed_items", JSONB, nullable=False, server_default="'[]'::jsonb"
        ),
        sa.Column("dismissed", sa.Boolean, server_default="false"),
        sa.Column(
            "created_at", sa.DateTime, server_default=sa.func.current_timestamp()
        ),
        sa.Column(
            "updated_at", sa.DateTime, server_default=sa.func.current_timestamp()
        ),
        sa.UniqueConstraint("user_id"),
    )

    op.create_table(
        "bom_drafts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id", sa.Integer, sa.ForeignKey("projects.id", ondelete="SET NULL")
        ),
        sa.Column("draft_name", sa.String(200), server_default="default"),
        sa.Column("rows_data", JSONB, nullable=False, server_default="'[]'::jsonb"),
        sa.Column("conversion_rate", sa.Integer, server_default="83"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column(
            "created_at", sa.DateTime, server_default=sa.func.current_timestamp()
        ),
        sa.Column(
            "updated_at", sa.DateTime, server_default=sa.func.current_timestamp()
        ),
        sa.UniqueConstraint("user_id", "draft_name"),
    )
    op.create_index("idx_bom_drafts_user", "bom_drafts", ["user_id"])
    op.create_index("idx_bom_drafts_project", "bom_drafts", ["project_id"])

    op.create_table(
        "scan_history",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("barcode_data", sa.Text, nullable=False),
        sa.Column("scan_result", JSONB),
        sa.Column(
            "scanned_at", sa.DateTime, server_default=sa.func.current_timestamp()
        ),
    )
    op.create_index(
        "idx_scan_history_user", "scan_history", ["user_id", sa.text("scanned_at DESC")]
    )

    op.create_table(
        "saved_searches",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("search_name", sa.String(200), nullable=False),
        sa.Column("search_params", JSONB, nullable=False, server_default="'{}'::jsonb"),
        sa.Column("is_default", sa.Boolean, server_default="false"),
        sa.Column(
            "created_at", sa.DateTime, server_default=sa.func.current_timestamp()
        ),
        sa.UniqueConstraint("user_id", "search_name"),
    )
    op.create_index("idx_saved_searches_user", "saved_searches", ["user_id"])


def downgrade() -> None:
    op.drop_table("saved_searches")
    op.drop_table("scan_history")
    op.drop_table("bom_drafts")
    op.drop_table("user_checklist_progress")
    op.drop_table("user_preferences")
    op.drop_table("user_data_store")
