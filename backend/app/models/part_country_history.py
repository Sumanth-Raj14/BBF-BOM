from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class PartCountryHistory(Base, TenantAwareMixin):
    __tablename__ = "part_country_history"

    id = Column(Integer, primary_key=True)
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    country = Column(String(100), nullable=False)
    date_from = Column(DateTime(timezone=True))
    date_to = Column(DateTime(timezone=True))
    reason = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.current_timestamp())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    part = relationship("Part", back_populates="country_history")

    def __repr__(self):
        return f"<PartCountryHistory {self.id}>"


class PartVendorPrice(Base, TenantAwareMixin):
    __tablename__ = "part_vendor_prices"

    id = Column(Integer, primary_key=True)
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="SET NULL"), index=True)
    vendor_name = Column(String(255))
    price = Column(Float, nullable=False)
    currency = Column(String(3), server_default="USD")
    quantity_break = Column(Integer, server_default="1")
    date_quoted = Column(DateTime(timezone=True))
    date_valid_until = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.current_timestamp())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<PartVendorPrice {self.id}>"

    part = relationship("Part", back_populates="vendor_prices")
    vendor = relationship("Vendor")
