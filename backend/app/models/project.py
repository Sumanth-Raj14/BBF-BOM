from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Project(Base, TenantAwareMixin):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    code = Column(String, index=True, nullable=False)  # Project code like ATL-MFR-A (unique per tenant)
    name = Column(String, nullable=False)  # Project name
    description = Column(Text)
    rev = Column(String, default="A")  # Project revision
    version = Column(String, default="v1.0.0")  # Project version
    status = Column(String, default="Released")  # Draft, Review, Released, Deprecated, Archived
    __table_args__ = (
        Index("idx_projects_tenant_status", "tenantId", "status"),
        UniqueConstraint("tenantId", "code", name="uq_projects_tenant_code"),
        CheckConstraint(
            "status IN ('Draft', 'Review', 'Released', 'Deprecated', 'Archived', 'Completed', 'Cancelled')",
            name="ck_projects_status",
        ),
    )
    owner = Column(String)  # Owner/creator

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    # parts = relationship("Part", secondary="bom_items", back_populates="projects")
    # bom_items = relationship("BOMItem", back_populates="project")

    def __repr__(self):
        return f"<Project {self.code}: {self.name}>"
