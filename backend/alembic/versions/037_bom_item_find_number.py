"""Add find_number to bom_items_master (X1 canonical-BOM instance-line CRUD)

The instance-line CRUD (X1) needs to persist a find/balloon number per line
(the identifier used on assembly drawings), distinct from `sort_order`
(display ordering, which changes on reorder) and `reference_designator`
(e.g. R1/C5). `bom_items_master` had no column for it. Nullable, additive,
no backfill required — no instance-line data exists yet to migrate.

Revision ID: 037_bom_item_find_number
Revises: 036_role_permission_tenant_scoped
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "037_bom_item_find_number"
down_revision: str | None = "036_role_permission_tenant_scoped"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("bom_items_master", sa.Column("find_number", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("bom_items_master", "find_number")
