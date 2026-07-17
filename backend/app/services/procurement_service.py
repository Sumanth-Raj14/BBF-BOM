"""Procurement service layer — business logic for purchase orders."""

from datetime import UTC, datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams, paginate
from app.models.part import Part
from app.models.po_models import POHeader, POLineItem
from app.models.vendor import Vendor

STAGES = [
    "Not Ordered",
    "RFQ Sent",
    "Under Review",
    "Ordered",
    "In Transit",
    "Received",
    "Quality Check",
    "Approved",
    "Rejected",
    "Closed",
]


def generate_po_number(count: int) -> str:
    year = datetime.now(UTC).year
    return f"PO-{year}-{count + 1:04d}"


async def batch_enrich(headers: list[POHeader], db: AsyncSession) -> list[dict]:
    if not headers:
        return []

    header_ids = [h.id for h in headers]
    vendor_ids = list(set(h.vendor_id for h in headers if h.vendor_id))

    items_result = await db.execute(select(POLineItem).where(POLineItem.headerId.in_(header_ids)))
    line_items = items_result.scalars().all()

    part_ids = list(set(li.partId for li in line_items if li.partId))
    parts_result = await db.execute(
        select(Part).where(Part.id.in_(part_ids))
        if part_ids
        else select(Part).where(Part.id.is_(None))
    )
    parts = {p.id: p for p in parts_result.scalars().all()}

    vendors_result = await db.execute(
        select(Vendor).where(Vendor.id.in_(vendor_ids))
        if vendor_ids
        else select(Vendor).where(Vendor.id.is_(None))
    )
    vendors = {v.id: v for v in vendors_result.scalars().all()}

    items_by_header = {}
    for li in line_items:
        items_by_header.setdefault(li.headerId, []).append(li)

    enriched = []
    for header in headers:
        header_items = items_by_header.get(header.id, [])
        line_item = header_items[0] if header_items else None
        part = parts.get(line_item.partId) if line_item and line_item.partId else None
        vendor = vendors.get(header.vendor_id)
        enriched.append(
            {
                "id": header.id,
                "poNumber": header.poNumber,
                "partId": line_item.partId if line_item else None,
                "vendorId": header.vendor_id,
                "qty": line_item.quantity if line_item else 0,
                "eta": line_item.eta if line_item else None,
                "status": header.status or "Not Ordered",
                "unitCost": line_item.itemPrice if line_item else None,
                "totalCost": header.poTotal,
                "taxCost": header.tax_total,
                "freightCost": header.freight_total,
                "poReference": None,
                "invoiceReference": None,
                "createdAt": header.createdAt,
                "updatedAt": header.updatedAt,
                "partName": part.name if part else None,
                "partPn": part.pn if part else None,
                "vendorName": vendor.name if vendor else None,
            }
        )
    return enriched


async def list_procurement(
    db: AsyncSession,
    page: PageParams,
    po_status: Optional[str] = None,
    vendorId: Optional[int] = None,
):
    query = select(POHeader)
    if po_status:
        query = query.where(POHeader.status == po_status)
    if vendorId:
        query = query.where(POHeader.vendor_id == vendorId)
    query = query.order_by(POHeader.id)
    result = await paginate(db, query, page)
    result["items"] = await batch_enrich(result["items"], db)
    return result


async def create_procurement(db: AsyncSession, data: dict, tenant_id: int) -> dict:
    count_result = await db.execute(select(func.count(POHeader.id)))
    count = count_result.scalar() or 0
    po_number = generate_po_number(count)

    total = data.get("totalCost")
    if total is None and data.get("unitCost") and data.get("qty"):
        total = data["unitCost"] * data["qty"]

    header = POHeader(
        poNumber=po_number,
        vendor_id=data.get("vendorId"),
        vendorName="",
        poTotal=total or 0,
        status="Not Ordered",
        tax_total=data.get("taxCost"),
        freight_total=data.get("freightCost"),
        tenantId=tenant_id,
    )
    db.add(header)
    await db.flush()

    line_item = POLineItem(
        headerId=header.id,
        itemName="",
        partId=data.get("partId"),
        quantity=data.get("qty"),
        itemPrice=data.get("unitCost") or 0,
        amount=total or 0,
        eta=data.get("eta"),
        tenantId=tenant_id,
    )
    db.add(line_item)
    await db.commit()
    await db.refresh(header)

    enriched = await batch_enrich([header], db)
    return enriched[0]


