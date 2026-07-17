"""Column-level encryption helpers using pgcrypto and Fernet."""

import base64
import hashlib
import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _validate_identifier(name: str):
    """Validate that a name is a safe SQL identifier (no injection risk)."""
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid SQL identifier: {name!r}")
    return name


def _get_fernet():
    from cryptography.fernet import Fernet

    raw_key = settings.ENCRYPTION_KEY
    if not raw_key:
        raise ValueError("ENCRYPTION_KEY is not configured. Set it in .env or via VAULT.")
    raw = hashlib.sha256(raw_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def fernet_encrypt(value: str) -> str:
    if not value:
        return value
    return _get_fernet().encrypt(value.encode()).decode()


def fernet_decrypt(value: str) -> str:
    if not value:
        return value
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except Exception as e:
        raise ValueError(f"Decryption failed: {e}") from e


class EncryptionError(Exception):
    """Raised when encryption or decryption fails."""


async def encrypt_column(db: AsyncSession, value: str) -> str:
    """Encrypt a string value using pgcrypto."""
    if not value:
        return value
    result = await db.execute(
        text("SELECT encode(pgp_sym_encrypt(:val, :key), 'base64')"),
        {"val": value, "key": settings.ENCRYPTION_KEY[:32]},
    )
    row = result.scalar()
    if not row:
        raise EncryptionError("pgcrypto encryption returned empty result")
    return row


async def decrypt_column(db: AsyncSession, encrypted_value: str) -> str:
    """Decrypt a pgcrypto-encrypted string value."""
    if not encrypted_value:
        return encrypted_value
    try:
        result = await db.execute(
            text("SELECT pgp_sym_decrypt(decode(:val, 'base64'), :key)"),
            {"val": encrypted_value, "key": settings.ENCRYPTION_KEY[:32]},
        )
        row = result.scalar()
        if not row:
            raise EncryptionError("pgcrypto decryption returned empty result")
        return row
    except Exception as e:
        raise EncryptionError(f"Decryption failed: {e}") from e


async def encrypt_sensitive_fields(db: AsyncSession, table: str, row_id: int, fields: list[str]):
    """Encrypt specified fields in a row with tenant isolation."""
    from app.core.tenant_context import tenant_sql_clause

    table = _validate_identifier(table)
    tc, tp = tenant_sql_clause()
    for field in fields:
        field = _validate_identifier(field)
        result = await db.execute(
            text(f'SELECT "{field}" FROM {table} WHERE id = :id {tc}'),
            {**tp, "id": row_id},
        )
        value = result.scalar()
        if value:
            encrypted = await encrypt_column(db, value)
            await db.execute(
                text(f'UPDATE {table} SET "{field}" = :encrypted WHERE id = :id {tc}'),
                {**tp, "encrypted": encrypted, "id": row_id},
            )
    await db.commit()


async def decrypt_sensitive_fields(
    db: AsyncSession, table: str, row_id: int, fields: list[str]
) -> dict:
    """Decrypt specified fields in a row and return them with tenant isolation."""
    from app.core.tenant_context import tenant_sql_clause

    table = _validate_identifier(table)
    tc, tp = tenant_sql_clause()
    decrypted = {}
    for field in fields:
        field = _validate_identifier(field)
        result = await db.execute(
            text(f'SELECT "{field}" FROM {table} WHERE id = :id {tc}'),
            {**tp, "id": row_id},
        )
        value = result.scalar()
        if value:
            decrypted[field] = await decrypt_column(db, value)
        else:
            decrypted[field] = value
    return decrypted
