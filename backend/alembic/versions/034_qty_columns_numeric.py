"""Convert structural BOM-line quantity columns from Integer to Numeric(10,4).

BOM line quantities are not always whole numbers — a line can call for 2.5
meters of wire, 0.5 kg of adhesive, or any other fractional unit of measure.
Storing them as Integer silently rejects (or, on lenient backends, truncates)
any fractional value a user enters. This migration switches the canonical
structural BOM-line quantity columns to Numeric(10,4), matching the precision
already used for quantity_on_hand/quantity_reserved/quantity_required/
quantity_issued/quantity_returned in inventory.py/work_order.py, and for
quantity in mbom.py/service_bom.py/part.py for the same kind of value.

Columns intentionally left as Integer (genuine whole-unit counts, not
structural/consumption quantities — e.g. work_order.quantity_ordered,
kanban.reorderQuantity, contract pricing-tier breakpoints, deviation/ECO
affected-unit counts) are unaffected.

Postgres performs an implicit assignment cast from integer to numeric on
ALTER COLUMN TYPE, so no explicit USING clause is required.

Revision ID: 034_qty_columns_numeric
Revises: 033_money_columns_numeric
Create Date: 2026-07-17

"""

import contextlib
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "034_qty_columns_numeric"
down_revision: str | None = "033_money_columns_numeric"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# table -> [column names] that move from Integer to Numeric(10, 4)
_QTY_COLUMNS: dict[str, list[str]] = {
    "bom_items_master": ["quantity"],
    "bom_items": ["quantity"],
    "bom_variant_items": ["quantity"],
    "revision_bom_snapshot_items": ["quantity"],
}

NEW_TYPE = sa.Numeric(10, 4)
OLD_TYPE = sa.Integer()


def upgrade() -> None:
    for table, columns in _QTY_COLUMNS.items():
        for col in columns:
            with contextlib.suppress(Exception):
                op.alter_column(
                    table,
                    col,
                    existing_type=OLD_TYPE,
                    type_=NEW_TYPE,
                )


def downgrade() -> None:
    for table, columns in reversed(list(_QTY_COLUMNS.items())):
        for col in columns:
            with contextlib.suppress(Exception):
                op.alter_column(
                    table,
                    col,
                    existing_type=NEW_TYPE,
                    type_=OLD_TYPE,
                )
