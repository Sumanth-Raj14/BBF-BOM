"""Session Management - track active user sessions."""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class UserSession(Base, TenantAwareMixin):
    """Track active user sessions for security."""

    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True)
    userId = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    sessionToken = Column(String, unique=True, index=True, nullable=False)
    ipAddress = Column(String)
    userAgent = Column(String)
    lastActivity = Column(DateTime(timezone=True), server_default=func.now())
    expiresAt = Column(DateTime(timezone=True), nullable=False)
    isActive = Column(Boolean, default=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="sessions")

    def __repr__(self):
        return f"<UserSession {self.id} for user {self.userId}>"
