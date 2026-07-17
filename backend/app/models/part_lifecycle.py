"""
Part Lifecycle Management
Supports part state machine and lifecycle transitions
"""

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class PartLifecycle(Base, TenantAwareMixin):
    __tablename__ = "part_lifecycles"

    id = Column(Integer, primary_key=True)
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    state = Column(String(50), nullable=False)  # draft, review, approved, production, obsolete
    previous_state = Column(String(50))
    __table_args__ = (
        CheckConstraint(
            "state IN ('concept', 'design', 'prototype', 'production', 'end_of_life', 'obsolete', 'draft', 'review', 'approved')",
            name="ck_part_lifecycles_state",
        ),
    )
    entered_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    entered_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    effective_date = Column(Date)
    expiry_date = Column(Date)
    notes = Column(Text)

    # Relationships
    part = relationship("Part", foreign_keys=[part_id], backref="lifecycle_history")
    entered_by_user = relationship("User", foreign_keys=[entered_by])

    def __repr__(self):
        return f"<PartLifecycle {self.id}>"


class LifecycleDefinition(Base, TenantAwareMixin):
    __tablename__ = "lifecycle_definitions"

    id = Column(Integer, primary_key=True)
    lifecycle_name = Column(String(100), unique=True, nullable=False)
    states = Column(JSON, nullable=False)  # List of states

    def __repr__(self):
        return f"<LifecycleDefinition {self.id}>"

    transitions = Column(JSON, nullable=False)  # Allowed transitions
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
