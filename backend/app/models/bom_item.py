from sqlalchemy import Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import OptimisticLockMixin, TenantAwareMixin


class BomItem(Base, TenantAwareMixin, OptimisticLockMixin):
    """Normalized BOM line item linking a BOM template to parts."""

    __tablename__ = "bom_items"

    id = Column(Integer, primary_key=True)
    bomTemplateId = Column(
        Integer, ForeignKey("bom_templates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Numeric(10, 4), default=1)
    referenceDesignator = Column(String)  # e.g. R1, C5, U3
    notes = Column(Text)
    sortOrder = Column(Integer, default=0)
    parentItemId = Column(
        Integer, ForeignKey("bom_items.id", ondelete="CASCADE"), nullable=True, index=True
    )  # For sub-BOM hierarchy

    # Cost snapshot at time of BOM creation
    unitCostSnapshot = Column(Numeric(18, 4))
    extendedCost = Column(Numeric(18, 4))

    # Effectivity: which revision of this line applies to a given build.
    # A line is *always* effective when every one of these is null (the
    # backward-compatible default for existing rows). Otherwise it is
    # effective on exactly ONE axis — date range, serial range, or lot —
    # enforced by app.services.bom_effectivity_service.validate_effectivity_fields
    # at write time (see that module for why a single explicit "type" column
    # was skipped in favor of inferring the axis from which fields are set).
    effectiveFrom = Column(Date, nullable=True)
    effectiveTo = Column(Date, nullable=True)
    effectiveSerialFrom = Column(String, nullable=True)
    effectiveSerialTo = Column(String, nullable=True)
    effectiveLot = Column(String, nullable=True)  # comma-separated lot codes

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    bom_template = relationship("BomTemplate", back_populates="items")
    part = relationship("Part", backref="bom_items")
    children = relationship(
        "BomItem",
        backref="parent",
        remote_side=[id],
        cascade="all, delete-orphan",
        single_parent=True,
        lazy="selectin",
    )

    __table_args__ = (Index("idx_bom_items_template_part", "bomTemplateId", "partId"),)

    def __repr__(self):
        return f"<BomItem BOM:{self.bomTemplateId} Part:{self.partId} x{self.quantity}>"
