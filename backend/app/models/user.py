from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class User(Base, TenantAwareMixin):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    tenantId = Column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    fullName = Column(String)
    hashedPassword = Column(String, nullable=False)
    isActive = Column(Boolean, default=True)
    isSuperuser = Column(Boolean, default=False)

    @property
    def effective_tenant_id(self):
        """Return tenantId for non-superusers, None for superusers."""
        return self.tenantId if not self.isSuperuser else None

    # Profile info
    avatarUrl = Column(String)
    department = Column(String)
    jobTitle = Column(String)

    # Account lockout
    failedLoginAttempts = Column(Integer, default=0)
    lockedUntil = Column(DateTime(timezone=True))

    # Password reset
    resetToken = Column(String, index=True)
    resetTokenExpires = Column(DateTime(timezone=True))

    # SSO providers (JSON array of provider names: ["google", "github"])
    ssoProviders = Column(JSON, default=list)

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())
    lastLoginAt = Column(DateTime(timezone=True))

    # Relationships
    roles = relationship("Role", secondary="user_roles", back_populates="users")
    tenant = relationship("Tenant", back_populates="users")

    def __repr__(self):
        return f"<User {self.email}>"
