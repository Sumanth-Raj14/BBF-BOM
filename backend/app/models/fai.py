from sqlalchemy import (
    JSON,
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


class FAIReport(Base, TenantAwareMixin):
    __tablename__ = "fai_reports"

    id = Column(Integer, primary_key=True)
    faiNumber = Column(String, unique=True, nullable=False)  # FAI-2026-001
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    projectId = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # AS9102 Form 1 — Part Number Accountability
    partName = Column(String)
    partNumber = Column(String)
    partRevision = Column(String)
    serialNumber = Column(String)
    lotBatchNumber = Column(String)

    # AS9102 Form 2 — Product Accountability
    rawMaterial = Column(Text)  # Material certifications
    specialProcessSource = Column(Text)  # Special process suppliers

    # AS9102 Form 3 — Characteristic Accountability
    characteristics = Column(
        JSON, default=[]
    )  # DEPRECATED — use FaiCharacteristic relationship instead. Will be removed after data migration.

    # Overall
    totalCharacteristics = Column(Integer, default=0)
    passedCharacteristics = Column(Integer, default=0)
    failedCharacteristics = Column(Integer, default=0)
    result = Column(String)  # "Pass", "Fail", "Conditional"

    # Approval
    inspectorName = Column(String)
    inspectorApprovalDate = Column(DateTime(timezone=True))
    qualityApprovalDate = Column(DateTime(timezone=True))
    customerApprovalDate = Column(DateTime(timezone=True))

    # Status
    status = Column(
        String, default="Draft"
    )  # Draft, In Progress, Pending Approval, Approved, Rejected

    __table_args__ = (
        Index("idx_fai_reports_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('Draft', 'In Progress', 'Pending Approval', 'Approved', 'Rejected')",
            name="ck_fai_reports_status",
        ),
        CheckConstraint("result IN ('Pass', 'Fail', 'Conditional')", name="ck_fai_reports_result"),
    )

    # Notes
    notes = Column(Text)
    deviations = Column(Text)

    # Attachments
    attachments = Column(
        JSON, default=[]
    )  # DEPRECATED — use attachment_items relationship instead. Will be removed after data migration.

    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    characteristic_items = relationship("FaiCharacteristic", back_populates="fai_report")
    attachment_items = relationship("FaiAttachment", back_populates="fai_report")
    part = relationship("Part", backref="fai_reports")
    project = relationship("Project", backref="fai_reports")

    def __repr__(self):
        return f"<FAIReport {self.faiNumber}: {self.result}>"


class FaiAttachment(Base, TenantAwareMixin):
    __tablename__ = "fai_attachments"

    id = Column(Integer, primary_key=True)
    fai_report_id = Column(
        Integer, ForeignKey("fai_reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename = Column(String(255))
    file_url = Column(Text)
    file_type = Column(String(50))
    file_size = Column(Integer)
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    fai_report = relationship("FAIReport", back_populates="attachment_items")
    uploaded_by_user = relationship("User", backref="fai_attachments")

    def __repr__(self):
        return f"<FaiAttachment {self.filename}>"


class FaiCharacteristic(Base, TenantAwareMixin):
    __tablename__ = "fai_characteristics"

    id = Column(Integer, primary_key=True)
    fai_report_id = Column(
        Integer, ForeignKey("fai_reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    characteristic_name = Column(String(255))
    requirement = Column(String(255))
    result = Column(String(255))
    status = Column(String(50), default="pending")
    notes = Column(Text)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_fai_characteristics_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "result IN ('pass', 'fail', 'conditional', 'na')", name="ck_fai_characteristics_result"
        ),
        CheckConstraint(
            "status IN ('pending', 'pass', 'fail')", name="ck_fai_characteristics_status"
        ),
    )

    fai_report = relationship("FAIReport", back_populates="characteristic_items")

    def __repr__(self):
        return f"<FaiCharacteristic {self.characteristic_name}: {self.status}>"
