from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class PartVendor(Base, TenantAwareMixin):
    __tablename__ = "part_vendors"

    id = Column(Integer, primary_key=True)
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    vendorId = Column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Vendor classification for this part
    isPreferred = Column(Boolean, default=False)  # Preferred vendor for this part
    isAlternate = Column(Boolean, default=False)  # Alternate/backup vendor

    # Part-specific vendor data
    vendorPn = Column(String)  # Vendor's part number (may differ from our PN)
    vendorCost = Column(Numeric(18, 4))  # Vendor-specific price
    vendorLead = Column(Integer)  # Vendor-specific lead time
    vendorMoq = Column(Integer)  # Vendor-specific MOQ

    # Risk and performance
    qualityScore = Column(Float, default=5.0)  # 0-5 scale
    onTimeRate = Column(Float, default=100.0)  # Percentage

    # Notes
    notes = Column(String)

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("partId", "vendorId", name="uq_part_vendor"),)

    # Relationships
    part = relationship("Part", backref="vendor_links")
    vendor = relationship("Vendor", backref="part_links")

    def __repr__(self):
        return (
            f"<PartVendor part:{self.partId} vendor:{self.vendorId} preferred:{self.isPreferred}>"
        )
