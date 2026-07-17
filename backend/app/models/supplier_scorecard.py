from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class SupplierScorecard(Base, TenantAwareMixin):
    __tablename__ = "supplier_scorecards"

    id = Column(Integer, primary_key=True)
    vendorId = Column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period = Column(String, nullable=False)  # e.g., "2026-Q1"
    year = Column(Integer, nullable=False)
    quarter = Column(Integer)  # 1-4, null for monthly

    # Weighted metric scores (0-100)
    qualityScore = Column(Float, default=0.0)  # Defect rate, returns
    deliveryScore = Column(Float, default=0.0)  # On-time delivery rate
    costScore = Column(Float, default=0.0)  # Price competitiveness
    responsivenessScore = Column(Float, default=0.0)  # Communication speed
    complianceScore = Column(Float, default=0.0)  # Regulatory compliance

    # Weights (should sum to 1.0)
    qualityWeight = Column(Float, default=0.30)
    deliveryWeight = Column(Float, default=0.25)
    costWeight = Column(Float, default=0.20)
    responsivenessWeight = Column(Float, default=0.15)
    complianceWeight = Column(Float, default=0.10)

    # Calculated
    weightedScore = Column(Float, default=0.0)  # Final weighted score
    grade = Column(String)  # A, B, C, D, F

    # Raw data
    totalOrders = Column(Integer, default=0)
    onTimeDeliveries = Column(Integer, default=0)
    defectCount = Column(Integer, default=0)
    totalUnitsReceived = Column(Integer, default=0)
    avgLeadTimeDays = Column(Float, default=0.0)
    avgResponseTimeHours = Column(Float, default=0.0)

    # Trends
    trend = Column(String)  # "Improving", "Stable", "Declining"
    notes = Column(Text)

    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    vendor = relationship("Vendor", backref="scorecards")

    def __repr__(self):
        return f"<SupplierScorecard {self.vendorId}: {self.grade} ({self.weightedScore})>"
