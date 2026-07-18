"""TENANT-OWNED substance composition, provenance & exemption claims.

Created by migration ``043_part_composition_declarations``. All four tables
subclass ``TenantAwareMixin`` (spec 2.3), so ``register_tenant_listeners()``
auto-populates ``tenantId`` on INSERT, auto-filters SELECT, and guards
UPDATE/DELETE; and migration 043 installs the Postgres RLS defense-in-depth
policy on each (gated on dialect==postgresql AND settings.ENABLE_RLS).

    PartMaterial            part_materials            (homogeneous material — the RoHS denominator)
    PartMaterialSubstance   part_material_substances  (leaf composition)
    SubstanceDeclaration    substance_declarations    (IPC-1752A provenance)
    ExemptionClaim          exemption_claims

All anchor to Part (item master), not BOMItem. Business keys are composite
(tenantId, …); any key with a nullable column is a PARTIAL unique index
(spec P2). ppm = Numeric(12,4); mass = Numeric(10,4).
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
from sqlalchemy.sql import func, text

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class PartMaterial(Base, TenantAwareMixin):
    """A homogeneous material within a part — the RoHS threshold denominator."""

    __tablename__ = "part_materials"

    id = Column(Integer, primary_key=True)
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    material_class = Column(String)
    mass_g = Column(Numeric(10, 4))  # grams within the part
    mass_fraction = Column(Numeric(10, 4))  # share of part mass

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            "mass_g IS NOT NULL OR mass_fraction IS NOT NULL",
            name="ck_part_materials_mass_present",
        ),
        UniqueConstraint("tenantId", "part_id", "name", name="uq_part_materials_tenant_part_name"),
        Index("idx_part_materials_tenant_part", "tenantId", "part_id"),
    )

    def __repr__(self):
        return f"<PartMaterial part={self.part_id} {self.name}>"


class PartMaterialSubstance(Base, TenantAwareMixin):
    """The concentration of a substance WITHIN a homogeneous material."""

    __tablename__ = "part_material_substances"

    id = Column(Integer, primary_key=True)
    part_material_id = Column(
        Integer, ForeignKey("part_materials.id", ondelete="CASCADE"), nullable=False, index=True
    )
    substance_id = Column(
        Integer, ForeignKey("substances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    concentration_ppm = Column(Numeric(12, 4), nullable=False)  # within the homogeneous material
    mass_g = Column(Numeric(10, 4))
    source_declaration_id = Column(
        Integer, ForeignKey("substance_declarations.id", ondelete="SET NULL")
    )

    __table_args__ = (
        UniqueConstraint(
            "tenantId", "part_material_id", "substance_id", name="uq_pms_tenant_material_substance"
        ),
        Index("idx_pms_tenant_material", "tenantId", "part_material_id"),
    )


class SubstanceDeclaration(Base, TenantAwareMixin):
    """An IPC-1752A (or equivalent) supplier declaration / provenance record.

    ``supplier_id`` FKs to ``vendors`` (STEP 0/P13: this codebase's vendor
    master is ``vendors``; there is no ``suppliers`` table). ``content_hash``
    is the SHA-256 computed server-side on document ingest (spec P10); its
    uniqueness key is a PARTIAL index (content_hash is NULL before upload,
    spec P2)."""

    __tablename__ = "substance_declarations"

    id = Column(Integer, primary_key=True)
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("vendors.id", ondelete="SET NULL"))
    standard = Column(String)  # IPC_1752A/IPC_1754/IEC_62474/MANUFACTURER_STATEMENT/PDF_UNSTRUCTURED
    disclosure_class = Column(String)  # CLASS_A..CLASS_F (C=summary, D=FMD)
    data_fidelity = Column(String)  # COMPUTED_FROM_FMD/ASSERTED_FROM_SUMMARY/NO_DATA
    declared_regulations = Column(JSON)  # codes the doc speaks to
    signing_authority = Column(String)
    signed_date = Column(Date)
    valid_from = Column(Date)
    valid_until = Column(Date)
    revision_of_part = Column(String)
    assessed_regulation_version_id = Column(
        Integer, ForeignKey("regulation_versions.id", ondelete="SET NULL")
    )
    document_uri = Column(String)  # local file store path (spec 5, 10.6), not cloud
    content_hash = Column(String(64))  # SHA-256, computed server-side on ingest (P10)
    status = Column(String, nullable=False, default="RECEIVED")  # RECEIVED/VALIDATED/REJECTED/EXPIRED/SUPERSEDED
    approved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    approved_at = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index(
            "uq_declarations_tenant_part_hash",
            "tenantId",
            "part_id",
            "content_hash",
            unique=True,
            sqlite_where=text("content_hash IS NOT NULL"),
            postgresql_where=text("content_hash IS NOT NULL"),
        ),
        Index("idx_declarations_tenant_part", "tenantId", "part_id"),
    )


class ExemptionClaim(Base, TenantAwareMixin):
    """A claim that a RoHS exemption covers an exceedance on a part.

    Group-aware (spec P16): references a substance OR a group; resolution
    matches the offending substance against the claim's substance or its
    group membership. Two partial unique indexes (nullable keys, P2)."""

    __tablename__ = "exemption_claims"

    id = Column(Integer, primary_key=True)
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    part_material_id = Column(Integer, ForeignKey("part_materials.id", ondelete="CASCADE"))
    exemption_id = Column(
        Integer, ForeignKey("rohs_exemptions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    substance_id = Column(Integer, ForeignKey("substances.id", ondelete="CASCADE"))
    substance_group_id = Column(Integer, ForeignKey("substance_groups.id", ondelete="CASCADE"))
    justification = Column(Text)
    source_declaration_id = Column(
        Integer, ForeignKey("substance_declarations.id", ondelete="SET NULL")
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index(
            "uq_exemption_claims_substance",
            "tenantId",
            "part_id",
            "exemption_id",
            "substance_id",
            unique=True,
            sqlite_where=text("substance_id IS NOT NULL"),
            postgresql_where=text("substance_id IS NOT NULL"),
        ),
        Index(
            "uq_exemption_claims_group",
            "tenantId",
            "part_id",
            "exemption_id",
            "substance_group_id",
            unique=True,
            sqlite_where=text("substance_group_id IS NOT NULL"),
            postgresql_where=text("substance_group_id IS NOT NULL"),
        ),
    )
