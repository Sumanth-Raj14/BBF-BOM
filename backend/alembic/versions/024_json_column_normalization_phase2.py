"""Normalize remaining denormalized JSON columns into proper normalized tables.

Normalizes:
1. bom_templates.bomData → already in bom_items table (mark deprecated)
2. revisions.bomSnapshot → revision_bom_snapshot_items
3. custom_attribute_definitions.options → custom_attribute_options
4. custom_attribute_definitions.validation_rules → custom_attribute_validation_rules
5. eco_items.old_value / eco_items.new_value → eco_item_attribute_changes

Revision ID: 024_json_column_normalization_phase2
Revises: 023
Create Date: 2026-06-19
"""


from alembic import op

revision = "024_json_column_normalization_phase2"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ════════════════════════════════════════════════════════════════
    # 1. bom_templates.bomData → already normalized in bom_items table
    #    Just add deprecation comment via a column comment
    # ════════════════════════════════════════════════════════════════
    op.execute(
        "COMMENT ON COLUMN bom_templates.\"bomData\" IS 'DEPRECATED: Use bom_items table instead. This column is kept for backward compatibility and will be removed in a future migration.'"
    )

    # ════════════════════════════════════════════════════════════════
    # 2. Normalize revisions.bomSnapshot → revision_bom_snapshot_items
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE IF NOT EXISTS revision_bom_snapshot_items (
            id SERIAL PRIMARY KEY,
            revision_id INTEGER NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
            part_id INTEGER REFERENCES parts(id),
            part_number VARCHAR(255),
            part_name VARCHAR(255),
            quantity INTEGER DEFAULT 1,
            reference_designator VARCHAR(255),
            unit_cost NUMERIC(12, 4),
            extended_cost NUMERIC(12, 4),
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.create_index(
        "idx_revision_bom_snap_revision", "revision_bom_snapshot_items", ["revision_id"]
    )
    op.create_index("idx_revision_bom_snap_part", "revision_bom_snapshot_items", ["part_id"])

    # Migrate data from revisions.bomSnapshot JSON
    # The JSON structure is expected to have an array of items with fields like:
    # partId, partNumber, partName, quantity, referenceDesignator, unitCost, extendedCost, sortOrder
    op.execute("""
        INSERT INTO revision_bom_snapshot_items (
            revision_id, part_id, part_number, part_name,
            quantity, reference_designator, unit_cost, extended_cost, sort_order
        )
        SELECT
            r.id,
            CAST(i.value->>'partId' AS INTEGER),
            i.value->>'partNumber',
            i.value->>'partName',
            COALESCE(CAST(i.value->>'quantity' AS INTEGER), 1),
            i.value->>'referenceDesignator',
            CAST(i.value->>'unitCost' AS NUMERIC(12, 4)),
            CAST(i.value->>'extendedCost' AS NUMERIC(12, 4)),
            COALESCE(CAST(i.value->>'sortOrder' AS INTEGER), 0)
        FROM revisions r,
        LATERAL json_array_elements(r."bomSnapshot"::json) AS i(value)
        WHERE r."bomSnapshot" IS NOT NULL
          AND r."bomSnapshot" != '[]'::json
          AND r."bomSnapshot" != '[]'::jsonb
    """)

    op.execute(
        "COMMENT ON COLUMN revisions.\"bomSnapshot\" IS 'DEPRECATED: Use revision_bom_snapshot_items table instead. Kept for backward compatibility.'"
    )

    # ════════════════════════════════════════════════════════════════
    # 3. Normalize custom_attribute_definitions.options → custom_attribute_options
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE IF NOT EXISTS custom_attribute_options (
            id SERIAL PRIMARY KEY,
            attribute_definition_id INTEGER NOT NULL REFERENCES custom_attribute_definitions(id) ON DELETE CASCADE,
            option_value VARCHAR(255) NOT NULL,
            display_label VARCHAR(255),
            is_default BOOLEAN DEFAULT false,
            sort_order INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(attribute_definition_id, option_value)
        )
    """)
    op.create_index(
        "idx_custom_attr_opts_def", "custom_attribute_options", ["attribute_definition_id"]
    )

    # Migrate data from custom_attribute_definitions.options JSON (array of strings or objects)
    op.execute("""
        INSERT INTO custom_attribute_options (attribute_definition_id, option_value, display_label, sort_order)
        SELECT
            c.id,
            CASE
                WHEN opt.value::text LIKE '{%' THEN opt.value->>'value'
                ELSE opt.value::text
            END,
            CASE
                WHEN opt.value::text LIKE '{%' THEN COALESCE(opt.value->>'label', opt.value->>'value')
                ELSE opt.value::text
            END,
            COALESCE(CAST(opt.value->>'sortOrder' AS INTEGER), 0)
        FROM custom_attribute_definitions c,
        LATERAL json_array_elements(c.options::json) AS opt(value)
        WHERE c.options IS NOT NULL
          AND c.options != '[]'::json
          AND c.options != '[]'::jsonb
    """)

    op.execute(
        "COMMENT ON COLUMN custom_attribute_definitions.options IS 'DEPRECATED: Use custom_attribute_options table instead. Kept for backward compatibility.'"
    )

    # ════════════════════════════════════════════════════════════════
    # 4. Normalize custom_attribute_definitions.validation_rules → custom_attribute_validation_rules
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE IF NOT EXISTS custom_attribute_validation_rules (
            id SERIAL PRIMARY KEY,
            attribute_definition_id INTEGER NOT NULL REFERENCES custom_attribute_definitions(id) ON DELETE CASCADE,
            rule_type VARCHAR(50) NOT NULL,
            rule_value TEXT NOT NULL,
            error_message TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(attribute_definition_id, rule_type)
        )
    """)
    op.create_index(
        "idx_custom_attr_val_def", "custom_attribute_validation_rules", ["attribute_definition_id"]
    )

    # Migrate data from custom_attribute_definitions.validation_rules JSON (object with rule keys)
    op.execute("""
        INSERT INTO custom_attribute_validation_rules (attribute_definition_id, rule_type, rule_value)
        SELECT
            c.id,
            rule.key,
            rule.value::text
        FROM custom_attribute_definitions c,
        LATERAL json_each_text(c.validation_rules::json) AS rule(key, value)
        WHERE c.validation_rules IS NOT NULL
          AND c.validation_rules != '{}'::json
          AND c.validation_rules != '{}'::jsonb
    """)

    op.execute(
        "COMMENT ON COLUMN custom_attribute_definitions.validation_rules IS 'DEPRECATED: Use custom_attribute_validation_rules table instead. Kept for backward compatibility.'"
    )

    # ════════════════════════════════════════════════════════════════
    # 5. Normalize eco_items.old_value / eco_items.new_value → eco_item_attribute_changes
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE TABLE IF NOT EXISTS eco_item_attribute_changes (
            id SERIAL PRIMARY KEY,
            eco_item_id INTEGER NOT NULL REFERENCES eco_items(id) ON DELETE CASCADE,
            field_name VARCHAR(255) NOT NULL,
            old_value TEXT,
            new_value TEXT,
            value_type VARCHAR(50) DEFAULT 'string',
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.create_index("idx_eco_item_changes_item", "eco_item_attribute_changes", ["eco_item_id"])

    # Migrate data from eco_items.old_value and eco_items.new_value JSON objects
    op.execute("""
        INSERT INTO eco_item_attribute_changes (eco_item_id, field_name, old_value, new_value, value_type)
        SELECT
            e.id,
            COALESCE(old_keys.key, new_keys.key),
            old_keys.value,
            new_keys.value,
            'string'
        FROM eco_items e
        LEFT JOIN LATERAL json_each_text(e.old_value::json) AS old_keys(key, value) ON true
        LEFT JOIN LATERAL json_each_text(e.new_value::json) AS new_keys(key, value) ON true
        WHERE (e.old_value IS NOT NULL AND e.old_value != '{}'::json AND e.old_value != '{}'::jsonb)
           OR (e.new_value IS NOT NULL AND e.new_value != '{}'::json AND e.new_value != '{}'::jsonb)
    """)

    op.execute(
        "COMMENT ON COLUMN eco_items.old_value IS 'DEPRECATED: Use eco_item_attribute_changes table instead. Kept for backward compatibility.'"
    )
    op.execute(
        "COMMENT ON COLUMN eco_items.new_value IS 'DEPRECATED: Use eco_item_attribute_changes table instead. Kept for backward compatibility.'"
    )


def downgrade() -> None:
    # Drop tables (reverse order of creation)
    op.drop_table("eco_item_attribute_changes")
    op.drop_table("custom_attribute_validation_rules")
    op.drop_table("custom_attribute_options")
    op.drop_table("revision_bom_snapshot_items")

    # Remove column comments (PG 9.x+)
    op.execute("COMMENT ON COLUMN eco_items.old_value IS NULL")
    op.execute("COMMENT ON COLUMN eco_items.new_value IS NULL")
    op.execute("COMMENT ON COLUMN custom_attribute_definitions.validation_rules IS NULL")
    op.execute("COMMENT ON COLUMN custom_attribute_definitions.options IS NULL")
    op.execute('COMMENT ON COLUMN revisions."bomSnapshot" IS NULL')
    op.execute('COMMENT ON COLUMN bom_templates."bomData" IS NULL')
