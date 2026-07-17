"""add password reset fields, sso_providers, and tenant_id to users

Revision ID: 020
Revises: 019
Create Date: 2026-06-16 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "020"
down_revision: str | None = "019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("resetToken", sa.String(), nullable=True))
    op.add_column(
        "users", sa.Column("resetTokenExpires", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("users", sa.Column("ssoProviders", postgresql.JSON(), nullable=True))
    op.add_column("users", sa.Column("tenantId", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_users_resetToken"), "users", ["resetToken"])
    op.create_index(op.f("ix_users_tenantId"), "users", ["tenantId"])
    op.create_foreign_key(
        "fk_users_tenantId_tenants",
        "users",
        "tenants",
        ["tenantId"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_tenantId_tenants", "users", type_="foreignkey")
    op.drop_index(op.f("ix_users_tenantId"), table_name="users")
    op.drop_index(op.f("ix_users_resetToken"), table_name="users")
    op.drop_column("users", "tenantId")
    op.drop_column("users", "ssoProviders")
    op.drop_column("users", "resetTokenExpires")
    op.drop_column("users", "resetToken")
