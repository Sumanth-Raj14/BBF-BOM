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
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class CAPA(Base, TenantAwareMixin):
    __tablename__ = "capas"

    id = Column(Integer, primary_key=True)
    capaNumber = Column(String, nullable=False)  # CAPA-2026-001 (unique per tenant)
    title = Column(String, nullable=False)
    type = Column(String, nullable=False)  # "Corrective", "Preventive"
    source = Column(String)  # "Internal Audit", "Customer Complaint", "NCR", "Supplier"

    # Problem description
    problemDescription = Column(Text, nullable=False)
    immediateAction = Column(Text)

    # Root cause analysis
    rootCauseMethod = Column(String)  # "5 Whys", "Fishbone", "FMEA"
    rootCause = Column(Text)

    # Corrective action
    correctiveAction = Column(Text)
    preventiveAction = Column(Text)
    actionOwner = Column(String)
    targetDate = Column(DateTime(timezone=True))

    # Verification
    verificationMethod = Column(String)
    verificationResult = Column(String)  # "Effective", "Not Effective", "Pending"
    verifiedBy = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    verifiedDate = Column(DateTime(timezone=True))

    # Status
    status = Column(
        String, default="Open"
    )  # Open, In Progress, Pending Verification, Closed, Overdue

    # Effectiveness check
    effectivenessCheckDate = Column(DateTime(timezone=True))
    effectivenessResult = Column(String)

    # Links
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=True, index=True)
    projectId = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    vendorId = Column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=True, index=True
    )

    __table_args__ = (
        Index("idx_capas_tenant_status", "tenantId", "status"),
        UniqueConstraint("tenantId", "capaNumber", name="uq_capas_tenant_capaNumber"),
        CheckConstraint("type IN ('Corrective', 'Preventive')", name="ck_capas_type"),
        CheckConstraint(
            "source IN ('Internal Audit', 'Customer Complaint', 'NCR', 'Supplier', 'Other')",
            name="ck_capas_source",
        ),
        CheckConstraint(
            "status IN ('Open', 'In Progress', 'Pending Verification', 'Closed', 'Overdue')",
            name="ck_capas_status",
        ),
        CheckConstraint(
            "\"verificationResult\" IN ('Effective', 'Not Effective', 'Pending')",
            name="ck_capas_verification_result",
        ),
    )

    # Attachments
    attachments = Column(
        JSON, default=[]
    )  # DEPRECATED — use CapaAttachment relationship instead. Will be removed after data migration.

    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    attachment_items = relationship("CapaAttachment", back_populates="capa")
    part = relationship("Part", backref="capas")
    project = relationship("Project", backref="capas")
    vendor = relationship("Vendor", backref="capas")

    def __repr__(self):
        return f"<CAPA {self.capaNumber}: {self.status}>"


class CapaAttachment(Base, TenantAwareMixin):
    __tablename__ = "capa_attachments"

    id = Column(Integer, primary_key=True)
    capa_id = Column(
        Integer, ForeignKey("capas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename = Column(String(255))
    file_url = Column(Text)
    file_type = Column(String(50))
    file_size = Column(Integer)
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    capa = relationship("CAPA", back_populates="attachment_items")
    uploaded_by_user = relationship("User", backref="capa_attachments")

    def __repr__(self):
        return f"<CapaAttachment {self.filename}>"
