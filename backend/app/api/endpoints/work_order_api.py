"""
Work Order Management API
Manufacturing work orders with operations and materials
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_engineering, require_viewer
from app.db.session import get_db
from app.models.user import User
from app.models.work_order import WorkOrder
from app.services.work_order_service import (
    add_work_order_material as service_add_mat,
)
from app.services.work_order_service import (
    add_work_order_operation as service_add_op,
)
from app.services.work_order_service import (
    complete_operation as service_complete_op,
)
from app.services.work_order_service import (
    create_work_order as service_create_wo,
)
from app.services.work_order_service import (
    get_daily_report as service_daily,
)
from app.services.work_order_service import (
    get_efficiency_report as service_efficiency,
)
from app.services.work_order_service import (
    get_work_order as service_get_wo,
)
from app.services.work_order_service import (
    issue_material_to_work_order as service_issue_mat,
)
from app.services.work_order_service import (
    perform_work_order_action as service_wo_action,
)
from app.services.work_order_service import (
    start_operation as service_start_op,
)

router = APIRouter(
    tags=["work-orders"], dependencies=[Depends(get_current_user), Depends(require_viewer)]
)


class WorkOrderCreateRequest(BaseModel):
    mbom_id: int
    quantity_ordered: int
    customer_name: Optional[str] = None
    sales_order_number: Optional[str] = None
    priority: str = "normal"
    due_date: Optional[str] = None
    assigned_to: Optional[int] = None
    work_center: Optional[str] = None


class WorkOrderOperationRequest(BaseModel):
    operation_number: int
    operation_name: str
    work_center: Optional[str] = None
    planned_setup_time: Optional[str] = None
    planned_run_time: Optional[str] = None


class WorkOrderMaterialRequest(BaseModel):
    part_id: int
    quantity_required: float
    unit: str = "EA"


class WorkOrderActionRequest(BaseModel):
    action: str
    comments: Optional[str] = None


@router.post("/")
async def create_work_order(
    request: WorkOrderCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    try:
        return await service_create_wo(
            db=db,
            current_user=current_user,
            mbom_id=request.mbom_id,
            quantity_ordered=request.quantity_ordered,
            customer_name=request.customer_name,
            sales_order_number=request.sales_order_number,
            priority=request.priority,
            due_date=request.due_date,
            assigned_to=request.assigned_to,
            work_center=request.work_center,
        )
    except ValueError as e:
        raise HTTPException(status_code=404 if "not found" in str(e) else 400, detail=str(e))


@router.get("/")
async def list_work_orders(
    page: PageParams = Depends(get_page_params),
    status: Optional[str] = None,
    work_center: Optional[str] = None,
    assigned_to: Optional[int] = None,
    priority: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(WorkOrder)
    if status:
        stmt = stmt.where(WorkOrder.status == status)
    if work_center:
        stmt = stmt.where(WorkOrder.work_center == work_center)
    if assigned_to:
        stmt = stmt.where(WorkOrder.assigned_to == assigned_to)
    if priority:
        stmt = stmt.where(WorkOrder.priority == priority)
    stmt = stmt.order_by(WorkOrder.id.desc())
    return await paginate(db, stmt, page)


@router.get("/{wo_id}")
async def get_work_order(
    wo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await service_get_wo(db=db, wo_id=wo_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{wo_id}/action")
async def work_order_action(
    wo_id: int,
    request: WorkOrderActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    try:
        return await service_wo_action(
            db=db,
            current_user=current_user,
            wo_id=wo_id,
            action=request.action,
            comments=request.comments,
        )
    except ValueError as e:
        raise HTTPException(status_code=404 if "not found" in str(e) else 400, detail=str(e))


@router.post("/{wo_id}/operations")
async def add_operation(
    wo_id: int,
    request: WorkOrderOperationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    try:
        return await service_add_op(
            db=db,
            wo_id=wo_id,
            operation_number=request.operation_number,
            operation_name=request.operation_name,
            work_center=request.work_center,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{wo_id}/operations/{op_id}/start")
async def start_operation(
    wo_id: int,
    op_id: int,
    employee_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    try:
        return await service_start_op(db=db, wo_id=wo_id, op_id=op_id, employee_id=employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{wo_id}/operations/{op_id}/complete")
async def complete_operation(
    wo_id: int,
    op_id: int,
    quantity_good: int,
    quantity_scrapped: int = 0,
    notes: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    try:
        return await service_complete_op(
            db=db,
            wo_id=wo_id,
            op_id=op_id,
            quantity_good=quantity_good,
            quantity_scrapped=quantity_scrapped,
            notes=notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{wo_id}/materials")
async def add_material(
    wo_id: int,
    request: WorkOrderMaterialRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    try:
        return await service_add_mat(
            db=db,
            wo_id=wo_id,
            part_id=request.part_id,
            quantity_required=request.quantity_required,
            unit=request.unit,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{wo_id}/materials/{mat_id}/issue")
async def issue_material(
    wo_id: int,
    mat_id: int,
    quantity: float,
    lot_number: Optional[str] = None,
    serial_number: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    try:
        return await service_issue_mat(
            db=db,
            current_user=current_user,
            wo_id=wo_id,
            mat_id=mat_id,
            quantity=quantity,
            lot_number=lot_number,
            serial_number=serial_number,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/reports/efficiency")
async def get_efficiency_report(
    work_center: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await service_efficiency(
        db=db, work_center=work_center, start_date=start_date, end_date=end_date
    )


@router.get("/reports/daily")
async def get_daily_report(
    work_center: Optional[str] = None,
    report_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await service_daily(db=db, work_center=work_center, report_date=report_date)
