"""BOM master model — represents a Bill of Materials header."""

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
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class BOM(Base, TenantAwareMixin):
    __tablename__ = "boms"

    id = Column(Integer, primary_key=True)
    bom_number = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    status = Column(String, default="draft")
    version = Column(String, default="1.0")
    revision = Column(Integer, default=1)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    project = relationship("Project", backref="boms")
    items = relationship("BOMItem", back_populates="bom", cascade="all, delete-orphan")
    snapshots = relationship("BomSnapshot", back_populates="bom", cascade="all, delete-orphan")
    baselines = relationship("BomBaseline", back_populates="bom", cascade="all, delete-orphan")
    variants = relationship("BomVariant", back_populates="base_bom", cascade="all, delete-orphan")
    mbom = relationship("MbomHeader", back_populates="ebom", uselist=False)

    __table_args__ = (
        Index("idx_boms_tenant_status", "tenantId", "status"),
        CheckConstraint("status IN ('draft', 'active', 'archived')", name="ck_boms_status"),
    )

    def __repr__(self):
        return f"<BOM {self.bom_number} v{self.version}>"


class BOMItem(Base, TenantAwareMixin):
    __tablename__ = "bom_items_master"

    id = Column(Integer, primary_key=True)
    bom_id = Column(Integer, ForeignKey("boms.id", ondelete="CASCADE"), nullable=False, index=True)
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), index=True)
    quantity = Column(Numeric(10, 4), default=1)
    unit = Column(String, default="EA")
    reference_designator = Column(String)
    sort_order = Column(Integer, default=0)
    parent_item_id = Column(
        Integer, ForeignKey("bom_items_master.id", ondelete="CASCADE"), index=True
    )
    unit_cost_snapshot = Column(Numeric(10, 4))
    extended_cost = Column(Numeric(10, 4))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    bom = relationship("BOM", back_populates="items")
    part = relationship("Part", backref="bom_master_items")
    children = relationship("BOMItem", backref="parent", remote_side=[id], lazy="selectin")

    def __repr__(self):
        return f"<BOMItem BOM:{self.bom_id} Part:{self.part_id} x{self.quantity}>"
