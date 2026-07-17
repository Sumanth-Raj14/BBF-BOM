"""Role.name / Permission.name -> composite (tenantId, name).

Follow-up to 035_tenant_scoped_unique_keys, which left Role.name and
Permission.name alone under the rationale that RBAC roles/permissions are a
shared, tenant-agnostic catalog. That rationale was inaccurate: both models
already carry a non-nullable tenantId (TenantAwareMixin), and
`auth_service._get_or_create_admin_role`'s own docstring already called the
resulting behavior "a known deferred quirk" -- every self-registered
tenant's "admin" role collapsed onto the same physical row (found by name
alone, with no tenant filter), and once that row existed, any OTHER
tenant's self-signup racing to create its own "admin" row would hit the
same globally-unique name and fail. That is the exact cross-tenant-coupling
bug class 035 fixes everywhere else, merely deferred here.

This migration converts Role.name and Permission.name from a bare
`unique=True` to a composite UniqueConstraint("tenantId", name) -- same
shape as 035 -- so each tenant gets its own independent RBAC catalog, and
`_get_or_create_admin_role` (fixed alongside this migration) explicitly
scopes its lookup/creation by tenant_id.

Old unique constraints/indexes are located by introspection rather than by
guessing their historical name, same approach as 035.

Revision ID: 036_role_permission_tenant_scoped
Revises: 035_tenant_scoped_unique_keys
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "036_role_permission_tenant_scoped"
down_revision: str | None = "035_tenant_scoped_unique_keys"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TENANT_SCOPED_KEYS: list[tuple[str, str, str]] = [
    ("roles", "name", "uq_roles_tenant_name"),
    ("permissions", "name", "uq_permissions_tenant_name"),
]


def _drop_existing_single_column_unique(inspector, table: str, column: str) -> None:
    """Drop whatever unique constraint or unique index currently enforces
    global uniqueness on `column`, regardless of what it happens to be named."""
    for uq in inspector.get_unique_constraints(table):
        if uq.get("column_names") == [column] and uq.get("name"):
            op.drop_constraint(uq["name"], table, type_="unique")
    for ix in inspector.get_indexes(table):
        if ix.get("unique") and ix.get("column_names") == [column] and ix.get("name"):
            op.drop_index(ix["name"], table_name=table)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table, column, new_name in TENANT_SCOPED_KEYS:
        _drop_existing_single_column_unique(inspector, table, column)
        op.create_unique_constraint(new_name, table, ["tenantId", column])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table, column, new_name in reversed(TENANT_SCOPED_KEYS):
        for uq in inspector.get_unique_constraints(table):
            if uq.get("name") == new_name:
                op.drop_constraint(new_name, table, type_="unique")
                break
        op.create_unique_constraint(f"uq_{table}_{column}", table, [column])
