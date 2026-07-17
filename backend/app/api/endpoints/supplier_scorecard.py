from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_read, require_parts_write
from app.db.session import get_db
from app.models.supplier_scorecard import SupplierScorecard
from app.models.user import User
from app.schemas.supplier_scorecard import (
    SupplierScorecardCreate,
    SupplierScorecardResponse,
    SupplierScorecardUpdate,
)

router = APIRouter(
    dependencies=[Depends(get_current_user)],
)


def _calculate_grade(score: float) -> str:
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    elif score >= 60:
        return "D"
    else:
        return "F"


@router.get("/")
async def list_scorecards(
    page: PageParams = Depends(get_page_params),
    vendorId: Optional[int] = None,
    period: Optional[str] = None,
    grade: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(SupplierScorecard)
    if vendorId:
        stmt = stmt.where(SupplierScorecard.vendorId == vendorId)
    if period:
        stmt = stmt.where(SupplierScorecard.period == period)
    if grade:
        stmt = stmt.where(SupplierScorecard.grade == grade)
    stmt = stmt.order_by(SupplierScorecard.id)
    return await paginate(db, stmt, page)


@router.get("/{scorecard_id}", response_model=SupplierScorecardResponse)
async def get_scorecard(
    scorecard_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    result = await db.execute(select(SupplierScorecard).where(SupplierScorecard.id == scorecard_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Scorecard not found")
    return item


@router.post("/", response_model=SupplierScorecardResponse, status_code=201)
async def create_scorecard(
    payload: SupplierScorecardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    weighted = (
        payload.qualityScore * payload.qualityWeight
        + payload.deliveryScore * payload.deliveryWeight
        + payload.costScore * payload.costWeight
        + payload.responsivenessScore * payload.responsivenessWeight
        + payload.complianceScore * payload.complianceWeight
    )
    grade = _calculate_grade(weighted)

    obj = SupplierScorecard(
        **payload.model_dump(exclude={"weightedScore", "grade"}),
        weightedScore=weighted,
        grade=grade,
        createdBy=current_user.id,
        tenantId=current_user.tenantId,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/{scorecard_id}", response_model=SupplierScorecardResponse)
async def update_scorecard(
    scorecard_id: int,
    payload: SupplierScorecardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(SupplierScorecard).where(SupplierScorecard.id == scorecard_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Scorecard not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    obj.weightedScore = (
        obj.qualityScore * obj.qualityWeight
        + obj.deliveryScore * obj.deliveryWeight
        + obj.costScore * obj.costWeight
        + obj.responsivenessScore * obj.responsivenessWeight
        + obj.complianceScore * obj.complianceWeight
    )
    obj.grade = _calculate_grade(obj.weightedScore)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{scorecard_id}", response_model=SupplierScorecardResponse)
async def patch_scorecard(
    scorecard_id: int,
    payload: SupplierScorecardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_scorecard(scorecard_id, payload, db, current_user)


@router.delete("/{scorecard_id}")
async def delete_scorecard(
    scorecard_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(SupplierScorecard).where(SupplierScorecard.id == scorecard_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Scorecard not found")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Scorecard deleted"}
