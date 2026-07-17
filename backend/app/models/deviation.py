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


class Deviation(Base, TenantAwareMixin):
    __tablename__ = "deviations"

    id = Column(Integer, primary_key=True)
    deviationNumber = Column(String, nullable=False)  # DEV-2026-001 (unique per tenant)
    title = Column(String, nullable=False)
    type = Column(String, nullable=False)  # "Deviation", "Waiver", "Concession"

    # Description
    partId = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=True, index=True)
    projectId = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    specification = Column(Text)  # What specification is being deviated from
    deviationDescription = Column(Text, nullable=False)

    # Impact
    impactAssessment = Column(Text)
    riskLevel = Column(String)  # "Low", "Medium", "High", "Critical"

    # Quantity
    affectedQuantity = Column(Integer, default=0)
    affectedLotNumbers = Column(
        JSON, default=[]
    )  # DEPRECATED — use DeviationLot relationship instead. Will be removed after data migration.

    # Duration
    requestType = Column(String)  # "One-time", "Permanent", "Temporary"
    expirationDate = Column(DateTime(timezone=True))

    # Approvals
    engineeringApproval = Column(String)  # Name/signature
    qualityApproval = Column(String)
    customerApproval = Column(String)
    allApprovalsReceived = Column(String, default="No")  # "Yes", "No"

    # Disposition
    disposition = Column(String)  # "Use As Is", "Rework", "Scrap", "Return to Vendor"

    # Status
    status = Column(
        String, default="Draft"
    )  # Draft, Submitted, Under Review, Approved, Rejected, Expired

    # Links
    capaId = Column(Integer, ForeignKey("capas.id", ondelete="CASCADE"), nullable=True, index=True)

    __table_args__ = (
        Index("idx_deviations_tenant_status", "tenantId", "status"),
        UniqueConstraint("tenantId", "deviationNumber", name="uq_deviations_tenant_deviationNumber"),
        CheckConstraint("type IN ('Deviation', 'Waiver', 'Concession')", name="ck_deviations_type"),
        CheckConstraint(
            "riskLevel IN ('Low', 'Medium', 'High', 'Critical')", name="ck_deviations_risk_level"
        ),
        CheckConstraint(
            "requestType IN ('One-time', 'Permanent', 'Temporary')",
            name="ck_deviations_request_type",
        ),
        CheckConstraint(
            "disposition IN ('Use As Is', 'Rework', 'Scrap', 'Return to Vendor')",
            name="ck_deviations_disposition",
        ),
        CheckConstraint(
            "status IN ('Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Expired')",
            name="ck_deviations_status",
        ),
    )

    # Attachments
    attachments = Column(
        JSON, default=[]
    )  # DEPRECATED — use attachment_items relationship instead. Will be removed after data migration.

    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    lot_items = relationship("DeviationLot", back_populates="deviation")
    attachment_items = relationship("DeviationAttachment", back_populates="deviation")
    part = relationship("Part", backref="deviations")
    project = relationship("Project", backref="deviations")
    capa = relationship("CAPA", backref="deviations")

    def __repr__(self):
        return f"<Deviation {self.deviationNumber}: {self.status}>"


class DeviationAttachment(Base, TenantAwareMixin):
    __tablename__ = "deviation_attachments"

    id = Column(Integer, primary_key=True)
    deviation_id = Column(
        Integer, ForeignKey("deviations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename = Column(String(255))
    file_url = Column(Text)
    file_type = Column(String(50))
    file_size = Column(Integer)
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    deviation = relationship("Deviation", back_populates="attachment_items")
    uploaded_by_user = relationship("User", backref="deviation_attachments")

    def __repr__(self):
        return f"<DeviationAttachment {self.filename}>"


class DeviationLot(Base, TenantAwareMixin):
    __tablename__ = "deviation_lots"

    id = Column(Integer, primary_key=True)
    deviation_id = Column(
        Integer, ForeignKey("deviations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lot_number = Column(String(255), nullable=False)
    quantity_affected = Column(Integer, default=0)
    disposition = Column(String(255))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    deviation = relationship("Deviation", back_populates="lot_items")

    def __repr__(self):
        return f"<DeviationLot {self.lot_number}>"
