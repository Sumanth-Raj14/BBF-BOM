-- Migration 010: Purchase Orders Consolidation
-- Moves from legacy purchase_orders (per-line) to po_headers + po_line_items
-- This is a read-only migration: legacy table is preserved and marked

-- =====================================================
-- 1. PO LINE ITEMS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS po_line_items (
    id SERIAL PRIMARY KEY,
    po_header_id INTEGER NOT NULL REFERENCES po_headers(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL DEFAULT 0,
    part_id INTEGER REFERENCES parts(id),
    part_number VARCHAR(200),
    description TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2) DEFAULT 0,
    total_price NUMERIC(12,2) DEFAULT 0,
    tax_amount NUMERIC(12,2) DEFAULT 0,
    freight_amount NUMERIC(12,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    expected_date DATE,
    received_date DATE,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_po_line_items_header ON po_line_items(po_header_id);
CREATE INDEX IF NOT EXISTS idx_po_line_items_part ON po_line_items(part_id);
CREATE INDEX IF NOT EXISTS idx_po_line_items_status ON po_line_items(status);

-- =====================================================
-- 2. ENHANCE PO_HEADERS WITH ADDITIONAL FIELDS
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'notes') THEN
        ALTER TABLE po_headers ADD COLUMN notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'shipping_address') THEN
        ALTER TABLE po_headers ADD COLUMN shipping_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'billing_address') THEN
        ALTER TABLE po_headers ADD COLUMN billing_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'payment_terms') THEN
        ALTER TABLE po_headers ADD COLUMN payment_terms VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'shipping_method') THEN
        ALTER TABLE po_headers ADD COLUMN shipping_method VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'currency') THEN
        ALTER TABLE po_headers ADD COLUMN currency VARCHAR(3) DEFAULT 'USD';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'approved_by') THEN
        ALTER TABLE po_headers ADD COLUMN approved_by INTEGER REFERENCES users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'approved_at') THEN
        ALTER TABLE po_headers ADD COLUMN approved_at TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'subtotal') THEN
        ALTER TABLE po_headers ADD COLUMN subtotal NUMERIC(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'tax_total') THEN
        ALTER TABLE po_headers ADD COLUMN tax_total NUMERIC(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'freight_total') THEN
        ALTER TABLE po_headers ADD COLUMN freight_total NUMERIC(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'line_count') THEN
        ALTER TABLE po_headers ADD COLUMN line_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'requested_by') THEN
        ALTER TABLE po_headers ADD COLUMN requested_by INTEGER REFERENCES users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'po_headers' AND column_name = 'project_id') THEN
        ALTER TABLE po_headers ADD COLUMN project_id INTEGER REFERENCES projects(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_po_headers_approved ON po_headers(approved_by);
CREATE INDEX IF NOT EXISTS idx_po_headers_requested ON po_headers(requested_by);
CREATE INDEX IF NOT EXISTS idx_po_headers_project ON po_headers(project_id);

-- =====================================================
-- 3. MIGRATE DATA FROM purchase_orders TO po_headers + po_line_items
-- =====================================================

-- Only run if there are unmigrated purchase_orders
DO $$
DECLARE
    po record;
    hdr_id INTEGER;
    line_num INTEGER;
    total NUMERIC(12,2);
    hdr_total NUMERIC(12,2);
BEGIN
    FOR po IN SELECT DISTINCT poNumber, status, "createdAt", "updatedAt"
              FROM purchase_orders
              WHERE (migrated_to_po_headers IS NULL OR migrated_to_po_headers = FALSE)
                AND poNumber IS NOT NULL
    LOOP
        -- Calculate header total from line items
        SELECT COALESCE(SUM("totalCost"), 0) INTO hdr_total
        FROM purchase_orders
        WHERE "poNumber" = po.poNumber;

        -- Create po_headers entry
        INSERT INTO po_headers (poNumber, status, "poTotal", "createdAt", "updatedAt")
        VALUES (po.poNumber, COALESCE(po.status, 'draft'), hdr_total, po."createdAt", po."updatedAt")
        RETURNING id INTO hdr_id;

        -- Migrate line items
        line_num := 0;
        FOR po_line IN SELECT * FROM purchase_orders
                       WHERE "poNumber" = po.poNumber
                       ORDER BY id
        LOOP
            line_num := line_num + 1;
            INSERT INTO po_line_items
                (po_header_id, line_number, part_id, quantity, unit_price, total_price,
                 tax_amount, freight_amount, status, created_at, updated_at)
            VALUES
                (hdr_id, line_num, po_line."partId", po_line.qty,
                 COALESCE(po_line."unitCost", 0), COALESCE(po_line."totalCost", 0),
                 COALESCE(po_line."taxCost", 0), COALESCE(po_line."freightCost", 0),
                 COALESCE(po_line.status, 'pending'),
                 po_line."createdAt", po_line."updatedAt");
        END LOOP;

        -- Update header line_count and totals
        UPDATE po_headers
        SET line_count = line_num,
            subtotal = hdr_total
        WHERE id = hdr_id;

        -- Mark purchase_orders as migrated
        UPDATE purchase_orders
        SET migrated_to_po_headers = TRUE,
            po_header_id = hdr_id
        WHERE "poNumber" = po.poNumber;
    END LOOP;
END $$;

-- =====================================================
-- 4. INDEXES FOR NEW COLUMNS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_po_headers_po_number ON po_headers("poNumber");
CREATE INDEX IF NOT EXISTS idx_po_headers_status_date ON po_headers(status, "poDate");
