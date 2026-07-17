"""Purchase Orders Consolidation Script.

Migrates data from the legacy `purchase_orders` table (one row per line item,
model `app.models.procurement.PurchaseOrder` — since removed) into the
canonical `po_headers` + `po_line_items` tables (`app.models.po_models`).

STATUS (backend-core Track A, PurchaseOrder-model removal):
    A repo-wide audit found no runtime code path that still writes to
    `purchase_orders` — `procurement_service` (the only service that creates
    POs) already writes exclusively to `po_headers`/`po_line_items`. So this
    script is retained only in case a real Postgres environment has orphaned
    historical rows in `purchase_orders` predating that switch; if `--dry-run`
    reports zero rows to migrate, there is no real data path and it is safe to
    proceed straight to dropping the table (see alembic migration
    038_drop_legacy_purchase_orders).

Column-drift fixes applied here (the previous version of this script would
have failed against the actual schema, not merely against a hypothetical one):
    - Grouped by (tenantId, poNumber), not bare poNumber — poNumber is only
      unique *per tenant* (migration 035_tenant_scoped_unique_keys), so
      grouping by poNumber alone would silently merge two different tenants'
      POs into one header.
    - po_headers.tenantId and po_headers.vendorName are NOT NULL; the previous
      INSERT omitted both (would fail with a NOT-NULL violation). vendorName
      is now populated via a lookup against `vendors`.
    - po_line_items.tenantId and po_line_items.itemName are NOT NULL and the
      table has no `line_number`/`part_id`/`unit_price`/`total_price`/
      `tax_amount`/`freight_amount`/`status`/`created_at`/`updated_at`
      columns at all (those are snake_case guesses; the real columns are
      camelCase: headerId, itemName, itemDesc, partId, quantity, itemPrice,
      amount, gst, total, eta, createdAt, updatedAt). Tax/freight only exist
      at the header level in the canonical schema, so per-line tax/freight
      are now summed onto the header's tax_total/freight_total instead of
      being dropped or written to nonexistent line columns.

Usage:
    python -m scripts.consolidate_po              # Run migration
    python -m scripts.consolidate_po --dry-run    # Preview only
    python -m scripts.consolidate_po --force      # Re-migrate even if already migrated
"""

import asyncio
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("po_consolidation")


