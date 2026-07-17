from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class PriceHistory(Base, TenantAwareMixin):
    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True)
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    vendorId = Column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=True, index=True
    )  # Optional if it's a general market price

    # Price details
    price = Column(Float, nullable=False)
    currency = Column(String, default="USD")
    effectiveDate = Column(DateTime(timezone=True))  # When this price became effective

    # Source
    source = Column(String)  # e.g., "vendor_quote", "market_data", "historical_avg"
    sourceReference = Column(String)  # Reference to the source document or quote

    # Timestamps
    recordedAt = Column(DateTime(timezone=True), server_default=func.now())
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    part = relationship("Part", backref="price_history")
    vendor = relationship("Vendor", backref="price_history")

    def __repr__(self):
        return f"<PriceHistory {self.partId}: {self.price} {self.currency} on {self.effectiveDate}>"
