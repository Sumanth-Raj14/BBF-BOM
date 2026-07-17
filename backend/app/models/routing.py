"""
Routing Tables - Reusable operation definitions for manufacturing.
Process Plans - Standalone templates for manufacturing sequences.
"""

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class RoutingTable(Base, TenantAwareMixin):
    __tablename__ = "routing_tables"

    id = Column(Integer, primary_key=True)
    routing_number = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), index=True)
    revision = Column(Integer, default=1)
    status = Column(String(50), default="draft")
    __table_args__ = (
        Index("idx_routing_tables_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('draft', 'active', 'archived')", name="ck_routing_tables_status"
        ),
    )
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    operations = relationship(
        "RoutingOperation", back_populates="routing", cascade="all, delete-orphan"
    )
    created_by_user = relationship("User", foreign_keys=[created_by])
    part = relationship("Part")

    def __repr__(self):
        return f"<RoutingTable {self.id}>"


class RoutingOperation(Base, TenantAwareMixin):
    __tablename__ = "routing_operations"

    id = Column(Integer, primary_key=True)
    routing_id = Column(
        Integer, ForeignKey("routing_tables.id", ondelete="CASCADE"), nullable=False, index=True
    )
    operation_number = Column(Integer, nullable=False)
    operation_name = Column(String(255), nullable=False)
    description = Column(Text)
    work_center = Column(String(100))
    setup_time_min = Column(Integer)
    run_time_min = Column(Integer)
    cycle_time_min = Column(Integer)
    tooling = Column(JSON)
    quality_checks = Column(JSON)
    is_optional = Column(Boolean, default=False)
    external_operation = Column(Boolean, default=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), index=True)
    estimated_cost = Column(Numeric(10, 4))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<RoutingOperation {self.id}>"

    routing = relationship("RoutingTable", back_populates="operations")
    vendor = relationship("Vendor")


class ProcessPlan(Base, TenantAwareMixin):
    __tablename__ = "process_plans"

    id = Column(Integer, primary_key=True)
    plan_number = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    part_family = Column(String(100))
    revision = Column(Integer, default=1)
    status = Column(String(50), default="draft")
    __table_args__ = (
        Index("idx_process_plans_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('draft', 'active', 'archived')", name="ck_process_plans_status"
        ),
    )
    is_template = Column(Boolean, default=False)
    estimated_hours = Column(Integer)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<ProcessPlan {self.id}>"

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    steps = relationship(
        "ProcessPlanStep", back_populates="process_plan", cascade="all, delete-orphan"
    )
    created_by_user = relationship("User", foreign_keys=[created_by])


class ProcessPlanStep(Base, TenantAwareMixin):
    __tablename__ = "process_plan_steps"

    id = Column(Integer, primary_key=True)
    process_plan_id = Column(
        Integer, ForeignKey("process_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    step_number = Column(Integer, nullable=False)
    step_name = Column(String(255), nullable=False)
    description = Column(Text)
    work_center = Column(String(100))
    setup_time_min = Column(Integer)

    def __repr__(self):
        return f"<ProcessPlanStep {self.id}>"

    run_time_min = Column(Integer)
    required_skills = Column(JSON)
    tooling_required = Column(JSON)
    inspection_required = Column(Boolean, default=False)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    process_plan = relationship("ProcessPlan", back_populates="steps")
