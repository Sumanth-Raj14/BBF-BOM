"""Per-line custom-attribute VALUES for BOM line items (bom_items_master).

`CustomAttributeDefinition` (entity_type free-form, app/models/enterprise_extensions.py)
already lets a tenant define an ad-hoc attribute for entity_type='bom_item' with
ZERO schema change (no CHECK constraint / allowlist on entity_type). What was
missing was somewhere to store the actual VALUE a specific BOM line has for one
of those definitions — this table is that value store, pairing
(bom_item_id, attribute_definition_id) -> value.

NOTE ON WIRING: this model is intentionally NOT imported into
app/models/__init__.py (Track-B scope is limited to bom_service.py +
the BOM items endpoint file). It is registered on Base.metadata by being
imported directly from app.services.bom_service, which is imported by the app
at startup (via app.api.api_v1 -> bom_enterprise -> bom_service) — so
Base.metadata.create_all (used by the test suite) and the app's runtime ORM
both see it correctly. The physical table is created via the accompanying
migration 046_bom_item_custom_values.py for real (Postgres) deployments. For
full parity with other models (e.g. so a bare `from app.models import *`
elsewhere also sees it), a follow-up should add:
    from app.models.bom_item_custom_value import BomItemCustomValue
to app/models/__init__.py.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class BomItemCustomValue(Base, TenantAwareMixin):
    __tablename__ = "bom_item_custom_values"

    id = Column(Integer, primary_key=True)
    bom_item_id = Column(
        Integer, ForeignKey("bom_items_master.id", ondelete="CASCADE"), nullable=False, index=True
    )
    attribute_definition_id = Column(
        Integer,
        ForeignKey("custom_attribute_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    value = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    bom_item = relationship("BOMItem", backref="custom_values")
    attribute_definition = relationship("CustomAttributeDefinition")

    __table_args__ = (
        UniqueConstraint(
            "tenantId",
            "bom_item_id",
            "attribute_definition_id",
            name="uq_bom_item_custom_values_tenant_item_attr",
        ),
    )

    def __repr__(self):
        return f"<BomItemCustomValue item={self.bom_item_id} attr={self.attribute_definition_id}>"
