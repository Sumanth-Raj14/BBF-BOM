"""Work Order service layer — business logic extracted from endpoint file."""

from datetime import UTC, datetime
from datetime import date as date_type
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get, cache_set
from app.core.idempotency import check_idempotency
from app.core.tenant_context import get_tenant_id
from app.models.audit_log import AuditLog
from app.models.mbom import MbomHeader
from app.models.part import Part
from app.models.user import User
from app.models.work_order import WorkOrder, WorkOrderMaterial, WorkOrderOperation


async def _log_audit(
    db: AsyncSession, user: User, action: str, entity_id: int, details: Optional[dict] = None
):
    log = AuditLog(
        action=action,
        entityType="work_order",
        entityId=entity_id,
        userId=user.id,
        userEmail=user.email,
        changes=details or {},
    )
    db.add(log)


async def create_work_order(
    db: AsyncSession,
    current_user: User,
    mbom_id: int,
    quantity_ordered: int,
    idempotency_key: Optional[str] = None,
    customer_name: Optional[str] = None,
    sales_order_number: Optional[str] = None,
    priority: str = "normal",
    due_date: Optional[str] = None,
    assigned_to: Optional[int] = None,
    work_center: Optional[str] = None,
) -> WorkOrder:
    if not await check_idempotency(idempotency_key):
        raise HTTPException(status_code=409, detail="Duplicate request")
    tid = get_tenant_id()
    mbom_stmt = select(MbomHeader).where(MbomHeader.id == mbom_id)
    if tid is not None:
        mbom_stmt = mbom_stmt.where(MbomHeader.tenantId == tid)
    mbom = await db.execute(mbom_stmt)
    if not mbom.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MBOM not found")
    count = await db.execute(select(func.count()).select_from(WorkOrder))
    total = count.scalar() or 0
    wo_number = f"WO-{datetime.now().strftime('%Y%m%d')}-{total + 1:03d}"
    due = None
    if due_date:
        try:
            due = date_type.fromisoformat(due_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid due_date format (use YYYY-MM-DD)",
            )
    wo = WorkOrder(
        wo_number=wo_number,
        mbom_id=mbom_id,
        quantity_ordered=quantity_ordered,
        customer_name=customer_name,
        sales_order_number=sales_order_number,
        priority=priority,
        due_date=due,
        assigned_to=assigned_to,
        work_center=work_center,
        status="draft",
        tenantId=tid,
    )
    db.add(wo)
    await db.commit()
    await db.refresh(wo)
    await _log_audit(db, current_user, "WORK_ORDER_CREATED", wo.id, {"wo_number": wo_number})
    await db.commit()
    return wo


async def get_work_order(db: AsyncSession, wo_id: int) -> dict:
    cache_key = f"work_order:{wo_id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached
    tid = get_tenant_id()
    wo_stmt = select(WorkOrder).where(WorkOrder.id == wo_id)
    if tid is not None:
        wo_stmt = wo_stmt.where(WorkOrder.tenantId == tid)
    result = await db.execute(wo_stmt)
    wo = result.scalar_one_or_none()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")
    ops_stmt = (
        select(WorkOrderOperation)
        .where(WorkOrderOperation.work_order_id == wo_id)
        .order_by(WorkOrderOperation.operation_number)
    )
    if tid is not None:
        ops_stmt = ops_stmt.where(WorkOrderOperation.tenantId == tid)
    ops = await db.execute(ops_stmt)
    mats = await db.execute(
        select(WorkOrderMaterial).where(WorkOrderMaterial.work_order_id == wo_id)
    )
    operations = [
        {
            "id": op.id,
            "operation_number": op.operation_number,
            "operation_name": op.operation_name,
            "work_center": op.work_center,
            "status": op.status,
            "quantity_good": op.quantity_good,
            "quantity_scrapped": op.quantity_scrapped,
            "start_time": op.start_time.isoformat() if op.start_time else None,
            "end_time": op.end_time.isoformat() if op.end_time else None,
        }
        for op in ops.scalars().all()
    ]
    materials = []
    for mat in mats.scalars().all():
        part = await db.execute(select(Part).where(Part.id == mat.part_id))
        p = part.scalar_one_or_none()
        materials.append(
            {
                "id": mat.id,
                "part_id": mat.part_id,
                "part_number": p.pn if p else None,
                "quantity_required": float(mat.quantity_required) if mat.quantity_required else 0,
                "quantity_issued": float(mat.quantity_issued) if mat.quantity_issued else 0,
                "quantity_returned": float(mat.quantity_returned) if mat.quantity_returned else 0,
                "unit": mat.unit,
                "issue_status": mat.issue_status,
            }
        )
    result = {
        "id": wo.id,
        "wo_number": wo.wo_number,
        "mbom_id": wo.mbom_id,
        "customer_name": wo.customer_name,
        "sales_order_number": wo.sales_order_number,
        "quantity_ordered": wo.quantity_ordered,
        "quantity_completed": wo.quantity_completed,
        "quantity_scrapped": wo.quantity_scrapped,
        "status": wo.status,
        "priority": wo.priority,
        "due_date": wo.due_date.isoformat() if wo.due_date else None,
        "start_date": wo.start_date.isoformat() if wo.start_date else None,
        "completed_date": wo.completed_date.isoformat() if wo.completed_date else None,
        "assigned_to": wo.assigned_to,
        "work_center": wo.work_center,
        "notes": wo.notes,
        "created_at": wo.created_at.isoformat() if wo.created_at else None,
        "updated_at": wo.updated_at.isoformat() if wo.updated_at else None,
        "operations": operations,
        "materials": materials,
    }
    await cache_set(cache_key, result, 300)
    return result


