"""SolidWorks integration state (tenant-scoped).

Two tables backing the SolidWorks (SW) round-trip:

- ``sw_property_mappings`` — per-tenant rules mapping a SolidWorks custom
  property name onto a target Part field, with an include/exclude flag so a
  tenant can suppress noisy SW properties from ever touching a Part.
- ``sw_pending_changes`` — an outbox of changes queued to be written BACK into
  SolidWorks (e.g. a value edited in the BOM tool that should propagate to the
  CAD model's custom properties). Each row carries an opaque JSON payload and a
  status that advances from 'pending' to applied.

Physical tables are created by migration 047_solidworks_integration.py; this
model is registered on Base.metadata via app/models/__init__.py.
"""

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.sql.expression import false

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class SwPropertyMapping(Base, TenantAwareMixin):
    __tablename__ = "sw_property_mappings"

    id = Column(Integer, primary_key=True)
    sw_property = Column(String(255), nullable=False)
    target_field = Column(String(255), nullable=False)
    is_excluded = Column(Boolean, nullable=False, default=False, server_default=false())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("tenantId", "sw_property", name="uq_sw_property_mappings_tenant_prop"),
    )

    def __repr__(self):
        return f"<SwPropertyMapping {self.sw_property}->{self.target_field}>"


class SwPendingChange(Base, TenantAwareMixin):
    __tablename__ = "sw_pending_changes"

    id = Column(Integer, primary_key=True)
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    model_name = Column(String(255))
    change_type = Column(String(100), nullable=False)
    payload = Column(JSON)
    status = Column(String(50), nullable=False, default="pending", server_default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    applied_at = Column(DateTime(timezone=True), nullable=True)

    part = relationship("Part")

    def __repr__(self):
        return f"<SwPendingChange {self.id} {self.change_type} status={self.status}>"
