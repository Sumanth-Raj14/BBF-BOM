"""
Engineering Change Management (ECO/ECN/ECR)
Supports complete change management workflow with approvals
"""

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class EcoHeader(Base, TenantAwareMixin):
    __tablename__ = "eco_headers"

    id = Column(Integer, primary_key=True)
    eco_number = Column(String(50), nullable=False, index=True)  # unique per tenant
    title = Column(String(255), nullable=False)
    description = Column(Text)
    reason = Column(Text)
    change_type = Column(String(50), nullable=False)  # design, process, supplier, quality
    status = Column(String(50), default="draft")  # draft, review, approved, implemented, closed
    priority = Column(String(50), default="medium")  # low, medium, high, critical
    impact_level = Column(String(50))  # minor, major, critical

    # Requestor
    requested_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())

    # Review
    reviewed_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    reviewed_at = Column(DateTime(timezone=True))

    # Approval
    approved_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    approved_at = Column(DateTime(timezone=True))

    # Implementation
    implemented_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    implemented_at = Column(DateTime(timezone=True))

    # Dates
    effective_date = Column(Date)
    target_completion_date = Column(Date)

    # Additional metadata
    extra_data = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_eco_headers_tenant_status", "tenantId", "status"),
        UniqueConstraint("tenantId", "eco_number", name="uq_eco_headers_tenant_eco_number"),
        CheckConstraint(
            "change_type IN ('design', 'process', 'supplier', 'quality', 'other')",
            name="ck_eco_headers_change_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'review', 'approved', 'implemented', 'closed', 'cancelled')",
            name="ck_eco_headers_status",
        ),
        CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'critical')", name="ck_eco_headers_priority"
        ),
        CheckConstraint(
            "impact_level IN ('minor', 'major', 'critical')", name="ck_eco_headers_impact_level"
        ),
    )

    # Relationships
    items = relationship("EcoItem", back_populates="eco", cascade="all, delete-orphan")
    approvals = relationship("EcoApproval", back_populates="eco", cascade="all, delete-orphan")
    notifications = relationship(
        "EcoNotification", back_populates="eco", cascade="all, delete-orphan"
    )
    requested_by_user = relationship("User", foreign_keys=[requested_by])
    reviewed_by_user = relationship("User", foreign_keys=[reviewed_by])
    approved_by_user = relationship("User", foreign_keys=[approved_by])
    implemented_by_user = relationship("User", foreign_keys=[implemented_by])

    def __repr__(self):
        return f"<EcoHeader {self.id}>"


class EcoItem(Base, TenantAwareMixin):
    __tablename__ = "eco_items"

    id = Column(Integer, primary_key=True)
    eco_id = Column(
        Integer, ForeignKey("eco_headers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bom_id = Column(Integer, ForeignKey("boms.id", ondelete="CASCADE"), index=True)
    change_type = Column(String(50), nullable=False)  # add, delete, modify, replace
    old_value = Column(JSON)  # DEPRECATED — use EcoItemAttributeChange relationship instead
    new_value = Column(JSON)  # DEPRECATED — use EcoItemAttributeChange relationship instead
    impact_description = Column(Text)
    affected_quantity = Column(Integer)
    status = Column(String(50), default="pending")
    implemented_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_eco_items_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "change_type IN ('add', 'delete', 'modify', 'replace')", name="ck_eco_items_change_type"
        ),
    )

    # Relationships
    eco = relationship("EcoHeader", back_populates="items")
    part = relationship("Part")
    bom = relationship("BOM")
    attribute_changes = relationship(
        "EcoItemAttributeChange", back_populates="eco_item", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<EcoItem {self.id}>"


class EcoItemAttributeChange(Base, TenantAwareMixin):
    __tablename__ = "eco_item_attribute_changes"

    id = Column(Integer, primary_key=True)
    eco_item_id = Column(
        Integer, ForeignKey("eco_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_name = Column(String(255), nullable=False)
    old_value = Column(Text)
    new_value = Column(Text)
    value_type = Column(String(50), default="string")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    eco_item = relationship("EcoItem", back_populates="attribute_changes")

    def __repr__(self):
        return f"<EcoItemAttributeChange {self.field_name}>"


class EcoApproval(Base, TenantAwareMixin):
    __tablename__ = "eco_approvals"

    id = Column(Integer, primary_key=True)
    eco_id = Column(
        Integer, ForeignKey("eco_headers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    approver_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    approval_order = Column(Integer, nullable=False)
    status = Column(String(50), default="pending")  # pending, approved, rejected
    comments = Column(Text)
    signed_at = Column(DateTime(timezone=True))
    digital_signature = Column(Text)

    __table_args__ = (
        Index("idx_eco_approvals_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')", name="ck_eco_approvals_status"
        ),
    )

    def __repr__(self):
        return f"<EcoApproval {self.id}>"

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    eco = relationship("EcoHeader", back_populates="approvals")
    approver = relationship("User")


class EcoNotification(Base, TenantAwareMixin):
    __tablename__ = "eco_notifications"

    id = Column(Integer, primary_key=True)
    eco_id = Column(
        Integer, ForeignKey("eco_headers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    def __repr__(self):
        return f"<EcoNotification {self.id}>"

    notification_type = Column(String(50), nullable=False)
    message = Column(Text)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    eco = relationship("EcoHeader", back_populates="notifications")
    user = relationship("User")