async def perform_work_order_action(
    db: AsyncSession, current_user: User, wo_id: int, action: str, comments: Optional[str] = None
) -> dict:
    tid = get_tenant_id()
    wo_stmt = select(WorkOrder).where(WorkOrder.id == wo_id)
    if tid is not None:
        wo_stmt = wo_stmt.where(WorkOrder.tenantId == tid)
    result = await db.execute(wo_stmt)
    wo = result.scalar_one_or_none()
    if not wo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")
    valid_actions = ["release", "start", "complete", "close", "hold", "scrap"]
    if action not in valid_actions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid action. Must be one of: {valid_actions}",
        )
    status_map = {
        "release": "released",
        "start": "in_progress",
        "complete": "completed",
        "close": "closed",
        "hold": "on_hold",
        "scrap": "scrapped",
    }
    wo.status = status_map[action]
    if action == "start":
        wo.start_date = date_type.today()
    elif action == "complete":
        wo.completed_date = date_type.today()
        wo.quantity_completed = wo.quantity_ordered
    if comments:
        wo.notes = (wo.notes or "") + f"\n[{datetime.now().isoformat()}] {comments}"
    await db.commit()
    await _log_audit(
        db,
        current_user,
        f"WORK_ORDER_{action.upper()}",
        wo_id,
        {"status": wo.status, "comments": comments},
    )
    await db.commit()
    return {
        "work_order_id": wo_id,
        "action": action,
        "status": wo.status,
        "timestamp": datetime.now().isoformat(),
    }


