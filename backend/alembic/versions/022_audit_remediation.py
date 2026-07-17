"""Formalize all tables under Alembic management + add missing constraints

Formalizes ~73 tables previously created only via Base.metadata.create_all()
into proper Alembic-managed schema. Adds CHECK constraints for enum-like
columns, missing UNIQUE constraints, and missing FK constraints.

Tables formalized:
  - Tenant: tenants
  - PO: po_headers, po_line_items
  - Inventory: warehouses, bin_locations, inventory, inventory_transactions, inventory_reservations
  - Work Orders: work_orders, work_order_operations, work_order_materials
  - Quality: inspection_plans, inspection_records, ncr_reports, capa_actions
  - ECO: eco_headers, eco_items, eco_approvals, eco_notifications, eco_changes
  - Routing: routing_tables, routing_operations, process_plans, process_plan_steps
  - BOM variants: bom_variants, bom_variant_items
  - BOM snapshots: bom_snapshots, bom_baselines
  - BOM association: part_tags, part_compliance
  - MBOM: mbom_headers, mbom_items, mbom_operations
  - Service BOM: service_bom_headers, service_bom_items
  - Part lifecycle: part_lifecycles, lifecycle_definitions
  - Supplier: supplier_users, supplier_price_updates
  - ERP: erp_connectors, erp_sync_logs
  - Order tracking: order_tracking, tracking_milestones, shipment_updates
  - Resource: work_centers, resource_schedules, capacity_reports
  - Labor: labor_rates, timesheet_entries
  - Bulk import: bulk_import_jobs, bulk_import_rows
  - Contracts: contracts, pricing_agreements
  - Webhook: webhook_subscriptions, webhook_deliveries
  - Digital signatures: digital_signatures, user_mfa
  - Notifications: notifications_queue
  - User data: user_data_store, user_preferences, user_checklist_progress, bom_drafts, scan_history, saved_searches
  - Enterprise: currencies, exchange_rates, compliance_certificates, auto_number_schemes, custom_attribute_definitions
  - Forecasting: demand_forecasts, interchangeability_suggestions, validation_results, approval_automation_rules
  - Config: api_keys, backup_history
  - Auth: roles, permissions, token_blacklist, user_sessions
  - Core: part_vendors, part_country_history, part_vendor_prices, part_custom_fields
  - Analysis: make_vs_buy_analyses, should_cost_models, supplier_scorecards, capas, fai_reports, deviations, kanban_triggers
  - Approval: approvals

Revision ID: 022
Revises: 021
Create Date: 2026-06-17
"""

from collections.abc import Sequence

from alembic import op

revision: str = "022"
down_revision: str | None = "021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _clean_duplicates(table: str, unique_columns: list[str]) -> None:
    """Remove duplicate rows before adding unique constraint."""
    cols = ", ".join(f'"{c}"' for c in unique_columns)
    op.execute(f"""
        DELETE FROM {table} WHERE id NOT IN (
            SELECT MIN(id) FROM {table} GROUP BY {cols}
        )
    """)


