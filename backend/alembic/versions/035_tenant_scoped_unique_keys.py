"""Business unique keys -> composite (tenantId, key).

Business identifiers (part number, BOM number, PO number, ECO number, serial
numbers, etc.) were previously enforced as globally unique. That both leaks
the existence/volume of other tenants' data (a duplicate-key error tells you
someone, somewhere, already used that number) and blocks two independent
tenants from using the same natural numbering scheme, which is normal in the
real world. This migration converts each of these columns from a bare
`unique=True` to a composite UniqueConstraint("tenantId", <column>) — the
same key is now only required to be unique *within* a tenant.

Role.name and Permission.name are handled separately, in migration
036_role_permission_tenant_scoped, not here: both models already carry a
non-nullable tenantId (TenantAwareMixin), so leaving their bare global
unique=True in place was not a settled "shared catalog" design — it was the
same cross-tenant-coupling bug this migration fixes everywhere else, merely
deferred. See 036 for the fix and rationale.

User.email/username, UserSession.sessionToken, and TokenBlacklist.jti are
left alone here and remain so — those are authentication/security
identifiers, not business keys, and changing their uniqueness scope is an
auth-architecture decision outside this migration's remit.

Old unique constraints/indexes are located by introspection rather than by
guessing their historical name (several of these columns were originally
created by hand-written `op.create_table()` calls in earlier migrations
rather than autogenerate, so the live constraint name in Postgres does not
necessarily follow the app's declared naming convention).

Revision ID: 035_tenant_scoped_unique_keys
Revises: 034_qty_columns_numeric
Create Date: 2026-07-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "035_tenant_scoped_unique_keys"
down_revision: str | None = "034_qty_columns_numeric"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, column, new composite-unique-constraint name)
TENANT_SCOPED_KEYS: list[tuple[str, str, str]] = [
    ("parts", "pn", "uq_parts_tenant_pn"),
    ("parts", "barcode", "uq_parts_tenant_barcode"),
    ("boms", "bom_number", "uq_boms_tenant_bom_number"),
    ("eco_headers", "eco_number", "uq_eco_headers_tenant_eco_number"),
    ("capas", "capaNumber", "uq_capas_tenant_capaNumber"),
    ("deviations", "deviationNumber", "uq_deviations_tenant_deviationNumber"),
    ("fai_reports", "faiNumber", "uq_fai_reports_tenant_faiNumber"),
    ("contracts", "contractNumber", "uq_contracts_tenant_contractNumber"),
    ("mbom_headers", "mbom_number", "uq_mbom_headers_tenant_mbom_number"),
    ("purchase_orders", "poNumber", "uq_purchase_orders_tenant_poNumber"),
    ("po_headers", "poNumber", "uq_po_headers_tenant_poNumber"),
    ("warehouses", "warehouse_code", "uq_warehouses_tenant_warehouse_code"),
    (
        "inventory_transactions",
        "transaction_number",
        "uq_inventory_transactions_tenant_transaction_number",
    ),
    ("currencies", "code", "uq_currencies_tenant_code"),
    (
        "compliance_certificates",
        "certificate_number",
        "uq_compliance_certificates_tenant_certificate_number",
    ),
    ("lifecycle_definitions", "lifecycle_name", "uq_lifecycle_definitions_tenant_lifecycle_name"),
    ("projects", "code", "uq_projects_tenant_code"),
    ("work_centers", "code", "uq_work_centers_tenant_code"),
    ("inspection_records", "record_number", "uq_inspection_records_tenant_record_number"),
    ("ncr_reports", "ncr_number", "uq_ncr_reports_tenant_ncr_number"),
    ("capa_actions", "capa_number", "uq_capa_actions_tenant_capa_number"),
    ("routing_tables", "routing_number", "uq_routing_tables_tenant_routing_number"),
    ("process_plans", "plan_number", "uq_process_plans_tenant_plan_number"),
    ("service_bom_headers", "bom_number", "uq_service_bom_headers_tenant_bom_number"),
    ("rfq_headers", "rfq_number", "uq_rfq_headers_tenant_rfq_number"),
    ("supplier_users", "email", "uq_supplier_users_tenant_email"),
    ("serial_numbers", "serialNumber", "uq_serial_numbers_tenant_serialNumber"),
    ("lot_batches", "lotBatchNumber", "uq_lot_batches_tenant_lotBatchNumber"),
    ("work_orders", "wo_number", "uq_work_orders_tenant_wo_number"),
    ("compliance", "name", "uq_compliance_tenant_name"),
    ("tags", "name", "uq_tags_tenant_name"),
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