async def get_procurement_alerts(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(POHeader))
    headers = result.scalars().all()
    enriched = await batch_enrich(headers, db)

    alerts = []
    for item in enriched:
        if item["status"] in ("Ordered", "In Transit"):
            alerts.append(
                {
                    "level": "info",
                    "title": f"{item['poNumber']} in transit",
                    "desc": f"{item['partName'] or 'Items'} — {item['status'].lower()}",
                    "action": "Track shipment",
                    "poId": item["id"],
                    "poNumber": item["poNumber"],
                }
            )
        elif item["status"] == "Not Ordered":
            alerts.append(
                {
                    "level": "warning",
                    "title": f"{item['poNumber']} not yet ordered",
                    "desc": f"{item['partName'] or 'Items'} x{item['qty']} — awaiting PO placement",
                    "action": "Create PO",
                    "poId": item["id"],
                    "poNumber": item["poNumber"],
                }
            )
        elif item["status"] == "Quality Check":
            alerts.append(
                {
                    "level": "info",
                    "title": f"{item['poNumber']} awaiting QC",
                    "desc": f"{item['partName'] or 'Items'} x{item['qty']} — in quality check",
                    "action": "Review",
                    "poId": item["id"],
                    "poNumber": item["poNumber"],
                }
            )

    if not alerts:
        alerts.append(
            {
                "level": "info",
                "title": "No active alerts",
                "desc": "All procurement orders are on track",
                "action": "View pipeline",
                "poId": None,
                "poNumber": None,
            }
        )
    return alerts


async def get_procurement_order(db: AsyncSession, order_id: int) -> dict:
    result = await db.execute(select(POHeader).where(POHeader.id == order_id))
    header = result.scalar_one_or_none()
    if not header:
        raise HTTPException(status_code=404, detail=f"PO {order_id} not found")
    enriched = await batch_enrich([header], db)
    return enriched[0]


async def update_procurement(db: AsyncSession, order_id: int, data: dict) -> dict:
    result = await db.execute(select(POHeader).where(POHeader.id == order_id))
    header = result.scalar_one_or_none()
    if not header:
        raise HTTPException(status_code=404, detail=f"PO {order_id} not found")

    items_result = await db.execute(
        select(POLineItem).where(POLineItem.headerId == header.id).limit(1)
    )
    line_item = items_result.scalar_one_or_none()

    if "status" in data:
        header.status = data["status"]
    if "totalCost" in data:
        header.poTotal = data["totalCost"]
    if "taxCost" in data:
        header.tax_total = data["taxCost"]
    if "freightCost" in data:
        header.freight_total = data["freightCost"]
    if "vendorId" in data:
        header.vendor_id = data["vendorId"]
    if "notes" in data:
        header.notes = data["notes"]

    if line_item:
        if "partId" in data:
            line_item.partId = data["partId"]
        if "qty" in data:
            line_item.quantity = data["qty"]
        if "unitCost" in data:
            line_item.itemPrice = data["unitCost"]

    await db.commit()
    await db.refresh(header)
    enriched = await batch_enrich([header], db)
    return enriched[0]


async def advance_procurement_status(
    db: AsyncSession, order_id: int, action: Optional[str] = None
) -> dict:
    result = await db.execute(select(POHeader).where(POHeader.id == order_id))
    header = result.scalar_one_or_none()
    if not header:
        raise HTTPException(status_code=404, detail=f"PO {order_id} not found")

    current_idx = STAGES.index(header.status) if header.status in STAGES else -1

    if action == "reject":
        header.status = "Rejected"
    elif action == "approve" and header.status == "Quality Check":
        header.status = "Approved"
    elif current_idx >= 0 and current_idx < len(STAGES) - 1:
        header.status = STAGES[current_idx + 1]
    else:
        raise HTTPException(status_code=400, detail=f"Cannot advance from status '{header.status}'")

    await db.commit()
    await db.refresh(header)
    enriched = await batch_enrich([header], db)
    return enriched[0]


async def delete_procurement(db: AsyncSession, order_id: int) -> None:
    result = await db.execute(select(POHeader).where(POHeader.id == order_id))
    header = result.scalar_one_or_none()
    if not header:
        raise HTTPException(status_code=404, detail=f"PO {order_id} not found")

    items_result = await db.execute(select(POLineItem).where(POLineItem.headerId == header.id))
    for item in items_result.scalars().all():
        await db.delete(item)
    await db.delete(header)
    await db.commit()
