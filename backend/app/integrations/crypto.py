import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import settings


def _fernet() -> Fernet:
    # Derive a stable 32-byte key from SECRET_KEY. (For key rotation later,
    # store a dedicated INTEGRATION_ENCRYPTION_KEY; SECRET_KEY-derived is fine now.)
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    if plaintext is None:
        return None
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(token: str) -> str:
    if not token:
        return token
    return _fernet().decrypt(token.encode()).decode()


def _integration_fernet() -> Fernet:
    # Prefer a DEDICATED key for integration credential blobs (e.g. the Zoho
    # OAuth refresh-token blob) so rotating SECRET_KEY (JWT signing) never
    # orphans stored refresh tokens -> mass silent disconnect. When
    # INTEGRATION_ENCRYPTION_KEY is unset this falls back to exactly the
    # SECRET_KEY-derived key used by _fernet(), so any blob written under the
    # old scheme keeps decrypting and existing deployments are unaffected.
    key_material = settings.INTEGRATION_ENCRYPTION_KEY or settings.SECRET_KEY
    digest = hashlib.sha256(key_material.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_integration_secret(plaintext: str) -> str | None:
    """Encrypt an integration credential blob under INTEGRATION_ENCRYPTION_KEY
    (falling back to the SECRET_KEY-derived key when unset)."""
    if plaintext is None:
        return None
    return _integration_fernet().encrypt(plaintext.encode()).decode()


def decrypt_integration_secret(token: str) -> str:
    if not token:
        return token
    return _integration_fernet().decrypt(token.encode()).decode()
