import logging
import os
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Optional

import bcrypt
import jwt

from app.core.config import settings

logger = logging.getLogger(__name__)

_RSA_PRIVATE_KEY: Optional[str] = None
_RSA_PUBLIC_KEY: Optional[str] = None
_RSA_PRIVATE_KEY_OBJ = None
_RSA_PUBLIC_KEY_OBJ = None


def _ensure_rsa_keys():
    global _RSA_PRIVATE_KEY, _RSA_PUBLIC_KEY
    if _RSA_PRIVATE_KEY and _RSA_PUBLIC_KEY:
        return

    priv_path = settings.RSA_PRIVATE_KEY_PATH or str(Path(settings.RSA_KEY_DIR) / "private.pem")
    pub_path = settings.RSA_PUBLIC_KEY_PATH or str(Path(settings.RSA_KEY_DIR) / "public.pem")

    if os.path.exists(priv_path) and os.path.exists(pub_path):
        with open(priv_path) as f:
            _RSA_PRIVATE_KEY = f.read()
        with open(pub_path) as f:
            _RSA_PUBLIC_KEY = f.read()
        logger.info("Loaded RSA keys from %s", priv_path)
        return

    os.makedirs(settings.RSA_KEY_DIR, exist_ok=True)
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=4096,
        backend=default_backend(),
    )
    _RSA_PRIVATE_KEY = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.BestAvailableEncryption(
            settings.ENCRYPTION_KEY.encode()[:32].ljust(32, b"_")[:32]
        ),
    ).decode()
    _RSA_PUBLIC_KEY = (
        key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )

    with open(priv_path, "w") as f:
        f.write(_RSA_PRIVATE_KEY)
    with open(pub_path, "w") as f:
        f.write(_RSA_PUBLIC_KEY)
    logger.info("Generated new RSA 4096-bit key pair at %s", settings.RSA_KEY_DIR)


def _get_jwt_key():
    global _RSA_PRIVATE_KEY_OBJ
    if settings.ALGORITHM.startswith("RS"):
        _ensure_rsa_keys()
        if _RSA_PRIVATE_KEY_OBJ is None:
            from cryptography.hazmat.primitives import serialization

            key_bytes = _RSA_PRIVATE_KEY.encode()
            key_password = settings.ENCRYPTION_KEY.encode()[:32].ljust(32, b"_")[:32]
            _RSA_PRIVATE_KEY_OBJ = serialization.load_pem_private_key(
                key_bytes, password=key_password
            )
        return _RSA_PRIVATE_KEY_OBJ
    return settings.SECRET_KEY


def _get_jwt_verify_key():
    if settings.ALGORITHM.startswith("RS"):
        _ensure_rsa_keys()
        return _RSA_PUBLIC_KEY
    return settings.SECRET_KEY


def _generate_jti() -> str:
    return secrets.token_urlsafe(16)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    to_encode["type"] = "access"
    to_encode["jti"] = _generate_jti()
    now = datetime.now(UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, _get_jwt_key(), algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    to_encode["type"] = "refresh"
    to_encode["jti"] = _generate_jti()
    now = datetime.now(UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, _get_jwt_key(), algorithm=settings.ALGORITHM)


def create_tokens_for_user(user) -> tuple:
    extra = {
        "email": user.email,
        "tenantId": user.tenantId if hasattr(user, "tenantId") else None,
        "isSuperuser": user.isSuperuser if hasattr(user, "isSuperuser") else False,
    }
    access_token = create_access_token(
        data={"sub": str(user.id), **extra},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id), **extra},
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    return access_token, refresh_token


def verify_token(token: str, expected_type: str = None) -> dict:
    try:
        unverified = jwt.get_unverified_header(token)
    except jwt.DecodeError:
        return None
    alg = unverified.get("alg", "")
    if alg != settings.ALGORITHM:
        return None
    supported = [settings.ALGORITHM]
    try:
        payload = jwt.decode(token, _get_jwt_verify_key(), algorithms=supported)
        if expected_type and payload.get("type") != expected_type:
            return None
        return payload
    except jwt.InvalidTokenError:
        return None


async def verify_token_with_blacklist(token: str, expected_type: str = None) -> dict:
    from app.core.cache import get_user_revoked_before, is_token_blacklisted

    payload = verify_token(token, expected_type)
    if payload is None:
        return None
    jti = payload.get("jti")
    if jti and await is_token_blacklisted(jti):
        return None

    # Bulk per-user revocation ("revoke all sessions"): reject any token issued
    # at/before the user's revoked_before timestamp.
    sub = payload.get("sub")
    if sub is not None:
        revoked_before = await get_user_revoked_before(sub)
        if revoked_before is not None:
            iat = payload.get("iat")
            # A missing iat cannot be proven to post-date the revocation, so
            # treat it as revoked.
            if iat is None or float(iat) < revoked_before:
                return None
    return payload


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
