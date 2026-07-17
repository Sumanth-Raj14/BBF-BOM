"""
Tenant Management
Supports multi-tenancy for SaaS deployment
"""

from sqlalchemy import JSON, CheckConstraint, Column, DateTime, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True)
    tenant_name = Column(String(255), nullable=False)
    tenant_code = Column(String(50), unique=True, nullable=False)
    domain = Column(String(255), unique=True)
    plan = Column(String(50), default="free")
    status = Column(String(50), default="active")
    settings = Column(JSON)
    max_users = Column(Integer, default=5)
    max_storage_gb = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('active', 'inactive', 'suspended')", name="ck_tenants_status"),
        CheckConstraint(
            "plan IN ('free', 'starter', 'professional', 'enterprise')", name="ck_tenants_plan"
        ),
    )

    # Relationships
    users = relationship("User", back_populates="tenant")

    def __repr__(self):
        return f"<Tenant {self.id}>"
