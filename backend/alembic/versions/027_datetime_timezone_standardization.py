"""Standardize all DateTime columns to use timezone=True.

Converts bare `DateTime` (no timezone) columns to `DateTime(timezone=True)`
(timestamptz) across all tables. The application layer already writes
timezone-aware UTC datetimes; this aligns the storage layer.

Affected tables: eco_*, inventory_*, warehouses, bin_locations,
enterprise_extensions_*, quality_*, ncr_reports, capa_actions,
work_centers, resource_schedules, capacity_reports, work_orders,
work_order_operations, work_order_materials, routing_*, process_plans,
digital_signatures, user_mfa, mbom_*, labor_rates, timesheet_entries,
part_lifecycles, lifecycle_definitions, bom_snapshots, bom_baselines,
bom_variants, bom_variant_items, notifications_queue, service_bom_*,
tenants, part_country_history, part_vendor_prices

Revision ID: 027_datetime_timezone_standardization
Revises: 026_tenant_id_not_null
Create Date: 2026-06-22
"""

import contextlib

import sqlalchemy as sa

from alembic import op

revision = "027_datetime_timezone_standardization"
down_revision = "026_tenant_id_not_null"
branch_labels = None
depends_on = None

_TABLES = {
    "eco_headers": [
        "created_at",
        "updated_at",
        "requested_at",
        "approved_at",
        "implemented_at",
        "effective_date",
        "target_completion_date",
    ],
    "eco_items": ["created_at", "updated_at"],
    "eco_item_attribute_changes": ["created_at"],
    "eco_approvals": ["created_at", "signed_at"],
    "eco_notifications": ["created_at", "read_at"],
    "warehouses": ["created_at", "updated_at"],
    "bin_locations": ["created_at", "updated_at"],
    "inventory": ["created_at", "updated_at", "last_counted_at"],
    "inventory_transactions": ["created_at", "transaction_date"],
    "inventory_reservations": ["created_at", "reserved_until", "fulfilled_at"],
    "currencies": ["created_at", "updated_at"],
    "exchange_rates": ["created_at", "effective_date"],
    "compliance_certificates": ["created_at", "certification_date", "expiry_date", "updated_at"],
    "auto_number_schemes": ["created_at", "updated_at"],
    "custom_attribute_definitions": ["created_at", "updated_at"],
    "custom_attribute_options": ["created_at"],
    "custom_attribute_validation_rules": ["created_at"],
    "inspection_plans": ["created_at", "updated_at"],
    "inspection_records": ["created_at", "inspection_date", "updated_at"],
    "ncr_reports": ["created_at", "updated_at", "date_raised", "date_closed"],
    "capa_actions": ["created_at", "updated_at", "target_date", "closed_date"],
    "work_centers": ["created_at", "updated_at"],
    "resource_schedules": ["created_at", "updated_at", "start_time", "end_time"],
    "capacity_reports": ["created_at", "report_date"],
    "work_orders": [
        "created_at",
        "updated_at",
        "start_date",
        "due_date",
        "completed_at",
        "released_at",
    ],
    "work_order_operations": ["created_at", "updated_at", "start_time", "end_time"],
    "work_order_materials": ["created_at"],
    "routing_tables": ["created_at", "updated_at"],
    "routing_operations": ["created_at", "updated_at"],
    "process_plans": ["created_at", "updated_at"],
    "process_plan_steps": ["created_at"],
    "digital_signatures": ["created_at", "signed_at"],
    "user_mfa": ["created_at", "last_verified_at"],
    "mbom_headers": ["created_at", "updated_at"],
    "mbom_items": ["created_at"],
    "mbom_operations": ["created_at"],
    "labor_rates": ["created_at", "effective_date", "updated_at"],
    "timesheet_entries": ["created_at", "date", "clock_in", "clock_out", "updated_at"],
    "part_lifecycles": ["created_at", "changed_at"],
    "lifecycle_definitions": ["created_at"],
    "bom_snapshots": ["created_at", "snapshot_date"],
    "bom_baselines": ["created_at", "baseline_date"],
    "bom_variants": ["created_at", "updated_at"],
    "bom_variant_items": ["created_at"],
    "notifications_queue": ["created_at", "sent_at", "read_at"],
    "service_bom_headers": ["created_at", "updated_at"],
    "service_bom_items": ["created_at"],
    "tenants": ["created_at", "updated_at"],
    "part_country_history": ["created_at", "changed_at", "effective_date"],
    "part_vendor_prices": ["created_at", "effective_date", "updated_at"],
}


def upgrade() -> None:
    for table, columns in _TABLES.items():
        for col in columns:
            with contextlib.suppress(Exception):
                op.alter_column(
                    table,
                    col,
                    existing_type=sa.DateTime(),
                    type_=sa.DateTime(timezone=True),
                    postgresql_using=f'"{col}"::timestamptz',
                )


def downgrade() -> None:
    for table, columns in reversed(list(_TABLES.items())):
        for col in columns:
            with contextlib.suppress(Exception):
                op.alter_column(
                    table,
                    col,
                    existing_type=sa.DateTime(timezone=True),
                    type_=sa.DateTime(),
                    postgresql_using=f'"{col}"::timestamp',
                )
