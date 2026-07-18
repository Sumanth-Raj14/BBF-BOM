"""GLOBAL RoHS/REACH regulatory reference (master) data.

These five tables are **global / system-owned** (spec 2.2): they do NOT
subclass ``TenantAwareMixin``, carry no ``tenantId``, get no RLS, and are
seeded once by migration ``042_substance_reference_data`` from the bundled,
versioned JSON under ``app/data/reference`` (shared by every tenant, never
duplicated per-tenant — spec P1).

    SubstanceGroup            substance_groups
    Substance                 substances
    RegulationVersion         regulation_versions
    RestrictedSubstanceEntry  restricted_substance_entries
    RohsExemption             rohs_exemptions

Tenant-owned composition / declarations / claims live in
``app/models/part_composition.py``; evaluation caches in
``app/models/compliance_evaluation.py``.

Numeric conventions (spec 2): ppm = Numeric(12,4) (documented deviation from
the qty/mass 10,4 — a 10,4 column maxes at 999,999.9999 and cannot hold
1,000,000 ppm = 100%).
"""

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import text

from app.db.base import Base


class SubstanceGroup(Base):
    """A regulated substance family — matching resolves group membership,
    not exact CAS only. Frozen scope (spec 10.8): PBB, PBDE, the
    four-phthalate family, and lead compounds."""

    __tablename__ = "substance_groups"

    id = Column(Integer, primary_key=True)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)

    __table_args__ = (UniqueConstraint("code", name="uq_substance_groups_code"),)

    def __repr__(self):
        return f"<SubstanceGroup {self.code}>"


class Substance(Base):
    """A regulated substance (global catalog). One row per CAS number."""

    __tablename__ = "substances"

    id = Column(Integer, primary_key=True)
    cas_number = Column(String, index=True, nullable=False)
    ec_number = Column(String)
    name = Column(String, nullable=False)
    substance_group_id = Column(
        Integer, ForeignKey("substance_groups.id", ondelete="SET NULL"), index=True
    )

    group = relationship("SubstanceGroup")

    __table_args__ = (UniqueConstraint("cas_number", name="uq_substances_cas"),)

    def __repr__(self):
        return f"<Substance {self.name} ({self.cas_number})>"


class RegulationVersion(Base):
    """A version-stamped snapshot of a regulation's restricted list, so
    evaluations stay reproducible and staleness is detectable. At most one
    ``is_current`` version per ``regulation_code`` (partial unique index)."""

    __tablename__ = "regulation_versions"

    id = Column(Integer, primary_key=True)
    regulation_code = Column(String, nullable=False, index=True)  # ROHS3/REACH_SVHC/REACH_ANNEX_XVII/SCIP
    version_label = Column(String, nullable=False)  # e.g. SVHC-2026.1
    effective_date = Column(Date)
    source = Column(String, nullable=False, default="BUNDLED")  # BUNDLED / IMPORT:<filename> (reserved)
    entry_count = Column(Integer)  # audit; never hard-coded in logic
    is_current = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("regulation_code", "version_label", name="uq_regulation_versions_code_label"),
        Index(
            "uq_regulation_versions_current",
            "regulation_code",
            unique=True,
            sqlite_where=text("is_current"),
            postgresql_where=text("is_current"),
        ),
    )

    def __repr__(self):
        return f"<RegulationVersion {self.regulation_code}:{self.version_label}>"


class RestrictedSubstanceEntry(Base):
    """One restriction rule within a regulation version. Exactly one of
    ``substance_id`` / ``substance_group_id`` is set (CHECK + two partial
    unique indexes, spec P2)."""

    __tablename__ = "restricted_substance_entries"

    id = Column(Integer, primary_key=True)
    regulation_version_id = Column(
        Integer, ForeignKey("regulation_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    substance_id = Column(Integer, ForeignKey("substances.id", ondelete="CASCADE"))
    substance_group_id = Column(Integer, ForeignKey("substance_groups.id", ondelete="CASCADE"))
    threshold_ppm = Column(Numeric(12, 4), nullable=False)  # RoHS 1000, Cd 100, SVHC 1000
    threshold_basis = Column(String, nullable=False)  # HOMOGENEOUS_MATERIAL / ARTICLE / MIXTURE / PRODUCT
    applicability = Column(JSON)  # Annex XVII per-use conditions (unused this build)

    __table_args__ = (
        CheckConstraint(
            "(CASE WHEN substance_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN substance_group_id IS NULL THEN 0 ELSE 1 END) = 1",
            name="ck_restricted_entry_one_target",
        ),
        Index(
            "uq_restricted_entry_version_substance",
            "regulation_version_id",
            "substance_id",
            unique=True,
            sqlite_where=text("substance_id IS NOT NULL"),
            postgresql_where=text("substance_id IS NOT NULL"),
        ),
        Index(
            "uq_restricted_entry_version_group",
            "regulation_version_id",
            "substance_group_id",
            unique=True,
            sqlite_where=text("substance_group_id IS NOT NULL"),
            postgresql_where=text("substance_group_id IS NOT NULL"),
        ),
    )


class RohsExemption(Base):
    """A RoHS Annex III/IV exemption. Resolved in end-product context at
    rollup (not baked onto the shared part). ``category_validity`` overrides
    the scalar ``valid_until`` per EEE category (spec P16)."""

    __tablename__ = "rohs_exemptions"

    id = Column(Integer, primary_key=True)
    code = Column(String, nullable=False)  # e.g. "6(c)"
    annex = Column(String, nullable=False)  # ANNEX_III / ANNEX_IV
    substance_id = Column(Integer, ForeignKey("substances.id", ondelete="SET NULL"))
    substance_group_id = Column(Integer, ForeignKey("substance_groups.id", ondelete="SET NULL"))
    application_scope = Column(Text)
    applicable_eee_categories = Column(JSON)  # int[] of RoHS categories 1-11
    valid_until = Column(Date)  # scalar fallback expiry
    category_validity = Column(JSON)  # {category: valid_until} overrides (nullable)
    status = Column(String, nullable=False, default="ACTIVE")  # ACTIVE / EXPIRED / RENEWAL_PENDING

    __table_args__ = (UniqueConstraint("code", name="uq_rohs_exemptions_code"),)

    def __repr__(self):
        return f"<RohsExemption {self.code} ({self.annex})>"
