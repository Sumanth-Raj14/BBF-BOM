"""
Service BOM + BOM Merge API
Endpoints for service BOM management and BOM merging.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter()


# ---- Service BOM ----


class ServiceBomHeaderCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_product_pn: Optional[str] = None
    service_type: Optional[str] = "maintenance"


class ServiceBomItemCreate(BaseModel):
    part_id: Optional[int] = None
    part_pn: Optional[str] = None
    part_name: Optional[str] = None
    quantity: float = 1
    unit: str = "EA"
    service_type: Optional[str] = None
    interval_hours: Optional[int] = None
    interval_months: Optional[int] = None
    is_wear_part: bool = False
    is_consumable: bool = False


class ServiceBomMergeRequest(BaseModel):
    source_bom_ids: list[int]
    target_name: str
    conflict_resolution: str = "keep_highest_qty"


@router.get("/service-bom")
async def list_service_boms(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text(
            """SELECT h.*, COALESCE(item_counts.cnt, 0) as items_count
            FROM service_bom_headers h
            LEFT JOIN (
                SELECT service_bom_id, COUNT(*) as cnt
                FROM service_bom_items GROUP BY service_bom_id
            ) item_counts ON h.id = item_counts.service_bom_id
            ORDER BY h.id DESC LIMIT :limit OFFSET :skip"""
        ),
        {"limit": limit, "skip": skip},
    )
    return [dict(r) for r in result.mappings().all()]


@router.post("/service-bom")
async def create_service_bom(
    body: ServiceBomHeaderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count_result = await db.execute(text("SELECT COUNT(*) FROM service_bom_headers"))
    count = count_result.scalar() or 0
    bom_number = f"SBOM-{datetime.now().year}-{count + 1:04d}"
    await db.execute(
        text(
            "INSERT INTO service_bom_headers (bom_number, name, description, parent_product_pn, service_type, created_by) VALUES (:bn, :name, :desc, :ppn, :st, :uid)"
        ),
        {
            "bn": bom_number,
            "name": body.name,
            "desc": body.description,
            "ppn": body.parent_product_pn,
            "st": body.service_type,
            "uid": current_user.id,
        },
    )
    await db.commit()
    return {"bom_number": bom_number, "status": "created"}


@router.get("/service-bom/{bom_id}")
async def get_service_bom(
    bom_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hdr = await db.execute(text("SELECT * FROM service_bom_headers WHERE id = :id"), {"id": bom_id})
    header = hdr.mappings().first()
    if not header:
        raise HTTPException(404, "Service BOM not found")
    items = await db.execute(
        text("SELECT * FROM service_bom_items WHERE service_bom_id = :bid ORDER BY sort_order"),
        {"bid": bom_id},
    )
    return {"header": dict(header), "items": [dict(r) for r in items.mappings().all()]}


@router.post("/service-bom/{bom_id}/items")
async def add_service_bom_item(
    bom_id: int,
    body: ServiceBomItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        text(
            "INSERT INTO service_bom_items (service_bom_id, part_id, part_pn, part_name, quantity, unit, service_type, interval_hours, interval_months, is_wear_part, is_consumable) VALUES (:bid, :pid, :ppn, :pn, :qty, :u, :st, :ih, :im, :wp, :ic)"
        ),
        {
            "bid": bom_id,
            "pid": body.part_id,
            "ppn": body.part_pn,
            "pn": body.part_name,
            "qty": body.quantity,
            "u": body.unit,
            "st": body.service_type,
            "ih": body.interval_hours,
            "im": body.interval_months,
            "wp": body.is_wear_part,
            "ic": body.is_consumable,
        },
    )
    await db.commit()
    return {"status": "added"}


@router.delete("/service-bom/{bom_id}/items/{item_id}")
async def delete_service_bom_item(
    bom_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        text("DELETE FROM service_bom_items WHERE id = :iid AND service_bom_id = :bid"),
        {"iid": item_id, "bid": bom_id},
    )
    await db.commit()
    return {"status": "deleted"}


# ---- BOM Merge ----


@router.post("/bom/merge")
async def merge_boms(
    body: ServiceBomMergeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if len(body.source_bom_ids) < 2:
        raise HTTPException(400, "Need at least 2 BOMs to merge")

    all_items = []
    for bom_id in body.source_bom_ids:
        result = await db.execute(
            text('SELECT * FROM bom_items WHERE "bomTemplateId" = :bid'),
            {"bid": bom_id},
        )
        all_items.extend(result.mappings().all())

    merged = {}
    for item in all_items:
        pn = item.get("pn") or item.get("name", "unknown")
        if pn in merged:
            existing = merged[pn]
            if body.conflict_resolution == "keep_highest_qty":
                existing["quantity"] = max(existing["quantity"] or 0, item.get("quantity", 0))
            elif body.conflict_resolution == "sum":
                existing["quantity"] = (existing["quantity"] or 0) + (item.get("quantity", 0))
            existing["sources"] = existing.get("sources", []) + [item.get("bomTemplateId")]
        else:
            merged[pn] = {
                "pn": pn,
                "name": item.get("name"),
                "quantity": item.get("quantity"),
                "uom": item.get("uom"),
                "cost": item.get("cost"),
                "sources": [item.get("bomTemplateId")],
            }

    return {
        "merged_name": body.target_name,
        "conflict_resolution": body.conflict_resolution,
        "total_items": len(merged),
        "items": list(merged.values()),
        "source_bom_ids": body.source_bom_ids,
    }
