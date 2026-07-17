"""Enterprise audit fixes — add missing tables, FKs, indexes, and constraints.

Fixes identified during Phase 4/5 enterprise audit:
1. Create missing boms / bom_items_master tables (only existed via create_all)
2. Add missing FK constraints on documents (partId, projectId)
3. Add missing columns on documents (isPublic, purchaseOrderId, replacesDocumentId)
4. Fix audit_logs column mismatches (add userEmail, rename ipAddress→userIp)
5. Add FK constraint on audit_logs.userId
6. Add 30+ missing indexes on FK columns
7. Add 15+ missing unique constraints
8. Add FK on exchange_rates.from_currency/to_currency

Revision ID: 013_enterprise_audit_fixes
Revises: 012_data_normalization_and_search
Create Date: 2026-06-16
"""

import sqlalchemy as sa

from alembic import op

revision = "013_enterprise_audit_fixes"
down_revision = "012_data_normalization_and_search"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ════════════════════════════════════════════════════════════════
    # 1. Create boms table (was only created via create_all)
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE IF NOT EXISTS boms (
            id SERIAL PRIMARY KEY,
            bom_number VARCHAR NOT NULL UNIQUE,
            name VARCHAR NOT NULL,
            description TEXT,
            status VARCHAR DEFAULT 'draft',
            version VARCHAR DEFAULT '1.0',
            revision INTEGER DEFAULT 1,
            project_id INTEGER REFERENCES projects(id),
            created_by INTEGER REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.create_index("idx_boms_bom_number", "boms", ["bom_number"], unique=True)
    op.create_index("idx_boms_project", "boms", ["project_id"])
    op.create_index("idx_boms_status", "boms", ["status"])
    op.create_index("idx_boms_created", "boms", [sa.text("created_at DESC")])

    # ════════════════════════════════════════════════════════════════
    # 2. Create bom_items_master table (was only created via create_all)
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE IF NOT EXISTS bom_items_master (
            id SERIAL PRIMARY KEY,
            bom_id INTEGER NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
            part_id INTEGER REFERENCES parts(id),
            quantity INTEGER DEFAULT 1,
            unit VARCHAR DEFAULT 'EA',
            reference_designator VARCHAR,
            sort_order INTEGER DEFAULT 0,
            parent_item_id INTEGER REFERENCES bom_items_master(id),
            unit_cost_snapshot NUMERIC(10,4),
            extended_cost NUMERIC(10,4),
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.create_index("idx_bom_items_master_bom", "bom_items_master", ["bom_id"])
    op.create_index("idx_bom_items_master_part", "bom_items_master", ["part_id"])
    op.create_index("idx_bom_items_master_parent", "bom_items_master", ["parent_item_id"])
    op.create_index(
        "idx_bom_items_master_bom_part",
        "bom_items_master",
        ["bom_id", "part_id"],
    )

    # ════════════════════════════════════════════════════════════════
    # 3. Fix documents table — add missing columns and FK constraints
    # ════════════════════════════════════════════════════════════════
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS isPublic BOOLEAN DEFAULT FALSE")
    op.execute(
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS purchaseOrderId INTEGER REFERENCES purchase_orders(id)"
    )
    op.execute(
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS replacesDocumentId INTEGER REFERENCES documents(id)"
    )
    # Add FK constraints on existing plain Integer columns
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_documents_part'
                AND table_name = 'documents'
            ) THEN
                ALTER TABLE documents ADD CONSTRAINT fk_documents_part
                    FOREIGN KEY ("partId") REFERENCES parts(id);
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_documents_project'
                AND table_name = 'documents'
            ) THEN
                ALTER TABLE documents ADD CONSTRAINT fk_documents_project
                    FOREIGN KEY ("projectId") REFERENCES projects(id);
            END IF;
        END $$;
    """)
    op.create_index("idx_documents_part", "documents", ["partId"])
    op.create_index("idx_documents_project", "documents", ["projectId"])
    op.create_index("idx_documents_purchase_order", "documents", ["purchaseOrderId"])
    op.create_index("idx_documents_replaces", "documents", ["replacesDocumentId"])
    op.create_index("idx_documents_category", "documents", ["category"])
    op.create_index("idx_documents_latest", "documents", ["isLatest", sa.text("createdAt DESC")])

    # ════════════════════════════════════════════════════════════════
    # 4. Fix audit_logs table — add missing columns, rename ipAddress→userIp
    # ════════════════════════════════════════════════════════════════
    # Add userEmail column
    op.execute('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "userEmail" VARCHAR')
    # If ipAddress exists but userIp does not, rename ipAddress → userIp
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'audit_logs' AND column_name = 'ipAddress'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'audit_logs' AND column_name = 'userIp'
            ) THEN
                ALTER TABLE audit_logs RENAME COLUMN "ipAddress" TO "userIp";
            END IF;
        END $$;
    """)
    # If neither exists, add userIp
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'audit_logs' AND column_name = 'userIp'
            ) THEN
                ALTER TABLE audit_logs ADD COLUMN "userIp" VARCHAR;
            END IF;
        END $$;
    """)
    # Add FK constraint on userId
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_audit_logs_user'
                AND table_name = 'audit_logs'
            ) THEN
                ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_user
                    FOREIGN KEY ("userId") REFERENCES users(id);
            END IF;
        END $$;
    """)
    op.create_index("idx_audit_logs_user", "audit_logs", ["userId"])
    op.create_index("idx_audit_logs_entity", "audit_logs", ["entityType", "entityId"])
    op.create_index("idx_audit_logs_action", "audit_logs", ["action", sa.text('"createdAt" DESC')])

    # ════════════════════════════════════════════════════════════════
    # 5. Missing indexes on inventory tables
    # ════════════════════════════════════════════════════════════════
    op.execute("CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_inventory_bin ON inventory(bin_location_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_inventory_part ON inventory(part_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_inventory_warehouse_part "
        "ON inventory(warehouse_id, part_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_inventory_transactions_inventory "
        "ON inventory_transactions(inventory_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type "
        "ON inventory_transactions(transaction_type, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_inventory_reservations_inventory "
        "ON inventory_reservations(inventory_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_bin_locations_warehouse ON bin_locations(warehouse_id)"
    )

    # ════════════════════════════════════════════════════════════════
    # 6. Missing indexes on ECO tables
    # ════════════════════════════════════════════════════════════════
    op.execute("CREATE INDEX IF NOT EXISTS idx_eco_items_eco ON eco_items(eco_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_eco_items_part ON eco_items(part_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_eco_items_bom ON eco_items(bom_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_eco_approvals_eco ON eco_approvals(eco_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_eco_approvals_approver ON eco_approvals(approver_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_eco_notifications_eco ON eco_notifications(eco_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_eco_notifications_user ON eco_notifications(user_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_eco_headers_status ON eco_headers(status)")

    # ════════════════════════════════════════════════════════════════
    # 7. Missing indexes on quality tables
    # ════════════════════════════════════════════════════════════════
    op.execute("CREATE INDEX IF NOT EXISTS idx_inspection_plans_part ON inspection_plans(part_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_inspection_records_plan "
        "ON inspection_records(inspection_plan_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_ncr_reports_part ON ncr_reports(part_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_ncr_reports_status ON ncr_reports(status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_capa_actions_capa ON capa_actions(capa_id)")

    # ════════════════════════════════════════════════════════════════
    # 8. Missing indexes on work_orders, contracts, routing
    # ════════════════════════════════════════════════════════════════
    op.execute("CREATE INDEX IF NOT EXISTS idx_work_orders_mbom ON work_orders(mbom_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_work_order_operations_wo "
        "ON work_order_operations(work_order_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_work_order_materials_wo "
        "ON work_order_materials(work_order_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_contracts_vendor ON contracts(vendor_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_routing_tables_status ON routing_tables(status)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_routing_operations_routing "
        "ON routing_operations(routing_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_process_plans_status ON process_plans(status)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_process_plan_steps_plan "
        "ON process_plan_steps(process_plan_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_mbom_headers_ebom ON mbom_headers(ebom_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mbom_items_mbom ON mbom_items(mbom_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mbom_operations_mbom ON mbom_operations(mbom_id)")

    # ════════════════════════════════════════════════════════════════
    # 9. Missing unique constraints
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'uq_eco_approvals_eco_approver'
                AND table_name = 'eco_approvals'
            ) THEN
                ALTER TABLE eco_approvals
                    ADD CONSTRAINT uq_eco_approvals_eco_approver
                    UNIQUE (eco_id, approver_id);
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'uq_routing_operations_routing_opnum'
                AND table_name = 'routing_operations'
            ) THEN
                ALTER TABLE routing_operations
                    ADD CONSTRAINT uq_routing_operations_routing_opnum
                    UNIQUE (routing_id, operation_number);
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'uq_mbom_operations_mbom_opnum'
                AND table_name = 'mbom_operations'
            ) THEN
                ALTER TABLE mbom_operations
                    ADD CONSTRAINT uq_mbom_operations_mbom_opnum
                    UNIQUE (mbom_id, operation_number);
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'uq_supplier_scorecards_vendor_period'
                AND table_name = 'supplier_scorecards'
            ) THEN
                ALTER TABLE supplier_scorecards
                    ADD CONSTRAINT uq_supplier_scorecards_vendor_period
                    UNIQUE ("vendorId", period);
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'uq_currencies_code'
                AND table_name = 'currencies'
            ) THEN
                ALTER TABLE currencies ADD CONSTRAINT uq_currencies_code UNIQUE (code);
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'uq_auto_number_schemes_entity'
                AND table_name = 'auto_number_schemes'
            ) THEN
                ALTER TABLE auto_number_schemes
                    ADD CONSTRAINT uq_auto_number_schemes_entity
                    UNIQUE (entity_type);
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'uq_custom_attr_defs_entity_name'
                AND table_name = 'custom_attribute_definitions'
            ) THEN
                ALTER TABLE custom_attribute_definitions
                    ADD CONSTRAINT uq_custom_attr_defs_entity_name
                    UNIQUE (entity_type, attribute_name);
            END IF;
        END $$;
    """)

    # ════════════════════════════════════════════════════════════════
    # 10. Add FK on exchange_rates.from_currency / to_currency
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_exchange_rates_from_currency'
                AND table_name = 'exchange_rates'
            ) THEN
                ALTER TABLE exchange_rates
                    ADD CONSTRAINT fk_exchange_rates_from_currency
                    FOREIGN KEY (from_currency) REFERENCES currencies(code);
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_exchange_rates_to_currency'
                AND table_name = 'exchange_rates'
            ) THEN
                ALTER TABLE exchange_rates
                    ADD CONSTRAINT fk_exchange_rates_to_currency
                    FOREIGN KEY (to_currency) REFERENCES currencies(code);
            END IF;
        END $$;
    """)
    op.create_index("idx_exchange_rates_from_currency", "exchange_rates", ["from_currency"])
    op.create_index("idx_exchange_rates_to_currency", "exchange_rates", ["to_currency"])
    op.create_index(
        "idx_exchange_rates_effective",
        "exchange_rates",
        ["from_currency", "to_currency", sa.text("effective_date DESC")],
    )

    # ════════════════════════════════════════════════════════════════
    # 11. Add indexes on resource scheduling tables
    # ════════════════════════════════════════════════════════════════
    op.execute("CREATE INDEX IF NOT EXISTS idx_work_centers_status ON work_centers(status)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_resource_schedules_center "
        "ON resource_schedules(work_center_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_resource_schedules_date "
        "ON resource_schedules(scheduled_date)"
    )

    # ════════════════════════════════════════════════════════════════
    # 12. Add indexes on supplier portal
    # ════════════════════════════════════════════════════════════════
    op.execute('CREATE INDEX IF NOT EXISTS idx_supplier_users_vendor ON supplier_users("vendorId")')
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_supplier_price_updates_supplier "
        'ON supplier_price_updates("supplierUserId")'
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_supplier_price_updates_part "
        'ON supplier_price_updates("partId")'
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_supplier_price_updates_status "
        "ON supplier_price_updates(status)"
    )

    # ════════════════════════════════════════════════════════════════
    # 13. Add indexes on traceability tables
    # ════════════════════════════════════════════════════════════════
    op.execute('CREATE INDEX IF NOT EXISTS idx_serial_numbers_part ON serial_numbers("partId")')
    op.execute('CREATE INDEX IF NOT EXISTS idx_serial_numbers_po ON serial_numbers("poId")')
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_serial_numbers_lot ON serial_numbers("lotBatchNumber")'
    )
    op.execute('CREATE INDEX IF NOT EXISTS idx_lot_batches_part ON lot_batches("partId")')
    op.execute('CREATE INDEX IF NOT EXISTS idx_lot_batches_po ON lot_batches("poId")')

    # ════════════════════════════════════════════════════════════════
    # 14. Add indexes on compliance / quality extended tables
    # ════════════════════════════════════════════════════════════════
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_compliance_certificates_part "
        "ON compliance_certificates(part_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_compliance_certificates_type "
        "ON compliance_certificates(compliance_type)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_compliance_certificates_status "
        "ON compliance_certificates(status)"
    )


