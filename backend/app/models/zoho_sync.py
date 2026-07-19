"""Zoho Books two-way sync state (spec §2).

Three tenant-owned tables that back the connector's version/baseline store,
incremental-poll cursors, and the conflict/mutation audit log. Credentials, the
bom<->zoho id cross-reference, and the outbound queue REUSE the existing
IntegrationConnection / IntegrationExternalLink / IntegrationOutbox tables — no
new table for those.

All inherit TenantAwareMixin (indexed non-null tenantId FK -> tenants.id ON
DELETE CASCADE) so register_tenant_listeners() auto-populates tenantId on
INSERT and auto-filters SELECT. Money = Numeric(18,4). The nullable-key tables
use PARTIAL unique indexes so multiple not-yet-pushed (external_id IS NULL) rows
can coexist per (tenant, entity_type).
"""

from sqlalchemy import (
    JSON,
    Column,
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


class ZohoSyncState(Base, TenantAwareMixin):
    """Per-record three-way baseline & status — the version/checksum store Zoho
    cannot give us (it exposes no ETag)."""

    __tablename__ = "zoho_sync_state"

    id = Column(Integer, primary_key=True)
    entity_type = Column(String(50), nullable=False)  # part | vendor | purchase_order
    entity_id = Column(Integer, nullable=False)       # local row id (polymorphic, no hard FK)
    external_id = Column(String(100), nullable=True)  # null while locally-created & not yet pushed
    last_synced_at = Column(DateTime(timezone=True))
    last_direction = Column(String(10))               # outbound | inbound
    local_checksum = Column(String(64))               # sha256 of canonical tool-owned field subset
    zoho_last_modified_time = Column(String(40))      # ISO-8601-with-offset per-record anchor
    last_cost = Column(Numeric(18, 4))                # last-synced purchase_rate baseline
    last_price = Column(Numeric(18, 4))               # last-synced rate baseline
    sync_lock = Column(String(20), nullable=True)     # 'syncing' gate (paired with SELECT ... FOR UPDATE)
    status = Column(String(20), default="pending_out")  # in_sync|pending_out|pending_in|conflict|error
    last_error = Column(Text)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("tenantId", "entity_type", "entity_id", name="uq_zoho_state_local"),
        # Partial unique on the nullable external_id key: a plain unique would
        # reject multiple null-external rows per (tenant, entity_type). SQLite
        # honors partial indexes too, so both dialects get the guard.
        Index(
            "uq_zoho_state_ext",
            "tenantId",
            "entity_type",
            "external_id",
            unique=True,
            sqlite_where=text("external_id IS NOT NULL"),
            postgresql_where=text("external_id IS NOT NULL"),
        ),
    )


class ZohoSyncCursor(Base, TenantAwareMixin):
    """Per-entity-type incremental-poll high-water cursor."""

    __tablename__ = "zoho_sync_cursor"

    id = Column(Integer, primary_key=True)
    entity_type = Column(String(50), nullable=False)
    high_water = Column(String(40))            # last fully-processed last_modified_time (polled >= )
    last_run_at = Column(DateTime(timezone=True))
    last_run_status = Column(String(20))       # ok | partial | error
    records_seen = Column(Integer, default=0)
    last_error = Column(Text)

    __table_args__ = (
        UniqueConstraint("tenantId", "entity_type", name="uq_zoho_cursor"),
    )


class ZohoSyncLog(Base, TenantAwareMixin):
    """Conflict + full mutation audit; doubles as the conflict-review queue
    (rows where event='conflict_detected' AND resolution IS NULL)."""

    __tablename__ = "zoho_sync_log"

    id = Column(Integer, primary_key=True)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=True)   # null for batch/cursor-level events
    external_id = Column(String(100), nullable=True)
    direction = Column(String(10))               # outbound | inbound
    event = Column(String(30))                   # push_create|push_update|pull_*|conflict_*|skipped|error
    status = Column(String(20))                  # ok | error | open
    field_diffs = Column(JSON)                   # {field:{old,new}} or three-way {field:{base,local,zoho}}
    actor = Column(String(40))                   # 'system-sync' | username for manual resolutions
    resolution = Column(String(20), nullable=True)  # tool_wins|books_wins|manual|deferred
    resolved_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    message = Column(Text)
    # createdAt is an addition to the spec table: an audit/log row needs a
    # timestamp anchor; omitting it would be a real defect. (See report.)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_zoho_log_tenant_status", "tenantId", "entity_type", "status"),
    )
