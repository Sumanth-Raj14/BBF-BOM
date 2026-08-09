"""Seed database with PO data from Cleaned_Purchase_Orders.xlsx.

INCIDENT (2026-08-09): this script used to resolve its own DB URL
(DATABASE_URL/DATABASE_URI env vars, or else a hardcoded
postgresql://.../bom_db default) and then unconditionally ran
`DELETE FROM po_line_items` / `DELETE FROM po_headers` with no scoping --
wiping ALL purchase-order data on whatever database it happened to resolve
to, live or not, and ignoring TEST_DATABASE_URL entirely.

Fixed by routing through the same two chokepoints every other script uses:
  - app.db.session.resolve_database_url() (TEST_DATABASE_URL > DATABASE_URL >
    settings.DATABASE_URI) via scripts._db_guard.require_non_production_db(),
    which also refuses to run at all unless the resolved DB looks like a
    test/e2e/sqlite database.
  - the delete is now scoped to just the PO numbers this run is about to
    re-insert (identified from the Excel file), not the whole table. If a
    future edit makes the po_numbers list unavailable, do NOT fall back to an
    unscoped delete -- require an explicit confirmation env var instead (see
    ALLOW_FULL_PO_WIPE below).
"""

import asyncio
import os
import sys

import openpyxl
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.db.base import Base  # noqa: E402
from app.models.po_models import POHeader, POLineItem  # noqa: E402
from scripts._db_guard import require_non_production_db  # noqa: E402

EXCEL_PATH = r"C:\Users\tsuma\Downloads\bom tool\Cleaned_Purchase_Orders.xlsx"

# Only consulted if the script can't identify its own rows (see below) --
# an explicit opt-in is required before it will ever delete every PO row.
ALLOW_FULL_PO_WIPE = os.environ.get("ALLOW_FULL_PO_WIPE", "").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)


async def seed():
    # Resolves via app.db.session.resolve_database_url() and raises unless the
    # target looks like a test/e2e/sqlite database (or ALLOW_SEED_ON_LIVE_DB is
    # explicitly set). Must happen before any connection is opened.
    database_url = require_non_production_db()

    engine = create_async_engine(database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Parse Excel
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True)
    ws = wb["Purchase Orders"]
    all_rows = list(ws.iter_rows(min_row=2, values_only=True))
    wb.close()

    # Parse into PO headers and line items
    current_po = None
    pos = []
    for row in all_rows:
        (
            po_date,
            po_num,
            vendor,
            item,
            desc,
            qty,
            price,
            amount,
            gst,
            total,
            po_total,
            project,
            status,
        ) = row
        if po_num:
            current_po = {
                "date": str(po_date) if po_date else None,
                "number": po_num,
                "vendor": vendor,
                "po_total": float(po_total) if po_total else 0,
                "project": project,
                "status": status,
                "items": [],
            }
            pos.append(current_po)
        if current_po and item:
            current_po["items"].append(
                {
                    "name": item,
                    "desc": desc,
                    "qty": int(qty) if qty else 0,
                    "price": float(price) if price else 0,
                    "amount": float(amount) if amount else 0,
                    "gst": float(gst) if gst else 0,
                    "total": float(total) if total else 0,
                }
            )

    print(f"Parsed {len(pos)} POs from Excel")

    # Insert into database
    async with async_session() as session:
        async with session.begin():
            # Scope the "clear existing data" step to exactly the PO numbers
            # this run is about to re-insert, so a re-run of this fixture
            # script cannot touch any other PO ever written to this database.
            po_numbers = [po_data["number"] for po_data in pos]
            if po_numbers:
                existing_header_ids = (
                    await session.execute(
                        select(POHeader.id).where(POHeader.poNumber.in_(po_numbers))
                    )
                ).scalars().all()
                if existing_header_ids:
                    await session.execute(
                        delete(POLineItem).where(POLineItem.headerId.in_(existing_header_ids))
                    )
                    await session.execute(
                        delete(POHeader).where(POHeader.id.in_(existing_header_ids))
                    )
            elif ALLOW_FULL_PO_WIPE:
                # No PO numbers parsed from the Excel file, so there is
                # nothing to scope to. Only wipe everything if the operator
                # explicitly opted in.
                await session.execute(delete(POLineItem))
                await session.execute(delete(POHeader))
            else:
                print(
                    "No PO numbers parsed from Excel -- skipping delete "
                    "(set ALLOW_FULL_PO_WIPE=true to force a full wipe instead)."
                )

            for po_data in pos:
                header = POHeader(
                    poNumber=po_data["number"],
                    poDate=po_data["date"],
                    vendorName=po_data["vendor"],
                    project=po_data["project"],
                    poTotal=po_data["po_total"],
                    status=po_data["status"],
                )
                session.add(header)
                await session.flush()  # Get the ID

                for item_data in po_data["items"]:
                    item = POLineItem(
                        headerId=header.id,
                        itemName=item_data["name"],
                        itemDesc=item_data["desc"],
                        quantity=item_data["qty"],
                        itemPrice=item_data["price"],
                        amount=item_data["amount"],
                        gst=item_data["gst"],
                        total=item_data["total"],
                    )
                    session.add(item)

        # Verify
        result = await session.execute(text("SELECT COUNT(*) FROM po_headers"))
        po_count = result.scalar()
        result = await session.execute(text("SELECT COUNT(*) FROM po_line_items"))
        item_count = result.scalar()
        print(f"Inserted {po_count} PO headers and {item_count} line items")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
