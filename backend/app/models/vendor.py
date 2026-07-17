from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Vendor(Base, TenantAwareMixin):
    __tablename__ = "vendors"
    __table_args__ = (UniqueConstraint("tenantId", "name", name="uq_vendor_tenant_name"),)

    id = Column(Integer, primary_key=True)
    name = Column(String, index=True, nullable=False)
    country = Column(String)  # Country where vendor is located
    contactEmail = Column(String)
    contactPhone = Column(String)
    address = Column(Text)
    leadTime = Column(Integer, default=0)  # Average lead time in days
    moq = Column(Integer, default=1)  # Minimum Order Quantity
    terms = Column(String)  # Payment terms (Net 30, etc.)
    reliabilityRating = Column(Float, default=0.0)  # 0-5 scale
    notes = Column(Text)
    active = Column(Boolean, default=True)

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<Vendor {self.name}>"
