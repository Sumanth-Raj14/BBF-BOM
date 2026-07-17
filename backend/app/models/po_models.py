from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class POHeader(Base, TenantAwareMixin):
    """Purchase Order header - represents one PO from the Excel import."""

    __tablename__ = "po_headers"

    id = Column(Integer, primary_key=True)
    poNumber = Column(String, index=True, nullable=False)  # unique per tenant
    poDate = Column(String)
    vendorName = Column(String, nullable=False)
    project = Column(String)
    poTotal = Column(Numeric(18, 4), default=0)
    status = Column(String)
    notes = Column(Text)
    shipping_address = Column(Text)
    billing_address = Column(Text)
    payment_terms = Column(String(100))
    shipping_method = Column(String(100))
    currency = Column(String(3), default="USD")
    approved_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    approved_at = Column(DateTime(timezone=True))
    subtotal = Column(Numeric(12, 2))
    tax_total = Column(Numeric(12, 2))
    freight_total = Column(Numeric(12, 2))
    line_count = Column(Integer)
    requested_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("idx_po_headers_tenant_status", "tenantId", "status"),
        UniqueConstraint("tenantId", "poNumber", name="uq_po_headers_tenant_poNumber"),
        CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'received', 'closed', 'cancelled', 'Not Ordered', 'RFQ Sent', 'Under Review', 'Ordered', 'In Transit', 'Quality Check', 'Rejected', 'Open')",
            name="ck_po_headers_status",
        ),
    )
    items = relationship("POLineItem", back_populates="header", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<POHeader {self.poNumber}: {self.vendorName}>"


class POLineItem(Base, TenantAwareMixin):
    """Purchase Order line item - individual item within a PO."""

    __tablename__ = "po_line_items"

    id = Column(Integer, primary_key=True)
    headerId = Column(
        Integer, ForeignKey("po_headers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    itemName = Column(Text, nullable=False)
    itemDesc = Column(Text)
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), index=True)
    quantity = Column(Integer, default=1)
    itemPrice = Column(Numeric(18, 4), default=0)
    amount = Column(Numeric(18, 4), default=0)
    gst = Column(Numeric(18, 4), default=0)
    total = Column(Numeric(18, 4), default=0)
    eta = Column(String)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    header = relationship("POHeader", back_populates="items")
    part = relationship("Part", backref="po_line_items")

    def __repr__(self):
        return f"<POLineItem {self.itemName[:30]}: qty={self.quantity}>"
