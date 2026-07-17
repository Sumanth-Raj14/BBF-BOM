import enum

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    event,
)
from sqlalchemy import (
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class ApprovalStatus(enum.StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class ApprovalType(enum.StrEnum):
    ECR = "ecr"  # Engineering Change Request
    ECO = "eco"  # Engineering Change Order
    NCR = "ncr"  # Non-Conformance Report
    CAPA = "capa"  # Corrective and Preventive Action
    DOCUMENT = "document"  # Document approval
    PURCHASE = "purchase"  # Purchase approval


class Approval(Base, TenantAwareMixin):
    __tablename__ = "approvals"

    ALLOWED_ENTITY_TYPES = {"part", "project", "document", "eco", "ncr", "capa", "po", "bom"}

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    type = Column(SQLEnum(ApprovalType), nullable=False)
    status = Column(SQLEnum(ApprovalStatus), default=ApprovalStatus.PENDING)

    # What requires approval
    entityType = Column(String)  # e.g., "part", "project", "document"
    entityId = Column(Integer, nullable=False)

    # Requester and approvers
    requestedById = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    approvedById = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # Comments and decision
    approvalComments = Column(Text)
    rejectionReason = Column(Text)

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())
    decidedAt = Column(DateTime(timezone=True), nullable=True)
    expiresAt = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("idx_approval_entity", "entityType", "entityId"),)

    # Relationships
    requestedBy = relationship("User", foreign_keys=[requestedById], backref="approvals_requested")
    approvedBy = relationship("User", foreign_keys=[approvedById], backref="approvals_approved")

    def __repr__(self):
        return f"<Approval {self.title} ({self.type}) - {self.status}>"


@event.listens_for(Approval, "before_insert")
@event.listens_for(Approval, "before_update")
def validate_approval_entity(mapper, connection, target):
    if target.entityType and target.entityType not in Approval.ALLOWED_ENTITY_TYPES:
        raise ValueError(
            f"Invalid entityType '{target.entityType}'. Must be one of: {Approval.ALLOWED_ENTITY_TYPES}"
        )
