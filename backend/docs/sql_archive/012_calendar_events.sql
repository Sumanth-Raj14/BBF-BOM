-- Migration 012: Calendar Events
-- Enables cloud sync for calendar events (previously localStorage only)

CREATE TABLE IF NOT EXISTS calendar_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    event_type VARCHAR(50) DEFAULT 'general',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    all_day BOOLEAN DEFAULT FALSE,
    color VARCHAR(20),
    related_resource_type VARCHAR(50),
    related_resource_id INTEGER,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_calendar_events_user_time ON calendar_events(user_id, start_time);
CREATE INDEX IF NOT EXISTS ix_calendar_events_type ON calendar_events(event_type);
CREATE INDEX IF NOT EXISTS ix_calendar_events_resource ON calendar_events(related_resource_type, related_resource_id);
