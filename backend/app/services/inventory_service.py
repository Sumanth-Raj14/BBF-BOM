"""Inventory service layer — business logic extracted from endpoint file."""

from datetime import UTC, datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get, cache_set
from app.core.idempotency import check_idempotency
from app.core.tenant_context import get_tenant_id
from app.models.audit_log import AuditLog
from app.models.inventory import (
    BinLocation,
    Inventory,
    InventoryReservation,
    InventoryTransaction,
    Warehouse,
)
from app.models.part import Part
from app.models.user import User


async def _log_audit(
    db: AsyncSession, user: User, action: str, entity_id: int, details: Optional[dict] = None
):
    log = AuditLog(
        action=action,
        entityType="inventory",
        entityId=entity_id,
        userId=user.id,
        userEmail=user.email,
        changes=details or {},
    )
    db.add(log)


async def create_warehouse(
    db: AsyncSession, warehouse_code: str, warehouse_name: str, address: Optional[str] = None
) -> Warehouse:
    tid = get_tenant_id()
    wh = Warehouse(
        warehouse_code=warehouse_code, warehouse_name=warehouse_name, address=address, tenantId=tid
    )
    db.add(wh)
    await db.commit()
    await db.refresh(wh)
    return wh


async def create_bin_location(
    db: AsyncSession,
    warehouse_id: int,
    bin_code: str,
    bin_name: Optional[str] = None,
    zone: Optional[str] = None,
    aisle: Optional[str] = None,
    rack: Optional[str] = None,
    shelf: Optional[str] = None,
) -> BinLocation:
    tid = get_tenant_id()
    wh_stmt = select(Warehouse).where(Warehouse.id == warehouse_id)
    if tid is not None:
        wh_stmt = wh_stmt.where(Warehouse.tenantId == tid)
    result = await db.execute(wh_stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found")
    bl = BinLocation(
        warehouse_id=warehouse_id,
        bin_code=bin_code,
        bin_name=bin_name,
        zone=zone,
        aisle=aisle,
        rack=rack,
        shelf=shelf,
        tenantId=tid,
    )
    db.add(bl)
    await db.commit()
    await db.refresh(bl)
    return bl


async def adjust_inventory(
    db: AsyncSession,
    current_user: User,
    part_id: int,
    warehouse_id: int,
    quantity: float,
    adjustment_type: str,
    idempotency_key: Optional[str] = None,
    reason: Optional[str] = None,
    lot_number: Optional[str] = None,
    serial_number: Optional[str] = None,
) -> dict:
    if not await check_idempotency(idempotency_key):
        raise HTTPException(status_code=409, detail="Duplicate request")
    tid = get_tenant_id()
    part_stmt = select(Part).where(Part.id == part_id)
    if tid is not None:
        part_stmt = part_stmt.where(Part.tenantId == tid)
    part = await db.execute(part_stmt)
    if not part.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Part not found")
    wh_stmt = select(Warehouse).where(Warehouse.id == warehouse_id)
    if tid is not None:
        wh_stmt = wh_stmt.where(Warehouse.tenantId == tid)
    wh = await db.execute(wh_stmt)
    if not wh.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found")
    inv_stmt = select(Inventory).where(
        Inventory.part_id == part_id, Inventory.warehouse_id == warehouse_id
    )
    if tid is not None:
        inv_stmt = inv_stmt.where(Inventory.tenantId == tid)
    inv = await db.execute(inv_stmt)
    inventory = inv.scalar_one_or_none()
    if not inventory:
        inventory = Inventory(part_id=part_id, warehouse_id=warehouse_id, quantity_on_hand=0)
        db.add(inventory)
        await db.flush()
    old_qty = inventory.quantity_on_hand or 0
    change = 0
    valid_types = {
        "receive": 1,
        "issue": -1,
        "adjust": 0,
        "return": 1,
        "scrap": -1,
        "transfer_in": 1,
        "transfer_out": -1,
    }
    multiplier = valid_types.get(adjustment_type)
    if multiplier is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid adjustment_type. Must be one of: {list(valid_types.keys())}",
        )
    if adjustment_type == "adjust":
        inventory.quantity_on_hand = quantity
        change = quantity - old_qty
    else:
        change = quantity * multiplier
        inventory.quantity_on_hand = (inventory.quantity_on_hand or 0) + change
    txn = InventoryTransaction(
        part_id=part_id,
        warehouse_id=warehouse_id,
        transaction_type=adjustment_type,
        quantity=abs(quantity),
        direction="in" if change >= 0 else "out",
        reference_type="manual",
        reference_id=0,
        reason=reason,
        lot_number=lot_number,
        serial_number=serial_number,
        created_by=current_user.id,
        transaction_date=datetime.now(UTC),
    )
    db.add(txn)
    await db.commit()
    await _log_audit(
        db,
        current_user,
        f"INVENTORY_{adjustment_type.upper()}",
        part_id,
        {
            "warehouse_id": warehouse_id,
            "old_qty": old_qty,
            "new_qty": inventory.quantity_on_hand,
        },
    )
    await db.commit()
    return {
        "part_id": part_id,
        "warehouse_id": warehouse_id,
        "old_quantity": old_qty,
        "new_quantity": inventory.quantity_on_hand,
        "adjustment_type": adjustment_type,
    }


