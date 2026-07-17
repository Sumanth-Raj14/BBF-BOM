from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.db.session import get_db
from app.models.order_tracking import OrderTracking, ShipmentUpdate, TrackingMilestone
from app.models.po_models import POHeader
from app.schemas.order_tracking_schemas import (
    OrderTrackingCreate,
    OrderTrackingResponse,
    OrderTrackingUpdate,
    ShipmentUpdateCreate,
    ShipmentUpdateResponse,
    TrackingMilestoneResponse,
)

router = APIRouter(dependencies=[Depends(get_current_user)])

# Standard stages like Amazon / e-commerce
DEFAULT_STAGES = [
    {
        "stage": "order_placed",
        "label": "Order Placed",
        "icon": "clipboard",
        "sortOrder": 0,
    },
    {"stage": "confirmed", "label": "Order Confirmed", "icon": "check", "sortOrder": 1},
    {"stage": "processing", "label": "Processing", "icon": "settings", "sortOrder": 2},
    {"stage": "packed", "label": "Packed & Ready", "icon": "box", "sortOrder": 3},
    {"stage": "shipped", "label": "Shipped", "icon": "truck", "sortOrder": 4},
    {"stage": "in_transit", "label": "In Transit", "icon": "route", "sortOrder": 5},
    {
        "stage": "out_for_delivery",
        "label": "Out for Delivery",
        "icon": "pin",
        "sortOrder": 6,
    },
    {
        "stage": "delivered",
        "label": "Delivered",
        "icon": "check-circle",
        "sortOrder": 7,
    },
    {
        "stage": "completed",
        "label": "Completed",
        "icon": "check-double",
        "sortOrder": 8,
    },
]


