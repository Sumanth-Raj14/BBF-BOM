from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    String,
    Table,
    Text,
    UniqueConstraint,
)
# Float import retained: Part.weight (grams) is a physical measurement, not money.
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin

# Association tables for many-to-many relationships
part_tags = Table(
    "part_tags",
    Base.metadata,
    Column(
        "part_id", Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    ),
    Column(
        "tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True
    ),
    PrimaryKeyConstraint("part_id", "tag_id"),
)

part_compliance = Table(
    "part_compliance",
    Base.metadata,
    Column(
        "part_id", Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True
    ),
    Column(
        "compliance_id",
        Integer,
        ForeignKey("compliance.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    ),
    PrimaryKeyConstraint("part_id", "compliance_id"),
)


class Part(Base, TenantAwareMixin):
    __tablename__ = "parts"

    id = Column(Integer, primary_key=True)
    pn = Column(String, index=True, nullable=False)  # Part Number (unique per tenant)
    name = Column(String, nullable=False)
    description = Column(Text)
    rev = Column(String, default="A")
    qty = Column(Numeric(10, 4), default=1.0)
    uom = Column(String, default="EA")  # Unit of Measure

    # Classification
    category = Column(String, index=True)  # Electrical, Mechanical, etc.
    subCategory = Column(String)  # Enclosure, Power Supply, etc.

    # Industry standard fields (MPN, HTS, UNSPSC)
    mpn = Column(String, index=True)  # Manufacturer Part Number
    htsCode = Column(String)  # Harmonized Tariff Schedule
    unspscCode = Column(String)  # United Nations Standard Products and Services Code
    eccn = Column(String)  # Export Control Classification Number

    # Vendor/Manufacturer info
    vendor = Column(String, index=True)  # Who sells it
    manufacturer = Column(String, index=True)  # Who makes it
    primary_vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), index=True)

    # Cost and timing
    cost = Column(Numeric(18, 4), default=0.0)
    lead = Column(Integer, default=0)  # Lead time in days
    origin = Column(String)  # Country of origin

    # Status and lifecycle
    status = Column(
        String, default="Released"
    )  # Draft, Review, Released, Deprecated, Obsolete, Archived
    assembly = Column(Boolean, default=False)  # Whether this part has children (is a BOM)

    # Technical specs
    barcode = Column(String, index=True)  # unique per tenant
    material = Column(String)
    weight = Column(Float)  # in grams
    dimensions = Column(String)  # L x W x H format
    imageUrl = Column(String)  # URL to product image

    # Custom fields (JSON for flexibility)
    customFields = Column(JSON, default={})

    # Tags and compliance use join tables: part_tags, part_compliance

    # Cost breakdown
    freight = Column(Numeric(18, 4), default=0.0)
    tax = Column(Numeric(18, 4), default=0.0)
    landedCost = Column(Numeric(18, 4), default=0.0)

    # CAD reference
    cadUrl = Column(String)  # Path or URL to CAD file

    # Timestamps
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    country_history = relationship(
        "PartCountryHistory", back_populates="part", cascade="all, delete-orphan"
    )
    vendor_prices = relationship(
        "PartVendorPrice", back_populates="part", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_parts_tenant_status", "tenantId", "status"),
        UniqueConstraint("tenantId", "pn", name="uq_parts_tenant_pn"),
        UniqueConstraint("tenantId", "barcode", name="uq_parts_tenant_barcode"),
        CheckConstraint(
            "status IN ('Draft', 'Review', 'Released', 'Deprecated', 'Obsolete', 'Archived')",
            name="ck_parts_status",
        ),
        CheckConstraint(
            "category IN ('Electrical', 'Mechanical', 'Software', 'Assembly', 'Raw Material', 'Hardware', 'Consumable', 'Subcontract', 'Packaging', 'Tooling', 'Other')",
            name="ck_parts_category",
        ),
    )

    def __repr__(self):
        return f"<Part {self.pn}: {self.name}>"
