"""Convert monetary columns from Float (double precision) to Numeric(18,4).

Binary floats cannot represent decimal fractions like 0.1 exactly, so
repeated arithmetic on money (line-item extension, PO totals, should-cost
rollups, etc.) silently drifts by fractions of a cent. This migration
switches every cost/price/amount/total column to Numeric(18,4), matching
the precision already used by bom.py/inventory.py/revision.py/routing.py/
labor.py for the same kind of values. Non-monetary Float columns (scores,
ratings, weights, percentages, hours, days, grams) are intentionally left
as Float — see app/models for the corresponding SQLAlchemy model changes.

Postgres performs an implicit assignment cast from double precision to
numeric on ALTER COLUMN TYPE, so no explicit USING clause is required.

Revision ID: 033_money_columns_numeric
Revises: 032_work_order_status_check
Create Date: 2026-07-17

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "033_money_columns_numeric"
down_revision: str | None = "032_work_order_status_check"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# table -> [column names] that move from Float to Numeric(18, 4)
_MONEY_COLUMNS: dict[str, list[str]] = {
    "bom_items": ["unitCostSnapshot", "extendedCost"],
    "contracts": ["maximumOrderValue"],
    "contract_pricing_tiers": ["unit_price"],
    "pricing_agreements": ["agreedPrice"],
    "pricing_agreement_volume_tiers": ["unit_price"],
    "make_vs_buy_analyses": [
        "makeMaterialCost",
        "makeLaborCost",
        "makeOverheadCost",
        "makeToolingCost",
        "makeTotalCost",
        "buyUnitPrice",
        "buyNreCost",
        "buyTotalCost",
    ],
    "part_vendor_prices": ["price"],
    "purchase_orders": ["unitCost", "totalCost", "taxCost", "freightCost"],
    "part_vendors": ["vendorCost"],
    "po_headers": ["poTotal"],
    "po_line_items": ["itemPrice", "amount", "gst", "total"],
    "price_history": ["price"],
    "parts": ["cost", "freight", "tax", "landedCost"],
    "supplier_price_updates": ["oldPrice", "newPrice"],
    "rfq_line_items": ["target_price"],
    "rfq_supplier_responses": ["quoted_price"],
    "should_cost_models": [
        "rawMaterialCost",
        "materialTotal",
        "laborRatePerHour",
        "laborTotal",
        "overheadTotal",
        "toolingCost",
        "toolingPerUnit",
        "profitAmount",
        "shouldCostPerUnit",
        "actualVendorPrice",
    ],
}

NEW_TYPE = sa.Numeric(18, 4)
OLD_TYPE = sa.Float()


# Finding 2: contextlib.suppress(Exception) around each op.alter_column, all inside
# one Postgres transaction, meant the FIRST failing alter aborted the transaction
# (Postgres marks it "aborted" until ROLLBACK) and every alter after that was then
# silently swallowed too - the migration reported success while changing nothing
# past the first failure. Give each column its own SAVEPOINT so a failure on one
# column only rolls back that column's statement, not the whole migration.
def _alter_column_guarded(table: str, col: str, existing_type, type_) -> None:
    savepoint = f"sp_{table}_{col}"
    op.execute(f"SAVEPOINT {savepoint}")
    try:
        op.alter_column(table, col, existing_type=existing_type, type_=type_)
    except Exception:
        op.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
    else:
        op.execute(f"RELEASE SAVEPOINT {savepoint}")


def upgrade() -> None:
    for table, columns in _MONEY_COLUMNS.items():
        for col in columns:
            _alter_column_guarded(table, col, OLD_TYPE, NEW_TYPE)


def downgrade() -> None:
    for table, columns in reversed(list(_MONEY_COLUMNS.items())):
        for col in columns:
            _alter_column_guarded(table, col, NEW_TYPE, OLD_TYPE)
