"""Add materialized views for dashboard aggregations and missing indexes.

Creates:
1. mv_part_category_summary — materialized view for parts dashboard
2. mv_bom_status_summary — materialized view for BOM dashboard
3. mv_inventory_summary — materialized view for inventory dashboard
4. Missing indexes on createdAt/updatedAt columns
5. GIN indexes on JSON columns (customFields)
6. Indexes for bom_items_master hierarchy queries

Revision ID: 025_materialized_views_and_indexes
Revises: 024_json_column_normalization_phase2
Create Date: 2026-06-22
"""


from alembic import op

revision = "025_materialized_views_and_indexes"
down_revision = "024_json_column_normalization_phase2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ════════════════════════════════════════════════════════════════
    # 1. Materialized view: Part category summary
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_part_category_summary AS
        SELECT
            "tenantId",
            category,
            COUNT(*) AS part_count,
            COUNT(*) FILTER (WHERE status = 'Released') AS released_count,
            AVG(cost) AS avg_cost,
            SUM(cost) AS total_cost
        FROM parts
        WHERE category IS NOT NULL
        GROUP BY "tenantId", category
        WITH DATA
    """)
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_part_category_tenant ON mv_part_category_summary ("tenantId", category)'
    )

    # ════════════════════════════════════════════════════════════════
    # 2. Materialized view: BOM status summary
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_bom_status_summary AS
        SELECT
            "tenantId",
            status,
            COUNT(*) AS bom_count,
            COUNT(*) FILTER (WHERE version IS NOT NULL) AS versioned_count
        FROM boms
        GROUP BY "tenantId", status
        WITH DATA
    """)
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_bom_status_tenant ON mv_bom_status_summary ("tenantId", status)'
    )

    # ════════════════════════════════════════════════════════════════
    # 3. Materialized view: Inventory summary by warehouse
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_inventory_summary AS
        SELECT
            i."tenantId",
            i.warehouse_id,
            w.name AS warehouse_name,
            COUNT(*) AS sku_count,
            SUM(i.on_hand_qty) AS total_on_hand,
            SUM(i.on_hand_qty * i.unit_cost) AS total_value
        FROM inventory i
        LEFT JOIN warehouses w ON i.warehouse_id = w.id
        GROUP BY i."tenantId", i.warehouse_id, w.name
        WITH DATA
    """)
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_inventory_warehouse ON mv_inventory_summary ("tenantId", warehouse_id)'
    )

    # ════════════════════════════════════════════════════════════════
    # 4. Missing indexes on timestamps
    # ════════════════════════════════════════════════════════════════
    op.create_index("idx_parts_created_at", "parts", ["createdAt"])
    op.create_index("idx_parts_updated_at", "parts", ["updatedAt"])
    op.create_index("idx_boms_created_at", "boms", ["created_at"])
    op.create_index("idx_boms_updated_at", "boms", ["updated_at"])
    op.create_index("idx_bom_items_master_created_at", "bom_items_master", ["created_at"])
    op.create_index("idx_bom_items_master_updated_at", "bom_items_master", ["updated_at"])
    op.create_index("idx_vendors_created_at", "vendors", ["createdAt"])
    op.create_index("idx_vendors_updated_at", "vendors", ["updatedAt"])
    op.create_index("idx_projects_created_at", "projects", ["createdAt"])
    op.create_index("idx_projects_updated_at", "projects", ["updatedAt"])

    # ════════════════════════════════════════════════════════════════
    # 5. GIN index on JSON columns for efficient JSON queries
    # ════════════════════════════════════════════════════════════════
    op.create_index(
        "idx_parts_custom_fields_gin", "parts", ["customFields"], postgresql_using="gin"
    )

    # ════════════════════════════════════════════════════════════════
    # 6. Indexes for BOM hierarchy queries (parent_item_id lookups)
    # ════════════════════════════════════════════════════════════════
    op.create_index("idx_bom_items_master_parent", "bom_items_master", ["parent_item_id", "bom_id"])
    op.create_index("idx_bom_items_master_bom_part", "bom_items_master", ["bom_id", "part_id"])

    # ════════════════════════════════════════════════════════════════
    # 7. Function + trigger to refresh materialized views
    # ════════════════════════════════════════════════════════════════
    op.execute("""
        CREATE OR REPLACE FUNCTION refresh_materialized_views()
        RETURNS TRIGGER AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW CONCURRENTLY mv_part_category_summary;
            REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bom_status_summary;
            REFRESH MATERIALIZED VIEW CONCURRENTLY mv_inventory_summary;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
    """)


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_part_category_summary")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_bom_status_summary")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_inventory_summary")
    op.execute("DROP FUNCTION IF EXISTS refresh_materialized_views()")

    op.drop_index("idx_parts_created_at", table_name="parts")
    op.drop_index("idx_parts_updated_at", table_name="parts")
    op.drop_index("idx_boms_created_at", table_name="boms")
    op.drop_index("idx_boms_updated_at", table_name="boms")
    op.drop_index("idx_bom_items_master_created_at", table_name="bom_items_master")
    op.drop_index("idx_bom_items_master_updated_at", table_name="bom_items_master")
    op.drop_index("idx_vendors_created_at", table_name="vendors")
    op.drop_index("idx_vendors_updated_at", table_name="vendors")
    op.drop_index("idx_projects_created_at", table_name="projects")
    op.drop_index("idx_projects_updated_at", table_name="projects")
    op.drop_index("idx_parts_custom_fields_gin", table_name="parts")
    op.drop_index("idx_bom_items_master_parent", table_name="bom_items_master")
    op.drop_index("idx_bom_items_master_bom_part", table_name="bom_items_master")
