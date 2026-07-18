from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func, text

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Compliance(Base, TenantAwareMixin):
    __tablename__ = "compliance"

    id = Column(Integer, primary_key=True)
    name = Column(String, index=True, nullable=False)  # unique per tenant
    description = Column(Text)
    isActive = Column(Boolean, default=True)

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("tenantId", "name", name="uq_compliance_tenant_name"),)

    def __repr__(self):
        return f"<Compliance {self.name}>"


# NOTE: the three tables below are NOT tenant-scoped in the live schema (no
# tenantId column), so they use plain Base — mirroring the existing bom_db DDL
# exactly. They back the pack/certification endpoints in
# app/api/endpoints/compliance_api.py, which access them via raw SQL. Modelling
# them here ensures Base.metadata.create_all() (fresh-install bootstrap) builds
# them so the feature works on a clean install.


class CompliancePack(Base):
    __tablename__ = "compliance_packs"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    standard_id = Column(Integer, ForeignKey("compliance.id", ondelete="SET NULL"))
    description = Column(Text)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<CompliancePack {self.name}>"


class CompliancePackItem(Base):
    __tablename__ = "compliance_pack_items"

    id = Column(Integer, primary_key=True)
    pack_id = Column(Integer, ForeignKey("compliance_packs.id", ondelete="CASCADE"))
    requirement = Column(Text, nullable=False)
    sort_order = Column(Integer, server_default=text("0"))

    def __repr__(self):
        return f"<CompliancePackItem {self.id}>"


class PartCertification(Base):
    __tablename__ = "part_certifications"

    id = Column(Integer, primary_key=True)
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"))
    compliance_id = Column(Integer, ForeignKey("compliance.id", ondelete="CASCADE"))
    certified_by = Column(String)
    certification_date = Column(Date)
    expiry_date = Column(Date)
    notes = Column(Text)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<PartCertification part={self.part_id} compliance={self.compliance_id}>"
