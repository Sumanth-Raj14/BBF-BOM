"""
Notifications Queue
Supports multi-channel notification delivery
"""

from sqlalchemy import (
    Boolean,
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


class NotificationQueue(Base, TenantAwareMixin):
    __tablename__ = "notifications_queue"

    ALLOWED_REFERENCE_TYPES = {
        "part",
        "project",
        "po",
        "document",
        "eco",
        "ncr",
        "capa",
        "vendor",
        "work_order",
        "bom",
    }

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notification_type = Column(String(50), nullable=False)
    subject = Column(String(255), nullable=False)
    body = Column(Text)
    channel = Column(String(50), default="in_app")
    priority = Column(String(50), default="normal")
    reference_type = Column(String(50))
    reference_id = Column(Integer)

    __table_args__ = (
        Index("idx_notif_queue_reference", "reference_type", "reference_id"),
        CheckConstraint(
            "notification_type IN ('info', 'warning', 'error', 'success', 'alert')",
            name="ck_notification_queue_notification_type",
        ),
        CheckConstraint(
            "priority IN ('low', 'normal', 'high', 'urgent')", name="ck_notification_queue_priority"
        ),
        CheckConstraint(
            "channel IN ('in_app', 'email', 'sms', 'push')", name="ck_notification_queue_channel"
        ),
    )
    is_read = Column(Boolean, default=False)
    is_sent = Column(Boolean, default=False)
    sent_at = Column(DateTime(timezone=True))
    read_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User")

    def __repr__(self):
        return f"<NotificationQueue {self.id}>"


@event.listens_for(NotificationQueue, "before_insert")
@event.listens_for(NotificationQueue, "before_update")
def validate_notif_queue_reference(mapper, connection, target):
    if (
        target.reference_type
        and target.reference_type not in NotificationQueue.ALLOWED_REFERENCE_TYPES
    ):
        raise ValueError(
            f"Invalid reference_type '{target.reference_type}'. Must be one of: {NotificationQueue.ALLOWED_REFERENCE_TYPES}"
        )
