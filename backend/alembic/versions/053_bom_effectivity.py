"""BOM line effectivity — date range, serial range, or lot.

Adds five nullable columns to `bom_items` (the reusable BOM *template*
line table backing app/models/bom_item.py + app/api/endpoints/bom_items.py):

    effectiveFrom / effectiveTo        - date-range effectivity
    effectiveSerialFrom / effectiveSerialTo - serial-range effectivity
    effectiveLot                       - lot-based effectivity (comma list)

All columns are nullable and additive — every existing line has all five
null, which app.services.bom_effectivity_service treats as "always
effective", so no backfill is needed and no existing line changes meaning.

A line uses at most one axis (date OR serial OR lot); that exclusivity and
the from<=to ordering are enforced in the service layer at write time, not
via DB constraints, because the check spans five nullable columns and differs
by axis (date compare vs. numeric-aware serial compare vs. set membership) —
a CHECK constraint expressing that is more contortion than the one lightweight
Python guard on the write path.

Revision ID: 053_bom_effectivity
Revises: 052_bom_types
Create Date: 2026-08-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "053_bom_effectivity"
down_revision: str | None = "052_bom_types"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("bom_items", sa.Column("effectiveFrom", sa.Date(), nullable=True))
    op.add_column("bom_items", sa.Column("effectiveTo", sa.Date(), nullable=True))
    op.add_column("bom_items", sa.Column("effectiveSerialFrom", sa.String(), nullable=True))
    op.add_column("bom_items", sa.Column("effectiveSerialTo", sa.String(), nullable=True))
    op.add_column("bom_items", sa.Column("effectiveLot", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("bom_items", "effectiveLot")
    op.drop_column("bom_items", "effectiveSerialTo")
    op.drop_column("bom_items", "effectiveSerialFrom")
    op.drop_column("bom_items", "effectiveTo")
    op.drop_column("bom_items", "effectiveFrom")
