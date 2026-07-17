"""Phase 0.24 - Fix missing columns for enterprise screens

Revision ID: 008_enterprise_fixes
Revises: 005_007_placeholder
Create Date: 2026-06-07
"""


from alembic import op

revision = "008_enterprise_fixes"
down_revision = "005_007_placeholder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE service_bom_headers ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'maintenance'"
    )
    op.execute(
        "ALTER TABLE routing_tables ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'"
    )
    op.execute(
        "ALTER TABLE process_plans ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(10,2) DEFAULT 0"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE service_bom_headers DROP COLUMN IF EXISTS service_type")
    op.execute("ALTER TABLE routing_tables DROP COLUMN IF EXISTS status")
    op.execute("ALTER TABLE process_plans DROP COLUMN IF EXISTS estimated_hours")
