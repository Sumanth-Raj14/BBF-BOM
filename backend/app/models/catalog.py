"""Catalog models (OpenBOM-parity).

A Catalog is a tenant-scoped grouping of parts (mirrors the tenant-aware
column shape of peers like Warehouse). Parts are linked to catalogs through
the many-to-many ``part_catalogs`` association (PartCatalog), which is itself
tenant-scoped so RLS / register_tenant_listeners() cover it.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Catalog(Base, TenantAwareMixin):
    __tablename__ = "catalogs"

    id = Column(Integer, primary_key=True)
    catalog_code = Column(String, nullable=False)  # unique per tenant
    catalog_name = Column(String, nullable=False)
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("tenantId", "catalog_code", name="uq_catalogs_tenant_catalog_code"),
    )

    part_links = relationship(
        "PartCatalog", back_populates="catalog", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Catalog {self.catalog_code}: {self.catalog_name}>"


class PartCatalog(Base, TenantAwareMixin):
    """Many-to-many association linking parts to catalogs (tenant-scoped)."""

    __tablename__ = "part_catalogs"

    id = Column(Integer, primary_key=True)
    part_id = Column(
        Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    catalog_id = Column(
        Integer, ForeignKey("catalogs.id", ondelete="CASCADE"), nullable=False, index=True
    )

    catalog = relationship("Catalog", back_populates="part_links")
    part = relationship("Part", backref="catalog_links")

    __table_args__ = (
        UniqueConstraint(
            "tenantId", "part_id", "catalog_id", name="uq_part_catalogs_tenant_part_catalog"
        ),
    )

    def __repr__(self):
        return f"<PartCatalog part:{self.part_id} catalog:{self.catalog_id}>"
