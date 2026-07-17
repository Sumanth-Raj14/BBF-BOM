from sqlalchemy import (
    JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class IntegrationConnection(Base, TenantAwareMixin):
    __tablename__ = "integration_connections"
    id = Column(Integer, primary_key=True)
    provider = Column(String(20), nullable=False)  # "clickup" | "cliq"
    auth = Column(Text)              # encrypted credential blob
    config = Column(JSON, default=dict)
    is_enabled = Column(Boolean, default=False)
    status = Column(String(20), default="unconfigured")  # ok | error | unconfigured
    last_error = Column(Text)
    last_checked_at = Column(DateTime(timezone=True))
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())
    __table_args__ = (
        UniqueConstraint("tenantId", "provider", name="uq_integration_conn_tenant_provider"),
    )


class IntegrationOutbox(Base, TenantAwareMixin):
    __tablename__ = "integration_outbox"
    id = Column(Integer, primary_key=True)
    provider = Column(String(20), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=False)
    action = Column(String(50), nullable=False)
    payload = Column(JSON, default=dict)
    status = Column(String(20), default="pending", index=True)  # pending|sent|failed|dead
    attempts = Column(Integer, default=0)
    next_attempt_at = Column(DateTime(timezone=True))
    last_error = Column(Text)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())
    __table_args__ = (Index("idx_outbox_status_next", "status", "next_attempt_at"),)


class IntegrationExternalLink(Base, TenantAwareMixin):
    __tablename__ = "integration_external_links"
    id = Column(Integer, primary_key=True)
    provider = Column(String(20), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=False)
    external_id = Column(String(100), nullable=False)
    external_url = Column(String(500))
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())
    __table_args__ = (
        UniqueConstraint(
            "tenantId", "provider", "entity_type", "entity_id",
            name="uq_extlink_entity",
        ),
    )