def downgrade() -> None:
    # This is a comprehensive fix migration; downgrade removes what was added.
    # ── Unique constraints ──
    op.execute("ALTER TABLE eco_approvals DROP CONSTRAINT IF EXISTS uq_eco_approvals_eco_approver")
    op.execute(
        "ALTER TABLE routing_operations DROP CONSTRAINT IF EXISTS uq_routing_operations_routing_opnum"
    )
    op.execute(
        "ALTER TABLE mbom_operations DROP CONSTRAINT IF EXISTS uq_mbom_operations_mbom_opnum"
    )
    op.execute(
        "ALTER TABLE supplier_scorecards DROP CONSTRAINT IF EXISTS uq_supplier_scorecards_vendor_period"
    )
    op.execute("ALTER TABLE currencies DROP CONSTRAINT IF EXISTS uq_currencies_code")
    op.execute(
        "ALTER TABLE auto_number_schemes DROP CONSTRAINT IF EXISTS uq_auto_number_schemes_entity"
    )
    op.execute(
        "ALTER TABLE custom_attribute_definitions DROP CONSTRAINT IF EXISTS uq_custom_attr_defs_entity_name"
    )

    # ── FK constraints ──
    op.execute(
        "ALTER TABLE exchange_rates DROP CONSTRAINT IF EXISTS fk_exchange_rates_from_currency"
    )
    op.execute("ALTER TABLE exchange_rates DROP CONSTRAINT IF EXISTS fk_exchange_rates_to_currency")
    op.execute("ALTER TABLE documents DROP CONSTRAINT IF EXISTS fk_documents_part")
    op.execute("ALTER TABLE documents DROP CONSTRAINT IF EXISTS fk_documents_project")
    op.execute("ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS fk_audit_logs_user")

    # ── Indexes ──
    _drop_indexes = [
        "idx_boms_bom_number",
        "idx_boms_project",
        "idx_boms_status",
        "idx_boms_created",
        "idx_bom_items_master_bom",
        "idx_bom_items_master_part",
        "idx_bom_items_master_parent",
        "idx_bom_items_master_bom_part",
        "idx_documents_part",
        "idx_documents_project",
        "idx_documents_purchase_order",
        "idx_documents_replaces",
        "idx_documents_category",
        "idx_documents_latest",
        "idx_audit_logs_user",
        "idx_audit_logs_entity",
        "idx_audit_logs_action",
        "idx_inventory_warehouse",
        "idx_inventory_bin",
        "idx_inventory_part",
        "idx_inventory_status",
        "idx_inventory_warehouse_part",
        "idx_inventory_transactions_inventory",
        "idx_inventory_transactions_type",
        "idx_inventory_reservations_inventory",
        "idx_bin_locations_warehouse",
        "idx_eco_items_eco",
        "idx_eco_items_part",
        "idx_eco_items_bom",
        "idx_eco_approvals_eco",
        "idx_eco_approvals_approver",
        "idx_eco_notifications_eco",
        "idx_eco_notifications_user",
        "idx_eco_headers_status",
        "idx_inspection_plans_part",
        "idx_inspection_records_plan",
        "idx_ncr_reports_part",
        "idx_ncr_reports_status",
        "idx_capa_actions_capa",
        "idx_work_orders_mbom",
        "idx_work_order_operations_wo",
        "idx_work_order_materials_wo",
        "idx_contracts_vendor",
        "idx_routing_tables_status",
        "idx_routing_operations_routing",
        "idx_process_plans_status",
        "idx_process_plan_steps_plan",
        "idx_mbom_headers_ebom",
        "idx_mbom_items_mbom",
        "idx_mbom_operations_mbom",
        "idx_exchange_rates_from_currency",
        "idx_exchange_rates_to_currency",
        "idx_exchange_rates_effective",
        "idx_work_centers_status",
        "idx_resource_schedules_center",
        "idx_resource_schedules_date",
        "idx_supplier_users_vendor",
        "idx_supplier_price_updates_supplier",
        "idx_supplier_price_updates_part",
        "idx_supplier_price_updates_status",
        "idx_serial_numbers_part",
        "idx_serial_numbers_po",
        "idx_serial_numbers_lot",
        "idx_lot_batches_part",
        "idx_lot_batches_po",
        "idx_compliance_certificates_part",
        "idx_compliance_certificates_type",
        "idx_compliance_certificates_status",
    ]
    for idx in _drop_indexes:
        op.execute(f"DROP INDEX IF EXISTS {idx}")

    # ── Columns ──
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS isPublic")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS purchaseOrderId")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS replacesDocumentId")
    op.execute('ALTER TABLE audit_logs DROP COLUMN IF EXISTS "userEmail"')
    # Don't drop userIp as it may have replaced ipAddress — leave it

    # ── Tables (only drop if they didn't exist before) ──
    op.execute("DROP TABLE IF EXISTS bom_items_master CASCADE")
    op.execute("DROP TABLE IF EXISTS boms CASCADE")
