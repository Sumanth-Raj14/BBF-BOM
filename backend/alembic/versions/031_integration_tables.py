"""WS3: integration connections, outbox, external links

Revision ID: 031_integration_tables
Revises: 030_teams_and_work_assignment
Create Date: 2026-07-11

"""
import sqlalchemy as sa
from alembic import op

revision = "031_integration_tables"
down_revision = "030_teams_and_work_assignment"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "integration_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("auth", sa.Text()),
        sa.Column("config", sa.JSON()),
        sa.Column("is_enabled", sa.Boolean(), server_default=sa.false()),
        sa.Column("status", sa.String(20), server_default="unconfigured"),
        sa.Column("last_error", sa.Text()),
        sa.Column("last_checked_at", sa.DateTime(timezone=True)),
        sa.Column("tenantId", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("tenantId", "provider", name="uq_integration_conn_tenant_provider"),
    )
    op.create_index("ix_integration_connections_tenantId", "integration_connections", ["tenantId"])

    op.create_table(
        "integration_outbox",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("payload", sa.JSON()),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("attempts", sa.Integer(), server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text()),
        sa.Column("tenantId", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_integration_outbox_provider", "integration_outbox", ["provider"])
    op.create_index("ix_integration_outbox_status", "integration_outbox", ["status"])
    op.create_index("idx_outbox_status_next", "integration_outbox", ["status", "next_attempt_at"])
    op.create_index("ix_integration_outbox_tenantId", "integration_outbox", ["tenantId"])

    op.create_table(
        "integration_external_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=False),
        sa.Column("external_url", sa.String(500)),
        sa.Column("tenantId", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("tenantId", "provider", "entity_type", "entity_id", name="uq_extlink_entity"),
    )
    op.create_index("ix_integration_external_links_tenantId", "integration_external_links", ["tenantId"])


def downgrade():
    op.drop_table("integration_external_links")
    op.drop_table("integration_outbox")
    op.drop_table("integration_connections")
