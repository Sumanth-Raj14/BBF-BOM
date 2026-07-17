from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class CalendarEvent(Base, TenantAwareMixin):
    __tablename__ = "calendar_events"
    __table_args__ = (Index("ix_calendar_events_user_time", "user_id", "start_time"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(500), nullable=False)
    description = Column(Text)
    event_type = Column(String(50), default="general")
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True))
    all_day = Column(Boolean, default=False)
    color = Column(String(20))
    related_resource_type = Column(String(50))
    related_resource_id = Column(Integer)
    is_completed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", backref="calendar_events")

    def __repr__(self):
        return f"<CalendarEvent {self.id}: {self.title}>"
