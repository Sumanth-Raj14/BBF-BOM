from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class OrderTracking(Base, TenantAwareMixin):
    """Master tracking record for a Purchase Order — one per PO."""

    __tablename__ = "order_tracking"

    id = Column(Integer, primary_key=True)
    poHeaderId = Column(
        Integer,
        ForeignKey("po_headers.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    currentStage = Column(String, default="order_placed")
    carrier = Column(String)
    trackingNumber = Column(String)
    trackingUrl = Column(String)
    estimatedDelivery = Column(String)
    actualDelivery = Column(String)
    shippingAddress = Column(Text)
    notes = Column(Text)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    po_header = relationship("POHeader", backref="tracking")
    milestones = relationship(
        "TrackingMilestone",
        back_populates="tracking",
        cascade="all, delete-orphan",
        order_by="TrackingMilestone.sortOrder",
    )
    shipmentUpdates = relationship(
        "ShipmentUpdate",
        back_populates="tracking",
        cascade="all, delete-orphan",
        order_by="ShipmentUpdate.createdAt.desc()",
    )

    def __repr__(self):
        return f"<OrderTracking PO:{self.poHeaderId} stage={self.currentStage}>"


class TrackingMilestone(Base, TenantAwareMixin):
    """Fixed stages in the order lifecycle (like Amazon order stages)."""

    __tablename__ = "tracking_milestones"

    id = Column(Integer, primary_key=True)
    trackingId = Column(
        Integer, ForeignKey("order_tracking.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage = Column(String, nullable=False)
    label = Column(String, nullable=False)
    description = Column(Text)
    completed = Column(Boolean, default=False)
    completedAt = Column(DateTime(timezone=True))
    sortOrder = Column(Integer, default=0)
    icon = Column(String)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    tracking = relationship("OrderTracking", back_populates="milestones")

    def __repr__(self):
        return f"<TrackingMilestone {self.stage} completed={self.completed}>"


class ShipmentUpdate(Base, TenantAwareMixin):
    """Real-time shipment updates — each scan/event from carrier."""

    __tablename__ = "shipment_updates"

    id = Column(Integer, primary_key=True)
    trackingId = Column(
        Integer, ForeignKey("order_tracking.id", ondelete="CASCADE"), nullable=False, index=True
    )
    location = Column(String)
    status = Column(String, nullable=False)
    __table_args__ = (
        Index("idx_shipment_updates_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned')",
            name="ck_shipment_updates_status",
        ),
    )
    description = Column(Text)
    carrierCode = Column(String)
    timestamp = Column(DateTime(timezone=True))
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    tracking = relationship("OrderTracking", back_populates="shipmentUpdates")

    def __repr__(self):
        return f"<ShipmentUpdate {self.status} @ {self.location}>"
