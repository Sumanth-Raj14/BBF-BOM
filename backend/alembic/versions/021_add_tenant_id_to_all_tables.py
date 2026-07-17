"""add tenant_id column to all tenant-aware tables

Revision ID: 021
Revises: 020
Create Date: 2026-06-16 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "021"
down_revision: str | None = "020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLES = [
    "parts",
    "boms",
    "bom_items_master",
    "serial_numbers",
    "lot_batches",
    "contracts",
    "pricing_agreements",
    "bulk_import_jobs",
    "bulk_import_rows",
    "supplier_users",
    "supplier_price_updates",
    "bom_snapshots",
    "bom_baselines",
    "bom_variants",
    "bom_variant_items",
    "digital_signatures",
    "user_mfa",
    "labor_rates",
    "timesheet_entries",
    "part_lifecycles",
    "lifecycle_definitions",
    "service_bom_headers",
    "service_bom_items",
    "po_headers",
    "po_line_items",
    "part_country_history",
    "part_vendor_prices",
    "webhook_subscriptions",
    "webhook_deliveries",
    "erp_connectors",
    "erp_sync_logs",
    "order_tracking",
    "tracking_milestones",
    "shipment_updates",
    "work_centers",
    "resource_schedules",
    "capacity_reports",
    "mbom_headers",
    "mbom_items",
    "mbom_operations",
    "work_orders",
    "work_order_operations",
    "work_order_materials",
    "user_data_store",
    "user_preferences",
    "user_checklist_progress",
    "bom_drafts",
    "scan_history",
    "saved_searches",
    "currencies",
    "exchange_rates",
    "compliance_certificates",
    "auto_number_schemes",
    "custom_attribute_definitions",
    "warehouses",
    "bin_locations",
    "inventory",
    "inventory_transactions",
    "inventory_reservations",
    "demand_forecasts",
    "interchangeability_suggestions",
    "validation_results",
    "approval_automation_rules",
    "inspection_plans",
    "inspection_records",
    "ncr_reports",
    "capa_actions",
    "routing_tables",
    "routing_operations",
    "process_plans",
    "process_plan_steps",
    "eco_headers",
    "eco_items",
    "eco_approvals",
    "eco_notifications",
    "revisions",
    "price_history",
    "comments",
    "notifications",
    "approvals",
    "purchase_orders",
    "api_keys",
    "notifications_queue",
    "vendors",
    "projects",
    "compliance",
    "tags",
    "part_vendors",
    "user_sessions",
    "bom_templates",
    "make_vs_buy_analyses",
    "should_cost_models",
    "supplier_scorecards",
    "capas",
    "fai_reports",
    "deviations",
    "kanban_triggers",
    "bom_items",
    "permissions",
    "audit_logs",
    "documents",
    "backup_history",
]


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("tenantId", sa.Integer(), nullable=True))
        op.create_index(op.f(f"ix_{table}_tenantId"), table, ["tenantId"])
        op.create_foreign_key(
            f"fk_{table}_tenantId_tenants",
            table,
            "tenants",
            ["tenantId"],
            ["id"],
        )


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_constraint(f"fk_{table}_tenantId_tenants", table, type_="foreignkey")
        op.drop_index(op.f(f"ix_{table}_tenantId"), table_name=table)
        op.drop_column(table, "tenantId")
