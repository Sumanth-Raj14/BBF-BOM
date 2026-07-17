from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Compliance(Base, TenantAwareMixin):
    __tablename__ = "compliance"

    id = Column(Integer, primary_key=True)
    name = Column(String, index=True, nullable=False)  # unique per tenant
    description = Column(Text)
    isActive = Column(Boolean, default=True)

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("tenantId", "name", name="uq_compliance_tenant_name"),)

    def __repr__(self):
        return f"<Compliance {self.name}>"
