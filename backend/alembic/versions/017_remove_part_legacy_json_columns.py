"""Remove legacy Part JSON columns (countryHistory, vendorPrices) — migrated to normalized tables.

The Part model had two legacy JSON columns that were superseded by normalized tables:
- countryHistory (JSON) → part_country_history table
- vendorPrices (JSON) → part_vendor_prices table (PartVendorPrice model)

This migration:
1. Migrates any remaining data from JSON columns to normalized tables
2. Drops the legacy JSON columns

Revision ID: 017_remove_part_legacy_json_columns
Revises: 016_fix_critical_schema_issues
Create Date: 2026-06-16
"""

from collections.abc import Sequence

from alembic import op

revision: str = "017_remove_part_legacy_json_columns"
down_revision: str | None = "016_fix_critical_schema_issues"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ═══════════════════════════════════════════════════════════════════════
    # 1. Migrate any remaining data from parts.countryHistory to part_country_history
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        INSERT INTO part_country_history (part_id, country, date_from, date_to, reason, created_at)
        SELECT
            p.id,
            c.value->>'country',
            (c.value->>'dateFrom')::TIMESTAMPTZ,
            (c.value->>'dateTo')::TIMESTAMPTZ,
            c.value->>'reason',
            COALESCE((c.value->>'createdAt')::TIMESTAMPTZ, NOW())
        FROM parts p,
        LATERAL json_array_elements(p."countryHistory"::json) AS c(value)
        WHERE p."countryHistory" IS NOT NULL
          AND p."countryHistory" != '[]'::json
          AND p."countryHistory" != '[]'::jsonb
          AND NOT EXISTS (
              SELECT 1 FROM part_country_history ch
              WHERE ch.part_id = p.id
          )
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 2. Migrate any remaining data from parts.vendorPrices to part_vendor_prices
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        INSERT INTO part_vendor_prices (part_id, vendor_name, price, currency, quantity_break, date_quoted, date_valid_until, created_at)
        SELECT
            p.id,
            v.value->>'vendorName',
            COALESCE((v.value->>'price')::FLOAT, 0.0),
            COALESCE(v.value->>'currency', 'USD'),
            COALESCE((v.value->>'quantityBreak')::INTEGER, 1),
            (v.value->>'dateQuoted')::TIMESTAMPTZ,
            (v.value->>'dateValidUntil')::TIMESTAMPTZ,
            COALESCE((v.value->>'createdAt')::TIMESTAMPTZ, NOW())
        FROM parts p,
        LATERAL json_array_elements(p."vendorPrices"::json) AS v(value)
        WHERE p."vendorPrices" IS NOT NULL
          AND p."vendorPrices" != '[]'::json
          AND p."vendorPrices" != '[]'::jsonb
          AND NOT EXISTS (
              SELECT 1 FROM part_vendor_prices vp
              WHERE vp.part_id = p.id
          )
    """)

    # ═══════════════════════════════════════════════════════════════════════
    # 3. Drop the legacy JSON columns
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'parts' AND column_name = 'countryHistory'
            ) THEN
                ALTER TABLE parts DROP COLUMN "countryHistory";
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'parts' AND column_name = 'vendorPrices'
            ) THEN
                ALTER TABLE parts DROP COLUMN "vendorPrices";
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # ═══════════════════════════════════════════════════════════════════════
    # Restore the JSON columns (data is preserved in normalized tables)
    # ═══════════════════════════════════════════════════════════════════════
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'parts' AND column_name = 'countryHistory'
            ) THEN
                ALTER TABLE parts ADD COLUMN "countryHistory" JSON DEFAULT '[]'::json;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'parts' AND column_name = 'vendorPrices'
            ) THEN
                ALTER TABLE parts ADD COLUMN "vendorPrices" JSON DEFAULT '[]'::json;
            END IF;
        END $$;
    """)
