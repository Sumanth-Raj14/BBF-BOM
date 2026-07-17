"""
Engineering Change Management API
ECO/ECN/ECR workflow with approvals and digital signatures
"""

from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_admin, require_engineering, require_viewer
from app.db.session import get_db
from app.integrations.events import emit_integration_event
from app.models.eco import EcoApproval, EcoHeader, EcoNotification
from app.models.user import User
from app.services.eco_service import (
    add_eco_item as service_add_item,
)
from app.services.eco_service import (
    create_eco as service_create_eco,
)
from app.services.eco_service import (
    get_eco_detail as service_get_eco,
)
from app.services.eco_service import (
    get_eco_impact as service_impact,
)
from app.services.eco_service import (
    perform_eco_action as service_eco_action,
)

router = APIRouter(tags=["eco"], dependencies=[Depends(get_current_user), Depends(require_viewer)])


class EcoCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    reason: Optional[str] = None
    change_type: str
    priority: str = "medium"
    impact_level: Optional[str] = None
    effective_date: Optional[str] = None
    target_completion_date: Optional[str] = None


class EcoItemRequest(BaseModel):
    part_id: int
    bom_id: Optional[int] = None
    change_type: str
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    impact_description: Optional[str] = None


class EcoApprovalRequest(BaseModel):
    approver_id: int
    approval_order: int


class EcoActionRequest(BaseModel):
    action: str
    comments: Optional[str] = None
    digital_signature: Optional[str] = None


@router.post("/")
async def create_eco(
    request: EcoCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    return await service_create_eco(
        db=db,
        current_user=current_user,
        title=request.title,
        description=request.description,
        reason=request.reason,
        change_type=request.change_type,
        priority=request.priority,
        impact_level=request.impact_level,
        effective_date=request.effective_date,
        target_completion_date=request.target_completion_date,
    )


@router.get("/")
async def list_ecos(
    page: PageParams = Depends(get_page_params),
    status: Optional[str] = None,
    priority: Optional[str] = None,
    change_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(EcoHeader)
    if status:
        stmt = stmt.where(EcoHeader.status == status)
    if priority:
        stmt = stmt.where(EcoHeader.priority == priority)
    if change_type:
        stmt = stmt.where(EcoHeader.change_type == change_type)
    stmt = stmt.order_by(EcoHeader.id.desc())
    return await paginate(db, stmt, page)


@router.get("/{eco_id}")
async def get_eco(
    eco_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await service_get_eco(db=db, eco_id=eco_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{eco_id}/items")
async def add_eco_item(
    eco_id: int,
    request: EcoItemRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    try:
        return await service_add_item(
            db=db,
            eco_id=eco_id,
            part_id=request.part_id,
            change_type=request.change_type,
            bom_id=request.bom_id,
            old_value=request.old_value,
            new_value=request.new_value,
            impact_description=request.impact_description,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{eco_id}/action")
async def eco_action(
    eco_id: int,
    request: EcoActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    try:
        return await service_eco_action(
            db=db,
            current_user=current_user,
            eco_id=eco_id,
            action=request.action,
            comments=request.comments,
            digital_signature=request.digital_signature,
        )
    except ValueError as e:
        raise HTTPException(status_code=404 if "not found" in str(e) else 400, detail=str(e))


@router.post("/{eco_id}/approve")
async def approve_eco(
    eco_id: int,
    approver_id: int,
    comments: Optional[str] = None,
    digital_signature: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(EcoHeader).where(EcoHeader.id == eco_id))
    eco = result.scalar_one_or_none()
    if not eco:
        raise HTTPException(status_code=404, detail="ECO not found")
    approval = EcoApproval(
        eco_id=eco_id,
        approver_id=approver_id,
        approval_order=1,
        status="approved",
        comments=comments,
        signed_at=datetime.now(UTC),
        digital_signature=digital_signature,
    )
    db.add(approval)
    eco.status = "approved"
    eco.approved_by = approver_id
    eco.approved_at = datetime.now(UTC)
    await emit_integration_event(
        db, current_user.tenantId, "eco", eco.id, "status_change",
        {"ref": eco.eco_number, "status": eco.status},
    )
    await db.commit()
    return {
        "eco_id": eco_id,
        "approver_id": approver_id,
        "status": "approved",
        "signed_at": approval.signed_at.isoformat(),
        "digital_signature_captured": digital_signature is not None,
    }


@router.post("/{eco_id}/implement")
async def implement_eco(
    eco_id: int,
    notes: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    result = await db.execute(select(EcoHeader).where(EcoHeader.id == eco_id))
    eco = result.scalar_one_or_none()
    if not eco:
        raise HTTPException(status_code=404, detail="ECO not found")
    eco.status = "implemented"
    eco.implemented_by = current_user.id
    eco.implemented_at = datetime.now(UTC)
    if notes:
        eco.description = (eco.description or "") + f"\n[IMPLEMENTED] {notes}"
    await emit_integration_event(
        db, current_user.tenantId, "eco", eco.id, "status_change",
        {"ref": eco.eco_number, "status": eco.status},
    )
    await db.commit()
    return {
        "eco_id": eco_id,
        "status": "implemented",
        "implemented_at": eco.implemented_at.isoformat(),
    }


@router.get("/{eco_id}/impact")
async def get_eco_impact(
    eco_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await service_impact(db=db, eco_id=eco_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{eco_id}/notifications")
async def get_eco_notifications(
    eco_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EcoNotification)
        .where(EcoNotification.eco_id == eco_id)
        .order_by(EcoNotification.created_at.desc())
    )
    return [
        {
            "id": n.id,
            "user_id": n.user_id,
            "notification_type": n.notification_type,
            "message": n.message,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in result.scalars().all()
    ]


@router.post("/ecn")
async def create_ecn(
    eco_id: int,
    description: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(EcoHeader).where(EcoHeader.id == eco_id))
    eco = result.scalar_one_or_none()
    if not eco:
        raise HTTPException(status_code=404, detail="ECO not found")
    count = await db.execute(select(func.count()).select_from(EcoHeader))
    total = count.scalar() or 0
    ecn_number = f"ECN-{datetime.now().strftime('%Y%m%d')}-{total + 1:03d}"
    ecn = EcoHeader(
        eco_number=ecn_number,
        title=f"ECN: {eco.title}",
        description=description,
        change_type=eco.change_type,
        status="issued",
        priority=eco.priority,
        requested_by=current_user.id,
    )
    db.add(ecn)
    await db.commit()
    await db.refresh(ecn)
    return {
        "ecn_number": ecn_number,
        "eco_id": eco_id,
        "status": "issued",
        "created_at": ecn.created_at.isoformat() if ecn.created_at else None,
    }


@router.post("/ecr")
async def create_ecr(
    title: str,
    description: str,
    requested_by: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = await db.execute(select(func.count()).select_from(EcoHeader))
    total = count.scalar() or 0
    ecr_number = f"ECR-{datetime.now().strftime('%Y%m%d')}-{total + 1:03d}"
    ecr = EcoHeader(
        eco_number=ecr_number,
        title=title,
        description=description,
        change_type="design",
        status="submitted",
        requested_by=requested_by,
    )
    db.add(ecr)
    await db.commit()
    await db.refresh(ecr)
    return {
        "ecr_number": ecr_number,
        "title": title,
        "status": "submitted",
        "created_at": ecr.created_at.isoformat() if ecr.created_at else None,
    }
