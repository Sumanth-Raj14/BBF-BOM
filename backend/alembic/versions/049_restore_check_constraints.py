"""Restore the CHECK constraints that migrated databases never got (#6).

The models declare 85 CHECK constraints. A greenfield install materialises all
of them via Base.metadata.create_all(); a database that reached its schema
through the Alembic chain had only 3. So one codebase produced two different
schemas, and an upgraded database silently accepted data a fresh one rejects —
found when a seed fixture using category='Fabricated' passed locally and failed
CI's clean bootstrap.

Audited with scripts/audit_check_constraints.py before writing this: of the 82
missing on the reference database, 81 had zero violating rows and 1 did
(projects.status holds legacy lowercase 'active', which is not in the allowed
set).

Every constraint is added NOT VALID. That is deliberate:
  * it enforces the rule on all INSERTs and UPDATEs from now on;
  * it does NOT scan existing rows, so this migration cannot abort on a
    database that already holds non-conforming data — which is exactly the
    situation these constraints were missing from.
Run scripts/audit_check_constraints.py, clean what it reports, then
ALTER TABLE ... VALIDATE CONSTRAINT to close the gap on historical rows.

Revision ID: 049_restore_check_constraints
Revises: 048_index_foreign_keys
"""

from alembic import op
from sqlalchemy import inspect

revision = "049_restore_check_constraints"
down_revision = "048_index_foreign_keys"
branch_labels = None
depends_on = None

