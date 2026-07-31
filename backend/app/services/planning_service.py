"""Planning service layer — required-quantity planning view + PO-from-BOM
generation (Track B, #8 / #15).

Explosion/aggregation traversal itself lives in
``bom_service.get_required_quantities`` (reused here, not duplicated); this
module is responsible for the planning-specific business logic layered on
top of it: resolving each part's preferred vendor and, for PO generation,
grouping parts by vendor and writing draft POHeader/POLineItem rows using
the EXISTING PO models (app/models/po_models.py) — the same models/pattern
``app/services/procurement_service.py`` writes through.
"""

import math
from datetime import UTC, datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import get_tenant_id
from app.models.part_vendor import PartVendor
from app.models.po_models import POHeader, POLineItem
from app.models.vendor import Vendor
from app.services import bom_service

_UNASSIGNED_VENDOR_NAME = "Unassigned"


async def _preferred_vendor_ids(
    db: AsyncSession, tid: Optional[int], part_ids: set[int]
) -> dict[int, int]:
    """part_id -> vendorId for parts whose preferred vendor is recorded via
    PartVendor.isPreferred — the fallback used when Part.primary_vendor_id
    (checked by the caller first) is not set."""
    if not part_ids:
        return {}
    stmt = select(PartVendor).where(
        PartVendor.partId.in_(part_ids), PartVendor.isPreferred.is_(True)
    )
    if tid is not None:
        stmt = stmt.where(PartVendor.tenantId == tid)
    rows = (await db.execute(stmt)).scalars().all()
    # If more than one PartVendor row is (incorrectly) flagged preferred for
    # the same part, the last one wins — deterministic, but callers should
    # treat multiple isPreferred rows per part as a data-quality issue.
    return {r.partId: r.vendorId for r in rows}


async def _attach_vendors(
    db: AsyncSession, tid: Optional[int], required: list[dict]
) -> list[dict]:
    """Resolve each required-quantity row's vendor: Part.primary_vendor_id
    first (already present on the row from get_required_quantities), else a
    PartVendor.isPreferred row, else None/"Unassigned"."""
    missing_ids = {r["part_id"] for r in required if not r.get("primary_vendor_id")}
    preferred = await _preferred_vendor_ids(db, tid, missing_ids)

    vendor_ids = {r["primary_vendor_id"] for r in required if r.get("primary_vendor_id")}
    vendor_ids |= set(preferred.values())
    vendors_map: dict[int, Vendor] = {}
    if vendor_ids:
        v_stmt = select(Vendor).where(Vendor.id.in_(vendor_ids))
        if tid is not None:
            v_stmt = v_stmt.where(Vendor.tenantId == tid)
        for v in (await db.execute(v_stmt)).scalars().all():
            vendors_map[v.id] = v

    out = []
    for r in required:
        vendor_id = r.get("primary_vendor_id") or preferred.get(r["part_id"])
        vendor = vendors_map.get(vendor_id) if vendor_id else None
        row = dict(r)
        row["vendor_id"] = vendor.id if vendor else None
        row["vendor_name"] = vendor.name if vendor else _UNASSIGNED_VENDOR_NAME
        row["extended_cost"] = round(row["unit_cost"] * row["required_qty"], 4)
        out.append(row)
    return out


async def get_planning_summary(
    db: AsyncSession, bom_id: int, purchased_as_leaf: bool = True
) -> dict:
    """Lightweight planning BOM view: per-part required quantity (honoring
    purchased_as_leaf — see bom_service.get_required_quantities), each with
    its resolved vendor, so a planner can preview a PO-from-BOM run before
    committing it."""
    required = await bom_service.get_required_quantities(db, bom_id, purchased_as_leaf)
    tid = get_tenant_id()
    enriched = await _attach_vendors(db, tid, required)
    return {
        "bom_id": bom_id,
        "purchased_as_leaf": purchased_as_leaf,
        "unique_parts": len(enriched),
        "total_required_qty": sum(r["required_qty"] for r in enriched),
        "total_extended_cost": round(sum(r["extended_cost"] for r in enriched), 2),
        "items": enriched,
    }


