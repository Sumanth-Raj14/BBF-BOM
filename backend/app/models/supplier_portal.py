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
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class SupplierUser(Base, TenantAwareMixin):
    __tablename__ = "supplier_users"

    id = Column(Integer, primary_key=True)
    vendorId = Column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    passwordHash = Column(String, nullable=False)
    active = Column(Boolean, default=True)
    lastLoginAt = Column(DateTime(timezone=True))
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<SupplierUser {self.email}>"


class SupplierPriceUpdate(Base, TenantAwareMixin):
    __tablename__ = "supplier_price_updates"

    id = Column(Integer, primary_key=True)
    supplierUserId = Column(
        Integer, ForeignKey("supplier_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    oldPrice = Column(Numeric(18, 4), default=0.0)
    newPrice = Column(Numeric(18, 4), default=0.0)
    status = Column(String, default="pending")
    __table_args__ = (
        Index("idx_supplier_price_updates_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')", name="ck_supplier_price_updates_status"
        ),
    )
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())
    reviewedAt = Column(DateTime(timezone=True))

    def __repr__(self):
        return f"<SupplierPriceUpdate {self.id}: part={self.partId}>"


class RfqHeader(Base, TenantAwareMixin):
    __tablename__ = "rfq_headers"

    id = Column(Integer, primary_key=True)
    rfq_number = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    description = Column(String)
    status = Column(String, default="draft")
    issue_date = Column(DateTime(timezone=True), server_default=func.now())
    response_deadline = Column(DateTime(timezone=True))
    awarded_to_vendor_id = Column(
        Integer, ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True
    )
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("idx_rfq_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('draft', 'sent', 'responded', 'awarded', 'cancelled')",
            name="ck_rfq_status",
        ),
    )

    def __repr__(self):
        return f"<RfqHeader {self.rfq_number}>"


class RfqLineItem(Base, TenantAwareMixin):
    __tablename__ = "rfq_line_items"

    id = Column(Integer, primary_key=True)
    rfq_id = Column(
        Integer, ForeignKey("rfq_headers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity = Column(Integer, nullable=False)
    target_price = Column(Numeric(18, 4))
    notes = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<RfqLineItem RFQ:{self.rfq_id} Part:{self.part_id}>"


class RfqSupplierResponse(Base, TenantAwareMixin):
    __tablename__ = "rfq_supplier_responses"

    id = Column(Integer, primary_key=True)
    rfq_id = Column(
        Integer, ForeignKey("rfq_headers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    supplier_user_id = Column(
        Integer, ForeignKey("supplier_users.id", ondelete="CASCADE"), nullable=False
    )
    line_item_id = Column(
        Integer, ForeignKey("rfq_line_items.id", ondelete="CASCADE"), nullable=False
    )
    quoted_price = Column(Numeric(18, 4), nullable=False)
    quoted_lead_time_days = Column(Integer)
    notes = Column(String)
    status = Column(String, default="submitted")
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "status IN ('submitted', 'accepted', 'rejected')",
            name="ck_rfq_response_status",
        ),
    )

    def __repr__(self):
        return f"<RfqSupplierResponse RFQ:{self.rfq_id} User:{self.supplier_user_id}>"
