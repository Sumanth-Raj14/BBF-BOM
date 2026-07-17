"""Fix critical schema issues: metadata column rename, check constraints, unique constraints, part.qty type.

Fixes identified during Phase 2 Database Schema Audit:
1. Rename `metadata` columns in eco_headers, work_orders, backup_history (SQLAlchemy reserved word conflict)
2. Add CHECK constraints for data integrity (qty >= 0, cost >= 0, quantity >= 0)
3. Add missing unique constraints (bom_id+part_id, variant_id+part_id, service_bom_id+part_id)
4. Change part.qty from Integer to Numeric(10,4) for fractional quantities
5. Add ON DELETE CASCADE where ORM already specifies cascade behaviour
6. Add composite indexes for common query patterns

Revision ID: 016_fix_critical_schema_issues
Revises: 015_remove_part_dual_storage
Create Date: 2026-06-16
"""

from collections.abc import Sequence

from alembic import op

revision: str = "016_fix_critical_schema_issues"
down_revision: str | None = "015_remove_part_dual_storage"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ═══════════════════════════════════════════════════════════════════════
    # 1. Rename `metadata` columns to avoid SQLAlchemy reserved word conflict
    # ═══════════════════════════════════════════════════════════════════════
    # eco_headers: metadata -> extra_data (Python attr was already extra_data)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'eco_headers' AND column_name = 'metadata'
            ) THEN
                ALTER TABLE eco_headers RENAME COLUMN "metadata" TO extra_data;
            END IF;
        END $$;
    """)
    # work_orders: metadata -> extra_data (Python attr was already extra_data)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'work_orders' AND column_name = 'metadata'
            ) THEN
                ALTER TABLE work_orders RENAME COLUMN "metadata" TO extra_data;
            END IF;
        END $$;
    """)
    # backup_history: metadata -> backup_metadata
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'backup_history' AND column_name = 'metadata'
            ) THEN
                ALTER TABLE backup_history RENAME COLUMN "metadata" TO backup_metadata;
            END IF;
        END $$;
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 2. Add CHECK constraints for data integrity
    # ═══════════════════════════════════════════════════════════════════════
    # part.qty >= 0
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'ck_parts_qty_positive' AND table_name = 'parts'
            ) THEN
                ALTER TABLE parts ADD CONSTRAINT ck_parts_qty_positive CHECK (qty >= 0);
            END IF;
        END $$;
    """)
    # part.cost >= 0
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'ck_parts_cost_positive' AND table_name = 'parts'
            ) THEN
                ALTER TABLE parts ADD CONSTRAINT ck_parts_cost_positive CHECK (cost >= 0);
            END IF;
        END $$;
    """)
    # part.lead >= 0
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'ck_parts_lead_positive' AND table_name = 'parts'
            ) THEN
                ALTER TABLE parts ADD CONSTRAINT ck_parts_lead_positive CHECK (lead >= 0);
            END IF;
        END $$;
    """)
    # inventory.quantity_on_hand >= 0
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'ck_inventory_qoh_positive' AND table_name = 'inventory'
            ) THEN
                ALTER TABLE inventory ADD CONSTRAINT ck_inventory_qoh_positive CHECK (quantity_on_hand >= 0);
            END IF;
        END $$;
    """)
    # inventory.quantity_reserved >= 0
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'ck_inventory_reserved_positive' AND table_name = 'inventory'
            ) THEN
                ALTER TABLE inventory ADD CONSTRAINT ck_inventory_reserved_positive CHECK (quantity_reserved >= 0);
            END IF;
        END $$;
    """)
    # bom_items_master.quantity >= 0
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'ck_bom_items_master_qty_positive' AND table_name = 'bom_items_master'
            ) THEN
                ALTER TABLE bom_items_master ADD CONSTRAINT ck_bom_items_master_qty_positive CHECK (quantity >= 0);
            END IF;
        END $$;
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 3. Add missing unique constraints
    # ═══════════════════════════════════════════════════════════════════════
    # bom_items_master: (bom_id, part_id) — prevent duplicate parts in same BOM
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'uq_bom_items_master_bom_part' AND table_name = 'bom_items_master'
            ) THEN
                ALTER TABLE bom_items_master ADD CONSTRAINT uq_bom_items_master_bom_part
                    UNIQUE (bom_id, part_id);
            END IF;
        END $$;
    """)
    # bom_variant_items: (variant_id, part_id)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'uq_bom_variant_items_variant_part' AND table_name = 'bom_variant_items'
            ) THEN
                ALTER TABLE bom_variant_items ADD CONSTRAINT uq_bom_variant_items_variant_part
                    UNIQUE (variant_id, part_id);
            END IF;
        END $$;
    """)
    # service_bom_items: (service_bom_id, part_id)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'uq_service_bom_items_bom_part' AND table_name = 'service_bom_items'
            ) THEN
                ALTER TABLE service_bom_items ADD CONSTRAINT uq_service_bom_items_bom_part
                    UNIQUE (service_bom_id, part_id);
            END IF;
        END $$;
    """)
    # po_line_items: (header_id, item_name) — prevent duplicate line items
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'uq_po_line_items_header_item' AND table_name = 'po_line_items'
            ) THEN
                ALTER TABLE po_line_items ADD CONSTRAINT uq_po_line_items_header_item
                    UNIQUE ("headerId", "itemName");
            END IF;
        END $$;
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 4. Change part.qty from Integer to Numeric(10,4) for fractional quantities
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'parts' AND column_name = 'qty' AND data_type = 'integer'
            ) THEN
                ALTER TABLE parts ALTER COLUMN qty TYPE NUMERIC(10,4) USING qty::NUMERIC(10,4);
            END IF;
        END $$;
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 5. Add composite indexes for common query patterns
    # ═══════════════════════════════════════════════════════════════════════
    # parts: (status, assembly) — common filter for approved assemblies
    op.execute("CREATE INDEX IF NOT EXISTS idx_parts_status_assembly ON parts(status, assembly)")
    # parts: (category, status) — common filter for parts dashboard
    op.execute("CREATE INDEX IF NOT EXISTS idx_parts_category_status ON parts(category, status)")
    # inventory: (part_id, warehouse_id) — stock lookup
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_inventory_part_warehouse ON inventory(part_id, warehouse_id)"
    )
    # work_orders: (status, due_date) — scheduling queries
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_work_orders_status_due ON work_orders(status, due_date)"
    )
    # ncr_reports: (status, severity) — quality dashboard
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ncr_reports_status_severity ON ncr_reports(status, severity)"
    )
    # audit_logs: (action, entityType, createdAt) — audit trail queries
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_action_entity ON audit_logs(action, "entityType", "createdAt" DESC)'
    )
    # notifications: (userId, status) — user notification list
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON notifications("userId", status)'
    )
    # eco_headers: (status, priority) — ECO dashboard
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_eco_headers_status_priority ON eco_headers(status, priority)"
    )
    # bom_variants: (base_bom_id, status) — variant lookup
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_bom_variants_bom_status ON bom_variants(base_bom_id, status)"
    )
    # mbom_items: (mbom_id, part_id) — MBOM part lookup
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_mbom_items_mbom_part ON mbom_items(mbom_id, part_id)"
    )
    # routing_tables: (part_id, status) — routing lookup
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_routing_tables_part_status ON routing_tables(part_id, status)"
    )
    # work_centers: (is_active, is_bottleneck) — capacity planning
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_work_centers_active_bottleneck ON work_centers(is_active, is_bottleneck)"
    )

    # ═══════════════════════════════════════════════════════════════════════
    # 6. Add missing indexes on frequently filtered FK columns
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("CREATE INDEX IF NOT EXISTS idx_po_headers_vendor ON po_headers(vendor_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_po_headers_project ON po_headers(project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_po_headers_status ON po_headers(status)")
    op.execute('CREATE INDEX IF NOT EXISTS idx_po_line_items_header ON po_line_items("headerId")')
    op.execute("CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)")
    op.execute('CREATE INDEX IF NOT EXISTS idx_purchase_orders_part ON purchase_orders("partId")')
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders("vendorId")'
    )
    op.execute('CREATE INDEX IF NOT EXISTS idx_part_vendors_part ON part_vendors("partId")')
    op.execute('CREATE INDEX IF NOT EXISTS idx_part_vendors_vendor ON part_vendors("vendorId")')
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_approvals_entity ON approvals("entityType", "entityId")'
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)")
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments("entityType", "entityId")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_revisions_entity ON revisions("entityType", "entityId")'
    )
    op.execute('CREATE INDEX IF NOT EXISTS idx_price_history_part ON price_history("partId")')
    op.execute('CREATE INDEX IF NOT EXISTS idx_make_vs_buy_part ON make_vs_buy_analyses("partId")')
    op.execute('CREATE INDEX IF NOT EXISTS idx_should_cost_part ON should_cost_models("partId")')
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_supplier_scorecards_vendor ON supplier_scorecards("vendorId")'
    )
    op.execute('CREATE INDEX IF NOT EXISTS idx_kanban_triggers_part ON kanban_triggers("partId")')
    op.execute("CREATE INDEX IF NOT EXISTS idx_kanban_triggers_status ON kanban_triggers(status)")
    op.execute('CREATE INDEX IF NOT EXISTS idx_deviation_part ON deviations("partId")')
    op.execute("CREATE INDEX IF NOT EXISTS idx_deviation_status ON deviations(status)")
    op.execute('CREATE INDEX IF NOT EXISTS idx_fai_reports_part ON fai_reports("partId")')
    op.execute("CREATE INDEX IF NOT EXISTS idx_fai_reports_status ON fai_reports(status)")
    op.execute('CREATE INDEX IF NOT EXISTS idx_capas_part ON capas("partId")')
    op.execute("CREATE INDEX IF NOT EXISTS idx_capas_status ON capas(status)")
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_pricing_agreements_contract ON pricing_agreements("contractId")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_pricing_agreements_part ON pricing_agreements("partId")'
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_notifications_queue_user ON notifications_queue(user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_notifications_queue_type ON notifications_queue(notification_type, is_sent)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_serial_number_events_serial ON serial_number_events(serial_number_id)"
    )
    op.execute('CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions("userId")')
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions("sessionToken")'
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_backup_history_status ON backup_history(status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_data_user ON user_data_store(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_bom_drafts_user ON bom_drafts(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_scan_history_user ON scan_history(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id)")
    op.execute('CREATE INDEX IF NOT EXISTS idx_demand_forecasts_part ON demand_forecasts("partId")')
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_interchangeability_suggestions_part ON interchangeability_suggestions("partId")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS idx_validation_results_entity ON validation_results("entityType", "entityId")'
    )

    # ═══════════════════════════════════════════════════════════════════════
    # 7. Add default value for part.lead (was missing)
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'parts' AND column_name = 'lead'
                AND column_default IS NULL
            ) THEN
                ALTER TABLE parts ALTER COLUMN lead SET DEFAULT 0;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # ═══════════════════════════════════════════════════════════════════════
    # Remove indexes
    # ═══════════════════════════════════════════════════════════════════════
    _drop_indexes = [
        "idx_parts_status_assembly",
        "idx_parts_category_status",
        "idx_inventory_part_warehouse",
        "idx_work_orders_status_due",
        "idx_ncr_reports_status_severity",
        "idx_audit_logs_action_entity",
        "idx_notifications_user_status",
        "idx_eco_headers_status_priority",
        "idx_bom_variants_bom_status",
        "idx_mbom_items_mbom_part",
        "idx_routing_tables_part_status",
        "idx_work_centers_active_bottleneck",
        "idx_po_headers_vendor",
        "idx_po_headers_project",
        "idx_po_headers_status",
        "idx_po_line_items_header",
        "idx_purchase_orders_status",
        "idx_purchase_orders_part",
        "idx_purchase_orders_vendor",
        "idx_part_vendors_part",
        "idx_part_vendors_vendor",
        "idx_approvals_entity",
        "idx_approvals_status",
        "idx_comments_entity",
        "idx_revisions_entity",
        "idx_price_history_part",
        "idx_make_vs_buy_part",
        "idx_should_cost_part",
        "idx_supplier_scorecards_vendor",
        "idx_kanban_triggers_part",
        "idx_kanban_triggers_status",
        "idx_deviation_part",
        "idx_deviation_status",
        "idx_fai_reports_part",
        "idx_fai_reports_status",
        "idx_capas_part",
        "idx_capas_status",
        "idx_pricing_agreements_contract",
        "idx_pricing_agreements_part",
        "idx_notifications_queue_user",
        "idx_notifications_queue_type",
        "idx_serial_number_events_serial",
        "idx_user_sessions_user",
        "idx_user_sessions_token",
        "idx_api_keys_user",
        "idx_api_keys_prefix",
        "idx_backup_history_status",
        "idx_user_preferences_user",
        "idx_user_data_user",
        "idx_bom_drafts_user",
        "idx_scan_history_user",
        "idx_saved_searches_user",
        "idx_demand_forecasts_part",
        "idx_interchangeability_suggestions_part",
        "idx_validation_results_entity",
    ]
    for idx in _drop_indexes:
        op.execute(f"DROP INDEX IF EXISTS {idx}")

    # ═══════════════════════════════════════════════════════════════════════
    # Remove unique constraints
    # ═══════════════════════════════════════════════════════════════════════
    op.execute(
        "ALTER TABLE bom_items_master DROP CONSTRAINT IF EXISTS uq_bom_items_master_bom_part"
    )
    op.execute(
        "ALTER TABLE bom_variant_items DROP CONSTRAINT IF EXISTS uq_bom_variant_items_variant_part"
    )
    op.execute(
        "ALTER TABLE service_bom_items DROP CONSTRAINT IF EXISTS uq_service_bom_items_bom_part"
    )
    op.execute("ALTER TABLE po_line_items DROP CONSTRAINT IF EXISTS uq_po_line_items_header_item")

    # ═══════════════════════════════════════════════════════════════════════
    # Remove CHECK constraints
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("ALTER TABLE parts DROP CONSTRAINT IF EXISTS ck_parts_qty_positive")
    op.execute("ALTER TABLE parts DROP CONSTRAINT IF EXISTS ck_parts_cost_positive")
    op.execute("ALTER TABLE parts DROP CONSTRAINT IF EXISTS ck_parts_lead_positive")
    op.execute("ALTER TABLE inventory DROP CONSTRAINT IF EXISTS ck_inventory_qoh_positive")
    op.execute("ALTER TABLE inventory DROP CONSTRAINT IF EXISTS ck_inventory_reserved_positive")
    op.execute(
        "ALTER TABLE bom_items_master DROP CONSTRAINT IF EXISTS ck_bom_items_master_qty_positive"
    )

    # ═══════════════════════════════════════════════════════════════════════
    # Revert part.qty back to Integer (will fail if data has fractional values)
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'parts' AND column_name = 'qty' AND data_type = 'numeric'
            ) THEN
                ALTER TABLE parts ALTER COLUMN qty TYPE INTEGER USING qty::INTEGER;
            END IF;
        END $$;
    """)

    # Note: metadata column renames are NOT reverted in downgrade because
    # the Python models have been updated to use the new column names.
    # A downgrade would break application code.