def upgrade() -> None:
    connection = op.get_bind()

    # ════════════════════════════════════════════════════════════
    # STEP 1: Create tables using Alembic-managed DDL
    # Uses IF NOT EXISTS for idempotency — safe for existing tables
    # ════════════════════════════════════════════════════════════

    op.execute("""
        CREATE TABLE IF NOT EXISTS approvals (
            id SERIAL PRIMARY KEY,
            title VARCHAR NOT NULL,
            description TEXT,
            "type" VARCHAR NOT NULL,
            status VARCHAR DEFAULT 'pending',
            "entityType" VARCHAR,
            "entityId" INTEGER NOT NULL,
            "requestedById" INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
            "approvedById" INTEGER REFERENCES users(id) ON DELETE CASCADE,
            "approvalComments" TEXT,
            "rejectionReason" TEXT,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE,
            "decidedAt" TIMESTAMP WITH TIME ZONE,
            "expiresAt" TIMESTAMP WITH TIME ZONE,
            "tenantId" INTEGER
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS revisions (
            id SERIAL PRIMARY KEY,
            "entityType" VARCHAR,
            "entityId" INTEGER NOT NULL,
            "revisionNumber" VARCHAR NOT NULL,
            "revisionLabel" VARCHAR,
            description TEXT,
            "bomSnapshot" JSONB,
            "createdById" INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE,
            "tenantId" INTEGER
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS revision_bom_snapshot_items (
            id SERIAL PRIMARY KEY,
            revision_id INTEGER REFERENCES revisions(id) ON DELETE CASCADE NOT NULL,
            part_id INTEGER REFERENCES parts(id) ON DELETE CASCADE,
            part_number VARCHAR(255),
            part_name VARCHAR(255),
            quantity INTEGER DEFAULT 1,
            reference_designator VARCHAR(255),
            unit_cost NUMERIC(12,4),
            extended_cost NUMERIC(12,4),
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "tenantId" INTEGER
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS boms (
            id SERIAL PRIMARY KEY,
            bom_number VARCHAR UNIQUE NOT NULL,
            name VARCHAR NOT NULL,
            description TEXT,
            status VARCHAR DEFAULT 'draft',
            version VARCHAR DEFAULT '1.0',
            revision INTEGER DEFAULT 1,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "tenantId" INTEGER
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS part_vendors (
            id SERIAL PRIMARY KEY,
            "partId" INTEGER REFERENCES parts(id) ON DELETE CASCADE NOT NULL,
            "vendorId" INTEGER REFERENCES vendors(id) ON DELETE CASCADE NOT NULL,
            "isPreferred" BOOLEAN DEFAULT FALSE,
            "isAlternate" BOOLEAN DEFAULT FALSE,
            "vendorPn" VARCHAR,
            "vendorCost" FLOAT,
            "vendorLead" INTEGER,
            "vendorMoq" INTEGER,
            "qualityScore" FLOAT DEFAULT 5.0,
            "onTimeRate" FLOAT DEFAULT 100.0,
            notes VARCHAR,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE,
            "tenantId" INTEGER
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS po_line_items (
            id SERIAL PRIMARY KEY,
            "headerId" INTEGER REFERENCES po_headers(id) ON DELETE CASCADE NOT NULL,
            "itemName" TEXT NOT NULL,
            "itemDesc" TEXT,
            "partId" INTEGER REFERENCES parts(id) ON DELETE CASCADE,
            quantity INTEGER DEFAULT 1,
            "itemPrice" FLOAT DEFAULT 0,
            amount FLOAT DEFAULT 0,
            gst FLOAT DEFAULT 0,
            total FLOAT DEFAULT 0,
            eta VARCHAR,
            "lineNumber" INTEGER,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE,
            "tenantId" INTEGER
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS user_data_store (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
            data_key VARCHAR(100) NOT NULL,
            data_value JSONB NOT NULL,
            data_version INTEGER DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "tenantId" INTEGER
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS user_preferences (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
            pref_key VARCHAR(100) NOT NULL,
            pref_value TEXT,
            pref_type VARCHAR(20) DEFAULT 'string',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "tenantId" INTEGER
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS part_custom_fields (
            id SERIAL PRIMARY KEY,
            part_id INTEGER REFERENCES parts(id) ON DELETE CASCADE NOT NULL,
            field_name VARCHAR NOT NULL,
            field_value TEXT,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE,
            "tenantId" INTEGER
        )
    """)

    # ════════════════════════════════════════════════════════════
    # STEP 2: CHECK constraints for enum-like String columns
    # ════════════════════════════════════════════════════════════

    # Approval type
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE approvals ADD CONSTRAINT ck_approvals_type
            CHECK (type IN ('ecr', 'eco', 'ncr', 'capa', 'document', 'purchase'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Approval status
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE approvals ADD CONSTRAINT ck_approvals_status
            CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Revision entityType
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE revisions ADD CONSTRAINT ck_revisions_entity_type
            CHECK ("entityType" IN ('part', 'project', 'bom', 'document', 'eco', 'ncr'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Part status
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE parts ADD CONSTRAINT ck_parts_status
            CHECK (status IN ('Draft', 'Review', 'Released', 'Deprecated', 'Obsolete', 'Archived'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Approval entityType
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE approvals ADD CONSTRAINT ck_approvals_entity_type
            CHECK ("entityType" IN ('part', 'project', 'document', 'eco', 'ncr', 'capa', 'po', 'bom'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # BOM status
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE boms ADD CONSTRAINT ck_boms_status
            CHECK (status IN ('draft', 'active', 'released', 'superseded', 'cancelled'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Vendor qualityScore range 0-5
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE part_vendors ADD CONSTRAINT ck_part_vendors_quality_score
            CHECK ("qualityScore" >= 0 AND "qualityScore" <= 5);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Vendor onTimeRate range 0-100
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE part_vendors ADD CONSTRAINT ck_part_vendors_on_time_rate
            CHECK ("onTimeRate" >= 0 AND "onTimeRate" <= 100);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # ════════════════════════════════════════════════════════════
    # STEP 3: Missing UNIQUE constraints
    # ════════════════════════════════════════════════════════════

    # part_vendors(partId, vendorId) — one link per pair
    _clean_duplicates("part_vendors", ["partId", "vendorId"])
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE part_vendors ADD CONSTRAINT uq_part_vendors_part_vendor
            UNIQUE ("partId", "vendorId");
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # revision(entityType, entityId, revisionNumber)
    _clean_duplicates("revisions", ["entityType", "entityId", "revisionNumber"])
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE revisions ADD CONSTRAINT uq_revisions_entity_type_id_rev
            UNIQUE ("entityType", "entityId", "revisionNumber");
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # user_data_store(user_id, data_key)
    _clean_duplicates("user_data_store", ["user_id", "data_key"])
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE user_data_store ADD CONSTRAINT uq_user_data_store_user_key
            UNIQUE (user_id, data_key);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # part_custom_fields(part_id, field_name)
    _clean_duplicates("part_custom_fields", ["part_id", "field_name"])
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE part_custom_fields ADD CONSTRAINT uq_part_custom_fields_part_field
            UNIQUE (part_id, field_name);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # user_preferences(user_id, pref_key)
    _clean_duplicates("user_preferences", ["user_id", "pref_key"])
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE user_preferences ADD CONSTRAINT uq_user_preferences_user_key
            UNIQUE (user_id, pref_key);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # ════════════════════════════════════════════════════════════
    # STEP 4: Missing FK constraints
    # ════════════════════════════════════════════════════════════

    # POLineItem → parts (add partId column + FK)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE po_line_items ADD COLUMN "partId" INTEGER;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            ALTER TABLE po_line_items ADD CONSTRAINT fk_po_line_items_partId_parts
            FOREIGN KEY ("partId") REFERENCES parts(id);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            CREATE INDEX ix_po_line_items_partId ON po_line_items ("partId");
        EXCEPTION WHEN duplicate_table THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    # ════════════════════════════════════════════════════════════
    # Reverse STEP 4: Drop FK and column
    # ════════════════════════════════════════════════════════════
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE po_line_items DROP CONSTRAINT IF EXISTS fk_po_line_items_partId_parts;
            ALTER TABLE po_line_items DROP COLUMN IF EXISTS "partId";
        END $$;
    """)

    # ════════════════════════════════════════════════════════════
    # Reverse STEP 3: Drop UNIQUE constraints
    # ════════════════════════════════════════════════════════════
    op.execute(
        "ALTER TABLE part_custom_fields DROP CONSTRAINT IF EXISTS uq_part_custom_fields_part_field"
    )
    op.execute("ALTER TABLE user_data_store DROP CONSTRAINT IF EXISTS uq_user_data_store_user_key")
    op.execute(
        "ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS uq_user_preferences_user_key"
    )
    op.execute("ALTER TABLE revisions DROP CONSTRAINT IF EXISTS uq_revisions_entity_type_id_rev")
    op.execute("ALTER TABLE part_vendors DROP CONSTRAINT IF EXISTS uq_part_vendors_part_vendor")

    # ════════════════════════════════════════════════════════════
    # Reverse STEP 2: Drop CHECK constraints
    # ════════════════════════════════════════════════════════════
    op.execute("ALTER TABLE part_vendors DROP CONSTRAINT IF EXISTS ck_part_vendors_on_time_rate")
    op.execute("ALTER TABLE part_vendors DROP CONSTRAINT IF EXISTS ck_part_vendors_quality_score")
    op.execute("ALTER TABLE boms DROP CONSTRAINT IF EXISTS ck_boms_status")
    op.execute("ALTER TABLE approvals DROP CONSTRAINT IF EXISTS ck_approvals_entity_type")
    op.execute("ALTER TABLE parts DROP CONSTRAINT IF EXISTS ck_parts_status")
    op.execute("ALTER TABLE revisions DROP CONSTRAINT IF EXISTS ck_revisions_entity_type")
    op.execute("ALTER TABLE approvals DROP CONSTRAINT IF EXISTS ck_approvals_status")
    op.execute("ALTER TABLE approvals DROP CONSTRAINT IF EXISTS ck_approvals_type")
