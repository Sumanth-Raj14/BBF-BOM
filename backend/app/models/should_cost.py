from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class ShouldCostModel(Base, TenantAwareMixin):
    __tablename__ = "should_cost_models"

    id = Column(Integer, primary_key=True)
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)

    # Material cost breakdown
    rawMaterialCost = Column(Float, default=0.0)
    materialWastePct = Column(Float, default=5.0)  # percentage
    materialTotal = Column(Float, default=0.0)

    # Labor cost breakdown
    laborHours = Column(Float, default=0.0)
    laborRatePerHour = Column(Float, default=0.0)
    laborTotal = Column(Float, default=0.0)

    # Overhead
    overheadPct = Column(Float, default=30.0)  # percentage of labor
    overheadTotal = Column(Float, default=0.0)

    # Tooling / NRE
    toolingCost = Column(Float, default=0.0)
    toolingAmortizedQty = Column(Integer, default=1000)
    toolingPerUnit = Column(Float, default=0.0)

    # Profit margin
    profitMarginPct = Column(Float, default=15.0)
    profitAmount = Column(Float, default=0.0)

    # Final
    shouldCostPerUnit = Column(Float, default=0.0)
    actualVendorPrice = Column(Float, default=0.0)
    variancePct = Column(Float, default=0.0)

    # Metadata
    notes = Column(Text)
    Assumptions = Column(Text)
    status = Column(String, default="Draft")  # Draft, Active, Archived

    __table_args__ = (
        Index("idx_should_cost_models_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('Draft', 'Active', 'Archived')", name="ck_should_cost_models_status"
        ),
    )

    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    part = relationship("Part", backref="should_cost_models")

    def __repr__(self):
        return f"<ShouldCost {self.partId}: ${self.shouldCostPerUnit}>"
