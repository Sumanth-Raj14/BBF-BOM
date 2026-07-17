from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class KanbanTrigger(Base, TenantAwareMixin):
    __tablename__ = "kanban_triggers"

    id = Column(Integer, primary_key=True)
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)

    # Kanban parameters
    minStock = Column(Integer, nullable=False)  # Trigger reorder when stock hits this
    maxStock = Column(Integer, nullable=False)  # Order up to this level
    reorderQuantity = Column(Integer, nullable=False)  # EOQ or fixed qty
    safetyStock = Column(Integer, default=0)

    # Current state
    currentStock = Column(Integer, default=0)
    openOrderQty = Column(Integer, default=0)  # Quantities already on order

    # Auto-reorder settings
    autoReorder = Column(Boolean, default=False)
    preferredVendorId = Column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=True, index=True
    )
    preferredPoTemplate = Column(String)  # Template for auto-generated PO

    # Status
    status = Column(String, default="Normal")  # Normal, Low, Critical, Overstock
    active = Column(Boolean, default=True)

    # Last trigger info
    lastTriggeredAt = Column(DateTime(timezone=True))
    lastPoCreated = Column(String)

    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("idx_kanban_triggers_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('Normal', 'Low', 'Critical', 'Overstock')", name="ck_kanban_triggers_status"
        ),
    )

    part = relationship("Part", backref="kanban_triggers")
    preferredVendor = relationship("Vendor", backref="kanban_triggers")

    def __repr__(self):
        return f"<KanbanTrigger {self.partId}: {self.status} (stock={self.currentStock})>"
