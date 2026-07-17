import enum

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    event,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class NotificationType(enum.StrEnum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    SUCCESS = "success"


class NotificationStatus(enum.StrEnum):
    UNREAD = "unread"
    READ = "read"
    ARCHIVED = "archived"


class Notification(Base, TenantAwareMixin):
    __tablename__ = "notifications"

    ALLOWED_ENTITY_TYPES = {
        "part",
        "project",
        "po",
        "document",
        "eco",
        "ncr",
        "capa",
        "vendor",
        "work_order",
    }

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String, default="info")
    status = Column(String, default="unread")

    # Related entity (optional)
    entityType = Column(String)  # e.g., "part", "project", "po"
    entityId = Column(Integer)

    # Recipient
    userId = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Action link (optional)
    actionUrl = Column(String)  # URL to take action on
    actionLabel = Column(String)  # Text for action button

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())
    readAt = Column(DateTime(timezone=True), nullable=True)
    expiresAt = Column(DateTime(timezone=True), nullable=True)  # Optional expiration

    __table_args__ = (
        Index("idx_notification_entity", "entityType", "entityId"),
        Index("idx_notifications_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "type IN ('info', 'warning', 'error', 'success')", name="ck_notifications_type"
        ),
        CheckConstraint("status IN ('unread', 'read', 'archived')", name="ck_notifications_status"),
    )

    # Relationships
    user = relationship("User", backref="notifications")

    def __repr__(self):
        return f"<Notification {self.title} for user {self.userId}>"


@event.listens_for(Notification, "before_insert")
@event.listens_for(Notification, "before_update")
def validate_notification_entity(mapper, connection, target):
    if target.entityType and target.entityType not in Notification.ALLOWED_ENTITY_TYPES:
        raise ValueError(
            f"Invalid entityType '{target.entityType}'. Must be one of: {Notification.ALLOWED_ENTITY_TYPES}"
        )