async def add_work_order_operation(
    db: AsyncSession,
    wo_id: int,
    operation_number: int,
    operation_name: str,
    work_center: Optional[str] = None,
) -> WorkOrderOperation:
    tid = get_tenant_id()
    wo_stmt = select(WorkOrder).where(WorkOrder.id == wo_id)
    if tid is not None:
        wo_stmt = wo_stmt.where(WorkOrder.tenantId == tid)
    result = await db.execute(wo_stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")
    op = WorkOrderOperation(
        work_order_id=wo_id,
        operation_number=operation_number,
        operation_name=operation_name,
        work_center=work_center,
        tenantId=tid,
    )
    db.add(op)
    await db.commit()
    await db.refresh(op)
    return op


async def start_operation(
    db: AsyncSession, wo_id: int, op_id: int, employee_id: Optional[int] = None
) -> dict:
    tid = get_tenant_id()
    op_stmt = select(WorkOrderOperation).where(
        WorkOrderOperation.id == op_id, WorkOrderOperation.work_order_id == wo_id
    )
    if tid is not None:
        op_stmt = op_stmt.where(WorkOrderOperation.tenantId == tid)
    result = await db.execute(op_stmt)
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation not found")
    op.status = "in_progress"
    op.start_time = datetime.now(UTC)
    if employee_id:
        op.employee_id = employee_id
    await db.commit()
    return {"operation_id": op_id, "status": "in_progress", "start_time": op.start_time.isoformat()}


async def complete_operation(
    db: AsyncSession,
    wo_id: int,
    op_id: int,
    quantity_good: int,
    quantity_scrapped: int = 0,
    notes: Optional[str] = None,
) -> dict:
    tid = get_tenant_id()
    op_stmt = select(WorkOrderOperation).where(
        WorkOrderOperation.id == op_id, WorkOrderOperation.work_order_id == wo_id
    )
    if tid is not None:
        op_stmt = op_stmt.where(WorkOrderOperation.tenantId == tid)
    result = await db.execute(op_stmt)
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation not found")
    op.status = "completed"
    op.end_time = datetime.now(UTC)
    op.quantity_good = quantity_good
    op.quantity_scrapped = quantity_scrapped
    if notes:
        op.notes = notes
    await db.commit()
    return {
        "operation_id": op_id,
        "status": "completed",
        "quantity_good": quantity_good,
        "quantity_scrapped": quantity_scrapped,
        "end_time": op.end_time.isoformat(),
    }


async def add_work_order_material(
    db: AsyncSession, wo_id: int, part_id: int, quantity_required: float, unit: str = "EA"
) -> WorkOrderMaterial:
    tid = get_tenant_id()
    wo_stmt = select(WorkOrder).where(WorkOrder.id == wo_id)
    if tid is not None:
        wo_stmt = wo_stmt.where(WorkOrder.tenantId == tid)
    result = await db.execute(wo_stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work order not found")
    part = await db.execute(select(Part).where(Part.id == part_id))
    if not part.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Part not found")
    mat = WorkOrderMaterial(
        work_order_id=wo_id,
        part_id=part_id,
        quantity_required=quantity_required,
        unit=unit,
        tenantId=tid,
    )
    db.add(mat)
    await db.commit()
    await db.refresh(mat)
    return mat


async def issue_material_to_work_order(
    db: AsyncSession,
    current_user: User,
    wo_id: int,
    mat_id: int,
    quantity: float,
    lot_number: Optional[str] = None,
    serial_number: Optional[str] = None,
) -> dict:
    tid = get_tenant_id()
    mat_stmt = select(WorkOrderMaterial).where(
        WorkOrderMaterial.id == mat_id, WorkOrderMaterial.work_order_id == wo_id
    )
    if tid is not None:
        mat_stmt = mat_stmt.where(WorkOrderMaterial.tenantId == tid)
    result = await db.execute(mat_stmt)
    mat = result.scalar_one_or_none()
    if not mat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material record not found"
        )
    mat.quantity_issued = (mat.quantity_issued or 0) + quantity
    mat.issue_status = "complete" if mat.quantity_issued >= mat.quantity_required else "partial"
    mat.issued_at = datetime.now(UTC)
    mat.issued_by = current_user.id
    await db.commit()
    return {
        "material_id": mat_id,
        "quantity_issued": float(mat.quantity_issued),
        "issue_status": mat.issue_status,
        "issued_at": mat.issued_at.isoformat(),
    }


async def get_efficiency_report(
    db: AsyncSession,
    work_center: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict:
    stmt = select(WorkOrder)
    tid = get_tenant_id()
    if tid is not None:
        stmt = stmt.where(WorkOrder.tenantId == tid)
    if work_center:
        stmt = stmt.where(WorkOrder.work_center == work_center)
    if start_date:
        try:
            sd = date_type.fromisoformat(start_date)
            stmt = stmt.where(WorkOrder.created_at >= sd)
        except ValueError:
            pass
    if end_date:
        try:
            ed = date_type.fromisoformat(end_date)
            stmt = stmt.where(WorkOrder.created_at <= ed)
        except ValueError:
            pass
    result = await db.execute(stmt)
    orders = result.scalars().all()
    total = len(orders)
    completed = sum(1 for o in orders if o.status == "completed")
    on_time = sum(
        1
        for o in orders
        if o.status == "completed"
        and o.due_date
        and o.completed_date
        and o.completed_date <= o.due_date
    )
    produced = sum(o.quantity_completed or 0 for o in orders)
    scrapped = sum(o.quantity_scrapped or 0 for o in orders)
    return {
        "work_center": work_center or "All",
        "period": f"{start_date or 'N/A'} to {end_date or 'N/A'}",
        "total_orders": total,
        "completed_orders": completed,
        "on_time_delivery": round(on_time / completed * 100, 1) if completed else 0,
        "quality_rate": round((produced - scrapped) / produced * 100, 1) if produced else 0,
        "total_produced": produced,
        "total_scrapped": scrapped,
    }


async def get_daily_report(
    db: AsyncSession, work_center: Optional[str] = None, report_date: Optional[str] = None
) -> dict:
    target_date = report_date or datetime.now().strftime("%Y-%m-%d")
    stmt = select(WorkOrder)
    tid = get_tenant_id()
    if tid is not None:
        stmt = stmt.where(WorkOrder.tenantId == tid)
    if work_center:
        stmt = stmt.where(WorkOrder.work_center == work_center)
    result = await db.execute(stmt)
    orders = result.scalars().all()
    started = sum(
        1 for o in orders if o.start_date and o.start_date.isoformat()[:10] == target_date[:10]
    )
    completed = sum(
        1
        for o in orders
        if o.completed_date and o.completed_date.isoformat()[:10] == target_date[:10]
    )
    produced = sum(
        o.quantity_completed or 0
        for o in orders
        if o.completed_date and o.completed_date.isoformat()[:10] == target_date[:10]
    )
    scrapped = sum(
        o.quantity_scrapped or 0
        for o in orders
        if o.completed_date and o.completed_date.isoformat()[:10] == target_date[:10]
    )
    return {
        "date": target_date,
        "work_center": work_center or "All",
        "orders_started": started,
        "orders_completed": completed,
        "total_produced": produced,
        "total_scrapped": scrapped,
    }
