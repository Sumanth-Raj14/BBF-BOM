from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_read, require_parts_write
from app.db.session import get_db
from app.models.deviation import Deviation
from app.models.user import User
from app.schemas.deviation import DeviationCreate, DeviationResponse, DeviationUpdate

router = APIRouter(
    dependencies=[Depends(get_current_user)],
)


@router.get("/")
async def list_deviations(
    page: PageParams = Depends(get_page_params),
    status: Optional[str] = None,
    type: Optional[str] = None,
    partId: Optional[int] = None,
    riskLevel: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(Deviation)
    if status:
        stmt = stmt.where(Deviation.status == status)
    if type:
        stmt = stmt.where(Deviation.type == type)
    if partId:
        stmt = stmt.where(Deviation.partId == partId)
    if riskLevel:
        stmt = stmt.where(Deviation.riskLevel == riskLevel)
    stmt = stmt.order_by(Deviation.id)
    return await paginate(db, stmt, page)


@router.get("/{deviation_id}", response_model=DeviationResponse)
async def get_deviation(
    deviation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    result = await db.execute(select(Deviation).where(Deviation.id == deviation_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Deviation not found")
    return item


@router.post("/", response_model=DeviationResponse, status_code=201)
async def create_deviation(
    payload: DeviationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = Deviation(
        **payload.model_dump(), createdBy=current_user.id, tenantId=current_user.tenantId
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/{deviation_id}", response_model=DeviationResponse)
async def update_deviation(
    deviation_id: int,
    payload: DeviationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(Deviation).where(Deviation.id == deviation_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Deviation not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    if obj.engineeringApproval and obj.qualityApproval and obj.customerApproval:
        obj.allApprovalsReceived = "Yes"
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{deviation_id}", response_model=DeviationResponse)
async def patch_deviation(
    deviation_id: int,
    payload: DeviationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_deviation(deviation_id, payload, db, current_user)


@router.delete("/{deviation_id}")
async def delete_deviation(
    deviation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(Deviation).where(Deviation.id == deviation_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Deviation not found")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Deviation deleted"}


@router.post("/{deviation_id}/submit")
async def submit_deviation(
    deviation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(Deviation).where(Deviation.id == deviation_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Deviation not found")
    obj.status = "Submitted"
    await db.commit()
    return {"detail": "Deviation submitted for review"}


@router.post("/{deviation_id}/approve")
async def approve_deviation(
    deviation_id: int,
    approvalType: str = Query(..., enum=["engineering", "quality", "customer"]),
    approverName: str = "",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(Deviation).where(Deviation.id == deviation_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Deviation not found")
    if approvalType == "engineering":
        obj.engineeringApproval = approverName or current_user.fullName
    elif approvalType == "quality":
        obj.qualityApproval = approverName or current_user.fullName
    elif approvalType == "customer":
        obj.customerApproval = approverName or current_user.fullName
    if obj.engineeringApproval and obj.qualityApproval and obj.customerApproval:
        obj.allApprovalsReceived = "Yes"
        obj.status = "Approved"
    await db.commit()
    return {"detail": f"Deviation {approvalType} approval recorded"}
