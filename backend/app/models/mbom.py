"""
Manufacturing BOM (MBOM)
Supports manufacturing-specific BOM with operations and work centers
"""

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Interval,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class MbomHeader(Base, TenantAwareMixin):
    __tablename__ = "mbom_headers"

    id = Column(Integer, primary_key=True)
    mbom_number = Column(String(50), nullable=False, index=True)  # unique per tenant
    ebom_id = Column(Integer, ForeignKey("boms.id", ondelete="CASCADE"), index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(50), default="draft")
    version = Column(String(50), default="1.0")
    revision = Column(Integer, default=1)
    work_center = Column(String(100))
    setup_time = Column(Interval)
    run_time = Column(Interval)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    __table_args__ = (
        Index("idx_mbom_headers_tenant_status", "tenantId", "status"),
        UniqueConstraint("tenantId", "mbom_number", name="uq_mbom_headers_tenant_mbom_number"),
        CheckConstraint(
            "status IN ('draft', 'released', 'archived')", name="ck_mbom_headers_status"
        ),
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    ebom = relationship("BOM", back_populates="mbom")
    items = relationship("MbomItem", back_populates="mbom", cascade="all, delete-orphan")
    operations = relationship("MbomOperation", back_populates="mbom", cascade="all, delete-orphan")
    work_orders = relationship("WorkOrder", back_populates="mbom")
    created_by_user = relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<MbomHeader {self.id}>"


class MbomItem(Base, TenantAwareMixin):
    __tablename__ = "mbom_items"

    id = Column(Integer, primary_key=True)
    mbom_id = Column(
        Integer, ForeignKey("mbom_headers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity = Column(Numeric(10, 4), nullable=False)
    unit = Column(String(20), default="EA")
    operation_number = Column(Integer)
    work_center = Column(String(100))
    setup_time = Column(Interval)
    run_time = Column(Interval)
    scrap_factor = Column(Numeric(5, 2), default=0)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships

    def __repr__(self):
        return f"<MbomItem {self.id}>"

    mbom = relationship("MbomHeader", back_populates="items")
    part = relationship("Part")


class MbomOperation(Base, TenantAwareMixin):
    __tablename__ = "mbom_operations"

    id = Column(Integer, primary_key=True)
    mbom_id = Column(
        Integer, ForeignKey("mbom_headers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    operation_number = Column(Integer, nullable=False)
    operation_name = Column(String(255), nullable=False)
    description = Column(Text)
    work_center = Column(String(100))
    setup_time = Column(Interval)
    run_time = Column(Interval)
    wait_time = Column(Interval)
    move_time = Column(Interval)
    tooling_required = Column(Text)
    skills_required = Column(Text)

    def __repr__(self):
        return f"<MbomOperation {self.id}>"

    instructions = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    mbom = relationship("MbomHeader", back_populates="operations")
