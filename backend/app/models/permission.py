from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Permission(Base, TenantAwareMixin):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True)
    name = Column(
        String, index=True, nullable=False
    )  # e.g., "parts:create", "parts:read" -- unique PER TENANT, see __table_args__
    resource = Column(String)  # e.g., "parts", "projects", "vendors"
    action = Column(String)  # e.g., "create", "read", "update", "delete", "export", "import"
    description = Column(Text)
    isActive = Column(Boolean, default=True)

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("tenantId", "name", name="uq_permissions_tenant_name"),)

    # Relationships
    roles = relationship("Role", secondary="role_permissions", back_populates="permissions")

    def __repr__(self):
        return f"<Permission {self.name}>"
