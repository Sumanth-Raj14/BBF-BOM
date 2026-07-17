from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.integrations.crypto import encrypt_secret
from app.integrations.events import emit_integration_event
from app.integrations.worker import deliver_pending
from app.models.integration import IntegrationConnection, IntegrationOutbox
from app.models.user import User

router = APIRouter()

_PROVIDERS = {"clickup", "cliq"}


class ConnectionUpsert(BaseModel):
    token: Optional[str] = None       # clickup token OR cliq webhook url
    config: Optional[dict] = None
    is_enabled: Optional[bool] = None


def _public(c: IntegrationConnection) -> dict:
    return {
        "provider": c.provider,
        "is_enabled": bool(c.is_enabled),
        "status": c.status,
        "last_error": c.last_error,
        "has_credentials": bool(c.auth),
        "config": c.config or {},
    }


@router.get("/")
async def list_connections(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(IntegrationConnection).where(
        IntegrationConnection.tenantId == user.tenantId))).scalars().all()
    return [_public(c) for c in rows]


@router.put("/{provider}")
async def upsert_connection(provider: str, body: ConnectionUpsert,
                            db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if provider not in _PROVIDERS:
        raise HTTPException(422, "unknown provider")
    row = (await db.execute(select(IntegrationConnection).where(
        IntegrationConnection.tenantId == user.tenantId,
        IntegrationConnection.provider == provider))).scalar_one_or_none()
    if row is None:
        row = IntegrationConnection(tenantId=user.tenantId, provider=provider)
        db.add(row)
    if body.token is not None:
        row.auth = encrypt_secret(body.token)
    if body.config is not None:
        row.config = body.config
    if body.is_enabled is not None:
        row.is_enabled = body.is_enabled
    row.status = "ok" if row.auth else "unconfigured"
    await db.commit()
    return _public(row)


@router.delete("/{provider}")
async def disconnect(provider: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = (await db.execute(select(IntegrationConnection).where(
        IntegrationConnection.tenantId == user.tenantId,
        IntegrationConnection.provider == provider))).scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()
    return {"status": "disconnected"}


@router.post("/{provider}/test")
async def send_test(provider: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if provider not in _PROVIDERS:
        raise HTTPException(422, "unknown provider")
    n = await emit_integration_event(db, user.tenantId, "work_order", 0, "test",
                                     {"ref": "TEST", "title": "Connection test", "status": "open"})
    await db.commit()
    result = await deliver_pending(db, limit=5)
    return {"enqueued": n, "delivery": result}


@router.get("/deliveries")
async def deliveries(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(IntegrationOutbox).where(
        IntegrationOutbox.tenantId == user.tenantId).order_by(
        IntegrationOutbox.id.desc()).limit(50))).scalars().all()
    return [{"id": r.id, "provider": r.provider, "entity_type": r.entity_type,
             "entity_id": r.entity_id, "action": r.action, "status": r.status,
             "attempts": r.attempts, "last_error": r.last_error} for r in rows]
