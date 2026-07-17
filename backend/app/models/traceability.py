from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class SerialNumber(Base, TenantAwareMixin):
    __tablename__ = "serial_numbers"

    id = Column(Integer, primary_key=True)
    serialNumber = Column(String, nullable=False)  # unique per tenant
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    lotBatchNumber = Column(String, index=True)
    poId = Column(
        Integer, ForeignKey("po_headers.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # Status
    status = Column(
        String, default="In Stock"
    )  # In Stock, Installed, Consumed, Scrapped, Quarantine

    __table_args__ = (
        Index("idx_serial_numbers_tenant_status", "tenantId", "status"),
        UniqueConstraint("tenantId", "serialNumber", name="uq_serial_numbers_tenant_serialNumber"),
        CheckConstraint(
            "status IN ('In Stock', 'Installed', 'Consumed', 'Scrapped', 'Quarantine')",
            name="ck_serial_numbers_status",
        ),
    )

    # Location tracking
    currentLocation = Column(String)  # "Warehouse A", "Line 3", etc.
    installedOnAsset = Column(String)  # Which asset/assembly it's installed on
    installationDate = Column(DateTime(timezone=True))

    # History
    statusHistory = Column(JSON, default=[])  # [{status, date, location, user}]

    # Quality
    incomingInspectionResult = Column(String)  # "Pass", "Fail", "Conditional"
    certificationUrl = Column(String)  # Link to material cert

    # Dates
    manufactureDate = Column(DateTime(timezone=True))
    expirationDate = Column(DateTime(timezone=True))
    receivedDate = Column(DateTime(timezone=True))

    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    events = relationship("SerialNumberEvent", back_populates="serial_number")
    part = relationship("Part", backref="serial_numbers")
    purchase_order = relationship("POHeader", backref="serial_numbers")

    def __repr__(self):
        return f"<SerialNumber {self.serialNumber}: {self.status}>"


class SerialNumberEvent(Base, TenantAwareMixin):
    __tablename__ = "serial_number_events"

    id = Column(Integer, primary_key=True)
    serial_number_id = Column(
        Integer, ForeignKey("serial_numbers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status = Column(String(50))
    to_status = Column(String(50))
    location = Column(String(255))
    changed_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    notes = Column(Text)
    event_date = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    serial_number = relationship("SerialNumber", back_populates="events")
    changed_by_user = relationship("User", backref="serial_number_events")

    def __repr__(self):
        return f"<SerialNumberEvent {self.from_status}->{self.to_status}>"


class LotBatch(Base, TenantAwareMixin):
    __tablename__ = "lot_batches"

    id = Column(Integer, primary_key=True)
    lotBatchNumber = Column(String, nullable=False)  # unique per tenant
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    vendorId = Column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=True, index=True
    )
    poId = Column(
        Integer, ForeignKey("po_headers.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # Quantities
    quantityReceived = Column(Integer, default=0)
    quantityInspected = Column(Integer, default=0)
    quantityAccepted = Column(Integer, default=0)
    quantityRejected = Column(Integer, default=0)

    # Dates
    manufactureDate = Column(DateTime(timezone=True))
    receivedDate = Column(DateTime(timezone=True))
    expirationDate = Column(DateTime(timezone=True))

    # Quality
    incomingInspectionResult = Column(String)  # "Pass", "Fail", "Conditional"
    certificationUrl = Column(String)

    # Status
    status = Column(
        String, default="Received"
    )  # Received, Inspected, Accepted, Rejected, Quarantine, Depleted

    __table_args__ = (
        Index("idx_lot_batches_tenant_status", "tenantId", "status"),
        UniqueConstraint(
            "tenantId", "lotBatchNumber", name="uq_lot_batches_tenant_lotBatchNumber"
        ),
        CheckConstraint(
            "status IN ('Received', 'Inspected', 'Accepted', 'Rejected', 'Quarantine', 'Depleted')",
            name="ck_lot_batches_status",
        ),
    )

    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    part = relationship("Part", backref="lot_batches")
    vendor = relationship("Vendor", backref="lot_batches")
    purchase_order = relationship("POHeader", backref="lot_batches")

    def __repr__(self):
        return f"<LotBatch {self.lotBatchNumber}: {self.status}>"
