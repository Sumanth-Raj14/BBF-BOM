"""Create resource_grants — object-level permission grants (per-BOM ACL).

RBAC was purely role + resource-TYPE ("engineering may write parts"); no object
id ever entered a check, so "Alice may edit BOM 12 but not BOM 30" could not be
expressed. This is the grant side of that: (resourceType, resourceId) ->
(user|team, level). See app/core/object_perms.py for the enforcement, which
composes with app/core/rbac.py rather than replacing it.

An object with NO rows here is unrestricted — the role check alone governs, i.e.
exactly today's behaviour. So this migration is a pure addition: creating an
empty table changes nothing for any existing deployment.

Idempotent: skips if the table already exists (every create_all-bootstrapped
database will have it from the model).

Revision ID: 063_resource_grants
Revises: 062_bom_share_links
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "063_resource_grants"
down_revision: str | None = "062_bom_share_links"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if "resource_grants" in inspect(bind).get_table_names():
        return

    op.create_table(
        "resource_grants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("resourceType", sa.String(length=50), nullable=False),
        sa.Column("resourceId", sa.Integer(), nullable=False),
        # Polymorphic grantee: no FK, granteeId points at users.id OR teams.id.
        sa.Column("granteeType", sa.String(length=10), nullable=False),
        sa.Column("granteeId", sa.Integer(), nullable=False),
        sa.Column("level", sa.String(length=10), nullable=False),
        sa.Column("createdById", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True)),
        # TenantAwareMixin: FK tenants.id ondelete CASCADE, index, NOT NULL.
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "tenantId",
            "resourceType",
            "resourceId",
            "granteeType",
            "granteeId",
            name="uq_resource_grants_grantee",
        ),
        sa.CheckConstraint("level IN ('view', 'edit', 'manage')", name="ck_resource_grants_level"),
        sa.CheckConstraint(
            "\"granteeType\" IN ('user', 'team')", name="ck_resource_grants_grantee_type"
        ),
    )
    # index=True on the model columns produces these under create_all; a
    # migration has to state them.
    op.create_index("ix_resource_grants_createdById", "resource_grants", ["createdById"])
    op.create_index("ix_resource_grants_tenantId", "resource_grants", ["tenantId"])
    op.create_index(
        "idx_resource_grants_object",
        "resource_grants",
        ["tenantId", "resourceType", "resourceId"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    if "resource_grants" not in inspect(bind).get_table_names():
        return
    op.drop_index("idx_resource_grants_object", table_name="resource_grants")
    op.drop_index("ix_resource_grants_tenantId", table_name="resource_grants")
    op.drop_index("ix_resource_grants_createdById", table_name="resource_grants")
    op.drop_table("resource_grants")
