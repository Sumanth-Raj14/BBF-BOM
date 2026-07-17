"""Quality service layer — business logic extracted from endpoint file."""

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
from app.models.quality import InspectionPlan, InspectionRecord, NcrReport
from app.models.user import User


async def _log_audit(
    db: AsyncSession, user: User, action: str, entity_id: int, details: Optional[dict] = None
):
    log = AuditLog(
        action=action,
        entityType="quality",
        entityId=entity_id,
        userId=user.id,
        userEmail=user.email,
        changes=details or {},
    )
    db.add(log)


async def create_inspection_plan(
    db: AsyncSession,
    part_id: int,
    plan_name: str,
    idempotency_key: Optional[str] = None,
    description: Optional[str] = None,
    inspection_type: str = "incoming",
    frequency: Optional[str] = None,
    sample_size: int = 1,
) -> InspectionPlan:
    if not await check_idempotency(idempotency_key):
        raise HTTPException(status_code=409, detail="Duplicate request")
    tid = get_tenant_id()
    plan = InspectionPlan(
        part_id=part_id,
        plan_name=plan_name,
        description=description,
        inspection_type=inspection_type,
        frequency=frequency,
        sample_size=sample_size,
        tenantId=tid,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def create_inspection_record(
    db: AsyncSession,
    current_user: User,
    plan_id: int,
    part_id: int,
    idempotency_key: Optional[str] = None,
    lot_number: Optional[str] = None,
    quantity_inspected: int = 0,
    quantity_passed: int = 0,
    quantity_failed: int = 0,
    result: str = "pending",
    notes: Optional[str] = None,
) -> InspectionRecord:
    if not await check_idempotency(idempotency_key):
        raise HTTPException(status_code=409, detail="Duplicate request")
    tid = get_tenant_id()
    rec = InspectionRecord(
        plan_id=plan_id,
        part_id=part_id,
        lot_number=lot_number,
        quantity_inspected=quantity_inspected,
        quantity_passed=quantity_passed,
        quantity_failed=quantity_failed,
        result=result,
        notes=notes,
        inspected_by=current_user.id,
        inspected_at=datetime.now(UTC),
        tenantId=tid,
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    await _log_audit(
        db, current_user, "INSPECTION_CREATED", rec.id, {"plan_id": plan_id, "result": result}
    )
    await db.commit()
    return rec


async def create_ncr(
    db: AsyncSession,
    current_user: User,
    part_id: Optional[int] = None,
    ncr_type: str = "material",
    idempotency_key: Optional[str] = None,
    description: Optional[str] = None,
    severity: str = "minor",
    disposition: Optional[str] = None,
    corrective_action: Optional[str] = None,
) -> NcrReport:
    if not await check_idempotency(idempotency_key):
        raise HTTPException(status_code=409, detail="Duplicate request")
    count = await db.execute(select(func.count()).select_from(NcrReport))
    total = count.scalar() or 0
    ncr_number = f"NCR-{datetime.now().strftime('%Y%m%d')}-{total + 1:03d}"
    tid = get_tenant_id()
    ncr = NcrReport(
        ncr_number=ncr_number,
        part_id=part_id,
        ncr_type=ncr_type,
        description=description,
        severity=severity,
        status="open",
        disposition=disposition,
        corrective_action=corrective_action,
        created_by=current_user.id,
        created_at=datetime.now(UTC),
        tenantId=tid,
    )
    db.add(ncr)
    await db.commit()
    await db.refresh(ncr)
    return ncr


async def perform_ncr_action(
    db: AsyncSession,
    current_user: User,
    ncr_id: int,
    action: str,
    disposition: Optional[str] = None,
    corrective_action: Optional[str] = None,
) -> dict:
    tid = get_tenant_id()
    ncr_stmt = select(NcrReport).where(NcrReport.id == ncr_id)
    if tid is not None:
        ncr_stmt = ncr_stmt.where(NcrReport.tenantId == tid)
    result = await db.execute(ncr_stmt)
    ncr = result.scalar_one_or_none()
    if not ncr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NCR not found")
    now = datetime.now(UTC)
    if action == "disposition":
        ncr.status = "dispositioned"
        ncr.disposition = disposition or ncr.disposition
        ncr.dispositioned_by = current_user.id
        ncr.dispositioned_at = now
    elif action == "correct":
        ncr.status = "corrective_action"
        ncr.corrective_action = corrective_action or ncr.corrective_action
    elif action == "verify":
        ncr.status = "closed"
        ncr.verified_by = current_user.id
        ncr.verified_at = now
    elif action == "reject":
        ncr.status = "rejected"
    await emit_integration_event(
        db, current_user.tenantId, "ncr", ncr.id, "status_change",
        {"ref": ncr.ncr_number, "status": ncr.status},
    )
    await db.commit()
    await _log_audit(db, current_user, f"NCR_{action.upper()}", ncr_id, {"status": ncr.status})
    await db.commit()
    return {"ncr_id": ncr_id, "action": action, "status": ncr.status}


async def get_defect_summary(
    db: AsyncSession,
    part_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict:
    cache_key = f"defect_summary:{part_id}:{start_date}:{end_date}"
    cached = await cache_get(cache_key)
    if cached:
        return cached
    stmt = select(NcrReport)
    tid = get_tenant_id()
    if tid is not None:
        stmt = stmt.where(NcrReport.tenantId == tid)
    if part_id:
        stmt = stmt.where(NcrReport.part_id == part_id)
    result = await db.execute(stmt)
    ncrs = result.scalars().all()
    result = {
        "total_ncrs": len(ncrs),
        "open": sum(1 for n in ncrs if n.status == "open"),
        "dispositioned": sum(1 for n in ncrs if n.status == "dispositioned"),
        "closed": sum(1 for n in ncrs if n.status == "closed"),
        "by_severity": {
            "critical": sum(1 for n in ncrs if n.severity == "critical"),
            "major": sum(1 for n in ncrs if n.severity == "major"),
            "minor": sum(1 for n in ncrs if n.severity == "minor"),
        },
    }
    await cache_set(cache_key, result, 300)
    return result
