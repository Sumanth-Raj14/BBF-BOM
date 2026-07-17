from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class BulkImportJob(Base, TenantAwareMixin):
    __tablename__ = "bulk_import_jobs"

    id = Column(Integer, primary_key=True)
    filename = Column(String, nullable=False)
    status = Column(String, default="pending")
    __table_args__ = (
        Index("idx_bulk_import_jobs_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'uploaded')",
            name="ck_bulk_import_jobs_status",
        ),
    )
    totalRows = Column(Integer, default=0)
    processedRows = Column(Integer, default=0)
    errorRows = Column(Integer, default=0)
    mappingConfig = Column(JSON, default={})
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())
    completedAt = Column(DateTime(timezone=True))

    def __repr__(self):
        return f"<BulkImportJob {self.id}: {self.filename}>"


class BulkImportRow(Base, TenantAwareMixin):
    __tablename__ = "bulk_import_rows"

    id = Column(Integer, primary_key=True)
    jobId = Column(
        Integer, ForeignKey("bulk_import_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rowData = Column(JSON, default={})
    status = Column(String, default="pending")
    __table_args__ = (
        Index("idx_bulk_import_rows_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('pending', 'processed', 'error', 'skipped')",
            name="ck_bulk_import_rows_status",
        ),
    )
    errors = Column(Text)

    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<BulkImportRow {self.id}: status={self.status}>"
