"""ECO service layer — business logic extracted from endpoint file."""

from datetime import UTC, datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get, cache_set
from app.core.idempotency import check_idempotency
from app.core.tenant_context import get_tenant_id
from app.integrations.events import emit_integration_event
from app.models.audit_log import AuditLog
from app.models.eco import EcoApproval, EcoHeader, EcoItem, EcoItemAttributeChange, EcoNotification
from app.models.user import User


async def _log_audit(
    db: AsyncSession, user: User, action: str, entity_id: int, details: Optional[dict] = None
):
    log = AuditLog(
        action=action,
        entityType="eco",
        entityId=entity_id,
        userId=user.id,
        userEmail=user.email,
        changes=details or {},
    )
    db.add(log)


async def create_eco(
    db: AsyncSession,
    current_user: User,
    title: str,
    change_type: str,
    description: Optional[str] = None,
    reason: Optional[str] = None,
    priority: str = "medium",
    impact_level: Optional[str] = None,
    effective_date: Optional[str] = None,
    target_completion_date: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> EcoHeader:
    if not await check_idempotency(idempotency_key):
        raise HTTPException(status_code=409, detail="Duplicate request")
    count = await db.execute(select(func.count()).select_from(EcoHeader))
    total = count.scalar() or 0
    eco_number = f"ECO-{datetime.now().strftime('%Y%m%d')}-{total + 1:03d}"
    tid = get_tenant_id()
    eco = EcoHeader(
        eco_number=eco_number,
        title=title,
        description=description,
        reason=reason,
        change_type=change_type,
        priority=priority,
        impact_level=impact_level,
        status="draft",
        requested_by=current_user.id,
        requested_at=datetime.now(UTC),
        tenantId=tid,
    )
    db.add(eco)
    await db.commit()
    await db.refresh(eco)
    await _log_audit(db, current_user, "ECO_CREATED", eco.id, {"eco_number": eco_number})
    await db.commit()
    return eco


async def get_eco_detail(db: AsyncSession, eco_id: int) -> dict:
    cache_key = f"eco:{eco_id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached
    tid = get_tenant_id()
    eco_stmt = select(EcoHeader).where(EcoHeader.id == eco_id)
    if tid is not None:
        eco_stmt = eco_stmt.where(EcoHeader.tenantId == tid)
    result = await db.execute(eco_stmt)
    eco = result.scalar_one_or_none()
    if not eco:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ECO not found")
    items_stmt = select(EcoItem).where(EcoItem.eco_id == eco_id)
    if tid is not None:
        items_stmt = items_stmt.where(EcoItem.tenantId == tid)
    items = await db.execute(items_stmt)
    approvals = await db.execute(
        select(EcoApproval).where(EcoApproval.eco_id == eco_id).order_by(EcoApproval.approval_order)
    )
    notifications = await db.execute(
        select(EcoNotification).where(
            EcoNotification.eco_id == eco_id, not EcoNotification.is_read
        )
    )
    result = {
        "id": eco.id,
        "eco_number": eco.eco_number,
        "title": eco.title,
        "description": eco.description,
        "reason": eco.reason,
        "change_type": eco.change_type,
        "status": eco.status,
        "priority": eco.priority,
        "impact_level": eco.impact_level,
        "requested_by": eco.requested_by,
        "requested_at": eco.requested_at.isoformat() if eco.requested_at else None,
        "effective_date": eco.effective_date.isoformat() if eco.effective_date else None,
        "target_completion_date": eco.target_completion_date.isoformat()
        if eco.target_completion_date
        else None,
        "created_at": eco.created_at.isoformat() if eco.created_at else None,
        "updated_at": eco.updated_at.isoformat() if eco.updated_at else None,
        "items": [
            {
                "id": i.id,
                "part_id": i.part_id,
                "bom_id": i.bom_id,
                "change_type": i.change_type,
                "old_value": i.old_value,
                "new_value": i.new_value,
                "impact_description": i.impact_description,
                "status": i.status,
                "attribute_changes": [
                    {
                        "field_name": c.field_name,
                        "old_value": c.old_value,
                        "new_value": c.new_value,
                        "value_type": c.value_type,
                    }
                    for c in i.attribute_changes
                ],
            }
            for i in items.scalars().all()
        ],
        "approvals": [
            {
                "id": a.id,
                "approver_id": a.approver_id,
                "approval_order": a.approval_order,
                "status": a.status,
                "comments": a.comments,
                "signed_at": a.signed_at.isoformat() if a.signed_at else None,
            }
            for a in approvals.scalars().all()
        ],
        "notifications": [
            {
                "id": n.id,
                "user_id": n.user_id,
                "notification_type": n.notification_type,
                "message": n.message,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifications.scalars().all()
        ],
    }
    await cache_set(cache_key, result, 300)
    return result


async def perform_eco_action(
    db: AsyncSession,
    current_user: User,
    eco_id: int,
    action: str,
    comments: Optional[str] = None,
    digital_signature: Optional[str] = None,
) -> dict:
    tid = get_tenant_id()
    eco_stmt = select(EcoHeader).where(EcoHeader.id == eco_id)
    if tid is not None:
        eco_stmt = eco_stmt.where(EcoHeader.tenantId == tid)
    result = await db.execute(eco_stmt)
    eco = result.scalar_one_or_none()
    if not eco:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ECO not found")
    valid_actions = ["submit", "approve", "reject", "implement", "close"]
    if action not in valid_actions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid action. Must be one of: {valid_actions}",
        )
    now = datetime.now(UTC)
    if action == "submit":
        eco.status = "review"
    elif action == "approve":
        eco.status = "approved"
        eco.approved_by = current_user.id
        eco.approved_at = now
    elif action == "reject":
        eco.status = "draft"
    elif action == "implement":
        eco.status = "implemented"
        eco.implemented_by = current_user.id
        eco.implemented_at = now
    elif action == "close":
        eco.status = "closed"
    if comments:
        eco.description = (eco.description or "") + f"\n[{now.isoformat()}] {comments}"
    await emit_integration_event(
        db, current_user.tenantId, "eco", eco.id, "status_change",
        {"ref": eco.eco_number, "status": eco.status},
    )
    await db.commit()
    await _log_audit(db, current_user, f"ECO_{action.upper()}", eco_id, {"status": eco.status})
    await db.commit()
    return {"eco_id": eco_id, "action": action, "status": eco.status, "timestamp": now.isoformat()}


async def add_eco_item(
    db: AsyncSession,
    eco_id: int,
    part_id: int,
    change_type: str,
    bom_id: Optional[int] = None,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
    impact_description: Optional[str] = None,
) -> EcoItem:
    tid = get_tenant_id()
    eco_stmt = select(EcoHeader).where(EcoHeader.id == eco_id)
    if tid is not None:
        eco_stmt = eco_stmt.where(EcoHeader.tenantId == tid)
    result = await db.execute(eco_stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ECO not found")
    item = EcoItem(
        eco_id=eco_id,
        part_id=part_id,
        bom_id=bom_id,
        change_type=change_type,
        old_value=old_value,
        new_value=new_value,
        impact_description=impact_description,
        tenantId=tid,
    )
    db.add(item)
    await db.flush()
    if old_value:
        for field, value in old_value.items():
            db.add(
                EcoItemAttributeChange(
                    eco_item_id=item.id,
                    field_name=field,
                    old_value=str(value) if value is not None else None,
                    new_value=str(new_value.get(field))
                    if new_value and new_value.get(field) is not None
                    else None,
                    value_type=type(value).__name__ if value is not None else "string",
                )
            )
    await db.commit()
    await db.refresh(item)
    return item


async def get_eco_impact(db: AsyncSession, eco_id: int) -> dict:
    tid = get_tenant_id()
    eco_stmt = select(EcoHeader).where(EcoHeader.id == eco_id)
    if tid is not None:
        eco_stmt = eco_stmt.where(EcoHeader.tenantId == tid)
    result = await db.execute(eco_stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ECO not found")
    items_stmt = select(EcoItem).where(EcoItem.eco_id == eco_id)
    if tid is not None:
        items_stmt = items_stmt.where(EcoItem.tenantId == tid)
    items = await db.execute(items_stmt)
    item_list = items.scalars().all()
    return {
        "eco_id": eco_id,
        "affected_parts": len(set(i.part_id for i in item_list if i.part_id)),
        "affected_boms": len(set(i.bom_id for i in item_list if i.bom_id)),
        "affected_items": len(item_list),
    }
