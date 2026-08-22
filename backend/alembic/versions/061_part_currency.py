"""Add parts."currency" and part_vendors."vendorCurrency".

A buyer sourcing internationally holds prices in the source's money. Before
this, every cost column in the system was an unlabelled number that the
roll-up implicitly assumed was all the same currency.

server_default "USD" (matching the pre-existing part_vendor_prices.currency
and price_history.currency convention): ADD COLUMN ... DEFAULT backfills
existing rows on both Postgres 11+ and SQLite, so nothing pre-existing
becomes NULL/ambiguous and single-currency shops see no behaviour change.

Idempotent — see 058/060: create_all-bootstrapped databases already have
these columns from the models, so re-adding would fail.

Revision ID: 061_part_currency
Revises: 060_part_vendor_avl_rank
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = "061_part_currency"
down_revision: str | None = "060_part_vendor_avl_rank"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = (("parts", "currency"), ("part_vendors", "vendorCurrency"))


def _has_column(bind, table: str, column: str) -> bool:
    insp = inspect(bind)
    if table not in insp.get_table_names():
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    for table, column in _COLUMNS:
        if _has_column(bind, table, column):
            continue
        op.add_column(table, sa.Column(column, sa.String(3), server_default="USD"))


def downgrade() -> None:
    bind = op.get_bind()
    for table, column in _COLUMNS:
        if _has_column(bind, table, column):
            op.drop_column(table, column)
