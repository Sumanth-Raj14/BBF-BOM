-- Migration 011: User Data Sync (localStorage → PostgreSQL)
-- Enables cloud sync for frontend localStorage data types

-- =====================================================
-- 1. USER DATA STORE (generic key-value per user)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_data_store (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data_key VARCHAR(100) NOT NULL,
    data_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    data_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, data_key)
);

CREATE INDEX IF NOT EXISTS idx_user_data_store_user ON user_data_store(user_id);
CREATE INDEX IF NOT EXISTS idx_user_data_store_key ON user_data_store(data_key);

-- =====================================================
-- 2. USER PREFERENCES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pref_key VARCHAR(100) NOT NULL,
    pref_value TEXT,
    pref_type VARCHAR(20) DEFAULT 'string',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, pref_key)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);

-- =====================================================
-- 3. CHECKLIST PROGRESS
-- =====================================================

CREATE TABLE IF NOT EXISTS user_checklist_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completed_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- =====================================================
-- 4. BOM DRAFT TABLE (row-level persistence)
-- =====================================================

CREATE TABLE IF NOT EXISTS bom_drafts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    draft_name VARCHAR(200) DEFAULT 'default',
    rows_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    conversion_rate NUMERIC(10,4) DEFAULT 83.0000,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, draft_name)
);

CREATE INDEX IF NOT EXISTS idx_bom_drafts_user ON bom_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_bom_drafts_project ON bom_drafts(project_id);

-- =====================================================
-- 5. BARCODE SCAN HISTORY
-- =====================================================

CREATE TABLE IF NOT EXISTS scan_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    barcode_data TEXT NOT NULL,
    scan_result JSONB,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scan_history_user ON scan_history(user_id, scanned_at DESC);

-- =====================================================
-- 6. SEARCH HISTORY
-- =====================================================

CREATE TABLE IF NOT EXISTS saved_searches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    search_name VARCHAR(200) NOT NULL,
    search_params JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, search_name)
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id);
