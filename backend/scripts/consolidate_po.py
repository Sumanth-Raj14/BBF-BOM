"""Purchase Orders Consolidation Script.

Migrates data from legacy purchase_orders table to po_headers + po_line_items.
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
            # Find distinct POs to migrate
            where_clause = (
                "TRUE"
                if force
                else "(migrated_to_po_headers IS NULL OR migrated_to_po_headers = FALSE)"
            )
            po_rows = await db.execute(
                text(f"""
                    SELECT DISTINCT "poNumber", status, "createdAt", "updatedAt"
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

                po_number = po[0]
                po_status = po[1] or "draft"
                po_created = po[2]
                po_updated = po[3]

                # Calculate header total
                total_row = await db.execute(
                    text(
                        'SELECT COALESCE(SUM("totalCost"), 0) FROM purchase_orders WHERE "poNumber" = :pn'
                    ),
                    {"pn": po_number},
                )
                hdr_total = total_row.scalar() or 0

                # Create po_headers entry
                hdr_result = await db.execute(
                    text("""
                        INSERT INTO po_headers ("poNumber", status, "poTotal", "createdAt", "updatedAt")
                        VALUES (:pn, :ps, :pt, :pc, :pu)
                        RETURNING id
                    """),
                    {
                        "pn": po_number,
                        "ps": po_status,
                        "pt": hdr_total,
                        "pc": po_created,
                        "pu": po_updated,
                    },
                )
                hdr_id = hdr_result.scalar()
                results["headers_created"] += 1

                # Get line items
                line_rows = await db.execute(
                    text("""
                        SELECT id, "partId", qty, "unitCost", "totalCost",
                               "taxCost", "freightCost", status, "createdAt", "updatedAt"
                        FROM purchase_orders
                        WHERE "poNumber" = :pn
                        ORDER BY id
                    """),
                    {"pn": po_number},
                )
                line_num = 0
                for line in line_rows:
                    line_num += 1
                    await db.execute(
                        text("""
                            INSERT INTO po_line_items
                                (po_header_id, line_number, part_id, quantity,
                                 unit_price, total_price, tax_amount, freight_amount,
                                 status, created_at, updated_at)
                            VALUES
                                (:hdr_id, :ln, :part_id, :qty,
                                 :unit_price, :total_price, :tax, :freight,
                                 :status, :created_at, :updated_at)
                        """),
                        {
                            "hdr_id": hdr_id,
                            "ln": line_num,
                            "part_id": line[1],
                            "qty": line[2] or 1,
                            "unit_price": line[3] or 0,
                            "total_price": line[4] or 0,
                            "tax": line[5] or 0,
                            "freight": line[6] or 0,
                            "status": line[7] or "pending",
                            "created_at": line[8],
                            "updated_at": line[9],
                        },
                    )
                    results["line_items_created"] += 1

                # Update header line_count
                await db.execute(
                    text("UPDATE po_headers SET line_count = :lc WHERE id = :id"),
                    {"lc": line_num, "id": hdr_id},
                )

                # Mark purchase_orders as migrated
                await db.execute(
                    text("""
                        UPDATE purchase_orders
                        SET migrated_to_po_headers = TRUE, po_header_id = :hdr_id
                        WHERE "poNumber" = :pn
                    """),
                    {"hdr_id": hdr_id, "pn": po_number},
                )
                results["purchase_orders_migrated"] += line_num

                logger.info(
                    f"  Migrated PO {po_number} -> header {hdr_id} ({line_num} lines)"
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
