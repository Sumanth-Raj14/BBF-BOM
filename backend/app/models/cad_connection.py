"""Per-tenant, per-vendor CAD connection (Onshape/Fusion 360/Altium/...).

`credentials` holds a JSON-encoded blob (vendor-specific: Onshape stores
{access_key, secret_key}) and is Fernet-encrypted at rest using the exact
before_insert/before_update/load event pattern `ERPConnector.apiKey` already
uses (app/models/erp_connector.py) — no new encryption mechanism, no
plaintext secret ever written to the table.

`connector_type` deliberately has no CHECK constraint: new vendors register
themselves in `app.integrations.cad.registry` without a migration, so the
framework never needs to update this table's schema to add one.
"""

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
)
from sqlalchemy.sql import func

from app.core.encryption import fernet_decrypt, fernet_encrypt
from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class CadConnection(Base, TenantAwareMixin):
    __tablename__ = "cad_connections"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    connector_type = Column(String, nullable=False, index=True)
    credentials = Column(Text)  # Fernet-encrypted JSON blob
    config = Column(JSON, default=dict)  # non-secret settings, e.g. base_url override
    status = Column(String, nullable=False, default="unconfigured")  # unconfigured|ok|error
    last_error = Column(Text)
    last_sync_at = Column(DateTime(timezone=True))
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("tenantId", "name", name="uq_cad_connections_tenant_name"),
        # Mirrors the composite index migration 056 creates. Without it a
        # create_all database (every test run, and any greenfield bootstrap via
        # scripts.init_db) had only the single-column connector_type index,
        # while a migrated database had both — so the two disagreed on the
        # index set for the same table.
        Index("idx_cad_connections_tenant_type", "tenantId", "connector_type"),
    )

    def __repr__(self):
        return f"<CadConnection {self.name}: {self.connector_type}>"


@event.listens_for(CadConnection, "before_insert")
@event.listens_for(CadConnection, "before_update")
def encrypt_cad_credentials(mapper, connection, target):
    if target.credentials and not target.credentials.startswith("gAAAAA"):
        target.credentials = fernet_encrypt(target.credentials)


@event.listens_for(CadConnection, "load")
def decrypt_cad_credentials(target, context):
    if target.credentials and target.credentials.startswith("gAAAAA"):
        target.credentials = fernet_decrypt(target.credentials)
