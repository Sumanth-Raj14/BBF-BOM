"""Add on_hold/scrapped to work_orders status CHECK (R7 / D12)

perform_work_order_action() maps action='hold' -> status='on_hold' and
action='scrap' -> status='scrapped', but ck_work_orders_status only allowed
draft/released/in_progress/completed/closed/cancelled, so committing either
action raised an IntegrityError that surfaced as a raw 500. This migration
reconciles the CHECK constraint with the app's status vocabulary.

Revision ID: 032_work_order_status_check
Revises: 031_integration_tables
Create Date: 2026-07-17

"""
from alembic import op

revision = "032_work_order_status_check"
down_revision = "031_integration_tables"
branch_labels = None
depends_on = None

OLD_STATUSES = ("draft", "released", "in_progress", "completed", "closed", "cancelled")
NEW_STATUSES = OLD_STATUSES + ("on_hold", "scrapped")


def _check_sql(statuses):
    values = ", ".join(f"'{s}'" for s in statuses)
    return f"CHECK (status IN ({values}))"


def upgrade():
    op.execute("ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS ck_work_orders_status")
    op.execute(
        f"ALTER TABLE work_orders ADD CONSTRAINT ck_work_orders_status {_check_sql(NEW_STATUSES)}"
    )


def downgrade():
    op.execute("ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS ck_work_orders_status")
    op.execute(
        f"ALTER TABLE work_orders ADD CONSTRAINT ck_work_orders_status {_check_sql(OLD_STATUSES)}"
    )
