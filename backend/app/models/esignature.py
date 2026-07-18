"""21 CFR Part 11 electronic signatures.

An `ESignature` is the immutable record produced by `app.services.part11_service.sign_action`
when a user re-authenticates (password) to attest to a critical, state-changing
action (e.g. approving/implementing an ECO). Rows are write-once: no
update/delete API is exposed for this model anywhere in the app — the only
supported operations are INSERT (via `sign_action`) and read-only listing.

`content_hash` is a SHA-256 hex digest over a canonical (sorted-keys) JSON
serialization of the record/action being attested to at the moment of
signing, giving a tamper-evident integrity check independent of the DB row
itself.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class ESignature(Base, TenantAwareMixin):
    __tablename__ = "e_signatures"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action = Column(String(100), nullable=False)  # e.g. 'eco.approve', 'eco.implement'
    entity_type = Column(String(50), nullable=False)  # e.g. 'eco'
    entity_id = Column(Integer, nullable=False)
    meaning = Column(Text, nullable=False)  # the reason/statement the signer attested to
    content_hash = Column(String(128), nullable=False)  # sha256 hex of the signed content
    signed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_esig_entity", "entity_type", "entity_id"),
        Index("idx_esig_tenant_entity", "tenantId", "entity_type", "entity_id"),
        Index("idx_esig_user", "user_id"),
    )

    # Relationships
    user = relationship("User")

    def __repr__(self):
        return f"<ESignature {self.action} {self.entity_type}:{self.entity_id} by user {self.user_id}>"