# (table, constraint name, predicate) — mirrors the models exactly, so a
# migrated schema and a fresh create_all() one agree.
CHECKS = [
    ('backup_history', 'ck_backup_history_ck_backup_history_backup_type', r"""backup_type IN ('full', 'incremental', 'differential', 'schema_only', 'physical', 'table')"""),
    ('backup_history', 'ck_backup_history_ck_backup_history_storage_type', r"""storage_type IN ('local', 's3', 'azure_blob', 'gcs', 'other')"""),
    ('backup_history', 'ck_backup_history_ck_backup_history_verification_status', r"""verification_status IN ('passed', 'verified', 'failed', 'pending', 'skipped')"""),
    ('backup_history', 'ck_backup_history_ck_backup_history_status', r"""status IN ('running', 'completed', 'failed', 'partial', 'verified')"""),
    ('bom_snapshots', 'ck_bom_snapshots_ck_bom_snapshots_snapshot_type', r"""snapshot_type IN ('baseline', 'release', 'archive')"""),
    ('bom_variants', 'ck_bom_variants_ck_bom_variants_status', r"""status IN ('active', 'inactive', 'draft')"""),
    ('boms', 'ck_boms_ck_boms_status', r"""status IN ('draft', 'active', 'archived')"""),
    ('bulk_import_jobs', 'ck_bulk_import_jobs_ck_bulk_import_jobs_status', r"""status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'uploaded')"""),
    ('bulk_import_rows', 'ck_bulk_import_rows_ck_bulk_import_rows_status', r"""status IN ('pending', 'processed', 'error', 'skipped')"""),
    ('capa_actions', 'ck_capa_actions_ck_capa_actions_status', r"""status IN ('open', 'in_progress', 'pending_verification', 'closed')"""),
    ('capa_actions', 'ck_capa_actions_ck_capa_actions_action_type', r"""action_type IN ('corrective', 'preventive')"""),
    ('capas', 'ck_capas_ck_capas_type', r"""type IN ('Corrective', 'Preventive')"""),
    ('capas', 'ck_capas_ck_capas_verification_result', r""""verificationResult" IN ('Effective', 'Not Effective', 'Pending')"""),
    ('capas', 'ck_capas_ck_capas_status', r"""status IN ('Open', 'In Progress', 'Pending Verification', 'Closed', 'Overdue')"""),
    ('capas', 'ck_capas_ck_capas_source', r"""source IN ('Internal Audit', 'Customer Complaint', 'NCR', 'Supplier', 'Other')"""),
    ('compliance_certificates', 'ck_compliance_certificates_ck_compliance_certificates_status', r"""status IN ('active', 'expired', 'revoked')"""),
    ('contracts', 'ck_contracts_ck_contracts_status', r"""status IN ('Draft', 'Active', 'Suspended', 'Expired', 'Terminated')"""),
    ('contracts', 'ck_contracts_ck_contracts_contract_type', r""""contractType" IN ('blanket_po', 'volume_discount', 'annual', 'fixed_price', 'other')"""),
    ('deviations', 'ck_deviations_ck_deviations_type', r"""type IN ('Deviation', 'Waiver', 'Concession')"""),
    ('deviations', 'ck_deviations_ck_deviations_status', r"""status IN ('Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Expired')"""),
    ('deviations', 'ck_deviations_ck_deviations_request_type', r""""requestType" IN ('One-time', 'Permanent', 'Temporary')"""),
    ('deviations', 'ck_deviations_ck_deviations_risk_level', r""""riskLevel" IN ('Low', 'Medium', 'High', 'Critical')"""),
    ('deviations', 'ck_deviations_ck_deviations_disposition', r"""disposition IN ('Use As Is', 'Rework', 'Scrap', 'Return to Vendor')"""),
    ('digital_signatures', 'ck_digital_signatures_ck_digital_signatures_document_type', r"""document_type IN ('eco', 'ncr', 'capa', 'contract', 'quality_report', 'fai', 'deviation', 'audit_report')"""),
    ('digital_signatures', 'ck_digital_signatures_ck_digital_signatures_signature_type', r"""signature_type IN ('electronic', 'digital', 'biometric', 'typed')"""),
    ('documents', 'ck_documents_ck_documents_access_level', r""""accessLevel" IN ('public', 'private', 'restricted')"""),
    ('documents', 'ck_documents_ck_documents_storage_type', r"""storage_type IN ('s3', 'local', 'azure_blob', 'gcs', 'other')"""),
    ('eco_approvals', 'ck_eco_approvals_ck_eco_approvals_status', r"""status IN ('pending', 'approved', 'rejected')"""),
    ('eco_headers', 'ck_eco_headers_ck_eco_headers_status', r"""status IN ('draft', 'review', 'approved', 'implemented', 'closed', 'cancelled')"""),
    ('eco_headers', 'ck_eco_headers_ck_eco_headers_priority', r"""priority IN ('low', 'medium', 'high', 'critical')"""),
    ('eco_headers', 'ck_eco_headers_ck_eco_headers_change_type', r"""change_type IN ('design', 'process', 'supplier', 'quality', 'other')"""),
    ('eco_headers', 'ck_eco_headers_ck_eco_headers_impact_level', r"""impact_level IN ('minor', 'major', 'critical')"""),
    ('eco_items', 'ck_eco_items_ck_eco_items_change_type', r"""change_type IN ('add', 'delete', 'modify', 'replace')"""),
    ('erp_connectors', 'ck_erp_connectors_ck_erp_connectors_type', r"""type IN ('SAP', 'Oracle', 'Microsoft Dynamics', 'NetSuite', 'Odoo', 'Custom', 'Other')"""),
    ('erp_sync_logs', 'ck_erp_sync_logs_ck_erp_sync_logs_status', r"""status IN ('pending', 'running', 'completed', 'failed', 'cancelled')"""),
    ('erp_sync_logs', 'ck_erp_sync_logs_ck_erp_sync_logs_direction', r"""direction IN ('import', 'export', 'sync')"""),
    ('fai_characteristics', 'ck_fai_characteristics_ck_fai_characteristics_result', r"""result IN ('pass', 'fail', 'conditional', 'na')"""),
    ('fai_characteristics', 'ck_fai_characteristics_ck_fai_characteristics_status', r"""status IN ('pending', 'pass', 'fail')"""),
    ('fai_reports', 'ck_fai_reports_ck_fai_reports_status', r"""status IN ('Draft', 'In Progress', 'Pending Approval', 'Approved', 'Rejected')"""),
    ('fai_reports', 'ck_fai_reports_ck_fai_reports_result', r"""result IN ('Pass', 'Fail', 'Conditional')"""),
    ('inspection_plans', 'ck_inspection_plans_ck_inspection_plans_status', r"""status IN ('active', 'inactive', 'draft')"""),
    ('inspection_records', 'ck_inspection_records_ck_inspection_records_result', r"""result IN ('pass', 'fail', 'conditional', 'pending')"""),
    ('interchangeability_suggestions', 'ck_interchangeability_suggestions_ck_interchangeability_suggestions_status', r"""status IN ('pending', 'approved', 'rejected', 'reviewed')"""),
    ('inventory', 'ck_inventory_ck_inventory_status', r"""status IN ('available', 'reserved', 'quarantined', 'damaged', 'consumed')"""),
    ('inventory_transactions', 'ck_inventory_transactions_ck_inv_txn_reference_type', r"""reference_type IN ('po', 'work_order', 'transfer', 'adjustment', 'sales_order', 'return')"""),
    ('inventory_transactions', 'ck_inventory_transactions_ck_inv_txn_transaction_type', r"""transaction_type IN ('receipt', 'issue', 'transfer', 'adjustment', 'return')"""),
    ('kanban_triggers', 'ck_kanban_triggers_ck_kanban_triggers_status', r"""status IN ('Normal', 'Low', 'Critical', 'Overstock')"""),
    ('lot_batches', 'ck_lot_batches_ck_lot_batches_status', r"""status IN ('Received', 'Inspected', 'Accepted', 'Rejected', 'Quarantine', 'Depleted')"""),
    ('make_vs_buy_analyses', 'ck_make_vs_buy_analyses_ck_make_vs_buy_analyses_status', r"""status IN ('Draft', 'Submitted', 'Approved', 'Rejected')"""),
    ('mbom_headers', 'ck_mbom_headers_ck_mbom_headers_status', r"""status IN ('draft', 'released', 'archived')"""),
    ('ncr_reports', 'ck_ncr_reports_ck_ncr_reports_disposition', r"""disposition IN ('use_as_is', 'rework', 'scrap', 'return_to_vendor')"""),
    ('ncr_reports', 'ck_ncr_reports_ck_ncr_reports_severity', r"""severity IN ('minor', 'major', 'critical')"""),
    ('ncr_reports', 'ck_ncr_reports_ck_ncr_reports_status', r"""status IN ('open', 'in_progress', 'closed', 'verified')"""),
    ('notifications', 'ck_notifications_ck_notifications_type', r"""type IN ('info', 'warning', 'error', 'success')"""),
    ('notifications', 'ck_notifications_ck_notifications_status', r"""status IN ('unread', 'read', 'archived')"""),
    ('notifications_queue', 'ck_notifications_queue_ck_notification_queue_notification_type', r"""notification_type IN ('info', 'warning', 'error', 'success', 'alert')"""),
    ('notifications_queue', 'ck_notifications_queue_ck_notification_queue_channel', r"""channel IN ('in_app', 'email', 'sms', 'push')"""),
    ('notifications_queue', 'ck_notifications_queue_ck_notification_queue_priority', r"""priority IN ('low', 'normal', 'high', 'urgent')"""),
    ('part_derivatives', 'ck_part_derivatives_ck_part_derivatives_kind', r"""kind IN ('pdf', 'step', 'dwg', 'dxf', 'other')"""),
    ('part_lifecycles', 'ck_part_lifecycles_ck_part_lifecycles_state', r"""state IN ('concept', 'design', 'prototype', 'production', 'end_of_life', 'obsolete', 'draft', 'review', 'approved')"""),
    ('part_materials', 'ck_part_materials_ck_part_materials_mass_present', r"""mass_g IS NOT NULL OR mass_fraction IS NOT NULL"""),
    ('parts', 'ck_parts_ck_parts_category', r"""category IN ('Electrical', 'Mechanical', 'Software', 'Assembly', 'Raw Material', 'Hardware', 'Consumable', 'Subcontract', 'Packaging', 'Tooling', 'Other')"""),
    ('parts', 'ck_parts_ck_parts_status', r"""status IN ('Draft', 'Review', 'Released', 'Deprecated', 'Obsolete', 'Archived')"""),
    ('po_headers', 'ck_po_headers_ck_po_headers_status', r"""status IN ('draft', 'submitted', 'approved', 'received', 'closed', 'cancelled', 'Not Ordered', 'RFQ Sent', 'Under Review', 'Ordered', 'In Transit', 'Quality Check', 'Rejected', 'Open')"""),
    ('pricing_agreements', 'ck_pricing_agreements_ck_pricing_agreements_status', r"""status IN ('Active', 'Expired', 'Superseded')"""),
    ('process_plans', 'ck_process_plans_ck_process_plans_status', r"""status IN ('draft', 'active', 'archived')"""),
    ('projects', 'ck_projects_ck_projects_status', r"""status IN ('Draft', 'Review', 'Released', 'Deprecated', 'Archived', 'Completed', 'Cancelled')"""),
    ('resource_schedules', 'ck_resource_schedules_ck_resource_schedules_status', r"""status IN ('scheduled', 'in_progress', 'completed', 'cancelled')"""),
    ('restricted_substance_entries', 'ck_restricted_substance_entries_ck_restricted_entry_one_target', r"""(CASE WHEN substance_id IS NULL THEN 0 ELSE 1 END + CASE WHEN substance_group_id IS NULL THEN 0 ELSE 1 END) = 1"""),
    ('rfq_headers', 'ck_rfq_headers_ck_rfq_status', r"""status IN ('draft', 'sent', 'responded', 'awarded', 'cancelled')"""),
    ('rfq_supplier_responses', 'ck_rfq_supplier_responses_ck_rfq_response_status', r"""status IN ('submitted', 'accepted', 'rejected')"""),
    ('routing_tables', 'ck_routing_tables_ck_routing_tables_status', r"""status IN ('draft', 'active', 'archived')"""),
    ('serial_numbers', 'ck_serial_numbers_ck_serial_numbers_status', r"""status IN ('In Stock', 'Installed', 'Consumed', 'Scrapped', 'Quarantine')"""),
    ('service_bom_headers', 'ck_service_bom_headers_ck_service_bom_headers_status', r"""status IN ('draft', 'active', 'archived')"""),
    ('service_bom_items', 'ck_service_bom_items_ck_service_bom_items_service_type', r"""service_type IN ('field_service', 'depot_repair', 'spare_parts', 'maintenance')"""),
    ('shipment_updates', 'ck_shipment_updates_ck_shipment_updates_status', r"""status IN ('in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned')"""),
    ('should_cost_models', 'ck_should_cost_models_ck_should_cost_models_status', r"""status IN ('Draft', 'Active', 'Archived')"""),
    ('supplier_price_updates', 'ck_supplier_price_updates_ck_supplier_price_updates_status', r"""status IN ('pending', 'approved', 'rejected')"""),
    ('tenants', 'ck_tenants_ck_tenants_status', r"""status IN ('active', 'inactive', 'suspended')"""),
    ('tenants', 'ck_tenants_ck_tenants_plan', r"""plan IN ('free', 'starter', 'professional', 'enterprise')"""),
    ('user_mfa', 'ck_user_mfa_ck_user_mfa_mfa_type', r"""mfa_type IN ('totp', 'sms', 'email', 'webauthn', 'backup_code')"""),
    ('webhook_deliveries', 'ck_webhook_deliveries_ck_webhook_deliveries_status', r"""status IN ('pending', 'delivered', 'failed', 'retrying')"""),
    ('work_order_operations', 'ck_work_order_operations_ck_work_order_operations_status', r"""status IN ('pending', 'in_progress', 'completed', 'skipped')"""),
    ('work_orders', 'ck_work_orders_ck_work_orders_priority', r"""priority IN ('low', 'normal', 'high', 'urgent')"""),
    ('work_orders', 'ck_work_orders_ck_work_orders_status', r"""status IN ('draft', 'released', 'in_progress', 'completed', 'closed', 'cancelled', 'on_hold', 'scrapped')"""),
]


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite cannot ADD CONSTRAINT, and the test schema is built by
        # create_all(), which already includes every CHECK.
        return
    insp = inspect(bind)
    tables = set(insp.get_table_names())
    for table, name, predicate in CHECKS:
        if table not in tables:
            continue
        existing = {c.get("name") for c in insp.get_check_constraints(table)}
        if name in existing:
            continue
        op.execute(
            f'ALTER TABLE "{table}" ADD CONSTRAINT "{name}" '
            f"CHECK ({predicate}) NOT VALID"
        )


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for table, name, _ in CHECKS:
        op.execute(f'ALTER TABLE IF EXISTS "{table}" DROP CONSTRAINT IF EXISTS "{name}"')
