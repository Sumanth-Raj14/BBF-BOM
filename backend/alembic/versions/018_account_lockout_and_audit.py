"""add account lockout fields to users

Revision ID: 018
Revises: 017_remove_part_legacy_json_columns
Create Date: 2026-06-16 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "018"
down_revision: str | None = "017_remove_part_legacy_json_columns"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("failedLoginAttempts", sa.Integer(), server_default="0"))
    op.add_column("users", sa.Column("lockedUntil", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "lockedUntil")
    op.drop_column("users", "failedLoginAttempts")
