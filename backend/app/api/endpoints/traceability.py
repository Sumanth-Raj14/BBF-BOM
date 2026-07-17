from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_read, require_parts_write
from app.db.session import get_db
from app.models.traceability import LotBatch, SerialNumber
from app.models.user import User
from app.schemas.traceability import (
    LotBatchCreate,
    LotBatchResponse,
    LotBatchUpdate,
    SerialNumberCreate,
    SerialNumberResponse,
    SerialNumberUpdate,
)

router = APIRouter(
    dependencies=[Depends(get_current_user)],
)


@router.get("/serial-numbers")
async def list_serial_numbers(
    page: PageParams = Depends(get_page_params),
    partId: Optional[int] = None,
    status: Optional[str] = None,
    lotBatchNumber: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(SerialNumber)
    if partId:
        stmt = stmt.where(SerialNumber.partId == partId)
    if status:
        stmt = stmt.where(SerialNumber.status == status)
    if lotBatchNumber:
        stmt = stmt.where(SerialNumber.lotBatchNumber == lotBatchNumber)
    stmt = stmt.order_by(SerialNumber.id)
    return await paginate(db, stmt, page)


@router.get("/serial-numbers/{sn_id}", response_model=SerialNumberResponse)
async def get_serial_number(
    sn_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    result = await db.execute(select(SerialNumber).where(SerialNumber.id == sn_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Serial number not found")
    return item


@router.get("/serial-numbers/lookup/{serial_number}")
async def lookup_serial_number(
    serial_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    result = await db.execute(
        select(SerialNumber).where(SerialNumber.serialNumber == serial_number)
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Serial number not found")
    return {
        "serialNumber": item.serialNumber,
        "partId": item.partId,
        "status": item.status,
        "currentLocation": item.currentLocation,
        "lotBatchNumber": item.lotBatchNumber,
        "statusHistory": item.statusHistory,
    }


@router.post("/serial-numbers", response_model=SerialNumberResponse, status_code=201)
async def create_serial_number(
    payload: SerialNumberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = SerialNumber(
        **payload.model_dump(), createdBy=current_user.id, tenantId=current_user.tenantId
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/serial-numbers/{sn_id}", response_model=SerialNumberResponse)
async def update_serial_number(
    sn_id: int,
    payload: SerialNumberUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(SerialNumber).where(SerialNumber.id == sn_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Serial number not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    history = obj.statusHistory or []
    history.append(
        {
            "status": obj.status,
            "date": datetime.now(UTC).isoformat(),
            "location": obj.currentLocation,
            "user": current_user.fullName or current_user.email,
        }
    )
    obj.statusHistory = history
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/serial-numbers/{sn_id}", response_model=SerialNumberResponse)
async def patch_serial_number(
    sn_id: int,
    payload: SerialNumberUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_serial_number(sn_id, payload, db, current_user)


@router.get("/lots")
async def list_lots(
    page: PageParams = Depends(get_page_params),
    partId: Optional[int] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(LotBatch)
    if partId:
        stmt = stmt.where(LotBatch.partId == partId)
    if status:
        stmt = stmt.where(LotBatch.status == status)
    stmt = stmt.order_by(LotBatch.id)
    return await paginate(db, stmt, page)


@router.get("/lots/{lot_id}", response_model=LotBatchResponse)
async def get_lot(
    lot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    result = await db.execute(select(LotBatch).where(LotBatch.id == lot_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Lot not found")
    return item


@router.post("/lots", response_model=LotBatchResponse, status_code=201)
async def create_lot(
    payload: LotBatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = LotBatch(
        **payload.model_dump(), createdBy=current_user.id, tenantId=current_user.tenantId
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/lots/{lot_id}", response_model=LotBatchResponse)
async def update_lot(
    lot_id: int,
    payload: LotBatchUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(LotBatch).where(LotBatch.id == lot_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Lot not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/lots/{lot_id}", response_model=LotBatchResponse)
async def patch_lot(
    lot_id: int,
    payload: LotBatchUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_lot(lot_id, payload, db, current_user)
