"""
Inventory Management
Supports warehouse, bin locations, inventory tracking, and transactions
"""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Warehouse(Base, TenantAwareMixin):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True)
    warehouse_code = Column(String(50), nullable=False)  # unique per tenant
    warehouse_name = Column(String(255), nullable=False)
    address = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("tenantId", "warehouse_code", name="uq_warehouses_tenant_warehouse_code"),
    )

    # Relationships
    bin_locations = relationship("BinLocation", back_populates="warehouse")
    inventory = relationship("Inventory", back_populates="warehouse")

    def __repr__(self):
        return f"<Warehouse {self.id}>"


class BinLocation(Base, TenantAwareMixin):
    __tablename__ = "bin_locations"

    id = Column(Integer, primary_key=True)
    warehouse_id = Column(
        Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bin_code = Column(String(50), nullable=False)
    bin_name = Column(String(255))
    zone = Column(String(50))
    aisle = Column(String(50))
    rack = Column(String(50))
    shelf = Column(String(50))
    bin_position = Column(String(50))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    warehouse = relationship("Warehouse", back_populates="bin_locations")

    def __repr__(self):
        return f"<BinLocation {self.id}>"

    inventory = relationship("Inventory", back_populates="bin_location")

    __table_args__ = (UniqueConstraint("warehouse_id", "bin_code", name="uq_bin_warehouse"),)


class Inventory(Base, TenantAwareMixin):
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True)
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    warehouse_id = Column(
        Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bin_location_id = Column(
        Integer, ForeignKey("bin_locations.id", ondelete="CASCADE"), index=True
    )
    lot_number = Column(String(100))
    serial_number = Column(String(100))
    quantity_on_hand = Column(Numeric(10, 4), default=0)
    quantity_reserved = Column(Numeric(10, 4), default=0)
    unit_cost = Column(Numeric(10, 4))
    last_received_date = Column(DateTime(timezone=True))
    last_issued_date = Column(DateTime(timezone=True))
    expiry_date = Column(Date)
    status = Column(String(50), default="available")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_inventory_tenant_status", "tenantId", "status"),
        UniqueConstraint(
            "part_id",
            "warehouse_id",
            "bin_location_id",
            "lot_number",
            name="uq_inventory_part_location_lot",
        ),
        CheckConstraint(
            "status IN ('available', 'reserved', 'quarantined', 'damaged', 'consumed')",
            name="ck_inventory_status",
        ),
    )

    def __repr__(self):
        return f"<Inventory {self.id}>"

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    part = relationship("Part")
    warehouse = relationship("Warehouse", back_populates="inventory")
    bin_location = relationship("BinLocation", back_populates="inventory")


class InventoryTransaction(Base, TenantAwareMixin):
    __tablename__ = "inventory_transactions"

    ALLOWED_REFERENCE_TYPES = {
        "po",
        "work_order",
        "transfer",
        "adjustment",
        "receipt",
        "issue",
        "return",
    }

    id = Column(Integer, primary_key=True)
    transaction_number = Column(String(50), nullable=False)  # unique per tenant
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    warehouse_id = Column(
        Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bin_location_id = Column(
        Integer, ForeignKey("bin_locations.id", ondelete="CASCADE"), index=True
    )
    transaction_type = Column(String(50), nullable=False)
    quantity = Column(Numeric(10, 4), nullable=False)
    unit_cost = Column(Numeric(10, 4))
    total_cost = Column(Numeric(10, 4))
    reference_type = Column(String(50))
    reference_id = Column(Integer)
    lot_number = Column(String(100))

    __table_args__ = (
        Index("idx_inv_txn_reference", "reference_type", "reference_id"),
        UniqueConstraint(
            "tenantId", "transaction_number", name="uq_inventory_transactions_tenant_transaction_number"
        ),
        CheckConstraint(
            "transaction_type IN ('receipt', 'issue', 'transfer', 'adjustment', 'return')",
            name="ck_inv_txn_transaction_type",
        ),
        CheckConstraint(
            "reference_type IN ('po', 'work_order', 'transfer', 'adjustment', 'sales_order', 'return')",
            name="ck_inv_txn_reference_type",
        ),
    )
    serial_number = Column(String(100))
    from_warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), index=True)
    to_warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), index=True)
    reason = Column(Text)
    performed_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    performed_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<InventoryTransaction {self.id}>"

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    part = relationship("Part")
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    from_warehouse = relationship("Warehouse", foreign_keys=[from_warehouse_id])
    to_warehouse = relationship("Warehouse", foreign_keys=[to_warehouse_id])
    performed_by_user = relationship("User", foreign_keys=[performed_by])


@event.listens_for(InventoryTransaction, "before_insert")
@event.listens_for(InventoryTransaction, "before_update")
def validate_inv_txn_reference(mapper, connection, target):
    if (
        target.reference_type
        and target.reference_type not in InventoryTransaction.ALLOWED_REFERENCE_TYPES
    ):
        raise ValueError(
            f"Invalid reference_type '{target.reference_type}'. Must be one of: {InventoryTransaction.ALLOWED_REFERENCE_TYPES}"
        )


class InventoryReservation(Base, TenantAwareMixin):
    __tablename__ = "inventory_reservations"

    ALLOWED_REFERENCE_TYPES = {"po", "work_order", "sales_order", "transfer", "forecast"}

    id = Column(Integer, primary_key=True)
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    warehouse_id = Column(
        Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity_reserved = Column(Numeric(10, 4), nullable=False)
    reference_type = Column(String(50))
    reference_id = Column(Integer)

    def __repr__(self):
        return f"<InventoryReservation {self.id}>"

    reserved_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    reserved_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True))

    __table_args__ = (Index("idx_inv_reservation_reference", "reference_type", "reference_id"),)

    # Relationships
    part = relationship("Part")
    warehouse = relationship("Warehouse")
    reserved_by_user = relationship("User", foreign_keys=[reserved_by])


@event.listens_for(InventoryReservation, "before_insert")
@event.listens_for(InventoryReservation, "before_update")
def validate_inv_reservation_reference(mapper, connection, target):
    if (
        target.reference_type
        and target.reference_type not in InventoryReservation.ALLOWED_REFERENCE_TYPES
    ):
        raise ValueError(
            f"Invalid reference_type '{target.reference_type}'. Must be one of: {InventoryReservation.ALLOWED_REFERENCE_TYPES}"
        )
