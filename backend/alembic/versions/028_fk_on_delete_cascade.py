"""Add ON DELETE CASCADE to all existing Foreign Key constraints.

Revision ID: 028
Revises: 027_datetime_timezone_standardization
Create Date: 2026-07-03
"""

from alembic import op

revision = "028"
down_revision = "027_datetime_timezone_standardization"
branch_labels = None
depends_on = None

UPGRADE_SQL = """
-- 001_initial: bom_templates.createdById -> users.id
DO $$ BEGIN
    ALTER TABLE bom_templates DROP CONSTRAINT IF EXISTS bom_templates_createdbyid_fkey;
    ALTER TABLE bom_templates ADD CONSTRAINT bom_templates_createdbyid_fkey
        FOREIGN KEY ("createdById") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 001_initial: bom_items.bomTemplateId -> bom_templates.id
DO $$ BEGIN
    ALTER TABLE bom_items DROP CONSTRAINT IF EXISTS bom_items_bomtemplateid_fkey;
    ALTER TABLE bom_items ADD CONSTRAINT bom_items_bomtemplateid_fkey
        FOREIGN KEY ("bomTemplateId") REFERENCES bom_templates(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 001_initial: bom_items.partId -> parts.id
DO $$ BEGIN
    ALTER TABLE bom_items DROP CONSTRAINT IF EXISTS bom_items_partid_fkey;
    ALTER TABLE bom_items ADD CONSTRAINT bom_items_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 001_initial: bom_items.parentItemId -> bom_items.id
DO $$ BEGIN
    ALTER TABLE bom_items DROP CONSTRAINT IF EXISTS bom_items_parentitemid_fkey;
    ALTER TABLE bom_items ADD CONSTRAINT bom_items_parentitemid_fkey
        FOREIGN KEY ("parentItemId") REFERENCES bom_items(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 001_initial: purchase_orders.partId -> parts.id
DO $$ BEGIN
    ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_partid_fkey;
    ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 001_initial: purchase_orders.vendorId -> vendors.id
DO $$ BEGIN
    ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_vendorid_fkey;
    ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: make_vs_buy_analyses.partId -> parts.id
DO $$ BEGIN
    ALTER TABLE make_vs_buy_analyses DROP CONSTRAINT IF EXISTS make_vs_buy_analyses_partid_fkey;
    ALTER TABLE make_vs_buy_analyses ADD CONSTRAINT make_vs_buy_analyses_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: make_vs_buy_analyses.projectId -> projects.id
DO $$ BEGIN
    ALTER TABLE make_vs_buy_analyses DROP CONSTRAINT IF EXISTS make_vs_buy_analyses_projectid_fkey;
    ALTER TABLE make_vs_buy_analyses ADD CONSTRAINT make_vs_buy_analyses_projectid_fkey
        FOREIGN KEY ("projectId") REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: make_vs_buy_analyses.createdBy -> users.id
DO $$ BEGIN
    ALTER TABLE make_vs_buy_analyses DROP CONSTRAINT IF EXISTS make_vs_buy_analyses_createdby_fkey;
    ALTER TABLE make_vs_buy_analyses ADD CONSTRAINT make_vs_buy_analyses_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: make_vs_buy_analyses.approvedBy -> users.id
DO $$ BEGIN
    ALTER TABLE make_vs_buy_analyses DROP CONSTRAINT IF EXISTS make_vs_buy_analyses_approvedby_fkey;
    ALTER TABLE make_vs_buy_analyses ADD CONSTRAINT make_vs_buy_analyses_approvedby_fkey
        FOREIGN KEY ("approvedBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: should_cost_models.partId -> parts.id
DO $$ BEGIN
    ALTER TABLE should_cost_models DROP CONSTRAINT IF EXISTS should_cost_models_partid_fkey;
    ALTER TABLE should_cost_models ADD CONSTRAINT should_cost_models_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: should_cost_models.createdBy -> users.id
DO $$ BEGIN
    ALTER TABLE should_cost_models DROP CONSTRAINT IF EXISTS should_cost_models_createdby_fkey;
    ALTER TABLE should_cost_models ADD CONSTRAINT should_cost_models_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: supplier_scorecards.vendorId -> vendors.id
DO $$ BEGIN
    ALTER TABLE supplier_scorecards DROP CONSTRAINT IF EXISTS supplier_scorecards_vendorid_fkey;
    ALTER TABLE supplier_scorecards ADD CONSTRAINT supplier_scorecards_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: supplier_scorecards.createdBy -> users.id
DO $$ BEGIN
    ALTER TABLE supplier_scorecards DROP CONSTRAINT IF EXISTS supplier_scorecards_createdby_fkey;
    ALTER TABLE supplier_scorecards ADD CONSTRAINT supplier_scorecards_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: capas.verifiedBy -> users.id
DO $$ BEGIN
    ALTER TABLE capas DROP CONSTRAINT IF EXISTS capas_verifiedby_fkey;
    ALTER TABLE capas ADD CONSTRAINT capas_verifiedby_fkey
        FOREIGN KEY ("verifiedBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: capas.partId -> parts.id
DO $$ BEGIN
    ALTER TABLE capas DROP CONSTRAINT IF EXISTS capas_partid_fkey;
    ALTER TABLE capas ADD CONSTRAINT capas_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: capas.projectId -> projects.id
DO $$ BEGIN
    ALTER TABLE capas DROP CONSTRAINT IF EXISTS capas_projectid_fkey;
    ALTER TABLE capas ADD CONSTRAINT capas_projectid_fkey
        FOREIGN KEY ("projectId") REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: capas.vendorId -> vendors.id
DO $$ BEGIN
    ALTER TABLE capas DROP CONSTRAINT IF EXISTS capas_vendorid_fkey;
    ALTER TABLE capas ADD CONSTRAINT capas_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: capas.createdBy -> users.id
DO $$ BEGIN
    ALTER TABLE capas DROP CONSTRAINT IF EXISTS capas_createdby_fkey;
    ALTER TABLE capas ADD CONSTRAINT capas_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: fai_reports.partId -> parts.id
DO $$ BEGIN
    ALTER TABLE fai_reports DROP CONSTRAINT IF EXISTS fai_reports_partid_fkey;
    ALTER TABLE fai_reports ADD CONSTRAINT fai_reports_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: fai_reports.projectId -> projects.id
DO $$ BEGIN
    ALTER TABLE fai_reports DROP CONSTRAINT IF EXISTS fai_reports_projectid_fkey;
    ALTER TABLE fai_reports ADD CONSTRAINT fai_reports_projectid_fkey
        FOREIGN KEY ("projectId") REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: fai_reports.createdBy -> users.id
DO $$ BEGIN
    ALTER TABLE fai_reports DROP CONSTRAINT IF EXISTS fai_reports_createdby_fkey;
    ALTER TABLE fai_reports ADD CONSTRAINT fai_reports_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: deviations.partId -> parts.id
DO $$ BEGIN
    ALTER TABLE deviations DROP CONSTRAINT IF EXISTS deviations_partid_fkey;
    ALTER TABLE deviations ADD CONSTRAINT deviations_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: deviations.projectId -> projects.id
DO $$ BEGIN
    ALTER TABLE deviations DROP CONSTRAINT IF EXISTS deviations_projectid_fkey;
    ALTER TABLE deviations ADD CONSTRAINT deviations_projectid_fkey
        FOREIGN KEY ("projectId") REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: deviations.capaId -> capas.id
DO $$ BEGIN
    ALTER TABLE deviations DROP CONSTRAINT IF EXISTS deviations_capaid_fkey;
    ALTER TABLE deviations ADD CONSTRAINT deviations_capaid_fkey
        FOREIGN KEY ("capaId") REFERENCES capas(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: deviations.createdBy -> users.id
DO $$ BEGIN
    ALTER TABLE deviations DROP CONSTRAINT IF EXISTS deviations_createdby_fkey;
    ALTER TABLE deviations ADD CONSTRAINT deviations_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: serial_numbers.partId -> parts.id
DO $$ BEGIN
    ALTER TABLE serial_numbers DROP CONSTRAINT IF EXISTS serial_numbers_partid_fkey;
    ALTER TABLE serial_numbers ADD CONSTRAINT serial_numbers_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: serial_numbers.poId -> purchase_orders.id
DO $$ BEGIN
    ALTER TABLE serial_numbers DROP CONSTRAINT IF EXISTS serial_numbers_poid_fkey;
    ALTER TABLE serial_numbers ADD CONSTRAINT serial_numbers_poid_fkey
        FOREIGN KEY ("poId") REFERENCES purchase_orders(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: serial_numbers.createdBy -> users.id
DO $$ BEGIN
    ALTER TABLE serial_numbers DROP CONSTRAINT IF EXISTS serial_numbers_createdby_fkey;
    ALTER TABLE serial_numbers ADD CONSTRAINT serial_numbers_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: lot_batches.partId -> parts.id
DO $$ BEGIN
    ALTER TABLE lot_batches DROP CONSTRAINT IF EXISTS lot_batches_partid_fkey;
    ALTER TABLE lot_batches ADD CONSTRAINT lot_batches_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: lot_batches.vendorId -> vendors.id
DO $$ BEGIN
    ALTER TABLE lot_batches DROP CONSTRAINT IF EXISTS lot_batches_vendorid_fkey;
    ALTER TABLE lot_batches ADD CONSTRAINT lot_batches_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: lot_batches.poId -> purchase_orders.id
DO $$ BEGIN
    ALTER TABLE lot_batches DROP CONSTRAINT IF EXISTS lot_batches_poid_fkey;
    ALTER TABLE lot_batches ADD CONSTRAINT lot_batches_poid_fkey
        FOREIGN KEY ("poId") REFERENCES purchase_orders(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: lot_batches.createdBy -> users.id
DO $$ BEGIN
    ALTER TABLE lot_batches DROP CONSTRAINT IF EXISTS lot_batches_createdby_fkey;
    ALTER TABLE lot_batches ADD CONSTRAINT lot_batches_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: kanban_triggers.partId -> parts.id
DO $$ BEGIN
    ALTER TABLE kanban_triggers DROP CONSTRAINT IF EXISTS kanban_triggers_partid_fkey;
    ALTER TABLE kanban_triggers ADD CONSTRAINT kanban_triggers_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: kanban_triggers.preferredVendorId -> vendors.id
DO $$ BEGIN
    ALTER TABLE kanban_triggers DROP CONSTRAINT IF EXISTS kanban_triggers_preferredvendorid_fkey;
    ALTER TABLE kanban_triggers ADD CONSTRAINT kanban_triggers_preferredvendorid_fkey
        FOREIGN KEY ("preferredVendorId") REFERENCES vendors(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: kanban_triggers.createdBy -> users.id
DO $$ BEGIN
    ALTER TABLE kanban_triggers DROP CONSTRAINT IF EXISTS kanban_triggers_createdby_fkey;
    ALTER TABLE kanban_triggers ADD CONSTRAINT kanban_triggers_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: contracts.vendorId -> vendors.id
DO $$ BEGIN
    ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_vendorid_fkey;
    ALTER TABLE contracts ADD CONSTRAINT contracts_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: contracts.createdBy -> users.id
DO $$ BEGIN
    ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_createdby_fkey;
    ALTER TABLE contracts ADD CONSTRAINT contracts_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: pricing_agreements.contractId -> contracts.id
DO $$ BEGIN
    ALTER TABLE pricing_agreements DROP CONSTRAINT IF EXISTS pricing_agreements_contractid_fkey;
    ALTER TABLE pricing_agreements ADD CONSTRAINT pricing_agreements_contractid_fkey
        FOREIGN KEY ("contractId") REFERENCES contracts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: pricing_agreements.partId -> parts.id
DO $$ BEGIN
    ALTER TABLE pricing_agreements DROP CONSTRAINT IF EXISTS pricing_agreements_partid_fkey;
    ALTER TABLE pricing_agreements ADD CONSTRAINT pricing_agreements_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: pricing_agreements.vendorId -> vendors.id
DO $$ BEGIN
    ALTER TABLE pricing_agreements DROP CONSTRAINT IF EXISTS pricing_agreements_vendorid_fkey;
    ALTER TABLE pricing_agreements ADD CONSTRAINT pricing_agreements_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: pricing_agreements.createdBy -> users.id
DO $$ BEGIN
    ALTER TABLE pricing_agreements DROP CONSTRAINT IF EXISTS pricing_agreements_createdby_fkey;
    ALTER TABLE pricing_agreements ADD CONSTRAINT pricing_agreements_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 003_phase4: webhook_deliveries.subscriptionId -> webhook_subscriptions.id
DO $$ BEGIN
    ALTER TABLE webhook_deliveries DROP CONSTRAINT IF EXISTS webhook_deliveries_subscriptionid_fkey;
    ALTER TABLE webhook_deliveries ADD CONSTRAINT webhook_deliveries_subscriptionid_fkey
        FOREIGN KEY ("subscriptionId") REFERENCES webhook_subscriptions(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 003_phase4: bulk_import_rows.jobId -> bulk_import_jobs.id
DO $$ BEGIN
    ALTER TABLE bulk_import_rows DROP CONSTRAINT IF EXISTS bulk_import_rows_jobid_fkey;
    ALTER TABLE bulk_import_rows ADD CONSTRAINT bulk_import_rows_jobid_fkey
        FOREIGN KEY ("jobId") REFERENCES bulk_import_jobs(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 003_phase4: erp_sync_logs.connectorId -> erp_connectors.id
DO $$ BEGIN
    ALTER TABLE erp_sync_logs DROP CONSTRAINT IF EXISTS erp_sync_logs_connectorid_fkey;
    ALTER TABLE erp_sync_logs ADD CONSTRAINT erp_sync_logs_connectorid_fkey
        FOREIGN KEY ("connectorId") REFERENCES erp_connectors(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 003_phase4: supplier_users.vendorId -> vendors.id
DO $$ BEGIN
    ALTER TABLE supplier_users DROP CONSTRAINT IF EXISTS supplier_users_vendorid_fkey;
    ALTER TABLE supplier_users ADD CONSTRAINT supplier_users_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 003_phase4: supplier_price_updates.supplierUserId -> supplier_users.id
DO $$ BEGIN
    ALTER TABLE supplier_price_updates DROP CONSTRAINT IF EXISTS supplier_price_updates_supplieruserid_fkey;
    ALTER TABLE supplier_price_updates ADD CONSTRAINT supplier_price_updates_supplieruserid_fkey
        FOREIGN KEY ("supplierUserId") REFERENCES supplier_users(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 003_phase4: supplier_price_updates.partId -> parts.id
DO $$ BEGIN
    ALTER TABLE supplier_price_updates DROP CONSTRAINT IF EXISTS supplier_price_updates_partid_fkey;
    ALTER TABLE supplier_price_updates ADD CONSTRAINT supplier_price_updates_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 004_order_tracking: order_tracking.poHeaderId -> po_headers.id
DO $$ BEGIN
    ALTER TABLE order_tracking DROP CONSTRAINT IF EXISTS order_tracking_poheaderid_fkey;
    ALTER TABLE order_tracking ADD CONSTRAINT order_tracking_poheaderid_fkey
        FOREIGN KEY ("poHeaderId") REFERENCES po_headers(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 004_order_tracking: tracking_milestones.trackingId -> order_tracking.id
DO $$ BEGIN
    ALTER TABLE tracking_milestones DROP CONSTRAINT IF EXISTS tracking_milestones_trackingid_fkey;
    ALTER TABLE tracking_milestones ADD CONSTRAINT tracking_milestones_trackingid_fkey
        FOREIGN KEY ("trackingId") REFERENCES order_tracking(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 004_order_tracking: shipment_updates.trackingId -> order_tracking.id
DO $$ BEGIN
    ALTER TABLE shipment_updates DROP CONSTRAINT IF EXISTS shipment_updates_trackingid_fkey;
    ALTER TABLE shipment_updates ADD CONSTRAINT shipment_updates_trackingid_fkey
        FOREIGN KEY ("trackingId") REFERENCES order_tracking(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
"""

