from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_read, require_parts_write
from app.db.session import get_db
from app.models.contract import Contract, PricingAgreement
from app.models.user import User
from app.schemas.contract import (
    ContractCreate,
    ContractResponse,
    ContractUpdate,
    PricingAgreementCreate,
    PricingAgreementResponse,
    PricingAgreementUpdate,
)

router = APIRouter(
    dependencies=[Depends(get_current_user)],
)


@router.get("/")
async def list_contracts(
    page: PageParams = Depends(get_page_params),
    vendorId: Optional[int] = None,
    status: Optional[str] = None,
    contractType: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(Contract)
    if vendorId:
        stmt = stmt.where(Contract.vendorId == vendorId)
    if status:
        stmt = stmt.where(Contract.status == status)
    if contractType:
        stmt = stmt.where(Contract.contractType == contractType)
    stmt = stmt.order_by(Contract.id)
    return await paginate(db, stmt, page)


@router.get("/{contract_id}", response_model=ContractResponse)
async def get_contract(
    contract_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    result = await db.execute(select(Contract).where(Contract.id == contract_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Contract not found")
    return item


@router.post("/", response_model=ContractResponse, status_code=201)
async def create_contract(
    payload: ContractCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = Contract(
        **payload.model_dump(), createdBy=current_user.id, tenantId=current_user.tenantId
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/{contract_id}", response_model=ContractResponse)
async def update_contract(
    contract_id: int,
    payload: ContractUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(Contract).where(Contract.id == contract_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Contract not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{contract_id}", response_model=ContractResponse)
async def patch_contract(
    contract_id: int,
    payload: ContractUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_contract(contract_id, payload, db, current_user)


@router.delete("/{contract_id}")
async def delete_contract(
    contract_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(Contract).where(Contract.id == contract_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Contract not found")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Contract deleted"}


@router.get("/{contract_id}/pricing")
async def get_contract_pricing(
    contract_id: int,
    partId: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(PricingAgreement).where(PricingAgreement.contractId == contract_id)
    if partId:
        stmt = stmt.where(PricingAgreement.partId == partId)
    q = await db.execute(stmt)
    items = q.scalars().all()
    return [
        {
            "id": item.id,
            "partId": item.partId,
            "vendorId": item.vendorId,
            "agreedPrice": item.agreedPrice,
            "currency": item.currency,
            "status": item.status,
        }
        for item in items
    ]


@router.get("/pricing-agreements/all", response_model=list[PricingAgreementResponse])
async def list_pricing_agreements(
    contractId: Optional[int] = None,
    partId: Optional[int] = None,
    vendorId: Optional[int] = None,
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(PricingAgreement)
    if contractId:
        stmt = stmt.where(PricingAgreement.contractId == contractId)
    if partId:
        stmt = stmt.where(PricingAgreement.partId == partId)
    if vendorId:
        stmt = stmt.where(PricingAgreement.vendorId == vendorId)
    q = await db.execute(stmt.order_by(PricingAgreement.createdAt.desc()).offset(skip).limit(limit))
    return q.scalars().all()


@router.post("/pricing-agreements", response_model=PricingAgreementResponse, status_code=201)
async def create_pricing_agreement(
    payload: PricingAgreementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = PricingAgreement(
        **payload.model_dump(), createdBy=current_user.id, tenantId=current_user.tenantId
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/pricing-agreements/{agreement_id}", response_model=PricingAgreementResponse)
async def update_pricing_agreement(
    agreement_id: int,
    payload: PricingAgreementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(PricingAgreement).where(PricingAgreement.id == agreement_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Pricing agreement not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/pricing-agreements/{agreement_id}", response_model=PricingAgreementResponse)
async def patch_pricing_agreement(
    agreement_id: int,
    payload: PricingAgreementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_pricing_agreement(agreement_id, payload, db, current_user)


@router.delete("/pricing-agreements/{agreement_id}")
async def delete_pricing_agreement(
    agreement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(PricingAgreement).where(PricingAgreement.id == agreement_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Pricing agreement not found")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Pricing agreement deleted"}
