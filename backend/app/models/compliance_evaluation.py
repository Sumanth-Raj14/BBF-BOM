"""TENANT-OWNED persisted compliance evaluation & REACH obligation caches.

Created by migration ``044_compliance_evaluations``. Both subclass
``TenantAwareMixin`` (spec 2.4); migration 044 installs the per-table
Postgres RLS policy (gated on dialect==postgresql AND settings.ENABLE_RLS).

    ComplianceEvaluation   compliance_evaluations
    ReachObligation        reach_obligations

Status is per-regulation and version-stamped (regulation_version_id +
evaluated_at) for reproducibility. SELF rows (bom_id NULL) are deduped per
part; ROLLUP rows are per-(part, bom). Both uniqueness keys are PARTIAL
indexes (spec P2). ReachObligation unions upward independent of the status
lattice (spec 4.4, O5A per-article), deduped with a COALESCE(bom_id,0)
sentinel so the nullable context column still enforces uniqueness.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    text,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class ComplianceEvaluation(Base, TenantAwareMixin):
    __tablename__ = "compliance_evaluations"

    id = Column(Integer, primary_key=True)
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    regulation_version_id = Column(
        Integer, ForeignKey("regulation_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bom_id = Column(Integer, ForeignKey("boms.id", ondelete="CASCADE"))  # NULL = context-free SELF
    bom_rev = Column(String)
    status = Column(String, nullable=False)  # see spec 4.1 lattice
    basis = Column(String, nullable=False)  # SELF / ROLLUP
    exceedance = Column(Boolean, nullable=False, default=False)  # raw breach at SELF, pre-exemption (P3)
    data_fidelity = Column(String)  # COMPUTED_FROM_FMD/ASSERTED_FROM_SUMMARY/NO_DATA
    driving_child_part_id = Column(Integer, ForeignKey("parts.id", ondelete="SET NULL"))
    driving_substance_id = Column(Integer, ForeignKey("substances.id", ondelete="SET NULL"))
    applied_exemption_id = Column(Integer, ForeignKey("rohs_exemptions.id", ondelete="SET NULL"))
    evaluated_at = Column(DateTime(timezone=True), server_default=func.now())
    is_stale = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index(
            "uq_eval_self",
            "tenantId",
            "part_id",
            "regulation_version_id",
            unique=True,
            sqlite_where=text("basis = 'SELF' AND bom_id IS NULL"),
            postgresql_where=text("basis = 'SELF' AND bom_id IS NULL"),
        ),
        Index(
            "uq_eval_rollup",
            "tenantId",
            "part_id",
            "regulation_version_id",
            "bom_id",
            unique=True,
            sqlite_where=text("basis = 'ROLLUP'"),
            postgresql_where=text("basis = 'ROLLUP'"),
        ),
        Index("idx_eval_tenant_part", "tenantId", "part_id"),
        Index("idx_eval_tenant_bom", "tenantId", "bom_id"),
    )


class ReachObligation(Base, TenantAwareMixin):
    """An Art 33 / SCIP obligation carried upward: (carrier part, offending
    leaf article, substance) in a BOM context."""

    __tablename__ = "reach_obligations"

    id = Column(Integer, primary_key=True)
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)  # carrier (parent accumulating)
    article_part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False)  # offending leaf article
    substance_id = Column(Integer, ForeignKey("substances.id", ondelete="CASCADE"), nullable=False)
    regulation_version_id = Column(
        Integer, ForeignKey("regulation_versions.id", ondelete="CASCADE"), nullable=False
    )
    bom_id = Column(Integer, ForeignKey("boms.id", ondelete="CASCADE"))  # nullable context
    concentration_ppm = Column(Numeric(12, 4))
    scip_ref = Column(String)

    __table_args__ = (
        Index(
            "uq_reach_obligations_dedup",
            "tenantId",
            "part_id",
            "article_part_id",
            "substance_id",
            "regulation_version_id",
            text("COALESCE(bom_id, 0)"),
            unique=True,
        ),
        Index("idx_reach_obligations_tenant_part", "tenantId", "part_id"),
    )