async def run_consolidation(dry_run: bool = False, force: bool = False) -> dict:
    from sqlalchemy import text

    from app.db.session import AsyncSessionLocal

    results = {
        "headers_created": 0,
        "line_items_created": 0,
        "purchase_orders_migrated": 0,
        "errors": [],
    }

    async with AsyncSessionLocal() as db:
        try:
            # Find distinct (tenant, PO) pairs to migrate — poNumber is only
            # unique per-tenant, so the group key must include tenantId.
            where_clause = (
                "TRUE"
                if force
                else "(migrated_to_po_headers IS NULL OR migrated_to_po_headers = FALSE)"
            )
            po_rows = await db.execute(
                text(f"""
                    SELECT DISTINCT "tenantId", "poNumber", status, "createdAt", "updatedAt"
                    FROM purchase_orders
                    WHERE {where_clause} AND "poNumber" IS NOT NULL
                """)
            )
            distinct_pos = po_rows.fetchall()

            if not distinct_pos:
                logger.info("No purchase orders to migrate")
                return results

            logger.info(f"Found {len(distinct_pos)} purchase orders to migrate")

            for po in distinct_pos:
                if dry_run:
                    results["headers_created"] += 1
                    continue

                tenant_id = po[0]
                po_number = po[1]
                po_status = po[2] or "draft"
                po_created = po[3]
                po_updated = po[4]

                # Header totals aggregate across all lines of this (tenant, poNumber).
                totals_row = await db.execute(
                    text("""
                        SELECT
                            COALESCE(SUM("totalCost"), 0),
                            COALESCE(SUM("taxCost"), 0),
                            COALESCE(SUM("freightCost"), 0)
                        FROM purchase_orders
                        WHERE "tenantId" = :tid AND "poNumber" = :pn
                    """),
                    {"tid": tenant_id, "pn": po_number},
                )
                hdr_total, hdr_tax, hdr_freight = totals_row.first()

                # vendorName is NOT NULL on po_headers; look it up via the
                # vendorId on any line of this PO (they should all share one).
                vendor_row = await db.execute(
                    text("""
                        SELECT v.name
                        FROM purchase_orders po
                        JOIN vendors v ON v.id = po."vendorId"
                        WHERE po."tenantId" = :tid AND po."poNumber" = :pn
                        LIMIT 1
                    """),
                    {"tid": tenant_id, "pn": po_number},
                )
                vendor_name = vendor_row.scalar() or ""

                hdr_result = await db.execute(
                    text("""
                        INSERT INTO po_headers
                            ("tenantId", "poNumber", status, "vendorName",
                             "poTotal", tax_total, freight_total, "createdAt", "updatedAt")
                        VALUES
                            (:tid, :pn, :ps, :vn, :pt, :tax, :freight, :pc, :pu)
                        RETURNING id
                    """),
                    {
                        "tid": tenant_id,
                        "pn": po_number,
                        "ps": po_status,
                        "vn": vendor_name,
                        "pt": hdr_total,
                        "tax": hdr_tax,
                        "freight": hdr_freight,
                        "pc": po_created,
                        "pu": po_updated,
                    },
                )
                hdr_id = hdr_result.scalar()
                results["headers_created"] += 1

                # Get line items, joining parts for an itemName (NOT NULL on po_line_items).
                line_rows = await db.execute(
                    text("""
                        SELECT po.id, po."partId", po.qty, po."unitCost", po."totalCost",
                               po.eta, po."createdAt", po."updatedAt", p.name
                        FROM purchase_orders po
                        LEFT JOIN parts p ON p.id = po."partId"
                        WHERE po."tenantId" = :tid AND po."poNumber" = :pn
                        ORDER BY po.id
                    """),
                    {"tid": tenant_id, "pn": po_number},
                )
                line_count = 0
                for line in line_rows:
                    line_count += 1
                    part_name = line[8] or f"Migrated line {line_count}"
                    await db.execute(
                        text("""
                            INSERT INTO po_line_items
                                ("tenantId", "headerId", "itemName", "partId", quantity,
                                 "itemPrice", amount, eta, "createdAt", "updatedAt")
                            VALUES
                                (:tid, :hdr_id, :item_name, :part_id, :qty,
                                 :unit_price, :total_price, :eta, :created_at, :updated_at)
                        """),
                        {
                            "tid": tenant_id,
                            "hdr_id": hdr_id,
                            "item_name": part_name,
                            "part_id": line[1],
                            "qty": line[2] or 1,
                            "unit_price": line[3] or 0,
                            "total_price": line[4] or 0,
                            "eta": line[5],
                            "created_at": line[6],
                            "updated_at": line[7],
                        },
                    )
                    results["line_items_created"] += 1

                # Update header line_count
                await db.execute(
                    text("UPDATE po_headers SET line_count = :lc WHERE id = :id"),
                    {"lc": line_count, "id": hdr_id},
                )

                # Mark purchase_orders as migrated
                await db.execute(
                    text("""
                        UPDATE purchase_orders
                        SET migrated_to_po_headers = TRUE, po_header_id = :hdr_id
                        WHERE "tenantId" = :tid AND "poNumber" = :pn
                    """),
                    {"hdr_id": hdr_id, "tid": tenant_id, "pn": po_number},
                )
                results["purchase_orders_migrated"] += line_count

                logger.info(
                    f"  Migrated PO {po_number} (tenant {tenant_id}) -> header {hdr_id} ({line_count} lines)"
                )

            if not dry_run:
                await db.commit()
                logger.info(
                    f"Migration complete: {results['headers_created']} headers, "
                    f"{results['line_items_created']} line items"
                )

        except Exception as e:
            await db.rollback()
            logger.error(f"Migration failed: {e}")
            results["errors"].append(str(e))

    return results


async def main():
    dry_run = "--dry-run" in sys.argv
    force = "--force" in sys.argv

    if dry_run:
        logger.info("DRY RUN MODE — no changes will be made")

    result = await run_consolidation(dry_run=dry_run, force=force)
    print(f"\nResults: {result}")

    if result["errors"]:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
