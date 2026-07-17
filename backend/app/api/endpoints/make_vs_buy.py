from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_read, require_parts_write
from app.db.session import get_db
from app.models.make_vs_buy import MakeVsBuyAnalysis
from app.models.user import User
from app.schemas.make_vs_buy import MakeVsBuyCreate, MakeVsBuyResponse, MakeVsBuyUpdate

router = APIRouter(
    dependencies=[Depends(get_current_user)],
)


@router.get("/")
async def list_analyses(
    page: PageParams = Depends(get_page_params),
    partId: Optional[int] = None,
    status: Optional[str] = None,
    decision: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(MakeVsBuyAnalysis)
    if partId:
        stmt = stmt.where(MakeVsBuyAnalysis.partId == partId)
    if status:
        stmt = stmt.where(MakeVsBuyAnalysis.status == status)
    if decision:
        stmt = stmt.where(MakeVsBuyAnalysis.decision == decision)
    stmt = stmt.order_by(MakeVsBuyAnalysis.id)
    return await paginate(db, stmt, page)


@router.get("/{analysis_id}", response_model=MakeVsBuyResponse)
async def get_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    result = await db.execute(select(MakeVsBuyAnalysis).where(MakeVsBuyAnalysis.id == analysis_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return item


@router.post("/", response_model=MakeVsBuyResponse, status_code=201)
async def create_analysis(
    payload: MakeVsBuyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    make_total = (
        payload.makeMaterialCost
        + payload.makeLaborCost
        + payload.makeOverheadCost
        + payload.makeToolingCost
    )
    buy_total = payload.buyUnitPrice + payload.buyNreCost

    obj = MakeVsBuyAnalysis(
        **payload.model_dump(exclude={"makeTotalCost", "buyTotalCost"}),
        makeTotalCost=make_total,
        buyTotalCost=buy_total,
        createdBy=current_user.id,
        tenantId=current_user.tenantId,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/{analysis_id}", response_model=MakeVsBuyResponse)
async def update_analysis(
    analysis_id: int,
    payload: MakeVsBuyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(MakeVsBuyAnalysis).where(MakeVsBuyAnalysis.id == analysis_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Analysis not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    obj.makeTotalCost = (
        obj.makeMaterialCost + obj.makeLaborCost + obj.makeOverheadCost + obj.makeToolingCost
    )
    obj.buyTotalCost = obj.buyUnitPrice + obj.buyNreCost
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{analysis_id}", response_model=MakeVsBuyResponse)
async def patch_analysis(
    analysis_id: int,
    payload: MakeVsBuyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_analysis(analysis_id, payload, db, current_user)


@router.delete("/{analysis_id}")
async def delete_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(MakeVsBuyAnalysis).where(MakeVsBuyAnalysis.id == analysis_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Analysis not found")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Analysis deleted"}


@router.post("/{analysis_id}/approve")
async def approve_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(MakeVsBuyAnalysis).where(MakeVsBuyAnalysis.id == analysis_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Analysis not found")
    obj.status = "Approved"
    obj.approvedBy = current_user.id
    await db.commit()
    return {"detail": "Analysis approved"}
