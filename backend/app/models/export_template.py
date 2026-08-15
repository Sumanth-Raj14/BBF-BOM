"""Saved export templates — a named, reusable export config per tenant.

`config` is exactly the POST /api/v1/export request body minus `entity` and
`bom_id` (see the shared export API contract): format, columns, indented,
include_sub_assemblies, filters, currency. Stored as JSON since the shape is
entity-dependent and this is config, not queryable data.
"""

from sqlalchemy import JSON, Column, DateTime, Index, Integer, String
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class ExportTemplate(Base, TenantAwareMixin):
    __tablename__ = "export_templates"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    entity = Column(String, nullable=False)  # bom | parts | vendors | purchase_orders
    config = Column(JSON, nullable=False, default=dict)

    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (Index("idx_export_templates_tenant_entity", "tenantId", "entity"),)

    def __repr__(self):
        return f"<ExportTemplate {self.name} ({self.entity})>"
