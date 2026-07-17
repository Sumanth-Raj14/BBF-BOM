from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.db.session import get_db
from app.models.po_models import POHeader, POLineItem
from app.schemas.po_schemas import (
    POHeaderResponse,
    POLineItemResponse,
)

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("")
async def list_po_headers(
    page: PageParams = Depends(get_page_params),
    status: str = Query(None),
    project: str = Query(None),
    vendor: str = Query(None),
    search: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(POHeader)

    if status:
        query = query.where(POHeader.status.ilike(f"%{status}%"))
    if project:
        query = query.where(POHeader.project.ilike(f"%{project}%"))
    if vendor:
        query = query.where(POHeader.vendorName.ilike(f"%{vendor}%"))
    if search:
        query = query.where(
            POHeader.poNumber.ilike(f"%{search}%") | POHeader.vendorName.ilike(f"%{search}%")
        )

    query = query.order_by(POHeader.poDate.desc(), POHeader.poNumber.desc())
    result = await paginate(db, query, page)
    headers = result["items"]

    items_query = select(POLineItem)
    items_result = await db.execute(items_query)
    all_items = items_result.scalars().all()
    items_by_header = {}
    for item in all_items:
        items_by_header.setdefault(item.headerId, []).append(item)

    header_responses = []
    for h in headers:
        h_items = items_by_header.get(h.id, [])
        header_responses.append(
            POHeaderResponse(
                id=h.id,
                poNumber=h.poNumber,
                poDate=h.poDate,
                vendorName=h.vendorName,
                project=h.project,
                poTotal=h.poTotal,
                status=h.status,
                createdAt=str(h.createdAt) if h.createdAt else None,
                items=[
                    POLineItemResponse(
                        id=i.id,
                        headerId=i.headerId,
                        itemName=i.itemName,
                        itemDesc=i.itemDesc,
                        quantity=i.quantity,
                        itemPrice=i.itemPrice,
                        amount=i.amount,
                        gst=i.gst,
                        total=i.total,
                    )
                    for i in h_items
                ],
            )
        )

    result["items"] = header_responses
    return result


@router.get("/stats")
async def po_stats(db: AsyncSession = Depends(get_db)):
    """Get PO aggregate statistics."""
    # Total POs and value
    result = await db.execute(select(func.count(POHeader.id)))
    total_pos = result.scalar() or 0

    result = await db.execute(select(func.coalesce(func.sum(POHeader.poTotal), 0)))
    total_value = result.scalar() or 0

    # Total line items
    result = await db.execute(select(func.count(POLineItem.id)))
    total_items = result.scalar() or 0

    # By status
    status_result = await db.execute(
        text(
            'SELECT status, COUNT(*) as cnt, SUM("poTotal") as val FROM "po_headers" GROUP BY status'
        )
    )
    by_status = {}
    for row in status_result.fetchall():
        by_status[row[0] or "Unknown"] = {"count": row[1], "value": float(row[2] or 0)}

    # By project
    project_result = await db.execute(
        text(
            'SELECT project, COUNT(*) as cnt, SUM("poTotal") as val FROM "po_headers" WHERE project IS NOT NULL GROUP BY project'
        )
    )
    by_project = {}
    for row in project_result.fetchall():
        by_project[row[0]] = {"count": row[1], "value": float(row[2] or 0)}

    # By vendor (top 10)
    vendor_result = await db.execute(
        text(
            'SELECT "vendorName", COUNT(*) as cnt, SUM("poTotal") as val FROM "po_headers" GROUP BY "vendorName" ORDER BY val DESC LIMIT 10'
        )
    )
    by_vendor = {}
    for row in vendor_result.fetchall():
        by_vendor[row[0]] = {"count": row[1], "value": float(row[2] or 0)}

    # Recent POs
    recent_result = await db.execute(select(POHeader).order_by(POHeader.createdAt.desc()).limit(5))
    recent = recent_result.scalars().all()

    return {
        "totalPOs": total_pos,
        "totalValue": float(total_value),
        "totalItems": total_items,
        "byStatus": by_status,
        "byProject": by_project,
        "byVendor": by_vendor,
        "recentPOs": [
            {
                "id": r.id,
                "poNumber": r.poNumber,
                "vendorName": r.vendorName,
                "poTotal": r.poTotal,
                "status": r.status,
                "project": r.project,
            }
            for r in recent
        ],
    }


@router.get("/{po_id}")
async def get_po_header(po_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single PO header with all its line items."""
    result = await db.execute(select(POHeader).where(POHeader.id == po_id))
    header = result.scalar_one_or_none()
    if not header:
        raise HTTPException(status_code=404, detail="PO not found")

    items_result = await db.execute(select(POLineItem).where(POLineItem.headerId == po_id))
    items = items_result.scalars().all()

    return {
        "id": header.id,
        "poNumber": header.poNumber,
        "poDate": header.poDate,
        "vendorName": header.vendorName,
        "project": header.project,
        "poTotal": header.poTotal,
        "status": header.status,
        "createdAt": str(header.createdAt) if header.createdAt else None,
        "items": [
            {
                "id": i.id,
                "headerId": i.headerId,
                "itemName": i.itemName,
                "itemDesc": i.itemDesc,
                "quantity": i.quantity,
                "itemPrice": i.itemPrice,
                "amount": i.amount,
                "gst": i.gst,
                "total": i.total,
            }
            for i in items
        ],
    }
