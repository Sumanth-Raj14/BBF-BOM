"""
API Key Management
Create, list, rotate, revoke API keys.
"""

import secrets
from datetime import UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.user import User

router = APIRouter()


class ApiKeyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    expires_in_days: Optional[int] = None
    scopes: Optional[list] = None


@router.get("/")
async def list_api_keys(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    r = await db.execute(
        text(
            "SELECT id, name, description, key_prefix, scopes, is_active, expires_at, last_used_at, created_at FROM api_keys WHERE user_id = :uid ORDER BY created_at DESC"
        ),
        {"uid": user.id},
    )
    return [dict(row) for row in r.mappings().all()]


@router.post("/")
async def create_api_key(
    body: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    raw_key = f"bkb_{secrets.token_urlsafe(32)}"
    key_prefix = raw_key.split("_")[0]
    key_hash = get_password_hash(raw_key)

    expires_at_val = None
    if body.expires_in_days:
        from datetime import datetime, timedelta

        expires_at_val = datetime.now(UTC) + timedelta(days=body.expires_in_days)

    import json

    scopes_json = json.dumps(body.scopes or ["read", "write"])

    await db.execute(
        text(
            "INSERT INTO api_keys (user_id, name, description, key_hash, key_prefix, scopes, expires_at) VALUES (:uid, :name, :desc, :kh, :kp, :scopes::json, :expires_at)"
        ),
        {
            "uid": user.id,
            "name": body.name,
            "desc": body.description,
            "kh": key_hash,
            "kp": key_prefix,
            "scopes": scopes_json,
            "expires_at": expires_at_val,
        },
    )
    await db.commit()
    return {
        "key": raw_key,
        "api_key": raw_key,
        "key_prefix": key_prefix,
        "message": "Save this key - it will not be shown again",
    }


@router.post("/{key_id}/rotate")
async def rotate_api_key(
    key_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    existing = await db.execute(
        text("SELECT * FROM api_keys WHERE id = :id AND user_id = :uid"),
        {"id": key_id, "uid": user.id},
    )
    if not existing.mappings().first():
        raise HTTPException(404, "API key not found")

    raw_key = f"bkb_{secrets.token_urlsafe(32)}"
    key_prefix = raw_key.split("_")[0]
    key_hash = get_password_hash(raw_key)

    await db.execute(
        text(
            "UPDATE api_keys SET key_hash = :kh, key_prefix = :kp, updated_at = NOW() WHERE id = :id"
        ),
        {"kh": key_hash, "kp": key_prefix, "id": key_id},
    )
    await db.commit()
    return {
        "key": raw_key,
        "api_key": raw_key,
        "key_prefix": key_prefix,
        "message": "Key rotated. Old key is now invalid.",
    }


@router.delete("/{key_id}")
async def revoke_api_key(
    key_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        text("UPDATE api_keys SET is_active = false WHERE id = :id AND user_id = :uid"),
        {"id": key_id, "uid": user.id},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(404, "API key not found")
    return {"status": "revoked"}
