"""Normalize denormalized JSON columns into proper normalized tables.

Normalizes:
1. contracts.partIds → contract_parts (many-to-many)
2. fai_reports.characteristics → fai_characteristics
3. serial_numbers.statusHistory → serial_number_events
4. capas.attachments → capa_attachments
5. deviations.affectedLotNumbers → deviation_lots

Revision ID: 014_json_column_normalization
Revises: 013_enterprise_audit_fixes
Create Date: 2026-06-16
"""

import sqlalchemy as sa

from alembic import op

revision = "014_json_column_normalization"
down_revision = "013_enterprise_audit_fixes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ════════════════════════════════════════════════════════════════
    # 1. Normalize contracts.partIds → contract_parts
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE IF NOT EXISTS contract_parts (
            id SERIAL PRIMARY KEY,
            contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
            part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(contract_id, part_id)
        )
    """)
    op.create_index("idx_contract_parts_contract", "contract_parts", ["contract_id"])
    op.create_index("idx_contract_parts_part", "contract_parts", ["part_id"])

    # Migrate data from contracts.partIds JSON to contract_parts
    op.execute("""
        INSERT INTO contract_parts (contract_id, part_id)
        SELECT c.id, CAST(p.value AS INTEGER)
        FROM contracts c,
        LATERAL json_array_elements_text(c."partIds"::json) AS p(value)
        WHERE c."partIds" IS NOT NULL
          AND c."partIds" != '[]'::json
          AND c."partIds" != '[]'::jsonb
        ON CONFLICT (contract_id, part_id) DO NOTHING
    """)

    # ════════════════════════════════════════════════════════════════
    # 2. Normalize fai_reports.characteristics → fai_characteristics
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE IF NOT EXISTS fai_characteristics (
            id SERIAL PRIMARY KEY,
            fai_report_id INTEGER NOT NULL REFERENCES fai_reports(id) ON DELETE CASCADE,
            characteristic_name VARCHAR(255),
            requirement VARCHAR(255),
            result VARCHAR(255),
            status VARCHAR(50) DEFAULT 'pending',
            notes TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.create_index("idx_fai_characteristics_report", "fai_characteristics", ["fai_report_id"])

    # Migrate data from fai_reports.characteristics JSON
    op.execute("""
        INSERT INTO fai_characteristics (fai_report_id, characteristic_name, requirement, result, status, notes, sort_order)
        SELECT
            f.id,
            c.value->>'name',
            c.value->>'requirement',
            c.value->>'result',
            COALESCE(c.value->>'status', 'pending'),
            c.value->>'notes',
            COALESCE((c.value->>'sortOrder')::INTEGER, 0)
        FROM fai_reports f,
        LATERAL json_array_elements(f.characteristics::json) AS c(value)
        WHERE f.characteristics IS NOT NULL
          AND f.characteristics != '[]'::json
          AND f.characteristics != '[]'::jsonb
    """)

    # ════════════════════════════════════════════════════════════════
    # 3. Normalize serial_numbers.statusHistory → serial_number_events
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE IF NOT EXISTS serial_number_events (
            id SERIAL PRIMARY KEY,
            serial_number_id INTEGER NOT NULL REFERENCES serial_numbers(id) ON DELETE CASCADE,
            from_status VARCHAR(50),
            to_status VARCHAR(50),
            location VARCHAR(255),
            changed_by INTEGER REFERENCES users(id),
            notes TEXT,
            event_date TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.create_index("idx_serial_number_events_serial", "serial_number_events", ["serial_number_id"])
    op.create_index(
        "idx_serial_number_events_date",
        "serial_number_events",
        [sa.text("event_date DESC")],
    )

    # Migrate data from serial_numbers.statusHistory JSON
    op.execute("""
        INSERT INTO serial_number_events (serial_number_id, from_status, to_status, location, notes, event_date)
        SELECT
            s.id,
            h.value->>'fromStatus',
            h.value->>'toStatus',
            h.value->>'location',
            h.value->>'notes',
            (h.value->>'date')::TIMESTAMPTZ
        FROM serial_numbers s,
        LATERAL json_array_elements(s."statusHistory"::json) AS h(value)
        WHERE s."statusHistory" IS NOT NULL
          AND s."statusHistory" != '[]'::json
          AND s."statusHistory" != '[]'::jsonb
    """)

    # ════════════════════════════════════════════════════════════════
    # 4. Normalize capas.attachments → capa_attachments
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE IF NOT EXISTS capa_attachments (
            id SERIAL PRIMARY KEY,
            capa_id INTEGER NOT NULL REFERENCES capas(id) ON DELETE CASCADE,
            filename VARCHAR(255),
            file_url TEXT,
            file_type VARCHAR(50),
            file_size INTEGER,
            uploaded_by INTEGER REFERENCES users(id),
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.create_index("idx_capa_attachments_capa", "capa_attachments", ["capa_id"])

    # Migrate data from capas.attachments JSON
    op.execute("""
        INSERT INTO capa_attachments (capa_id, filename, file_url, file_type, description)
        SELECT
            c.id,
            a.value->>'filename',
            a.value->>'url',
            a.value->>'type',
            a.value->>'description'
        FROM capas c,
        LATERAL json_array_elements(c.attachments::json) AS a(value)
        WHERE c.attachments IS NOT NULL
          AND c.attachments != '[]'::json
          AND c.attachments != '[]'::jsonb
    """)

    # ════════════════════════════════════════════════════════════════
    # 5. Normalize deviations.affectedLotNumbers → deviation_lots
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE IF NOT EXISTS deviation_lots (
            id SERIAL PRIMARY KEY,
            deviation_id INTEGER NOT NULL REFERENCES deviations(id) ON DELETE CASCADE,
            lot_number VARCHAR(255) NOT NULL,
            quantity_affected INTEGER DEFAULT 0,
            disposition VARCHAR(255),
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.create_index("idx_deviation_lots_deviation", "deviation_lots", ["deviation_id"])

    # Migrate data from deviations.affectedLotNumbers JSON
    op.execute("""
        INSERT INTO deviation_lots (deviation_id, lot_number)
        SELECT
            d.id,
            l.value->>'lotNumber'
        FROM deviations d,
        LATERAL json_array_elements(d."affectedLotNumbers"::json) AS l(value)
        WHERE d."affectedLotNumbers" IS NOT NULL
          AND d."affectedLotNumbers" != '[]'::json
          AND d."affectedLotNumbers" != '[]'::jsonb
    """)


def downgrade() -> None:
    op.drop_table("deviation_lots")
    op.drop_table("capa_attachments")
    op.drop_table("serial_number_events")
    op.drop_table("fai_characteristics")
    op.drop_table("contract_parts")
