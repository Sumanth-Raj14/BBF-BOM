"""Initial migration - create all tables.

Revision ID: 001_initial
Revises:
Create Date: 2026-06-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

from alembic import op

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("email", sa.String, unique=True, index=True, nullable=False),
        sa.Column("username", sa.String, unique=True, index=True, nullable=False),
        sa.Column("fullName", sa.String),
        sa.Column("avatarUrl", sa.String),
        sa.Column("hashedPassword", sa.String, nullable=False),
        sa.Column("isActive", sa.Boolean, default=True),
        sa.Column("isSuperuser", sa.Boolean, default=False),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "parts",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("pn", sa.String, unique=True, index=True, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("rev", sa.String, default="A"),
        sa.Column("qty", sa.Integer, default=1),
        sa.Column("uom", sa.String, default="EA"),
        sa.Column("category", sa.String, index=True),
        sa.Column("subCategory", sa.String),
        sa.Column("mpn", sa.String, index=True),
        sa.Column("htsCode", sa.String),
        sa.Column("unspscCode", sa.String),
        sa.Column("eccn", sa.String),
        sa.Column("vendor", sa.String, index=True),
        sa.Column("manufacturer", sa.String, index=True),
        sa.Column("cost", sa.Float, default=0.0),
        sa.Column("lead", sa.Integer, default=0),
        sa.Column("origin", sa.String),
        sa.Column("status", sa.String, default="Released"),
        sa.Column("assembly", sa.Boolean, default=False),
        sa.Column("barcode", sa.String, unique=True, index=True),
        sa.Column("material", sa.String),
        sa.Column("weight", sa.Float),
        sa.Column("dimensions", sa.String),
        sa.Column("imageUrl", sa.String),
        sa.Column("customFields", JSON, default={}),
        sa.Column("tags", sa.Text),
        sa.Column("compliance", sa.Text),
        sa.Column("freight", sa.Float, default=0.0),
        sa.Column("tax", sa.Float, default=0.0),
        sa.Column("landedCost", sa.Float, default=0.0),
        sa.Column("countryHistory", JSON, default=[]),
        sa.Column("vendorPrices", JSON, default=[]),
        sa.Column("cadUrl", sa.String),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("code", sa.String, unique=True, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("status", sa.String, default="active"),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "vendors",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("country", sa.String),
        sa.Column("leadTime", sa.Integer),
        sa.Column("moq", sa.Integer),
        sa.Column("terms", sa.String),
        sa.Column("reliabilityRating", sa.Float),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("filename", sa.String, nullable=False),
        sa.Column("originalName", sa.String, nullable=False),
        sa.Column("fileType", sa.String),
        sa.Column("fileSize", sa.Integer),
        sa.Column("filePath", sa.String),
        sa.Column("url", sa.String),
        sa.Column("category", sa.String),
        sa.Column("tags", sa.Text),
        sa.Column("partId", sa.Integer),
        sa.Column("projectId", sa.Integer),
        sa.Column("version", sa.Integer, default=1),
        sa.Column("isLatest", sa.Boolean, default=True),
        sa.Column("accessLevel", sa.String, default="private"),
        sa.Column("uploadedBy", sa.String),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("action", sa.String, nullable=False),
        sa.Column("entityType", sa.String),
        sa.Column("entityId", sa.Integer),
        sa.Column("entityName", sa.String),
        sa.Column("changes", JSON),
        sa.Column("userId", sa.Integer),
        sa.Column("ipAddress", sa.String),
        sa.Column("userAgent", sa.String),
        sa.Column("requestId", sa.String),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )

    op.create_table(
        "bom_templates",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("name", sa.String, nullable=False, index=True),
        sa.Column("description", sa.Text),
        sa.Column("bomData", JSON),
        sa.Column("partCount", sa.Integer, default=0),
        sa.Column("projectCode", sa.String),
        sa.Column("createdById", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "bom_items",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "bomTemplateId",
            sa.Integer,
            sa.ForeignKey("bom_templates.id"),
            nullable=False,
        ),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("quantity", sa.Integer, default=1),
        sa.Column("referenceDesignator", sa.String),
        sa.Column("notes", sa.Text),
        sa.Column("sortOrder", sa.Integer, default=0),
        sa.Column("parentItemId", sa.Integer, sa.ForeignKey("bom_items.id")),
        sa.Column("unitCostSnapshot", sa.Float),
        sa.Column("extendedCost", sa.Float),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )

    op.execute("""
        CREATE TYPE po_status AS ENUM (
            'Not Ordered', 'RFQ Sent', 'Under Review', 'Ordered',
            'In Transit', 'Received', 'Quality Check', 'Approved',
            'Rejected', 'Closed'
        )
    """)

    op.create_table(
        "purchase_orders",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("poNumber", sa.String, unique=True, index=True, nullable=False),
        sa.Column("partId", sa.Integer, sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("vendorId", sa.Integer, sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("qty", sa.Integer, nullable=False),
        sa.Column("eta", sa.String),
        sa.Column("status", sa.String, default="Not Ordered"),
        sa.Column("unitCost", sa.Float),
        sa.Column("totalCost", sa.Float),
        sa.Column("taxCost", sa.Float),
        sa.Column("freightCost", sa.Float),
        sa.Column("poReference", sa.String),
        sa.Column("invoiceReference", sa.String),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted';
        END;
        $$ LANGUAGE plpgsql
    """)

    op.execute("""
        CREATE TRIGGER audit_log_immutable
            BEFORE UPDATE OR DELETE ON audit_logs
            FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_log_immutable ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_log_modification")
    op.drop_table("purchase_orders")
    op.execute("DROP TYPE IF EXISTS po_status")
    op.drop_table("bom_items")
    op.drop_table("bom_templates")
    op.drop_table("audit_logs")
    op.drop_table("documents")
    op.drop_table("vendors")
    op.drop_table("projects")
    op.drop_table("parts")
    op.drop_table("users")
