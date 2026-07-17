"""Phase 4.6 - Order Tracking tables

Revision ID: 004_order_tracking
Revises: 003_phase4
Create Date: 2026-06-06
"""

import sqlalchemy as sa

from alembic import op

revision = "004_order_tracking"
down_revision = "003_phase4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "order_tracking",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "poHeaderId",
            sa.Integer(),
            sa.ForeignKey("po_headers.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("currentStage", sa.String(), server_default="order_placed"),
        sa.Column("carrier", sa.String(), nullable=True),
        sa.Column("trackingNumber", sa.String(), nullable=True),
        sa.Column("trackingUrl", sa.String(), nullable=True),
        sa.Column("estimatedDelivery", sa.String(), nullable=True),
        sa.Column("actualDelivery", sa.String(), nullable=True),
        sa.Column("shippingAddress", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updatedAt", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "tracking_milestones",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "trackingId",
            sa.Integer(),
            sa.ForeignKey("order_tracking.id"),
            nullable=False,
        ),
        sa.Column("stage", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("completed", sa.Boolean(), server_default="false"),
        sa.Column("completedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sortOrder", sa.Integer(), server_default="0"),
        sa.Column("icon", sa.String(), nullable=True),
    )

    op.create_table(
        "shipment_updates",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "trackingId",
            sa.Integer(),
            sa.ForeignKey("order_tracking.id"),
            nullable=False,
        ),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("carrierCode", sa.String(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )


def downgrade() -> None:
    op.drop_table("shipment_updates")
    op.drop_table("tracking_milestones")
    op.drop_table("order_tracking")
