"""
BOM Snapshots and Baselines
Supports BOM versioning, snapshots, and baseline management
"""

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class BomSnapshot(Base, TenantAwareMixin):
    __tablename__ = "bom_snapshots"

    id = Column(Integer, primary_key=True)
    bom_id = Column(Integer, ForeignKey("boms.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_name = Column(String(255), nullable=False)
    snapshot_type = Column(String(50), nullable=False)  # baseline, release, archive
    snapshot_data = Column(JSON, nullable=False)  # Complete BOM snapshot
    version = Column(String(50))
    change_description = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            "snapshot_type IN ('baseline', 'release', 'archive')",
            name="ck_bom_snapshots_snapshot_type",
        ),
    )

    # Relationships
    bom = relationship("BOM", back_populates="snapshots")
    created_by_user = relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<BomSnapshot {self.id}>"


class BomBaseline(Base, TenantAwareMixin):
    __tablename__ = "bom_baselines"

    id = Column(Integer, primary_key=True)
    bom_id = Column(Integer, ForeignKey("boms.id", ondelete="CASCADE"), nullable=False, index=True)
    baseline_name = Column(String(255), nullable=False)
    snapshot_id = Column(Integer, ForeignKey("bom_snapshots.id", ondelete="CASCADE"), index=True)
    is_current = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships

    def __repr__(self):
        return f"<BomBaseline {self.id}>"

    bom = relationship("BOM", back_populates="baselines")
    snapshot = relationship("BomSnapshot")
    created_by_user = relationship("User", foreign_keys=[created_by])
