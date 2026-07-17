"""
BOM Variants and Configurations
Supports configurable BOM, variant BOM, and product configuration
"""

from sqlalchemy import (
    JSON,
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
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class BomVariant(Base, TenantAwareMixin):
    __tablename__ = "bom_variants"

    id = Column(Integer, primary_key=True)
    base_bom_id = Column(
        Integer, ForeignKey("boms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    variant_name = Column(String(255), nullable=False)
    description = Column(Text)
    configuration_rules = Column(JSON)  # Rules for when to use this variant
    status = Column(String(50), default="active")  # active, inactive, draft
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_bom_variants_tenant_status", "tenantId", "status"),
        CheckConstraint("status IN ('active', 'inactive', 'draft')", name="ck_bom_variants_status"),
    )

    # Relationships
    base_bom = relationship("BOM", back_populates="variants")
    items = relationship("BomVariantItem", back_populates="variant", cascade="all, delete-orphan")
    created_by_user = relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<BomVariant {self.id}>"


class BomVariantItem(Base, TenantAwareMixin):
    __tablename__ = "bom_variant_items"

    id = Column(Integer, primary_key=True)
    variant_id = Column(
        Integer, ForeignKey("bom_variants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity = Column(Numeric(10, 4), nullable=False, default=1)
    substitute_part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), index=True)
    is_optional = Column(Boolean, default=False)
    condition_expression = Column(Text)  # Expression to evaluate when to include
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships

    def __repr__(self):
        return f"<BomVariantItem {self.id}>"

    variant = relationship("BomVariant", back_populates="items")
    part = relationship("Part", foreign_keys=[part_id])
    substitute_part = relationship("Part", foreign_keys=[substitute_part_id])
