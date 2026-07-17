import enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class POStatus(enum.StrEnum):
    NOT_ORDERED = "Not Ordered"
    RFQ_SENT = "RFQ Sent"
    UNDER_REVIEW = "Under Review"
    ORDERED = "Ordered"
    IN_TRANSIT = "In Transit"
    RECEIVED = "Received"
    QUALITY_CHECK = "Quality Check"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    CLOSED = "Closed"


class PurchaseOrder(Base, TenantAwareMixin):
    """DEPRECATED — use POHeader/POLineItem from po_models.py instead.
    Retained for backward compatibility with existing FK references in
    document.py and traceability.py. Will be removed in v2.0.0 after
    data migration via scripts/consolidate_po.py completes."""

    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True)
    poNumber = Column(String, unique=True, index=True, nullable=False)  # PO-2026-0001
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    vendorId = Column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    qty = Column(Integer, nullable=False)
    eta = Column(String)  # Estimated Time of Arrival
    status = Column(String, default="Not Ordered")

    # Financials
    unitCost = Column(Numeric(18, 4))
    totalCost = Column(Numeric(18, 4))
    taxCost = Column(Numeric(18, 4))
    freightCost = Column(Numeric(18, 4))

    # Migration tracking
    migrated_to_po_headers = Column(Boolean, default=False)
    po_header_id = Column(Integer, ForeignKey("po_headers.id", ondelete="CASCADE"), index=True)

    # References
    poReference = Column(String)  # PO reference from vendor
    invoiceReference = Column(String)  # Invoice number

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    part = relationship("Part", backref="purchase_orders")
    vendor = relationship("Vendor", backref="purchase_orders")

    __table_args__ = (
        Index("idx_purchase_orders_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('Not Ordered', 'RFQ Sent', 'Under Review', 'Ordered', 'In Transit', 'Received', 'Quality Check', 'Approved', 'Rejected', 'Closed')",
            name="ck_purchase_orders_status",
        ),
    )

    def __repr__(self):
        return f"<PurchaseOrder {self.poNumber}: {self.partId} x{self.qty}>"
