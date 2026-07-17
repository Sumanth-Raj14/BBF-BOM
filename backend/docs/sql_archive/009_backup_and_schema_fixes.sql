-- Migration 009: Backup system + Schema fixes + Performance indexes
-- Addresses: backup_history table, po_headers vendor FK, missing indexes, document storage tracking

-- =====================================================
-- 1. BACKUP HISTORY TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS backup_history (
    id SERIAL PRIMARY KEY,
    backup_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    size_bytes BIGINT,
    storage_path TEXT,
    storage_type VARCHAR(20) DEFAULT 'local',
    error_message TEXT,
    verified_at TIMESTAMP,
    verification_status VARCHAR(20),
    retention_tier VARCHAR(20),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_backup_history_started_at ON backup_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_history_status ON backup_history(status);
CREATE INDEX IF NOT EXISTS idx_backup_history_retention ON backup_history(retention_tier, started_at);

-- =====================================================
-- 2. FIX PO_HEADERS VENDOR FK (Critical Data Integrity)
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'vendor_id') THEN
        ALTER TABLE po_headers ADD COLUMN vendor_id INTEGER;
    END IF;
END $$;

UPDATE po_headers ph
SET vendor_id = v.id
FROM vendors v
WHERE ph.vendor_id IS NULL
  AND ph."vendorName" = v.name;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_po_headers_vendor') THEN
        ALTER TABLE po_headers ADD CONSTRAINT fk_po_headers_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_po_headers_vendor_id ON po_headers(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_headers_vendor_name ON po_headers("vendorName");
CREATE INDEX IF NOT EXISTS idx_po_headers_po_date ON po_headers("poDate");

-- =====================================================
-- 3. DOCUMENT STORAGE TRACKING
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'storage_type') THEN
        ALTER TABLE documents ADD COLUMN storage_type VARCHAR(20) DEFAULT 's3';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'local_fallback_path') THEN
        ALTER TABLE documents ADD COLUMN local_fallback_path TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'checksum') THEN
        ALTER TABLE documents ADD COLUMN checksum VARCHAR(64);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_partid_latest ON documents("partId") WHERE "isLatest" = true;
CREATE INDEX IF NOT EXISTS idx_documents_projectid_latest ON documents("projectId") WHERE "isLatest" = true;
CREATE INDEX IF NOT EXISTS idx_documents_category_latest ON documents(category) WHERE "isLatest" = true;
CREATE INDEX IF NOT EXISTS idx_documents_storage_type ON documents(storage_type);

-- =====================================================
-- 4. PERFORMANCE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_parts_status_category ON parts(status, category);
CREATE INDEX IF NOT EXISTS idx_parts_vendor_category ON parts(vendor, category);
CREATE INDEX IF NOT EXISTS idx_bom_items_master_bom_sort ON bom_items_master(bom_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_inventory_avail ON inventory(part_id, warehouse_id, quantity_available);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_performed_at ON inventory_transactions(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_part_warehouse ON inventory_transactions(part_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status_due ON work_orders(status, due_date);
CREATE INDEX IF NOT EXISTS idx_eco_headers_status_requested ON eco_headers(status, requested_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs("entityType", "entityId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_queue_user_read ON notifications_queue("userId", "is_read", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);

-- =====================================================
-- 5. AUDIT LOG IMPROVEMENTS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs("userId", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- =====================================================
-- 6. VENDOR-PART RELATIONSHIP CONSOLIDATION PREP
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parts' AND column_name = 'primary_vendor_id') THEN
        ALTER TABLE parts ADD COLUMN primary_vendor_id INTEGER REFERENCES vendors(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_parts_primary_vendor ON parts(primary_vendor_id);

-- =====================================================
-- 7. CLEANUP: Mark legacy purchase_orders for deprecation
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'migrated_to_po_headers') THEN
        ALTER TABLE purchase_orders ADD COLUMN migrated_to_po_headers BOOLEAN DEFAULT FALSE;
        ALTER TABLE purchase_orders ADD COLUMN po_header_id INTEGER REFERENCES po_headers(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_migrated ON purchase_orders(migrated_to_po_headers);