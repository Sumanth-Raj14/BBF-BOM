"""
Service BOM - For after-sales, maintenance, and spare parts management.
Complements Engineering BOM (EBOM) and Manufacturing BOM (MBOM).
"""

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
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class ServiceBomHeader(Base, TenantAwareMixin):
    __tablename__ = "service_bom_headers"

    id = Column(Integer, primary_key=True)
    bom_number = Column(String(50), nullable=False)  # unique per tenant
    name = Column(String(255), nullable=False)
    description = Column(Text)
    parent_product_pn = Column(String(100))
    revision = Column(Integer, default=1)
    status = Column(String(50), default="draft")
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    __table_args__ = (
        Index("idx_service_bom_headers_tenant_status", "tenantId", "status"),
        UniqueConstraint(
            "tenantId", "bom_number", name="uq_service_bom_headers_tenant_bom_number"
        ),
        CheckConstraint(
            "status IN ('draft', 'active', 'archived')", name="ck_service_bom_headers_status"
        ),
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    items = relationship(
        "ServiceBomItem", back_populates="service_bom", cascade="all, delete-orphan"
    )
    created_by_user = relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<ServiceBomHeader {self.id}>"


class ServiceBomItem(Base, TenantAwareMixin):
    __tablename__ = "service_bom_items"

    id = Column(Integer, primary_key=True)
    service_bom_id = Column(
        Integer,
        ForeignKey("service_bom_headers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), index=True)
    part_pn = Column(String(100))
    part_name = Column(String(255))
    quantity = Column(Numeric(10, 4), default=1)
    unit = Column(String(20), default="EA")
    __table_args__ = (
        CheckConstraint(
            "service_type IN ('field_service', 'depot_repair', 'spare_parts', 'maintenance')",
            name="ck_service_bom_items_service_type",
        ),
    )
    service_type = Column(String(50))
    interval_hours = Column(Integer)
    interval_months = Column(Integer)
    is_wear_part = Column(Boolean, default=False)
    is_consumable = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<ServiceBomItem {self.id}>"

    service_bom = relationship("ServiceBomHeader", back_populates="items")
    part = relationship("Part")
