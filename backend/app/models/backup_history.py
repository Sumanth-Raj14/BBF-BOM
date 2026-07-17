from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class BackupHistory(Base, TenantAwareMixin):
    __tablename__ = "backup_history"

    id = Column(Integer, primary_key=True)
    backup_type = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="running")
    __table_args__ = (
        Index("idx_backup_history_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('running', 'completed', 'failed', 'partial', 'verified')",
            name="ck_backup_history_status",
        ),
        CheckConstraint(
            "backup_type IN ('full', 'incremental', 'differential', 'schema_only', 'physical', 'table')",
            name="ck_backup_history_backup_type",
        ),
        CheckConstraint(
            "storage_type IN ('local', 's3', 'azure_blob', 'gcs', 'other')",
            name="ck_backup_history_storage_type",
        ),
        CheckConstraint(
            "verification_status IN ('passed', 'verified', 'failed', 'pending', 'skipped')",
            name="ck_backup_history_verification_status",
        ),
    )
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))
    size_bytes = Column(BigInteger)
    storage_path = Column(Text)
    storage_type = Column(String(20), default="local")
    error_message = Column(Text)
    verified_at = Column(DateTime(timezone=True))
    verification_status = Column(String(20))
    retention_tier = Column(String(20))
    backup_metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<BackupHistory {self.id}>"
