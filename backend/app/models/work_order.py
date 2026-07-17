"""
Work Orders
Supports manufacturing work order management with operations and materials
"""

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Interval,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class WorkOrder(Base, TenantAwareMixin):
    __tablename__ = "work_orders"

    id = Column(Integer, primary_key=True)
    wo_number = Column(String(50), nullable=False, index=True)  # unique per tenant
    mbom_id = Column(Integer, ForeignKey("mbom_headers.id", ondelete="CASCADE"), index=True)
    sales_order_number = Column(String(50))
    customer_name = Column(String(255))
    quantity_ordered = Column(Integer, nullable=False)
    quantity_completed = Column(Integer, default=0)
    quantity_scrapped = Column(Integer, default=0)
    status = Column(
        String(50), default="draft"
    )  # draft, released, in_progress, completed, closed, cancelled, on_hold, scrapped
    priority = Column(String(50), default="normal")
    due_date = Column(Date)
    start_date = Column(Date)
    completed_date = Column(Date)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    assigned_team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), index=True)
    work_center = Column(String(100))
    notes = Column(Text)
    extra_data = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    mbom = relationship("MbomHeader", back_populates="work_orders")
    operations = relationship(
        "WorkOrderOperation", back_populates="work_order", cascade="all, delete-orphan"
    )
    materials = relationship(
        "WorkOrderMaterial", back_populates="work_order", cascade="all, delete-orphan"
    )
    assigned_to_user = relationship("User", foreign_keys=[assigned_to])

    __table_args__ = (
        Index("idx_work_orders_tenant_status", "tenantId", "status"),
        Index("idx_work_orders_status_due", "status", "due_date"),
        UniqueConstraint("tenantId", "wo_number", name="uq_work_orders_tenant_wo_number"),
        CheckConstraint(
            "status IN ('draft', 'released', 'in_progress', 'completed', 'closed', "
            "'cancelled', 'on_hold', 'scrapped')",
            name="ck_work_orders_status",
        ),
        CheckConstraint(
            "priority IN ('low', 'normal', 'high', 'urgent')", name="ck_work_orders_priority"
        ),
    )

    def __repr__(self):
        return f"<WorkOrder {self.id}>"


class WorkOrderOperation(Base, TenantAwareMixin):
    __tablename__ = "work_order_operations"

    id = Column(Integer, primary_key=True)
    work_order_id = Column(
        Integer, ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    operation_number = Column(Integer, nullable=False)
    operation_name = Column(String(255), nullable=False)
    work_center = Column(String(100))
    status = Column(String(50), default="pending")
    planned_setup_time = Column(Interval)
    actual_setup_time = Column(Interval)
    planned_run_time = Column(Interval)
    actual_run_time = Column(Interval)
    quantity_good = Column(Integer, default=0)
    quantity_scrapped = Column(Integer, default=0)
    employee_id = Column(Integer)
    start_time = Column(DateTime(timezone=True))
    end_time = Column(DateTime(timezone=True))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_work_order_operations_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed', 'skipped')",
            name="ck_work_order_operations_status",
        ),
    )

    def __repr__(self):
        return f"<WorkOrderOperation {self.id}>"

    # Relationships
    work_order = relationship("WorkOrder", back_populates="operations")


class WorkOrderMaterial(Base, TenantAwareMixin):
    __tablename__ = "work_order_materials"

    id = Column(Integer, primary_key=True)
    work_order_id = Column(
        Integer, ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity_required = Column(Numeric(10, 4))
    quantity_issued = Column(Numeric(10, 4), default=0)
    quantity_returned = Column(Numeric(10, 4), default=0)
    unit = Column(String(20), default="EA")
    issue_status = Column(String(50), default="pending")
    issued_at = Column(DateTime(timezone=True))
    issued_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<WorkOrderMaterial {self.id}>"

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    work_order = relationship("WorkOrder", back_populates="materials")
    part = relationship("Part")
    issued_by_user = relationship("User", foreign_keys=[issued_by])
