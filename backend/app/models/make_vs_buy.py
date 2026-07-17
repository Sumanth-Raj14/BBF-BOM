from sqlalchemy import (
    JSON,
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


class MakeVsBuyAnalysis(Base, TenantAwareMixin):
    __tablename__ = "make_vs_buy_analyses"

    id = Column(Integer, primary_key=True)
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    projectId = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    decision = Column(String, nullable=False)  # "Make", "Buy", "TBD"

    # Make costs
    makeMaterialCost = Column(Float, default=0.0)
    makeLaborCost = Column(Float, default=0.0)
    makeOverheadCost = Column(Float, default=0.0)
    makeToolingCost = Column(Float, default=0.0)
    makeTotalCost = Column(Float, default=0.0)

    # Buy costs
    buyUnitPrice = Column(Float, default=0.0)
    buyNreCost = Column(Float, default=0.0)  # Non-recurring engineering
    buyTotalCost = Column(Float, default=0.0)

    # Non-cost factors (1-10 scale)
    qualityScore = Column(Integer, default=5)
    leadTimeDays = Column(Integer, default=0)
    capacityScore = Column(Integer, default=5)  # Internal capacity
    ipRiskScore = Column(Integer, default=5)  # IP protection risk
    supplyRiskScore = Column(Integer, default=5)

    # Recommendation
    recommendation = Column(String)  # AI or manual recommendation
    rationale = Column(Text)
    status = Column(String, default="Draft")  # Draft, Submitted, Approved, Rejected
    __table_args__ = (
        Index("idx_make_vs_buy_analyses_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('Draft', 'Submitted', 'Approved', 'Rejected')",
            name="ck_make_vs_buy_analyses_status",
        ),
    )

    # Attachments / references
    attachments = Column(JSON, default=[])

    # Audit
    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    approvedBy = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    part = relationship("Part", backref="make_vs_buy_analyses")
    project = relationship("Project", backref="make_vs_buy_analyses")

    def __repr__(self):
        return f"<MakeVsBuy {self.partId}: {self.decision}>"
