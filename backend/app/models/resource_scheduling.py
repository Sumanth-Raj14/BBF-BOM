"""
Resource Scheduling & Capacity Planning
Work centers, calendars, capacity allocation.
"""

from sqlalchemy import (
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


class WorkCenter(Base, TenantAwareMixin):
    __tablename__ = "work_centers"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    capacity_per_hour = Column(Numeric(10, 4))
    capacity_unit = Column(String(20), default="EA")
    cost_per_hour = Column(Numeric(10, 4))
    available_hours_per_day = Column(Numeric(5, 2), default=8.0)
    efficiency_rate = Column(Numeric(5, 2), default=100.0)
    is_bottleneck = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    location = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<WorkCenter {self.id}>"


class ResourceSchedule(Base, TenantAwareMixin):
    __tablename__ = "resource_schedules"

    id = Column(Integer, primary_key=True)
    work_center_id = Column(
        Integer, ForeignKey("work_centers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    work_order_id = Column(Integer, ForeignKey("work_orders.id", ondelete="CASCADE"), index=True)
    operation_name = Column(String(255))
    scheduled_date = Column(DateTime(timezone=True), nullable=False)
    start_time = Column(DateTime(timezone=True))
    end_time = Column(DateTime(timezone=True))
    planned_hours = Column(Numeric(5, 2))
    actual_hours = Column(Numeric(5, 2))
    status = Column(String(50), default="scheduled")
    __table_args__ = (
        Index("idx_resource_schedules_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('scheduled', 'in_progress', 'completed', 'cancelled')",
            name="ck_resource_schedules_status",
        ),
    )
    priority = Column(Integer, default=0)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<ResourceSchedule {self.id}>"

    work_center = relationship("WorkCenter")
    work_order = relationship("WorkOrder")


class CapacityReport(Base, TenantAwareMixin):
    __tablename__ = "capacity_reports"

    id = Column(Integer, primary_key=True)
    report_date = Column(DateTime(timezone=True), nullable=False)
    work_center_id = Column(
        Integer, ForeignKey("work_centers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    available_hours = Column(Numeric(5, 2))
    planned_hours = Column(Numeric(5, 2))
    actual_hours = Column(Numeric(5, 2))

    def __repr__(self):
        return f"<CapacityReport {self.id}>"

    utilization_pct = Column(Numeric(5, 2))
    bottleneck_flag = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    work_center = relationship("WorkCenter")
