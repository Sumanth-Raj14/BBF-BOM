"""TOTP secret encryption/decryption using Fernet (AES-128-CBC + HMAC-SHA256).

TOTP secrets are encrypted at rest using the application's ENCRYPTION_KEY.
This prevents plaintext exposure if the database is compromised.
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet

from app.core.config import settings

logger = logging.getLogger(__name__)


def _get_totp_fernet() -> Fernet:
    """Derive a Fernet key from ENCRYPTION_KEY for TOTP secret encryption."""
    raw_key = settings.ENCRYPTION_KEY
    if not raw_key:
        raise ValueError("ENCRYPTION_KEY is not configured. TOTP secret encryption requires it.")
    raw = hashlib.sha256(raw_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def encrypt_totp_secret(secret: str) -> str:
    """Encrypt a TOTP secret key for storage."""
    if not secret:
        return ""
    try:
        fernet = _get_totp_fernet()
        return fernet.encrypt(secret.encode()).decode()
    except Exception as e:
        logger.error("Failed to encrypt TOTP secret: %s", e)
        raise


def decrypt_totp_secret(encrypted: str) -> str:
    """Decrypt a stored TOTP secret key for use."""
    if not encrypted:
        return ""
    try:
        fernet = _get_totp_fernet()
        return fernet.decrypt(encrypted.encode()).decode()
    except Exception as e:
        logger.error("Failed to decrypt TOTP secret: %s", e)
        raise
