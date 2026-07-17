"""Backfill NULL tenantId values and add NOT NULL constraint.

Two models (User, AuditLog) override TenantAwareMixin with nullable=True.
This migration backfills existing NULL tenantId rows with a default tenant,
then sets the columns to NOT NULL.

Revision ID: 026_tenant_id_not_null
Revises: 025_materialized_views_and_indexes
Create Date: 2026-06-22
"""

import sqlalchemy as sa

from alembic import op

revision = "026_tenant_id_not_null"
down_revision = "025_materialized_views_and_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Backfill users.tenantId = 1 (default tenant) for any NULL rows
    op.execute("""
        UPDATE users
        SET "tenantId" = 1
        WHERE "tenantId" IS NULL
    """)
    # Set NOT NULL
    op.alter_column("users", "tenantId", existing_type=sa.Integer(), nullable=False)

    # Backfill audit_logs.tenantId = 1 for any NULL rows
    op.execute("""
        UPDATE audit_logs
        SET "tenantId" = 1
        WHERE "tenantId" IS NULL
    """)
    op.alter_column("audit_logs", "tenantId", existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    op.alter_column("audit_logs", "tenantId", existing_type=sa.Integer(), nullable=True)
    op.alter_column("users", "tenantId", existing_type=sa.Integer(), nullable=True)
