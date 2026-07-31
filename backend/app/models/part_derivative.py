"""Typed CAD derivative links for a Part (tenant-scoped).

A ``part_derivatives`` row records a generated/associated CAD derivative for a
Part — a PDF drawing, a STEP/DWG/DXF export, etc. — as a typed (kind, url)
pair, optionally carrying the drawing's release status. One derivative per
(tenant, part, kind) so re-generating an export upserts rather than duplicates.

Physical table is created by migration 047_solidworks_integration.py; this
model is registered on Base.metadata via app/models/__init__.py.
"""

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class PartDerivative(Base, TenantAwareMixin):
    __tablename__ = "part_derivatives"

    id = Column(Integer, primary_key=True)
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind = Column(String(20), nullable=False)  # pdf|step|dwg|dxf|other
    url = Column(String(2048), nullable=False)
    drawing_status = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    part = relationship("Part")

    __table_args__ = (
        UniqueConstraint("tenantId", "part_id", "kind", name="uq_part_derivatives_tenant_part_kind"),
        CheckConstraint(
            "kind IN ('pdf', 'step', 'dwg', 'dxf', 'other')",
            name="ck_part_derivatives_kind",
        ),
    )

    def __repr__(self):
        return f"<PartDerivative part={self.part_id} kind={self.kind}>"
