from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_read, require_parts_write
from app.db.session import get_db
from app.models.fai import FAIReport
from app.models.user import User
from app.schemas.fai import FAIReportCreate, FAIReportResponse, FAIReportUpdate

router = APIRouter(
    dependencies=[Depends(get_current_user)],
)


@router.get("/")
async def list_fai_reports(
    page: PageParams = Depends(get_page_params),
    status: Optional[str] = None,
    partId: Optional[int] = None,
    result: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(FAIReport)
    if status:
        stmt = stmt.where(FAIReport.status == status)
    if partId:
        stmt = stmt.where(FAIReport.partId == partId)
    if result:
        stmt = stmt.where(FAIReport.result == result)
    stmt = stmt.order_by(FAIReport.id)
    return await paginate(db, stmt, page)


@router.get("/{fai_id}", response_model=FAIReportResponse)
async def get_fai_report(
    fai_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    result = await db.execute(select(FAIReport).where(FAIReport.id == fai_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="FAI report not found")
    return item


@router.post("/", response_model=FAIReportResponse, status_code=201)
async def create_fai_report(
    payload: FAIReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = FAIReport(
        **payload.model_dump(), createdBy=current_user.id, tenantId=current_user.tenantId
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/{fai_id}", response_model=FAIReportResponse)
async def update_fai_report(
    fai_id: int,
    payload: FAIReportUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(FAIReport).where(FAIReport.id == fai_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="FAI report not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    if obj.characteristics:
        obj.totalCharacteristics = len(obj.characteristics)
        obj.passedCharacteristics = sum(1 for c in obj.characteristics if c.get("pass"))
        obj.failedCharacteristics = obj.totalCharacteristics - obj.passedCharacteristics
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{fai_id}", response_model=FAIReportResponse)
async def patch_fai_report(
    fai_id: int,
    payload: FAIReportUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_fai_report(fai_id, payload, db, current_user)


@router.delete("/{fai_id}")
async def delete_fai_report(
    fai_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(FAIReport).where(FAIReport.id == fai_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="FAI report not found")
    await db.delete(obj)
    await db.commit()
    return {"detail": "FAI report deleted"}


@router.post("/{fai_id}/submit")
async def submit_fai(
    fai_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(FAIReport).where(FAIReport.id == fai_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="FAI report not found")
    obj.status = "Pending Approval"
    await db.commit()
    return {"detail": "FAI submitted for approval"}


@router.post("/{fai_id}/approve")
async def approve_fai(
    fai_id: int,
    approvalType: str = Query("quality", enum=["inspector", "quality", "customer"]),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(FAIReport).where(FAIReport.id == fai_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="FAI report not found")
    if approvalType == "inspector":
        obj.inspectorApprovalDate = datetime.now(UTC)
    elif approvalType == "quality":
        obj.qualityApprovalDate = datetime.now(UTC)
    elif approvalType == "customer":
        obj.customerApprovalDate = datetime.now(UTC)
    if obj.inspectorApprovalDate and obj.qualityApprovalDate:
        obj.status = "Approved"
        obj.result = "Pass" if obj.failedCharacteristics == 0 else "Conditional"
    await db.commit()
    return {"detail": f"FAI {approvalType} approval recorded"}