def _serialize_po(header: POHeader, items: list[POLineItem]) -> dict:
    return {
        "id": header.id,
        "poNumber": header.poNumber,
        "vendorName": header.vendorName,
        "vendor_id": header.vendor_id,
        "project_id": header.project_id,
        "status": header.status,
        "poTotal": float(header.poTotal or 0),
        "line_count": header.line_count,
        "items": [
            {
                "id": i.id,
                "headerId": i.headerId,
                "itemName": i.itemName,
                "itemDesc": i.itemDesc,
                "partId": i.partId,
                "quantity": i.quantity,
                "itemPrice": float(i.itemPrice or 0),
                "amount": float(i.amount or 0),
                "total": float(i.total or 0),
            }
            for i in items
        ],
    }


async def generate_po_from_bom(
    db: AsyncSession,
    bom_id: int,
    tenant_id: Optional[int] = None,
    purchased_as_leaf: bool = True,
) -> list[dict]:
    """Explode the BOM (honoring purchased_as_leaf), aggregate required
    quantity per part, group by preferred vendor, and CREATE draft PO
    header(s) + lines using the existing POHeader/POLineItem models. Returns
    the created PO(s) as dicts (one per vendor group, including an
    "Unassigned" group for parts with no resolvable vendor).

    `tenant_id`, when supplied, is used both to scope the vendor-lookup
    queries below AND to stamp every new row's tenantId — mirroring
    bom_service.create_bom_item's convention for superuser callers, where
    the ambient tenant context (used internally by get_bom_or_404 /
    get_required_quantities) resolves to None but a concrete tenant is still
    required for the NOT NULL tenantId columns being written here.
    """
    tid = tenant_id if tenant_id is not None else get_tenant_id()
    bom = await bom_service.get_bom_or_404(db, bom_id)

    required = await bom_service.get_required_quantities(db, bom_id, purchased_as_leaf)
    if not required:
        raise HTTPException(
            status_code=400,
            detail="BOM has no purchasable line items to generate a PO from",
        )
    enriched = await _attach_vendors(db, tid, required)

    groups: dict[Optional[int], list[dict]] = {}
    for row in enriched:
        groups.setdefault(row["vendor_id"], []).append(row)

    # Tenant-scoped running PO-number counter — same
    # f"PO-{year}-{count:04d}" shape as procurement_service.generate_po_number,
    # but tenant-scoped (that function's caller does not scope its count
    # query) and incremented locally per header created in THIS call so
    # multiple vendor groups never collide on one number.
    count_stmt = select(func.count()).select_from(POHeader)
    if tid is not None:
        count_stmt = count_stmt.where(POHeader.tenantId == tid)
    next_seq = (await db.execute(count_stmt)).scalar() or 0
    year = datetime.now(UTC).year

    created_headers: list[tuple[POHeader, list[POLineItem]]] = []

    for vendor_id, rows in groups.items():
        vendor_name = rows[0]["vendor_name"]
        next_seq += 1
        po_number = f"PO-{year}-{next_seq:04d}"

        header = POHeader(
            poNumber=po_number,
            vendorName=vendor_name,
            vendor_id=vendor_id,
            project_id=bom.project_id,
            status="draft",
            tenantId=tid,
        )
        db.add(header)
        await db.flush()  # assigns header.id, needed by line items below

        line_items = []
        for row in rows:
            # POLineItem.quantity is an Integer column while the aggregated
            # required_qty is a float (BOMItem.quantity is Numeric(10,4)) —
            # round UP so purchasing never orders less than required.
            qty = max(1, math.ceil(row["required_qty"]))
            unit_price = row["unit_cost"]
            amount = round(unit_price * qty, 4)
            line = POLineItem(
                headerId=header.id,
                itemName=row["part_name"] or row["part_number"] or f"Part {row['part_id']}",
                itemDesc=row["part_number"],
                partId=row["part_id"],
                quantity=qty,
                itemPrice=unit_price,
                amount=amount,
                total=amount,
                tenantId=tid,
            )
            db.add(line)
            line_items.append(line)

        await db.flush()
        header.poTotal = sum(float(li.amount or 0) for li in line_items)
        header.subtotal = header.poTotal
        header.line_count = len(line_items)
        created_headers.append((header, line_items))

    await db.commit()
    for header, _ in created_headers:
        await db.refresh(header)

    return [_serialize_po(header, items) for header, items in created_headers]
