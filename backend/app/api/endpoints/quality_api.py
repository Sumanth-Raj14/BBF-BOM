"""
Quality Management API
Inspection plans, NCR, CAPA, quality records
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
from app.models.quality import CapaAction, InspectionPlan, InspectionRecord, NcrReport
from app.models.user import User
from app.services.quality_service import (
    create_inspection_plan as service_create_plan,
)
from app.services.quality_service import (
    create_inspection_record as service_create_record,
)
from app.services.quality_service import (
    create_ncr as service_create_ncr,
)
from app.services.quality_service import (
    get_defect_summary as service_defect_summary,
)
from app.services.quality_service import (
    perform_ncr_action as service_ncr_action,
)

router = APIRouter(
    tags=["quality"], dependencies=[Depends(get_current_user), Depends(require_viewer)]
)


class InspectionPlanCreateRequest(BaseModel):
    part_id: int
    plan_name: str
    description: Optional[str] = None
    inspection_type: str = "incoming"
    frequency: Optional[str] = None
    sample_size: int = 1


class InspectionRecordCreateRequest(BaseModel):
    plan_id: int
    part_id: int
    lot_number: Optional[str] = None
    quantity_inspected: int = 0
    quantity_passed: int = 0
    quantity_failed: int = 0
    result: str = "pending"
    notes: Optional[str] = None


class NcrCreateRequest(BaseModel):
    part_id: Optional[int] = None
    ncr_type: str = "material"
    description: Optional[str] = None
    severity: str = "minor"
    disposition: Optional[str] = None
    corrective_action: Optional[str] = None


class NcrActionRequest(BaseModel):
    action: str
    disposition: Optional[str] = None
    corrective_action: Optional[str] = None


@router.get("/inspection-plans")
async def list_inspection_plans(
    page: PageParams = Depends(get_page_params),
    part_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(InspectionPlan)
    if part_id:
        stmt = stmt.where(InspectionPlan.part_id == part_id)
    stmt = stmt.order_by(InspectionPlan.id)
    return await paginate(db, stmt, page)


@router.post("/inspection-plans")
async def create_inspection_plan(
    request: InspectionPlanCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    return await service_create_plan(
        db=db,
        part_id=request.part_id,
        plan_name=request.plan_name,
        description=request.description,
        inspection_type=request.inspection_type,
        frequency=request.frequency,
        sample_size=request.sample_size,
    )


@router.get("/inspection-plans/{plan_id}")
async def get_inspection_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(InspectionPlan).where(InspectionPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Inspection plan not found")
    records = await db.execute(
        select(InspectionRecord)
        .where(InspectionRecord.plan_id == plan_id)
        .order_by(InspectionRecord.id.desc())
    )
    return {
        "id": plan.id,
        "part_id": plan.part_id,
        "plan_name": plan.plan_name,
        "description": plan.description,
        "inspection_type": plan.inspection_type,
        "frequency": plan.frequency,
        "sample_size": plan.sample_size,
        "records": [
            {
                "id": r.id,
                "lot_number": r.lot_number,
                "quantity_inspected": r.quantity_inspected,
                "quantity_passed": r.quantity_passed,
                "quantity_failed": r.quantity_failed,
                "result": r.result,
                "inspected_by": r.inspected_by,
                "inspected_at": r.inspected_at.isoformat() if r.inspected_at else None,
            }
            for r in records.scalars().all()
        ],
    }


@router.post("/inspection-records")
async def create_inspection_record(
    request: InspectionRecordCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    return await service_create_record(
        db=db,
        current_user=current_user,
        plan_id=request.plan_id,
        part_id=request.part_id,
        lot_number=request.lot_number,
        quantity_inspected=request.quantity_inspected,
        quantity_passed=request.quantity_passed,
        quantity_failed=request.quantity_failed,
        result=request.result,
        notes=request.notes,
    )


@router.get("/inspection-records")
async def list_inspection_records(
    page: PageParams = Depends(get_page_params),
    plan_id: Optional[int] = None,
    part_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(InspectionRecord)
    if plan_id:
        stmt = stmt.where(InspectionRecord.plan_id == plan_id)
    if part_id:
        stmt = stmt.where(InspectionRecord.part_id == part_id)
    stmt = stmt.order_by(InspectionRecord.id.desc())
    return await paginate(db, stmt, page)


@router.get("/ncrs")
async def list_ncrs(
    page: PageParams = Depends(get_page_params),
    status: Optional[str] = None,
    severity: Optional[str] = None,
    part_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(NcrReport)
    if status:
        stmt = stmt.where(NcrReport.status == status)
    if severity:
        stmt = stmt.where(NcrReport.severity == severity)
    if part_id:
        stmt = stmt.where(NcrReport.part_id == part_id)
    stmt = stmt.order_by(NcrReport.id.desc())
    return await paginate(db, stmt, page)


@router.post("/ncrs")
async def create_ncr(
    request: NcrCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    return await service_create_ncr(
        db=db,
        current_user=current_user,
        part_id=request.part_id,
        ncr_type=request.ncr_type,
        description=request.description,
        severity=request.severity,
        disposition=request.disposition,
        corrective_action=request.corrective_action,
    )


@router.get("/ncrs/{ncr_id}")
async def get_ncr(
    ncr_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(NcrReport).where(NcrReport.id == ncr_id))
    ncr = result.scalar_one_or_none()
    if not ncr:
        raise HTTPException(status_code=404, detail="NCR not found")
    return {
        "id": ncr.id,
        "ncr_number": ncr.ncr_number,
        "part_id": ncr.part_id,
        "ncr_type": ncr.ncr_type,
        "description": ncr.description,
        "severity": ncr.severity,
        "status": ncr.status,
        "disposition": ncr.disposition,
        "corrective_action": ncr.corrective_action,
        "created_by": ncr.created_by,
        "created_at": ncr.created_at.isoformat() if ncr.created_at else None,
        "dispositioned_by": ncr.dispositioned_by,
        "dispositioned_at": ncr.dispositioned_at.isoformat() if ncr.dispositioned_at else None,
        "verified_by": ncr.verified_by,
        "verified_at": ncr.verified_at.isoformat() if ncr.verified_at else None,
    }


@router.post("/ncrs/{ncr_id}/action")
async def ncr_action(
    ncr_id: int,
    request: NcrActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    try:
        return await service_ncr_action(
            db=db,
            current_user=current_user,
            ncr_id=ncr_id,
            action=request.action,
            disposition=request.disposition,
            corrective_action=request.corrective_action,
        )
    except ValueError as e:
        raise HTTPException(status_code=404 if "not found" in str(e) else 400, detail=str(e))


@router.get("/ncrs/{ncr_id}/capa")
async def get_ncr_capa(
    ncr_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CapaAction).where(CapaAction.ncr_id == ncr_id).order_by(CapaAction.id)
    )
    capas = result.scalars().all()
    return [
        {
            "id": c.id,
            "capa_number": c.capa_number,
            "title": c.title,
            "status": c.status,
            "priority": c.priority,
            "target_date": c.target_date.isoformat() if c.target_date else None,
            "effectiveness_review_date": c.effectiveness_review_date.isoformat()
            if c.effectiveness_review_date
            else None,
        }
        for c in capas
    ]


@router.get("/reports/defect-summary")
async def get_defect_summary(
    part_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await service_defect_summary(
        db=db, part_id=part_id, start_date=start_date, end_date=end_date
    )


@router.get("/reports/capa-effectiveness")
async def get_capa_effectiveness(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(CapaAction))
    capas = result.scalars().all()
    total = len(capas)
    verified_effective = sum(1 for c in capas if c.effectiveness_reviewed and c.is_effective)
    return {
        "total_capas": total,
        "verified_effective": verified_effective,
        "effectiveness_rate": round(verified_effective / total * 100, 1) if total else 0,
    }


@router.get("/reports/supplier-quality")
async def get_supplier_quality(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(NcrReport))
    ncrs = result.scalars().all()
    return {
        "total_ncrs": len(ncrs),
        "open_ncrs": sum(1 for n in ncrs if n.status == "open"),
        "closed_ncrs": sum(1 for n in ncrs if n.status == "closed"),
        "by_type": {
            t: sum(1 for n in ncrs if n.ncr_type == t)
            for t in set(n.ncr_type for n in ncrs if n.ncr_type)
        },
    }
