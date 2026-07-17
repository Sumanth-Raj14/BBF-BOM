from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String, event
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class AuditLog(Base, TenantAwareMixin):
    __tablename__ = "audit_logs"

    ALLOWED_ENTITY_TYPES = {
        "part",
        "project",
        "user",
        "document",
        "bom",
        "po",
        "eco",
        "ncr",
        "capa",
        "vendor",
        "auth",
        "api_key",
    }

    id = Column(Integer, primary_key=True)
    tenantId = Column(
        Integer, ForeignKey("tenants.id", ondelete="SET NULL"), index=True, nullable=True
    )
    action = Column(String, nullable=False)  # CREATE, UPDATE, DELETE, LOGIN, LOGOUT, etc.
    entityType = Column(String)  # e.g., "part", "project", "user", "document"
    entityId = Column(Integer)  # ID of the entity
    entityName = Column(String)  # Human-readable name of the entity

    # What changed
    changes = Column(JSON)  # JSON dict describing what changed

    # Who did it
    userId = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    userEmail = Column(String)  # For convenience, denormalized
    userIp = Column(String)  # IP address

    # When
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Additional context
    userAgent = Column(String)
    requestId = Column(String)  # For tracing requests across services

    __table_args__ = (
        Index("idx_audit_log_entity", "entityType", "entityId"),
        Index("idx_audit_log_created", "createdAt"),
        Index("idx_audit_log_user", "userId"),
    )

    # Relationships
    user = relationship("User", backref="audit_logs")

    def __repr__(self):
        return f"<AuditLog {self.action} {self.entityType}:{self.entityId} by {self.userEmail}>"


@event.listens_for(AuditLog, "before_insert")
@event.listens_for(AuditLog, "before_update")
def validate_audit_log_entity(mapper, connection, target):
    if target.entityType and target.entityType not in AuditLog.ALLOWED_ENTITY_TYPES:
        raise ValueError(
            f"Invalid entityType '{target.entityType}'. Must be one of: {AuditLog.ALLOWED_ENTITY_TYPES}"
        )
