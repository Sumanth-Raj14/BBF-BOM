from datetime import UTC, datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_superuser, get_current_user
from app.db.session import get_db
from app.integrations.crypto import encrypt_secret
from app.integrations.events import emit_integration_event
# _build_client/_mark_health/_sanitize_error are the same helpers the outbox
# worker uses to build provider clients, record connection health, and redact
# secrets/URLs from error text — reused here so the live "test connection"
# check and the delivery pipeline can never disagree about what's safe to
# persist/return.
from app.integrations.worker import _build_client, _mark_health, _sanitize_error, deliver_pending
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
                            db: AsyncSession = Depends(get_db), user: User = Depends(get_current_superuser)):
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
async def disconnect(provider: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_superuser)):
    row = (await db.execute(select(IntegrationConnection).where(
        IntegrationConnection.tenantId == user.tenantId,
        IntegrationConnection.provider == provider))).scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()
    return {"status": "disconnected"}


@router.post("/{provider}/test")
async def send_test(provider: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_superuser)):
    if provider not in _PROVIDERS:
        raise HTTPException(422, "unknown provider")
    # entity_id=0 + action="test" is a sentinel: the worker skips external-link creation
    # so a "Send test" never leaves a spurious integration_external_links row behind.
    n = await emit_integration_event(db, user.tenantId, "work_order", 0, "test",
                                     {"ref": "TEST", "title": "Connection test", "status": "open"})
    await db.commit()
    # Scope delivery to this tenant so a test never drains other tenants' pending rows.
    result = await deliver_pending(db, limit=5, tenant_id=user.tenantId)
    return {"enqueued": n, "delivery": result}


@router.post("/{provider}/test-connection")
async def test_connection(provider: str, db: AsyncSession = Depends(get_db),
                          user: User = Depends(get_current_superuser)):
    """Live, synchronous credential check — separate from `/test` (which enqueues
    a real delivery through the outbox pipeline for observability). This makes
    ONE lightweight authenticated call via the existing provider client and
    reports an honest ok/fail result immediately. It never returns the raw
    secret, and it never fabricates a success: a missing credential is reported
    as `not_configured`, not `ok`.
    """
    if provider not in _PROVIDERS:
        raise HTTPException(422, "unknown provider")
    row = (await db.execute(select(IntegrationConnection).where(
        IntegrationConnection.tenantId == user.tenantId,
        IntegrationConnection.provider == provider))).scalar_one_or_none()
    checked_at = datetime.now(UTC)

    if row is None or not row.auth:
        return {
            "provider": provider, "ok": False, "reason": "not_configured",
            "detail": "No credentials saved for this provider yet.",
            "checked_at": checked_at.isoformat(),
        }

    client = _build_client(row, provider)
    try:
        await client.verify()
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        reason = "auth_failed" if code in (401, 403) else "http_error"
        detail = f"Provider rejected the request (HTTP {code})."
        _mark_health(row, ok=False, error=_sanitize_error(e))
        await db.commit()
        return {"provider": provider, "ok": False, "reason": reason,
                "detail": detail, "checked_at": row.last_checked_at.isoformat()}
    except httpx.TimeoutException:
        _mark_health(row, ok=False, error="timeout")
        await db.commit()
        return {"provider": provider, "ok": False, "reason": "timeout",
                "detail": "Connection to the provider timed out.",
                "checked_at": row.last_checked_at.isoformat()}
    except httpx.HTTPError as e:
        err = _sanitize_error(e)
        _mark_health(row, ok=False, error=err)
        await db.commit()
        return {"provider": provider, "ok": False, "reason": "network_error",
                "detail": "Could not reach the provider.",
                "checked_at": row.last_checked_at.isoformat()}
    except Exception as e:  # noqa: BLE001 — never let an unexpected error leak raw secrets
        _mark_health(row, ok=False, error=_sanitize_error(e))
        await db.commit()
        return {"provider": provider, "ok": False, "reason": "error",
                "detail": "Connection check failed.",
                "checked_at": row.last_checked_at.isoformat()}

    _mark_health(row, ok=True)
    await db.commit()
    return {"provider": provider, "ok": True, "reason": "ok",
            "detail": "Credentials verified.", "checked_at": row.last_checked_at.isoformat()}


@router.get("/deliveries")
async def deliveries(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(IntegrationOutbox).where(
        IntegrationOutbox.tenantId == user.tenantId).order_by(
        IntegrationOutbox.id.desc()).limit(50))).scalars().all()
    return [{"id": r.id, "provider": r.provider, "entity_type": r.entity_type,
             "entity_id": r.entity_id, "action": r.action, "status": r.status,
             "attempts": r.attempts, "last_error": r.last_error} for r in rows]
