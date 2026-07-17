"""
Labor Tracking & Cost Models
Timesheets, labor rates, cost calculations.
"""

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class LaborRate(Base, TenantAwareMixin):
    __tablename__ = "labor_rates"

    id = Column(Integer, primary_key=True)
    employee_id = Column(String(50), nullable=False)
    employee_name = Column(String(255), nullable=False)
    skill_level = Column(String(50))
    regular_rate = Column(Numeric(10, 4), nullable=False)
    overtime_rate = Column(Numeric(10, 4))
    skill_tags = Column(JSON)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<LaborRate {self.id}>"


class TimesheetEntry(Base, TenantAwareMixin):
    __tablename__ = "timesheet_entries"

    id = Column(Integer, primary_key=True)
    employee_id = Column(String(50), nullable=False)
    work_order_id = Column(Integer, ForeignKey("work_orders.id", ondelete="CASCADE"), index=True)
    work_order_operation_id = Column(
        Integer, ForeignKey("work_order_operations.id", ondelete="CASCADE"), index=True
    )
    work_center_id = Column(Integer, ForeignKey("work_centers.id", ondelete="CASCADE"), index=True)
    date = Column(DateTime(timezone=True), nullable=False)
    hours_worked = Column(Numeric(5, 2), nullable=False)
    is_overtime = Column(Boolean, default=False)
    activity_type = Column(String(50))
    description = Column(Text)
    approved = Column(Boolean, default=False)
    approved_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    work_order = relationship("WorkOrder")

    def __repr__(self):
        return f"<TimesheetEntry {self.id}>"

    work_order_operation = relationship("WorkOrderOperation")
    work_center = relationship("WorkCenter")
    approved_by_user = relationship("User", foreign_keys=[approved_by])
