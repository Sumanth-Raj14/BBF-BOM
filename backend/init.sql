-- Blackbox BOM Database Initialization
-- This runs on first docker-compose up

-- Enable pgcrypto for encryption at rest
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create custom types
DO $$ BEGIN
    CREATE TYPE po_status AS ENUM ('Not Ordered', 'RFQ Sent', 'Under Review', 'Ordered', 'In Transit', 'Received', 'Quality Check', 'Approved', 'Rejected', 'Closed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE bom_db TO bom_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bom_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bom_user;

-- Immutable audit log trigger
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable. Updates and deletes are not allowed.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to audit_logs table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_logs') THEN
        CREATE TRIGGER audit_log_immutable
            BEFORE UPDATE OR DELETE ON audit_logs
            FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
    END IF;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
