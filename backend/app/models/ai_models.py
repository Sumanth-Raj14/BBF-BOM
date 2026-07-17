from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    event,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class DemandForecast(Base, TenantAwareMixin):
    __tablename__ = "demand_forecasts"

    id = Column(Integer, primary_key=True)
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    forecast = Column(JSON)
    confidence = Column(Float, default=0.0)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<DemandForecast partId={self.partId}>"


class InterchangeabilitySuggestion(Base, TenantAwareMixin):
    __tablename__ = "interchangeability_suggestions"

    id = Column(Integer, primary_key=True)
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    suggestedPartId = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    score = Column(Float, default=0.0)
    reason = Column(Text)
    status = Column(String, default="pending")
    __table_args__ = (
        Index("idx_interchangeability_suggestions_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'reviewed')",
            name="ck_interchangeability_suggestions_status",
        ),
    )
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<InterchangeabilitySuggestion {self.partId} <-> {self.suggestedPartId} score={self.score}>"


class ValidationResult(Base, TenantAwareMixin):
    __tablename__ = "validation_results"

    ALLOWED_ENTITY_TYPES = {"part", "project", "bom", "document", "eco", "ncr", "po", "vendor"}

    id = Column(Integer, primary_key=True)
    entityType = Column(String(50))
    entityId = Column(Integer)
    result = Column(JSON)
    passed = Column(Boolean, default=False)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (Index("idx_validation_entity", "entityType", "entityId"),)

    def __repr__(self):
        return f"<ValidationResult entityType={self.entityType} entityId={self.entityId} passed={self.passed}>"


@event.listens_for(ValidationResult, "before_insert")
@event.listens_for(ValidationResult, "before_update")
def validate_validation_entity(mapper, connection, target):
    if target.entityType and target.entityType not in ValidationResult.ALLOWED_ENTITY_TYPES:
        raise ValueError(
            f"Invalid entityType '{target.entityType}'. Must be one of: {ValidationResult.ALLOWED_ENTITY_TYPES}"
        )


class ApprovalAutomationRule(Base, TenantAwareMixin):
    __tablename__ = "approval_automation_rules"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    conditions = Column(JSON)
    actions = Column(JSON)
    active = Column(Boolean, default=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<ApprovalAutomationRule {self.name}>"
