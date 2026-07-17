"""
Digital Signatures and User MFA
Supports digital signature capture and multi-factor authentication
"""

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
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class DigitalSignature(Base, TenantAwareMixin):
    __tablename__ = "digital_signatures"

    ALLOWED_DOCUMENT_TYPES = {
        "eco",
        "ncr",
        "capa",
        "contract",
        "quality_report",
        "fai",
        "deviation",
        "audit_report",
    }

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_type = Column(String(50), nullable=False)
    document_id = Column(Integer, nullable=False)
    signature_type = Column(String(50), nullable=False)

    __table_args__ = (
        Index("idx_digital_sig_document", "document_type", "document_id"),
        CheckConstraint(
            "document_type IN ('eco', 'ncr', 'capa', 'contract', 'quality_report', 'fai', 'deviation', 'audit_report')",
            name="ck_digital_signatures_document_type",
        ),
        CheckConstraint(
            "signature_type IN ('electronic', 'digital', 'biometric', 'typed')",
            name="ck_digital_signatures_signature_type",
        ),
    )
    signature_data = Column(Text, nullable=False)
    certificate_info = Column(JSON)
    ip_address = Column(String(50))
    user_agent = Column(Text)
    signed_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_valid = Column(Boolean, default=True)

    # Relationships
    user = relationship("User")

    def __repr__(self):
        return f"<DigitalSignature {self.id}>"


@event.listens_for(DigitalSignature, "before_insert")
@event.listens_for(DigitalSignature, "before_update")
def validate_digital_sig_document(mapper, connection, target):
    if target.document_type and target.document_type not in DigitalSignature.ALLOWED_DOCUMENT_TYPES:
        raise ValueError(
            f"Invalid document_type '{target.document_type}'. Must be one of: {DigitalSignature.ALLOWED_DOCUMENT_TYPES}"
        )


class UserMfa(Base, TenantAwareMixin):
    __tablename__ = "user_mfa"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    mfa_type = Column(String(50), nullable=False)
    __table_args__ = (
        CheckConstraint(
            "mfa_type IN ('totp', 'sms', 'email', 'webauthn', 'backup_code')",
            name="ck_user_mfa_mfa_type",
        ),
        Index("idx_user_mfa_type", "mfa_type"),
    )
    secret_key = Column(String(512), nullable=False)
    backup_codes = Column(JSON)
    is_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_used_at = Column(DateTime(timezone=True))

    def __repr__(self):
        return f"<UserMfa {self.id}>"

    # Relationships
    user = relationship("User")

    def get_decrypted_secret(self) -> str:
        """Return the decrypted TOTP secret for use in verification."""
        from app.core.totp_encryption import decrypt_totp_secret

        return decrypt_totp_secret(self.secret_key)


@event.listens_for(UserMfa, "before_insert")
@event.listens_for(UserMfa, "before_update")
def encrypt_mfa_secret(mapper, connection, target):
    """Automatically encrypt the TOTP secret before persisting to DB."""
    from app.core.totp_encryption import encrypt_totp_secret

    if target.secret_key and not target.secret_key.startswith("gAAAAA"):
        target.secret_key = encrypt_totp_secret(target.secret_key)
