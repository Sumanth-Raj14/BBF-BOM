from sqlalchemy import (
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


class Requirement(Base, TenantAwareMixin):
    """A single engineering/regulatory requirement.

    The Arena/Teamcenter differentiator over OpenBOM: a requirement is a
    first-class record with a hierarchy (parent_id) and traceability links
    to the parts/BOMs that satisfy it (see RequirementPartLink /
    RequirementBomLink below) — not a comment on a part.
    """

    __tablename__ = "requirements"

    id = Column(Integer, primary_key=True)
    key = Column(String, nullable=False)  # e.g. "REQ-0001", unique per tenant
    title = Column(String, nullable=False)
    description = Column(Text)
    type = Column(String, nullable=False, default="functional")
    status = Column(String, nullable=False, default="draft")
    priority = Column(String, default="medium")
    version = Column(Integer, default=1)

    parent_id = Column(
        Integer, ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True, index=True
    )

    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    parent = relationship("Requirement", remote_side=[id], backref="children")
    part_links = relationship(
        "RequirementPartLink", back_populates="requirement", cascade="all, delete-orphan"
    )
    bom_links = relationship(
        "RequirementBomLink", back_populates="requirement", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("tenantId", "key", name="uq_requirements_tenant_key"),
        Index("idx_requirements_tenant_status", "tenantId", "status"),
        Index("idx_requirements_tenant_type", "tenantId", "type"),
        CheckConstraint(
            "type IN ('functional', 'performance', 'regulatory', 'interface')",
            name="ck_requirements_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'approved', 'obsolete')", name="ck_requirements_status"
        ),
    )

    def __repr__(self):
        return f"<Requirement {self.key}: {self.status}>"


class RequirementPartLink(Base, TenantAwareMixin):
    """Traceability: which part(s) satisfy a requirement (and reverse)."""

    __tablename__ = "requirement_part_links"

    id = Column(Integer, primary_key=True)
    requirement_id = Column(
        Integer, ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())

    requirement = relationship("Requirement", back_populates="part_links")
    part = relationship("Part", backref="requirement_links")

    __table_args__ = (
        UniqueConstraint(
            "tenantId", "requirement_id", "part_id", name="uq_req_part_link"
        ),
    )

    def __repr__(self):
        return f"<RequirementPartLink req={self.requirement_id} part={self.part_id}>"


class RequirementBomLink(Base, TenantAwareMixin):
    """Traceability: which BOM(s) implement a requirement."""

    __tablename__ = "requirement_bom_links"

    id = Column(Integer, primary_key=True)
    requirement_id = Column(
        Integer, ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bom_id = Column(Integer, ForeignKey("boms.id", ondelete="CASCADE"), nullable=False, index=True)
    createdBy = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())

    requirement = relationship("Requirement", back_populates="bom_links")
    bom = relationship("BOM", backref="requirement_links")

    __table_args__ = (
        UniqueConstraint("tenantId", "requirement_id", "bom_id", name="uq_req_bom_link"),
    )

    def __repr__(self):
        return f"<RequirementBomLink req={self.requirement_id} bom={self.bom_id}>"
