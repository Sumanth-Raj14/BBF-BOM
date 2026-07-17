"""Seed database with PO data from Cleaned_Purchase_Orders.xlsx"""

import asyncio

import openpyxl
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.po_models import POHeader, POLineItem

EXCEL_PATH = r"C:\Users\tsuma\Downloads\bom tool\Cleaned_Purchase_Orders.xlsx"
import os

DATABASE_URL = (
    os.environ.get("DATABASE_URL")
    or os.environ.get("DATABASE_URI")
    or "postgresql+asyncpg://bom_user:bom_password@127.0.0.1:5432/bom_db"
)


async def seed():
    engine = create_async_engine(DATABASE_URL)
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
            # Clear existing data
            await session.execute(text("DELETE FROM po_line_items"))
            await session.execute(text("DELETE FROM po_headers"))

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
    from sqlalchemy import text

    asyncio.run(seed())
