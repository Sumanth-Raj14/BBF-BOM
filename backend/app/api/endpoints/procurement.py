from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params
from app.core.rbac import require_procurement_write
from app.db.session import get_db
from app.integrations.events import emit_integration_event
from app.models.user import User
from app.services import procurement_service

router = APIRouter()


class ProcurementCreate(BaseModel):
    partId: int
    vendorId: int
    qty: int
    unitCost: Optional[float] = None
    totalCost: Optional[float] = None
    taxCost: Optional[float] = None
    freightCost: Optional[float] = None
    eta: Optional[str] = None
    poReference: Optional[str] = None
    notes: Optional[str] = None


class ProcurementUpdate(BaseModel):
    partId: Optional[int] = None
    vendorId: Optional[int] = None
    qty: Optional[int] = None
    unitCost: Optional[float] = None
    totalCost: Optional[float] = None
    taxCost: Optional[float] = None
    freightCost: Optional[float] = None
    eta: Optional[str] = None
    status: Optional[str] = None
    poReference: Optional[str] = None
    invoiceReference: Optional[str] = None
    notes: Optional[str] = None


class ProcurementResponse(BaseModel):
    id: int
    poNumber: str
    partId: int
    vendorId: int
    qty: int
    eta: Optional[str] = None
    status: str
    unitCost: Optional[float] = None
    totalCost: Optional[float] = None
    taxCost: Optional[float] = None
    freightCost: Optional[float] = None
    poReference: Optional[str] = None
    invoiceReference: Optional[str] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None
    partName: Optional[str] = None
    partPn: Optional[str] = None
    vendorName: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class AdvanceStatusRequest(BaseModel):
    action: Optional[str] = None


class AlertResponse(BaseModel):
    level: str
    title: str
    desc: str
    action: str
    poId: Optional[int] = None
    poNumber: Optional[str] = None


@router.get("/")
async def get_procurement(
    page: PageParams = Depends(get_page_params),
    po_status: Optional[str] = None,
    vendorId: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await procurement_service.list_procurement(db, page, po_status, vendorId)


@router.post("/", response_model=ProcurementResponse, status_code=status.HTTP_201_CREATED)
async def create_procurement(
    procurement: ProcurementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_procurement_write),
):
    result = await procurement_service.create_procurement(
        db, procurement.model_dump(), current_user.tenantId
    )
    # Outbound PO create event (the deliver path reloads the header + lines).
    await emit_integration_event(
        db, current_user.tenantId, "purchase_order", result["id"], "created",
        {"ref": result.get("poNumber"), "status": result.get("status")},
    )
    await db.commit()
    return result


@router.get("/alerts", response_model=list[AlertResponse])
async def get_procurement_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alerts = await procurement_service.get_procurement_alerts(db)
    return [AlertResponse(**a) for a in alerts]


@router.get("/{order_id}", response_model=ProcurementResponse)
async def get_procurement_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await procurement_service.get_procurement_order(db, order_id)


@router.put("/{order_id}", response_model=ProcurementResponse)
async def update_procurement(
    order_id: int,
    procurement_update: ProcurementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_procurement_write),
):
    return await procurement_service.update_procurement(
        db, order_id, procurement_update.model_dump(exclude_unset=True)
    )


@router.patch("/{order_id}", response_model=ProcurementResponse)
async def patch_procurement(
    order_id: int,
    procurement_update: ProcurementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_procurement_write),
):
    return await update_procurement(order_id, procurement_update, db, current_user)


@router.post("/{order_id}/advance", response_model=ProcurementResponse)
async def advance_procurement_status(
    order_id: int,
    body: AdvanceStatusRequest = AdvanceStatusRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_procurement_write),
):
    result = await procurement_service.advance_procurement_status(db, order_id, body.action)
    await emit_integration_event(
        db, current_user.tenantId, "purchase_order", result["id"], "status_change",
        {"ref": result.get("poNumber"), "status": result.get("status")},
    )
    await db.commit()
    return result


@router.delete("/{order_id}", status_code=204)
async def delete_procurement(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_procurement_write),
):
    await procurement_service.delete_procurement(db, order_id)
    # Cascade-clean the polymorphic Zoho mapping (spec §4.7/§10-K).
    from app.integrations.zoho_inbound import cascade_clean

    await cascade_clean(db, current_user.tenantId, "purchase_order", order_id)
    await db.commit()
    return None
