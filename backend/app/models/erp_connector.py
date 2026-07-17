from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    event,
)
from sqlalchemy.sql import func

from app.core.encryption import fernet_decrypt, fernet_encrypt
from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class ERPConnector(Base, TenantAwareMixin):
    __tablename__ = "erp_connectors"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    __table_args__ = (
        CheckConstraint(
            "type IN ('SAP', 'Oracle', 'Microsoft Dynamics', 'NetSuite', 'Odoo', 'Custom', 'Other')",
            name="ck_erp_connectors_type",
        ),
    )
    baseUrl = Column(String)
    apiKey = Column(String)
    active = Column(Boolean, default=True)
    lastSyncAt = Column(DateTime(timezone=True))
    config = Column(JSON, default={})
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<ERPConnector {self.name}: {self.type}>"


@event.listens_for(ERPConnector, "before_insert")
@event.listens_for(ERPConnector, "before_update")
def encrypt_erp_apikey(mapper, connection, target):
    if target.apiKey and not target.apiKey.startswith("gAAAAA"):
        target.apiKey = fernet_encrypt(target.apiKey)


@event.listens_for(ERPConnector, "load")
def decrypt_erp_apikey(target, context):
    if target.apiKey and target.apiKey.startswith("gAAAAA"):
        target.apiKey = fernet_decrypt(target.apiKey)


class ERPSyncLog(Base, TenantAwareMixin):
    __tablename__ = "erp_sync_logs"

    id = Column(Integer, primary_key=True)
    connectorId = Column(
        Integer, ForeignKey("erp_connectors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    direction = Column(String, nullable=False)
    entityType = Column(String, nullable=False)
    recordsCount = Column(Integer, default=0)
    status = Column(String, default="pending")
    __table_args__ = (
        Index("idx_erp_sync_logs_tenant_status", "tenantId", "status"),
        CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed', 'cancelled')",
            name="ck_erp_sync_logs_status",
        ),
        CheckConstraint(
            "direction IN ('import', 'export', 'sync')", name="ck_erp_sync_logs_direction"
        ),
    )
    errors = Column(Text)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<ERPSyncLog {self.id}: {self.direction}>"