async def transfer_inventory(
    db: AsyncSession,
    current_user: User,
    part_id: int,
    from_warehouse_id: int,
    to_warehouse_id: int,
    quantity: float,
    idempotency_key: Optional[str] = None,
    lot_number: Optional[str] = None,
    serial_number: Optional[str] = None,
) -> dict:
    if not await check_idempotency(idempotency_key):
        raise HTTPException(status_code=409, detail="Duplicate request")

    tid = get_tenant_id()
    part_stmt = select(Part).where(Part.id == part_id)
    if tid is not None:
        part_stmt = part_stmt.where(Part.tenantId == tid)
    part = await db.execute(part_stmt)
    if not part.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Part not found")

    wh_stmt = select(Warehouse).where(Warehouse.id == from_warehouse_id)
    if tid is not None:
        wh_stmt = wh_stmt.where(Warehouse.tenantId == tid)
    wh = await db.execute(wh_stmt)
    if not wh.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Source warehouse not found"
        )

    wh_stmt = select(Warehouse).where(Warehouse.id == to_warehouse_id)
    if tid is not None:
        wh_stmt = wh_stmt.where(Warehouse.tenantId == tid)
    wh = await db.execute(wh_stmt)
    if not wh.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Destination warehouse not found"
        )

    from_inv_stmt = (
        select(Inventory)
        .where(Inventory.part_id == part_id, Inventory.warehouse_id == from_warehouse_id)
        .with_for_update()
    )
    if tid is not None:
        from_inv_stmt = from_inv_stmt.where(Inventory.tenantId == tid)
    from_inv = await db.execute(from_inv_stmt)

    wh = await db.execute(select(Warehouse).where(Warehouse.id == to_warehouse_id))
    if not wh.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Destination warehouse not found"
        )

    from_inv = await db.execute(
        select(Inventory)
        .where(Inventory.part_id == part_id, Inventory.warehouse_id == from_warehouse_id)
        .with_for_update()
    )
    from_inventory = from_inv.scalar_one_or_none()
    if not from_inventory or (from_inventory.quantity_on_hand or 0) < quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient inventory for transfer"
        )

    to_inv = await db.execute(
        select(Inventory)
        .where(Inventory.part_id == part_id, Inventory.warehouse_id == to_warehouse_id)
        .with_for_update()
    )
    to_inventory = to_inv.scalar_one_or_none()
    if not to_inventory:
        to_inventory = Inventory(part_id=part_id, warehouse_id=to_warehouse_id, quantity_on_hand=0)
        db.add(to_inventory)
        await db.flush()

    from_inventory.quantity_on_hand -= quantity
    to_inventory.quantity_on_hand += quantity
    now = datetime.now(UTC)

    out_txn = InventoryTransaction(
        part_id=part_id,
        warehouse_id=from_warehouse_id,
        transaction_type="transfer_out",
        quantity=quantity,
        direction="out",
        reference_type="transfer",
        reference_id=0,
        reason=f"Transfer to warehouse {to_warehouse_id}",
        lot_number=lot_number,
        serial_number=serial_number,
        created_by=current_user.id,
        transaction_date=now,
    )
    db.add(out_txn)

    in_txn = InventoryTransaction(
        part_id=part_id,
        warehouse_id=to_warehouse_id,
        transaction_type="transfer_in",
        quantity=quantity,
        direction="in",
        reference_type="transfer",
        reference_id=0,
        reason=f"Transfer from warehouse {from_warehouse_id}",
        lot_number=lot_number,
        serial_number=serial_number,
        created_by=current_user.id,
        transaction_date=now,
    )
    db.add(in_txn)

    await db.commit()
    await _log_audit(
        db,
        current_user,
        "INVENTORY_TRANSFER",
        part_id,
        {
            "from_warehouse_id": from_warehouse_id,
            "to_warehouse_id": to_warehouse_id,
            "quantity": quantity,
        },
    )
    await db.commit()
    return {
        "part_id": part_id,
        "from_warehouse_id": from_warehouse_id,
        "to_warehouse_id": to_warehouse_id,
        "quantity": quantity,
    }


