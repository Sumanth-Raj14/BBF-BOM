"""
Quality Management
Supports inspection plans, NCR, CAPA, and quality records
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
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class InspectionPlan(Base, TenantAwareMixin):
    __tablename__ = "inspection_plans"

    id = Column(Integer, primary_key=True)
    plan_name = Column(String(255), nullable=False)
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), index=True)
    plan_type = Column(String(50), nullable=False)
    characteristics = Column(JSON, nullable=False)
    frequency = Column(String(50))
    frequency_value = Column(Integer)
    sample_size = Column(Integer)
    status = Column(String(50), default="active")
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    part = relationship("Part")
    records = relationship("InspectionRecord", back_populates="plan")
    created_by_user = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        Index("idx_inspection_plans_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('active', 'inactive', 'draft')", name="ck_inspection_plans_status"
        ),
    )

    def __repr__(self):
        return f"<InspectionPlan {self.id}>"


class InspectionRecord(Base, TenantAwareMixin):
    __tablename__ = "inspection_records"

    id = Column(Integer, primary_key=True)
    record_number = Column(String(50), nullable=False)  # unique per tenant
    inspection_plan_id = Column(
        Integer, ForeignKey("inspection_plans.id", ondelete="CASCADE"), index=True
    )
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lot_number = Column(String(100))
    serial_number = Column(String(100))
    inspection_type = Column(String(50), nullable=False)
    inspector_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    inspection_date = Column(DateTime(timezone=True), server_default=func.now())
    result = Column(String(50))
    measurements = Column(JSON)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "tenantId", "record_number", name="uq_inspection_records_tenant_record_number"
        ),
        CheckConstraint(
            "result IN ('pass', 'fail', 'conditional', 'pending')",
            name="ck_inspection_records_result",
        ),
    )

    # Relationships

    def __repr__(self):
        return f"<InspectionRecord {self.id}>"

    plan = relationship("InspectionPlan", back_populates="records")
    part = relationship("Part")
    inspector = relationship("User", foreign_keys=[inspector_id])


class NcrReport(Base, TenantAwareMixin):
    __tablename__ = "ncr_reports"

    id = Column(Integer, primary_key=True)
    ncr_number = Column(String(50), nullable=False)  # unique per tenant
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inspection_record_id = Column(
        Integer, ForeignKey("inspection_records.id", ondelete="CASCADE"), index=True
    )
    defect_description = Column(Text, nullable=False)
    defect_category = Column(String(50), nullable=False)
    severity = Column(String(50), nullable=False)
    detected_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    detected_at = Column(DateTime(timezone=True), server_default=func.now())
    detected_stage = Column(String(50))
    disposition = Column(String(50))
    disposition_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    disposition_at = Column(DateTime(timezone=True))
    root_cause = Column(Text)
    corrective_action = Column(Text)
    preventive_action = Column(Text)
    verified_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    verified_at = Column(DateTime(timezone=True))
    status = Column(String(50), default="open")
    target_close_date = Column(Date)
    actual_close_date = Column(Date)
    cost_of_poor_quality = Column(Numeric(10, 2))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_ncr_reports_tenant_status", "tenantId", "status"),
        UniqueConstraint("tenantId", "ncr_number", name="uq_ncr_reports_tenant_ncr_number"),
        CheckConstraint(
            "severity IN ('minor', 'major', 'critical')", name="ck_ncr_reports_severity"
        ),
        CheckConstraint(
            "disposition IN ('use_as_is', 'rework', 'scrap', 'return_to_vendor')",
            name="ck_ncr_reports_disposition",
        ),
        CheckConstraint(
            "status IN ('open', 'in_progress', 'closed', 'verified')", name="ck_ncr_reports_status"
        ),
    )

    # Relationships

    def __repr__(self):
        return f"<NcrReport {self.id}>"

    part = relationship("Part")
    inspection_record = relationship("InspectionRecord")
    detected_by_user = relationship("User", foreign_keys=[detected_by])
    disposition_by_user = relationship("User", foreign_keys=[disposition_by])
    verified_by_user = relationship("User", foreign_keys=[verified_by])
    capa_actions = relationship("CapaAction", back_populates="ncr")


class CapaAction(Base, TenantAwareMixin):
    __tablename__ = "capa_actions"

    id = Column(Integer, primary_key=True)
    capa_number = Column(String(50), nullable=False)  # unique per tenant
    ncr_id = Column(Integer, ForeignKey("ncr_reports.id", ondelete="CASCADE"), index=True)
    eco_id = Column(Integer, ForeignKey("eco_headers.id", ondelete="CASCADE"), index=True)
    action_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    assigned_team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), index=True)
    due_date = Column(Date)
    status = Column(String(50), default="open")
    completed_at = Column(DateTime(timezone=True))
    verified_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    verified_at = Column(DateTime(timezone=True))

    def __repr__(self):
        return f"<CapaAction {self.id}>"

    effectiveness_notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_capa_actions_tenant_status", "tenantId", "status"),
        UniqueConstraint("tenantId", "capa_number", name="uq_capa_actions_tenant_capa_number"),
        CheckConstraint(
            "action_type IN ('corrective', 'preventive')", name="ck_capa_actions_action_type"
        ),
        CheckConstraint(
            "status IN ('open', 'in_progress', 'pending_verification', 'closed')",
            name="ck_capa_actions_status",
        ),
    )

    # Relationships
    ncr = relationship("NcrReport", back_populates="capa_actions")
    eco = relationship("EcoHeader")
    assigned_to_user = relationship("User", foreign_keys=[assigned_to])
    verified_by_user = relationship("User", foreign_keys=[verified_by])