DOWNGRADE_SQL = """
-- 001_initial: bom_templates.createdById -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE bom_templates DROP CONSTRAINT IF EXISTS bom_templates_createdbyid_fkey;
    ALTER TABLE bom_templates ADD CONSTRAINT bom_templates_createdbyid_fkey
        FOREIGN KEY ("createdById") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 001_initial: bom_items.bomTemplateId -> bom_templates.id (no cascade)
DO $$ BEGIN
    ALTER TABLE bom_items DROP CONSTRAINT IF EXISTS bom_items_bomtemplateid_fkey;
    ALTER TABLE bom_items ADD CONSTRAINT bom_items_bomtemplateid_fkey
        FOREIGN KEY ("bomTemplateId") REFERENCES bom_templates(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 001_initial: bom_items.partId -> parts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE bom_items DROP CONSTRAINT IF EXISTS bom_items_partid_fkey;
    ALTER TABLE bom_items ADD CONSTRAINT bom_items_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 001_initial: bom_items.parentItemId -> bom_items.id (no cascade)
DO $$ BEGIN
    ALTER TABLE bom_items DROP CONSTRAINT IF EXISTS bom_items_parentitemid_fkey;
    ALTER TABLE bom_items ADD CONSTRAINT bom_items_parentitemid_fkey
        FOREIGN KEY ("parentItemId") REFERENCES bom_items(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 001_initial: purchase_orders.partId -> parts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_partid_fkey;
    ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 001_initial: purchase_orders.vendorId -> vendors.id (no cascade)
DO $$ BEGIN
    ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_vendorid_fkey;
    ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: make_vs_buy_analyses.partId -> parts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE make_vs_buy_analyses DROP CONSTRAINT IF EXISTS make_vs_buy_analyses_partid_fkey;
    ALTER TABLE make_vs_buy_analyses ADD CONSTRAINT make_vs_buy_analyses_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: make_vs_buy_analyses.projectId -> projects.id (no cascade)
DO $$ BEGIN
    ALTER TABLE make_vs_buy_analyses DROP CONSTRAINT IF EXISTS make_vs_buy_analyses_projectid_fkey;
    ALTER TABLE make_vs_buy_analyses ADD CONSTRAINT make_vs_buy_analyses_projectid_fkey
        FOREIGN KEY ("projectId") REFERENCES projects(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: make_vs_buy_analyses.createdBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE make_vs_buy_analyses DROP CONSTRAINT IF EXISTS make_vs_buy_analyses_createdby_fkey;
    ALTER TABLE make_vs_buy_analyses ADD CONSTRAINT make_vs_buy_analyses_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: make_vs_buy_analyses.approvedBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE make_vs_buy_analyses DROP CONSTRAINT IF EXISTS make_vs_buy_analyses_approvedby_fkey;
    ALTER TABLE make_vs_buy_analyses ADD CONSTRAINT make_vs_buy_analyses_approvedby_fkey
        FOREIGN KEY ("approvedBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: should_cost_models.partId -> parts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE should_cost_models DROP CONSTRAINT IF EXISTS should_cost_models_partid_fkey;
    ALTER TABLE should_cost_models ADD CONSTRAINT should_cost_models_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: should_cost_models.createdBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE should_cost_models DROP CONSTRAINT IF EXISTS should_cost_models_createdby_fkey;
    ALTER TABLE should_cost_models ADD CONSTRAINT should_cost_models_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: supplier_scorecards.vendorId -> vendors.id (no cascade)
DO $$ BEGIN
    ALTER TABLE supplier_scorecards DROP CONSTRAINT IF EXISTS supplier_scorecards_vendorid_fkey;
    ALTER TABLE supplier_scorecards ADD CONSTRAINT supplier_scorecards_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: supplier_scorecards.createdBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE supplier_scorecards DROP CONSTRAINT IF EXISTS supplier_scorecards_createdby_fkey;
    ALTER TABLE supplier_scorecards ADD CONSTRAINT supplier_scorecards_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: capas.verifiedBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE capas DROP CONSTRAINT IF EXISTS capas_verifiedby_fkey;
    ALTER TABLE capas ADD CONSTRAINT capas_verifiedby_fkey
        FOREIGN KEY ("verifiedBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: capas.partId -> parts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE capas DROP CONSTRAINT IF EXISTS capas_partid_fkey;
    ALTER TABLE capas ADD CONSTRAINT capas_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: capas.projectId -> projects.id (no cascade)
DO $$ BEGIN
    ALTER TABLE capas DROP CONSTRAINT IF EXISTS capas_projectid_fkey;
    ALTER TABLE capas ADD CONSTRAINT capas_projectid_fkey
        FOREIGN KEY ("projectId") REFERENCES projects(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: capas.vendorId -> vendors.id (no cascade)
DO $$ BEGIN
    ALTER TABLE capas DROP CONSTRAINT IF EXISTS capas_vendorid_fkey;
    ALTER TABLE capas ADD CONSTRAINT capas_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: capas.createdBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE capas DROP CONSTRAINT IF EXISTS capas_createdby_fkey;
    ALTER TABLE capas ADD CONSTRAINT capas_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: fai_reports.partId -> parts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE fai_reports DROP CONSTRAINT IF EXISTS fai_reports_partid_fkey;
    ALTER TABLE fai_reports ADD CONSTRAINT fai_reports_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: fai_reports.projectId -> projects.id (no cascade)
DO $$ BEGIN
    ALTER TABLE fai_reports DROP CONSTRAINT IF EXISTS fai_reports_projectid_fkey;
    ALTER TABLE fai_reports ADD CONSTRAINT fai_reports_projectid_fkey
        FOREIGN KEY ("projectId") REFERENCES projects(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: fai_reports.createdBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE fai_reports DROP CONSTRAINT IF EXISTS fai_reports_createdby_fkey;
    ALTER TABLE fai_reports ADD CONSTRAINT fai_reports_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: deviations.partId -> parts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE deviations DROP CONSTRAINT IF EXISTS deviations_partid_fkey;
    ALTER TABLE deviations ADD CONSTRAINT deviations_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: deviations.projectId -> projects.id (no cascade)
DO $$ BEGIN
    ALTER TABLE deviations DROP CONSTRAINT IF EXISTS deviations_projectid_fkey;
    ALTER TABLE deviations ADD CONSTRAINT deviations_projectid_fkey
        FOREIGN KEY ("projectId") REFERENCES projects(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: deviations.capaId -> capas.id (no cascade)
DO $$ BEGIN
    ALTER TABLE deviations DROP CONSTRAINT IF EXISTS deviations_capaid_fkey;
    ALTER TABLE deviations ADD CONSTRAINT deviations_capaid_fkey
        FOREIGN KEY ("capaId") REFERENCES capas(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: deviations.createdBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE deviations DROP CONSTRAINT IF EXISTS deviations_createdby_fkey;
    ALTER TABLE deviations ADD CONSTRAINT deviations_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: serial_numbers.partId -> parts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE serial_numbers DROP CONSTRAINT IF EXISTS serial_numbers_partid_fkey;
    ALTER TABLE serial_numbers ADD CONSTRAINT serial_numbers_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: serial_numbers.poId -> purchase_orders.id (no cascade)
DO $$ BEGIN
    ALTER TABLE serial_numbers DROP CONSTRAINT IF EXISTS serial_numbers_poid_fkey;
    ALTER TABLE serial_numbers ADD CONSTRAINT serial_numbers_poid_fkey
        FOREIGN KEY ("poId") REFERENCES purchase_orders(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: serial_numbers.createdBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE serial_numbers DROP CONSTRAINT IF EXISTS serial_numbers_createdby_fkey;
    ALTER TABLE serial_numbers ADD CONSTRAINT serial_numbers_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: lot_batches.partId -> parts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE lot_batches DROP CONSTRAINT IF EXISTS lot_batches_partid_fkey;
    ALTER TABLE lot_batches ADD CONSTRAINT lot_batches_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: lot_batches.vendorId -> vendors.id (no cascade)
DO $$ BEGIN
    ALTER TABLE lot_batches DROP CONSTRAINT IF EXISTS lot_batches_vendorid_fkey;
    ALTER TABLE lot_batches ADD CONSTRAINT lot_batches_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: lot_batches.poId -> purchase_orders.id (no cascade)
DO $$ BEGIN
    ALTER TABLE lot_batches DROP CONSTRAINT IF EXISTS lot_batches_poid_fkey;
    ALTER TABLE lot_batches ADD CONSTRAINT lot_batches_poid_fkey
        FOREIGN KEY ("poId") REFERENCES purchase_orders(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: lot_batches.createdBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE lot_batches DROP CONSTRAINT IF EXISTS lot_batches_createdby_fkey;
    ALTER TABLE lot_batches ADD CONSTRAINT lot_batches_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: kanban_triggers.partId -> parts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE kanban_triggers DROP CONSTRAINT IF EXISTS kanban_triggers_partid_fkey;
    ALTER TABLE kanban_triggers ADD CONSTRAINT kanban_triggers_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: kanban_triggers.preferredVendorId -> vendors.id (no cascade)
DO $$ BEGIN
    ALTER TABLE kanban_triggers DROP CONSTRAINT IF EXISTS kanban_triggers_preferredvendorid_fkey;
    ALTER TABLE kanban_triggers ADD CONSTRAINT kanban_triggers_preferredvendorid_fkey
        FOREIGN KEY ("preferredVendorId") REFERENCES vendors(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: kanban_triggers.createdBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE kanban_triggers DROP CONSTRAINT IF EXISTS kanban_triggers_createdby_fkey;
    ALTER TABLE kanban_triggers ADD CONSTRAINT kanban_triggers_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: contracts.vendorId -> vendors.id (no cascade)
DO $$ BEGIN
    ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_vendorid_fkey;
    ALTER TABLE contracts ADD CONSTRAINT contracts_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: contracts.createdBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_createdby_fkey;
    ALTER TABLE contracts ADD CONSTRAINT contracts_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: pricing_agreements.contractId -> contracts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE pricing_agreements DROP CONSTRAINT IF EXISTS pricing_agreements_contractid_fkey;
    ALTER TABLE pricing_agreements ADD CONSTRAINT pricing_agreements_contractid_fkey
        FOREIGN KEY ("contractId") REFERENCES contracts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: pricing_agreements.partId -> parts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE pricing_agreements DROP CONSTRAINT IF EXISTS pricing_agreements_partid_fkey;
    ALTER TABLE pricing_agreements ADD CONSTRAINT pricing_agreements_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: pricing_agreements.vendorId -> vendors.id (no cascade)
DO $$ BEGIN
    ALTER TABLE pricing_agreements DROP CONSTRAINT IF EXISTS pricing_agreements_vendorid_fkey;
    ALTER TABLE pricing_agreements ADD CONSTRAINT pricing_agreements_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 002_phase3: pricing_agreements.createdBy -> users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE pricing_agreements DROP CONSTRAINT IF EXISTS pricing_agreements_createdby_fkey;
    ALTER TABLE pricing_agreements ADD CONSTRAINT pricing_agreements_createdby_fkey
        FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 003_phase4: webhook_deliveries.subscriptionId -> webhook_subscriptions.id (no cascade)
DO $$ BEGIN
    ALTER TABLE webhook_deliveries DROP CONSTRAINT IF EXISTS webhook_deliveries_subscriptionid_fkey;
    ALTER TABLE webhook_deliveries ADD CONSTRAINT webhook_deliveries_subscriptionid_fkey
        FOREIGN KEY ("subscriptionId") REFERENCES webhook_subscriptions(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 003_phase4: bulk_import_rows.jobId -> bulk_import_jobs.id (no cascade)
DO $$ BEGIN
    ALTER TABLE bulk_import_rows DROP CONSTRAINT IF EXISTS bulk_import_rows_jobid_fkey;
    ALTER TABLE bulk_import_rows ADD CONSTRAINT bulk_import_rows_jobid_fkey
        FOREIGN KEY ("jobId") REFERENCES bulk_import_jobs(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 003_phase4: erp_sync_logs.connectorId -> erp_connectors.id (no cascade)
DO $$ BEGIN
    ALTER TABLE erp_sync_logs DROP CONSTRAINT IF EXISTS erp_sync_logs_connectorid_fkey;
    ALTER TABLE erp_sync_logs ADD CONSTRAINT erp_sync_logs_connectorid_fkey
        FOREIGN KEY ("connectorId") REFERENCES erp_connectors(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 003_phase4: supplier_users.vendorId -> vendors.id (no cascade)
DO $$ BEGIN
    ALTER TABLE supplier_users DROP CONSTRAINT IF EXISTS supplier_users_vendorid_fkey;
    ALTER TABLE supplier_users ADD CONSTRAINT supplier_users_vendorid_fkey
        FOREIGN KEY ("vendorId") REFERENCES vendors(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 003_phase4: supplier_price_updates.supplierUserId -> supplier_users.id (no cascade)
DO $$ BEGIN
    ALTER TABLE supplier_price_updates DROP CONSTRAINT IF EXISTS supplier_price_updates_supplieruserid_fkey;
    ALTER TABLE supplier_price_updates ADD CONSTRAINT supplier_price_updates_supplieruserid_fkey
        FOREIGN KEY ("supplierUserId") REFERENCES supplier_users(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 003_phase4: supplier_price_updates.partId -> parts.id (no cascade)
DO $$ BEGIN
    ALTER TABLE supplier_price_updates DROP CONSTRAINT IF EXISTS supplier_price_updates_partid_fkey;
    ALTER TABLE supplier_price_updates ADD CONSTRAINT supplier_price_updates_partid_fkey
        FOREIGN KEY ("partId") REFERENCES parts(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 004_order_tracking: order_tracking.poHeaderId -> po_headers.id (no cascade)
DO $$ BEGIN
    ALTER TABLE order_tracking DROP CONSTRAINT IF EXISTS order_tracking_poheaderid_fkey;
    ALTER TABLE order_tracking ADD CONSTRAINT order_tracking_poheaderid_fkey
        FOREIGN KEY ("poHeaderId") REFERENCES po_headers(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 004_order_tracking: tracking_milestones.trackingId -> order_tracking.id (no cascade)
DO $$ BEGIN
    ALTER TABLE tracking_milestones DROP CONSTRAINT IF EXISTS tracking_milestones_trackingid_fkey;
    ALTER TABLE tracking_milestones ADD CONSTRAINT tracking_milestones_trackingid_fkey
        FOREIGN KEY ("trackingId") REFERENCES order_tracking(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 004_order_tracking: shipment_updates.trackingId -> order_tracking.id (no cascade)
DO $$ BEGIN
    ALTER TABLE shipment_updates DROP CONSTRAINT IF EXISTS shipment_updates_trackingid_fkey;
    ALTER TABLE shipment_updates ADD CONSTRAINT shipment_updates_trackingid_fkey
        FOREIGN KEY ("trackingId") REFERENCES order_tracking(id);
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
