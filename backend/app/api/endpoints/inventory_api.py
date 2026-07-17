"""
Inventory Management API
Warehouses, bin locations, inventory tracking, transactions
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_procurement, require_viewer
from app.db.session import get_db
from app.models.inventory import (
    BinLocation,
    Inventory,
    InventoryReservation,
    InventoryTransaction,
    Warehouse,
)
from app.models.user import User
from app.services.inventory_service import (
    adjust_inventory as service_adjust,
)
from app.services.inventory_service import (
    create_bin_location as service_create_bin,
)
from app.services.inventory_service import (
    create_warehouse as service_create_wh,
)
from app.services.inventory_service import (
    reserve_inventory as service_reserve,
)
from app.services.inventory_service import (
    transfer_inventory as service_transfer,
)

router = APIRouter(
    tags=["inventory"], dependencies=[Depends(get_current_user), Depends(require_viewer)]
)


class WarehouseCreateRequest(BaseModel):
    warehouse_code: str
    warehouse_name: str
    address: Optional[str] = None


class BinLocationCreateRequest(BaseModel):
    warehouse_id: int
    bin_code: str
    bin_name: Optional[str] = None
    zone: Optional[str] = None
    aisle: Optional[str] = None
    rack: Optional[str] = None
    shelf: Optional[str] = None


class InventoryAdjustRequest(BaseModel):
    part_id: int
    warehouse_id: int
    quantity: float
    adjustment_type: str
    reason: Optional[str] = None
    lot_number: Optional[str] = None
    serial_number: Optional[str] = None


class InventoryTransferRequest(BaseModel):
    part_id: int
    from_warehouse_id: int
    to_warehouse_id: int
    quantity: float
    lot_number: Optional[str] = None
    serial_number: Optional[str] = None


class InventoryReservationRequest(BaseModel):
    part_id: int
    warehouse_id: int
    quantity: float
    reference_type: str
    reference_id: int


@router.post("/warehouses")
async def create_warehouse(
    request: WarehouseCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_procurement),
):
    return await service_create_wh(
        db=db,
        warehouse_code=request.warehouse_code,
        warehouse_name=request.warehouse_name,
        address=request.address,
    )


@router.get("/warehouses")
async def list_warehouses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Warehouse))
    return result.scalars().all()


@router.post("/bin-locations")
async def create_bin_location(
    request: BinLocationCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_procurement),
):
    try:
        return await service_create_bin(
            db=db,
            warehouse_id=request.warehouse_id,
            bin_code=request.bin_code,
            bin_name=request.bin_name,
            zone=request.zone,
            aisle=request.aisle,
            rack=request.rack,
            shelf=request.shelf,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/bin-locations")
async def list_bin_locations(
    warehouse_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(BinLocation)
    if warehouse_id:
        stmt = stmt.where(BinLocation.warehouse_id == warehouse_id)
    result = await db.execute(stmt.order_by(BinLocation.bin_code))
    return result.scalars().all()


@router.get("/stock")
async def get_stock(
    page: PageParams = Depends(get_page_params),
    part_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Inventory)
    if part_id:
        stmt = stmt.where(Inventory.part_id == part_id)
    if warehouse_id:
        stmt = stmt.where(Inventory.warehouse_id == warehouse_id)
    stmt = stmt.order_by(Inventory.id)
    return await paginate(db, stmt, page)


@router.post("/adjust")
async def adjust_inventory(
    request: InventoryAdjustRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_procurement),
):
    try:
        return await service_adjust(
            db=db,
            current_user=current_user,
            part_id=request.part_id,
            warehouse_id=request.warehouse_id,
            quantity=request.quantity,
            adjustment_type=request.adjustment_type,
            reason=request.reason,
            lot_number=request.lot_number,
            serial_number=request.serial_number,
        )
    except ValueError as e:
        raise HTTPException(status_code=404 if "not found" in str(e) else 400, detail=str(e))


@router.post("/transfer")
async def transfer_inventory(
    request: InventoryTransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_procurement),
):
    try:
        return await service_transfer(
            db=db,
            current_user=current_user,
            part_id=request.part_id,
            from_warehouse_id=request.from_warehouse_id,
            to_warehouse_id=request.to_warehouse_id,
            quantity=request.quantity,
            lot_number=request.lot_number,
            serial_number=request.serial_number,
        )
    except ValueError as e:
        raise HTTPException(status_code=404 if "not found" in str(e) else 400, detail=str(e))


@router.post("/reserve")
async def reserve_inventory(
    request: InventoryReservationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_procurement),
):
    try:
        return await service_reserve(
            db=db,
            current_user=current_user,
            part_id=request.part_id,
            warehouse_id=request.warehouse_id,
            quantity=request.quantity,
            reference_type=request.reference_type,
            reference_id=request.reference_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404 if "not found" in str(e) else 400, detail=str(e))


@router.get("/reservations")
async def list_reservations(
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(InventoryReservation)
    if reference_type:
        stmt = stmt.where(InventoryReservation.reference_type == reference_type)
    if reference_id:
        stmt = stmt.where(InventoryReservation.reference_id == reference_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/transactions")
async def list_transactions(
    page: PageParams = Depends(get_page_params),
    part_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    transaction_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(InventoryTransaction)
    if part_id:
        stmt = stmt.where(InventoryTransaction.part_id == part_id)
    if warehouse_id:
        stmt = stmt.where(InventoryTransaction.warehouse_id == warehouse_id)
    if transaction_type:
        stmt = stmt.where(InventoryTransaction.transaction_type == transaction_type)
    stmt = stmt.order_by(InventoryTransaction.id.desc())
    return await paginate(db, stmt, page)


@router.get("/reports/stock-summary")
async def get_stock_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(
            Inventory.warehouse_id,
            func.count(Inventory.id).label("total_items"),
            func.sum(Inventory.quantity_on_hand).label("total_quantity"),
            func.sum(Inventory.quantity_reserved).label("total_reserved"),
        ).group_by(Inventory.warehouse_id)
    )
    return [dict(row) for row in result.mappings().all()]


@router.get("/reports/stock-valuation")
async def get_stock_valuation(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(
            Inventory.part_id,
            Inventory.quantity_on_hand,
        ).order_by(Inventory.part_id)
    )
    items = result.all()
    total_value = 0.0
    for item in items:
        total_value += float(item.quantity_on_hand or 0) * 1.0
    return {"total_items": len(items), "estimated_total_value": total_value, "currency": "USD"}
