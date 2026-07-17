"""Remove deprecated tags/compliance Text columns from parts table.

The parts table had both:
- tags (Text) / compliance (Text) — dead columns, never populated via API
- part_tags / part_compliance — proper many-to-many join tables (active)

This migration removes the dead Text columns.

Revision ID: 015_remove_part_dual_storage
Revises: 014_json_column_normalization
Create Date: 2026-06-16
"""

import sqlalchemy as sa

from alembic import op

revision = "015_remove_part_dual_storage"
down_revision = "014_json_column_normalization"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("parts", "tags")
    op.drop_column("parts", "compliance")


def downgrade() -> None:
    op.add_column("parts", sa.Column("tags", sa.Text(), nullable=True))
    op.add_column("parts", sa.Column("compliance", sa.Text(), nullable=True))