async def get_inventory(db: AsyncSession, part_id: int, warehouse_id: int) -> Optional[dict]:
    cache_key = f"inventory:{part_id}:{warehouse_id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached
    tid = get_tenant_id()
    inv_stmt = select(Inventory).where(
        Inventory.part_id == part_id, Inventory.warehouse_id == warehouse_id
    )
    if tid is not None:
        inv_stmt = inv_stmt.where(Inventory.tenantId == tid)
    inv = await db.execute(inv_stmt)
    inventory = inv.scalar_one_or_none()
    if not inventory:
        return None
    result = {
        "id": inventory.id,
        "part_id": inventory.part_id,
        "warehouse_id": inventory.warehouse_id,
        "quantity_on_hand": inventory.quantity_on_hand,
        "quantity_reserved": inventory.quantity_reserved,
        "lot_number": inventory.lot_number,
        "serial_number": inventory.serial_number,
        "created_at": inventory.created_at.isoformat() if inventory.created_at else None,
        "updated_at": inventory.updated_at.isoformat() if inventory.updated_at else None,
    }
    await cache_set(cache_key, result, 300)
    return result


async def reserve_inventory(
    db: AsyncSession,
    current_user: User,
    part_id: int,
    warehouse_id: int,
    quantity: float,
    reference_type: str,
    reference_id: int,
) -> dict:
    tid = get_tenant_id()
    inv_stmt = select(Inventory).where(
        Inventory.part_id == part_id, Inventory.warehouse_id == warehouse_id
    )
    if tid is not None:
        inv_stmt = inv_stmt.where(Inventory.tenantId == tid)
    inv = await db.execute(inv_stmt)
    inventory = inv.scalar_one_or_none()
    if not inventory or (inventory.quantity_on_hand or 0) < quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient inventory"
        )
    reservation = InventoryReservation(
        part_id=part_id,
        warehouse_id=warehouse_id,
        quantity_reserved=quantity,
        reference_type=reference_type,
        reference_id=reference_id,
        reserved_by=current_user.id,
        reserved_at=datetime.now(UTC),
    )
    db.add(reservation)
    inventory.quantity_reserved = (inventory.quantity_reserved or 0) + quantity
    await db.commit()
    return {
        "part_id": part_id,
        "warehouse_id": warehouse_id,
        "quantity_reserved": quantity,
        "reference_type": reference_type,
        "reference_id": reference_id,
    }
