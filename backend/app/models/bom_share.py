"""Public read-only share link for a BOM (bom_templates row).

Replaces the fabricated "https://bbox.dev/share/" + Math.random() the frontend
handed out: a real, revocable, optionally expiring / password-protected token
that resolves to exactly one BOM through an unauthenticated endpoint.

The token is the ONLY credential, so it is 256 bits of secrets.token_urlsafe
(never sequential) and the password — when set — is stored as a bcrypt hash via
app.core.security.get_password_hash, never in the clear.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    false,
    text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class BomShareLink(Base, TenantAwareMixin):
    __tablename__ = "bom_share_links"

    id = Column(Integer, primary_key=True)
    # Globally unique: the public endpoint looks a token up with NO tenant
    # context, so it must identify one row across the whole install.
    token = Column(String(64), nullable=False, unique=True, index=True)
    bom_id = Column(
        Integer, ForeignKey("bom_templates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    expires_at = Column(DateTime(timezone=True))  # null = never expires
    password_hash = Column(String)  # null = no password; bcrypt hash otherwise
    revoked = Column(Boolean, nullable=False, server_default=false(), default=False)

    # Access accounting — the only thing the public endpoint writes.
    last_accessed_at = Column(DateTime(timezone=True))
    access_count = Column(Integer, nullable=False, server_default=text("0"), default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bom = relationship("BomTemplate", backref="share_links")

    __table_args__ = (Index("idx_bom_share_links_tenant_bom", "tenantId", "bom_id"),)

    def __repr__(self):
        return f"<BomShareLink bom={self.bom_id} revoked={self.revoked}>"