@router.get("")
async def list_tracking(
    page: PageParams = Depends(get_page_params),
    status: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(OrderTracking).options(
        selectinload(OrderTracking.milestones),
        selectinload(OrderTracking.shipmentUpdates),
    )

    if status:
        query = query.where(OrderTracking.currentStage == status)

    query = query.order_by(OrderTracking.id)
    result = await paginate(db, query, page)

    result["items"] = [
        OrderTrackingResponse(
            id=t.id,
            poHeaderId=t.poHeaderId,
            currentStage=t.currentStage,
            carrier=t.carrier,
            trackingNumber=t.trackingNumber,
            trackingUrl=t.trackingUrl,
            estimatedDelivery=t.estimatedDelivery,
            actualDelivery=t.actualDelivery,
            shippingAddress=t.shippingAddress,
            notes=t.notes,
            createdAt=str(t.createdAt) if t.createdAt else None,
            updatedAt=str(t.updatedAt) if t.updatedAt else None,
            milestones=[
                TrackingMilestoneResponse(
                    id=m.id,
                    trackingId=m.trackingId,
                    stage=m.stage,
                    label=m.label,
                    description=m.description,
                    completed=m.completed,
                    completedAt=str(m.completedAt) if m.completedAt else None,
                    sortOrder=m.sortOrder,
                    icon=m.icon,
                )
                for m in sorted(t.milestones, key=lambda x: x.sortOrder)
            ],
            shipmentUpdates=[
                ShipmentUpdateResponse(
                    id=s.id,
                    trackingId=s.trackingId,
                    location=s.location,
                    status=s.status,
                    description=s.description,
                    carrierCode=s.carrierCode,
                    timestamp=str(s.timestamp) if s.timestamp else None,
                    createdAt=str(s.createdAt) if s.createdAt else None,
                )
                for s in t.shipmentUpdates
            ],
        )
        for t in result["items"]
    ]

    return result


@router.get("/stats")
async def tracking_stats(db: AsyncSession = Depends(get_db)):
    """Get tracking aggregate statistics."""
    result = await db.execute(select(func.count(OrderTracking.id)))
    total = result.scalar() or 0

    result = await db.execute(
        text('SELECT "currentStage", COUNT(*) as cnt FROM "order_tracking" GROUP BY "currentStage"')
    )
    by_stage = {}
    for row in result.fetchall():
        by_stage[row[0]] = row[1]

    result = await db.execute(
        text(
            'SELECT COUNT(*) FROM "order_tracking" WHERE "estimatedDelivery" < NOW()::text AND "currentStage" NOT IN (\'delivered\', \'completed\')'
        )
    )
    overdue = result.scalar() or 0

    return {
        "totalTracked": total,
        "byStage": by_stage,
        "overdue": overdue,
    }


@router.get("/{tracking_id}")
async def get_tracking(tracking_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single tracking record with all milestones and shipment updates."""
    result = await db.execute(
        select(OrderTracking)
        .options(selectinload(OrderTracking.milestones))
        .options(selectinload(OrderTracking.shipmentUpdates))
        .where(OrderTracking.id == tracking_id)
    )
    tracking = result.scalar_one_or_none()
    if not tracking:
        raise HTTPException(status_code=404, detail="Tracking record not found")

    # Get PO header info
    po_result = await db.execute(select(POHeader).where(POHeader.id == tracking.poHeaderId))
    po = po_result.scalar_one_or_none()

    return {
        "id": tracking.id,
        "poHeaderId": tracking.poHeaderId,
        "currentStage": tracking.currentStage,
        "carrier": tracking.carrier,
        "trackingNumber": tracking.trackingNumber,
        "trackingUrl": tracking.trackingUrl,
        "estimatedDelivery": tracking.estimatedDelivery,
        "actualDelivery": tracking.actualDelivery,
        "shippingAddress": tracking.shippingAddress,
        "notes": tracking.notes,
        "createdAt": str(tracking.createdAt) if tracking.createdAt else None,
        "updatedAt": str(tracking.updatedAt) if tracking.updatedAt else None,
        "po": {
            "poNumber": po.poNumber if po else None,
            "vendorName": po.vendorName if po else None,
            "poTotal": po.poTotal if po else None,
            "project": po.project if po else None,
            "status": po.status if po else None,
        }
        if po
        else None,
        "milestones": [
            {
                "id": m.id,
                "stage": m.stage,
                "label": m.label,
                "description": m.description,
                "completed": m.completed,
                "completedAt": str(m.completedAt) if m.completedAt else None,
                "sortOrder": m.sortOrder,
                "icon": m.icon,
            }
            for m in sorted(tracking.milestones, key=lambda x: x.sortOrder)
        ],
        "shipmentUpdates": [
            {
                "id": s.id,
                "location": s.location,
                "status": s.status,
                "description": s.description,
                "carrierCode": s.carrierCode,
                "timestamp": str(s.timestamp) if s.timestamp else None,
                "createdAt": str(s.createdAt) if s.createdAt else None,
            }
            for s in tracking.shipmentUpdates
        ],
    }


@router.get("/by-po/{po_id}")
async def get_tracking_by_po(po_id: int, db: AsyncSession = Depends(get_db)):
    """Get tracking record for a specific PO."""
    result = await db.execute(
        select(OrderTracking)
        .options(selectinload(OrderTracking.milestones))
        .options(selectinload(OrderTracking.shipmentUpdates))
        .where(OrderTracking.poHeaderId == po_id)
    )
    tracking = result.scalar_one_or_none()
    if not tracking:
        raise HTTPException(status_code=404, detail="No tracking record for this PO")

    po_result = await db.execute(select(POHeader).where(POHeader.id == po_id))
    po = po_result.scalar_one_or_none()

    return {
        "id": tracking.id,
        "poHeaderId": tracking.poHeaderId,
        "currentStage": tracking.currentStage,
        "carrier": tracking.carrier,
        "trackingNumber": tracking.trackingNumber,
        "trackingUrl": tracking.trackingUrl,
        "estimatedDelivery": tracking.estimatedDelivery,
        "actualDelivery": tracking.actualDelivery,
        "shippingAddress": tracking.shippingAddress,
        "notes": tracking.notes,
        "createdAt": str(tracking.createdAt) if tracking.createdAt else None,
        "updatedAt": str(tracking.updatedAt) if tracking.updatedAt else None,
        "po": {
            "poNumber": po.poNumber if po else None,
            "vendorName": po.vendorName if po else None,
            "poTotal": po.poTotal if po else None,
            "project": po.project if po else None,
        }
        if po
        else None,
        "milestones": [
            {
                "id": m.id,
                "stage": m.stage,
                "label": m.label,
                "description": m.description,
                "completed": m.completed,
                "completedAt": str(m.completedAt) if m.completedAt else None,
                "sortOrder": m.sortOrder,
                "icon": m.icon,
            }
            for m in sorted(tracking.milestones, key=lambda x: x.sortOrder)
        ],
        "shipmentUpdates": [
            {
                "id": s.id,
                "location": s.location,
                "status": s.status,
                "description": s.description,
                "carrierCode": s.carrierCode,
                "timestamp": str(s.timestamp) if s.timestamp else None,
                "createdAt": str(s.createdAt) if s.createdAt else None,
            }
            for s in tracking.shipmentUpdates
        ],
    }


@router.post("", response_model=OrderTrackingResponse, status_code=201)
async def create_tracking(data: OrderTrackingCreate, db: AsyncSession = Depends(get_db)):
    """Create a tracking record for a PO with default milestones."""
    existing = await db.execute(
        select(OrderTracking).where(OrderTracking.poHeaderId == data.poHeaderId)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tracking record already exists for this PO")

    tracking = OrderTracking(
        poHeaderId=data.poHeaderId,
        currentStage=data.currentStage or "order_placed",
        carrier=data.carrier,
        trackingNumber=data.trackingNumber,
        trackingUrl=data.trackingUrl,
        estimatedDelivery=data.estimatedDelivery,
        shippingAddress=data.shippingAddress,
        notes=data.notes,
    )
    db.add(tracking)
    await db.flush()

    stages = data.milestones if data.milestones else DEFAULT_STAGES
    for s in stages:
        milestone = TrackingMilestone(
            trackingId=tracking.id,
            stage=s.stage,
            label=s.label,
            description=s.description if hasattr(s, "description") else None,
            completed=s.completed if hasattr(s, "completed") else False,
            completedAt=s.completedAt if hasattr(s, "completedAt") else None,
            sortOrder=s.sortOrder if hasattr(s, "sortOrder") else 0,
            icon=s.icon if hasattr(s, "icon") else None,
        )
        db.add(milestone)

    await db.commit()
    await db.refresh(tracking)

    return OrderTrackingResponse(
        id=tracking.id,
        poHeaderId=tracking.poHeaderId,
        currentStage=tracking.currentStage,
        carrier=tracking.carrier,
        trackingNumber=tracking.trackingNumber,
        trackingUrl=tracking.trackingUrl,
        estimatedDelivery=tracking.estimatedDelivery,
        shippingAddress=tracking.shippingAddress,
        notes=tracking.notes,
        createdAt=str(tracking.createdAt) if tracking.createdAt else None,
    )


@router.put("/{tracking_id}", response_model=OrderTrackingResponse)
async def update_tracking(
    tracking_id: int, data: OrderTrackingUpdate, db: AsyncSession = Depends(get_db)
):
    """Update tracking record."""
    result = await db.execute(select(OrderTracking).where(OrderTracking.id == tracking_id))
    tracking = result.scalar_one_or_none()
    if not tracking:
        raise HTTPException(status_code=404, detail="Tracking record not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(tracking, key, value)

    await db.commit()
    await db.refresh(tracking)

    return OrderTrackingResponse(
        id=tracking.id,
        poHeaderId=tracking.poHeaderId,
        currentStage=tracking.currentStage,
        carrier=tracking.carrier,
        trackingNumber=tracking.trackingNumber,
        trackingUrl=tracking.trackingUrl,
        estimatedDelivery=tracking.estimatedDelivery,
        shippingAddress=tracking.shippingAddress,
        notes=tracking.notes,
        createdAt=str(tracking.createdAt) if tracking.createdAt else None,
        updatedAt=str(tracking.updatedAt) if tracking.updatedAt else None,
    )


@router.patch("/{tracking_id}", response_model=OrderTrackingResponse)
async def patch_tracking(
    tracking_id: int,
    data: OrderTrackingUpdate,
    db: AsyncSession = Depends(get_db),
):
    return await update_tracking(tracking_id, data, db)


@router.post("/{tracking_id}/advance")
async def advance_stage(tracking_id: int, db: AsyncSession = Depends(get_db)):
    """Advance to the next stage automatically."""
    result = await db.execute(
        select(OrderTracking)
        .options(selectinload(OrderTracking.milestones))
        .where(OrderTracking.id == tracking_id)
    )
    tracking = result.scalar_one_or_none()
    if not tracking:
        raise HTTPException(status_code=404, detail="Tracking record not found")

    current_idx = -1
    for i, m in enumerate(sorted(tracking.milestones, key=lambda x: x.sortOrder)):
        if m.stage == tracking.currentStage:
            current_idx = i
            break

    if current_idx < len(tracking.milestones) - 1:
        next_milestone = sorted(tracking.milestones, key=lambda x: x.sortOrder)[current_idx + 1]
        tracking.currentStage = next_milestone.stage
        next_milestone.completed = True
        next_milestone.completedAt = func.now()

        if next_milestone.stage in ("delivered", "completed"):
            tracking.actualDelivery = str(func.now())

        await db.commit()
        return {
            "message": f"Advanced to: {next_milestone.label}",
            "stage": next_milestone.stage,
        }
    else:
        return {"message": "Already at final stage", "stage": tracking.currentStage}


@router.delete("/{tracking_id}")
async def delete_tracking(tracking_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a tracking record."""
    result = await db.execute(select(OrderTracking).where(OrderTracking.id == tracking_id))
    tracking = result.scalar_one_or_none()
    if not tracking:
        raise HTTPException(status_code=404, detail="Tracking record not found")

    await db.delete(tracking)
    await db.commit()
    return {"message": "Tracking record deleted"}


@router.post(
    "/{tracking_id}/shipment-updates",
    response_model=ShipmentUpdateResponse,
    status_code=201,
)
async def add_shipment_update(
    tracking_id: int, data: ShipmentUpdateCreate, db: AsyncSession = Depends(get_db)
):
    """Add a shipment update (carrier scan/event)."""
    result = await db.execute(select(OrderTracking).where(OrderTracking.id == tracking_id))
    tracking = result.scalar_one_or_none()
    if not tracking:
        raise HTTPException(status_code=404, detail="Tracking record not found")

    update = ShipmentUpdate(
        trackingId=tracking_id,
        location=data.location,
        status=data.status,
        description=data.description,
        carrierCode=data.carrierCode,
        timestamp=data.timestamp,
    )
    db.add(update)
    await db.commit()
    await db.refresh(update)

    return ShipmentUpdateResponse(
        id=update.id,
        trackingId=update.trackingId,
        location=update.location,
        status=update.status,
        description=update.description,
        carrierCode=update.carrierCode,
        timestamp=str(update.timestamp) if update.timestamp else None,
        createdAt=str(update.createdAt) if update.createdAt else None,
    )
