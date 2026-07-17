"""Phase 4 — Integration tables.

Revision ID: 003_phase4
Revises: 002_phase3
Create Date: 2026-06-06
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

from alembic import op

revision = "003_phase4"
down_revision = "002_phase3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 4.2 Webhook System
    op.create_table(
        "webhook_subscriptions",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("url", sa.String, nullable=False),
        sa.Column("events", sa.String, nullable=False),
        sa.Column("secret", sa.String),
        sa.Column("active", sa.Boolean, default=True),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "webhook_deliveries",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "subscriptionId",
            sa.Integer,
            sa.ForeignKey("webhook_subscriptions.id"),
            nullable=False,
        ),
        sa.Column("event", sa.String, nullable=False),
        sa.Column("payload", sa.Text),
        sa.Column("status", sa.String, default="pending"),
        sa.Column("statusCode", sa.Integer),
        sa.Column("responseText", sa.Text),
        sa.Column("retryCount", sa.Integer, default=0),
        sa.Column("nextRetryAt", sa.DateTime(timezone=True)),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )

    # 4.3 Bulk Import
    op.create_table(
        "bulk_import_jobs",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("filename", sa.String, nullable=False),
        sa.Column("status", sa.String, default="pending"),
        sa.Column("totalRows", sa.Integer, default=0),
        sa.Column("processedRows", sa.Integer, default=0),
        sa.Column("errorRows", sa.Integer, default=0),
        sa.Column("mappingConfig", JSON, default={}),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("completedAt", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "bulk_import_rows",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "jobId", sa.Integer, sa.ForeignKey("bulk_import_jobs.id"), nullable=False
        ),
        sa.Column("rowData", JSON, default={}),
        sa.Column("status", sa.String, default="pending"),
        sa.Column("errors", sa.Text),
    )

    # 4.4 ERP Connector
    op.create_table(
        "erp_connectors",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("type", sa.String, nullable=False),
        sa.Column("baseUrl", sa.String),
        sa.Column("apiKey", sa.String),
        sa.Column("active", sa.Boolean, default=True),
        sa.Column("lastSyncAt", sa.DateTime(timezone=True)),
        sa.Column("config", JSON, default={}),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "erp_sync_logs",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "connectorId",
            sa.Integer,
            sa.ForeignKey("erp_connectors.id"),
            nullable=False,
        ),
        sa.Column("direction", sa.String, nullable=False),
        sa.Column("entityType", sa.String, nullable=False),
        sa.Column("recordsCount", sa.Integer, default=0),
        sa.Column("status", sa.String, default="pending"),
        sa.Column("errors", sa.Text),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )

    # 4.5 Supplier Portal
    op.create_table(
        "supplier_users",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("vendorId", sa.Integer, sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("email", sa.String, unique=True, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("passwordHash", sa.String, nullable=False),
        sa.Column("active", sa.Boolean, default=True),
        sa.Column("lastLoginAt", sa.DateTime(timezone=True)),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )

    op.create_table(
        "supplier_price_updates",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "supplierUserId",
            sa.Integer,
            sa.ForeignKey("supplier_users.id"),
            nullable=False,
        ),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("oldPrice", sa.Float, default=0.0),
        sa.Column("newPrice", sa.Float, default=0.0),
        sa.Column("status", sa.String, default="pending"),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("reviewedAt", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("supplier_price_updates")
    op.drop_table("supplier_users")
    op.drop_table("erp_sync_logs")
    op.drop_table("erp_connectors")
    op.drop_table("bulk_import_rows")
    op.drop_table("bulk_import_jobs")
    op.drop_table("webhook_deliveries")
    op.drop_table("webhook_subscriptions")
