"""Zoho Books connector — OAuth connect flow + outbound sync API (increment 2a).

Per-tenant, superuser-gated (except the read-only status/mappings views),
mounted under `/integrations/zoho_books`. Reuses the existing
`IntegrationConnection(provider='zoho_books')` row for credentials/config and
the existing outbox pipeline for delivery.

Honesty posture matches the rest of `/integrations`: secrets are never echoed
(`auth` is encrypted and redacted), a missing/invalid credential surfaces as an
explicit failure rather than a fabricated success, and inbound-only features
(pull/reconcile/conflicts) return an explicit "not implemented in this
increment" rather than pretending to work.
"""

import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_superuser, get_current_user
from app.db.session import get_db
from app.integrations.events import emit_integration_event
from app.integrations.worker import _sanitize_error, deliver_pending
from app.integrations.zoho_client import ZohoBooksClient
from app.integrations.zoho_oauth import (
    ZOHO_DC,
    accounts_host,
    dump_auth_blob,
    exchange_code,
    load_auth_blob,
    revoke_refresh_token,
)
from app.integrations.zoho_snapshots import part_snapshot, po_snapshot, vendor_snapshot
from app.models.integration import IntegrationConnection, IntegrationExternalLink
from app.models.part import Part
from app.models.po_models import POHeader
from app.models.user import User
from app.models.vendor import Vendor
from app.models.zoho_sync import ZohoSyncCursor, ZohoSyncState

router = APIRouter()

PROVIDER = "zoho_books"

# Least-privilege default scopes (spec §5). The exact Items read+write scope
# string needs live-sandbox confirmation (§10-P) — override via the start body
# if the console reports a different string. `fullaccess.all` is intentionally
# avoided.
DEFAULT_SCOPES = [
    "ZohoBooks.contacts.ALL",
    "ZohoBooks.purchaseorders.ALL",
    "ZohoBooks.items.ALL",
    "ZohoBooks.settings.READ",
    "ZohoBooks.bills.READ",
]

_ENTITY_TYPES = {"part", "vendor", "purchase_order"}


class OAuthStartRequest(BaseModel):
    region: str
    client_id: str
    client_secret: str
    redirect_uri: str
    scopes: list[str] | None = None


class SelectOrgRequest(BaseModel):
    organization_id: str


async def _get_conn(db: AsyncSession, tenant_id: int) -> IntegrationConnection | None:
    return (await db.execute(select(IntegrationConnection).where(
        IntegrationConnection.tenantId == tenant_id,
        IntegrationConnection.provider == PROVIDER))).scalar_one_or_none()


# --- OAuth connect flow -----------------------------------------------------

@router.post("/oauth/start")
async def oauth_start(
    body: OAuthStartRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_superuser),
):
    """Build the region-aware Zoho consent URL and stash the app client
    credentials (encrypted) + a CSRF state token on the connection.

    `prompt=consent` is sent only when no refresh token exists yet, so a routine
    reconnect does not churn the 20-tokens-per-user cap (spec §5); a prior
    refresh token is revoked first."""
    region = (body.region or "").lower()
    if region not in ZOHO_DC:
        raise HTTPException(422, "unknown region")

    conn = await _get_conn(db, user.tenantId)
    if conn is None:
        conn = IntegrationConnection(tenantId=user.tenantId, provider=PROVIDER)
        db.add(conn)

    # Reconnect hygiene: revoke the previous refresh token before minting a new
    # one (best-effort — a dead token failing to revoke must not block connect).
    prior = load_auth_blob(conn.auth) if conn.auth else {}
    has_refresh = bool(prior.get("refresh_token"))
    if has_refresh:
        try:
            await revoke_refresh_token(refresh_token=prior["refresh_token"], region=region)
        except Exception:  # noqa: BLE001 — revoke is best-effort
            pass

    state = secrets.token_urlsafe(24)
    scopes = body.scopes or DEFAULT_SCOPES

    # Persist the app client credentials now (encrypted); the refresh token is
    # merged in at callback. Never store secrets in the non-secret config.
    conn.auth = dump_auth_blob({
        "client_id": body.client_id,
        "client_secret": body.client_secret,
    })
    cfg = dict(conn.config or {})
    cfg.update({
        "region": region,
        "scopes": scopes,
        "redirect_uri": body.redirect_uri,
        "oauth_state": state,
    })
    conn.config = cfg
    conn.status = "unconfigured"
    await db.commit()

    params = {
        "response_type": "code",
        "access_type": "offline",
        "client_id": body.client_id,
        "scope": ",".join(scopes),
        "redirect_uri": body.redirect_uri,
        "state": state,
    }
    if not has_refresh:
        params["prompt"] = "consent"
    authorize_url = f"{accounts_host(region)}/oauth/v2/auth?{urlencode(params)}"
    return {"authorize_url": authorize_url}


@router.get("/oauth/callback")
async def oauth_callback(
    db: AsyncSession = Depends(get_db),
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    location: str | None = Query(None),
):
    """Handle the Zoho redirect: validate `state`, exchange the code, and store
    the encrypted credential blob + api_domain/location on the connection. Runs
    WITHOUT an auth dependency (it is a browser redirect) — the tenant is
    resolved by matching the opaque `state` token stashed at start.

    Never echoes secrets; returns the org list for the select-organization step.
    """
    if error:
        raise HTTPException(400, f"authorization denied: {error}")
    if not code or not state:
        raise HTTPException(400, "missing code/state")

    # No auth => no tenant context => the app-layer SELECT filter is inert, so
    # this returns candidates across tenants; match the state token in Python.
    conns = (await db.execute(select(IntegrationConnection).where(
        IntegrationConnection.provider == PROVIDER))).scalars().all()
    conn = next((c for c in conns if (c.config or {}).get("oauth_state") == state), None)
    if conn is None:
        raise HTTPException(400, "invalid state")

    cfg = dict(conn.config or {})
    region = cfg.get("region")
    blob = load_auth_blob(conn.auth) if conn.auth else {}
    if not blob.get("client_id") or not blob.get("client_secret"):
        raise HTTPException(400, "connection not initialized")

    try:
        tokens = await exchange_code(
            code=code,
            client_id=blob["client_id"],
            client_secret=blob["client_secret"],
            redirect_uri=cfg.get("redirect_uri"),
            region=region,
        )
    except Exception as e:  # noqa: BLE001 — never leak the code/secret in the error
        raise HTTPException(400, f"token exchange failed: {_sanitize_error(e)}")

    if not tokens.get("refresh_token"):
        raise HTTPException(400, "no refresh_token returned")

    import time

    blob.update({
        "refresh_token": tokens["refresh_token"],
        "access_token": tokens.get("access_token"),
        "access_token_expires_at": time.time() + float(tokens.get("expires_in", 3600)),
    })
    conn.auth = dump_auth_blob(blob)

    # Persist api_domain/location from the response, never hardcode (spec §5).
    if tokens.get("api_domain"):
        cfg["api_domain"] = tokens["api_domain"]
    if tokens.get("location") or location:
        cfg["location"] = tokens.get("location") or location
    cfg.pop("oauth_state", None)
    conn.config = cfg
    conn.status = "ok"
    await db.commit()

    # Creds are safely stored; org listing is best-effort so a Books hiccup here
    # doesn't lose the just-minted credentials.
    organizations: list[dict] = []
    try:
        client = ZohoBooksClient.from_connection(conn)
        organizations = await client.list_organizations()
    except Exception:  # noqa: BLE001
        organizations = []

    return {
        "status": "connected",
        "organizations": [
            {"organization_id": o.get("organization_id"), "name": o.get("name")}
            for o in organizations
        ],
    }


@router.get("/organizations")
async def list_organizations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_superuser),
):
    """List the Books organizations for the connected tenant (spec §5)."""
    conn = await _get_conn(db, user.tenantId)
    if conn is None or not conn.auth:
        raise HTTPException(400, "not connected")
    client = ZohoBooksClient.from_connection(conn)
    try:
        orgs = await client.list_organizations()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"could not list organizations: {_sanitize_error(e)}")
    return {"organizations": [
        {"organization_id": o.get("organization_id"), "name": o.get("name")} for o in orgs
    ]}


@router.post("/select-organization")
async def select_organization(
    body: SelectOrgRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_superuser),
):
    """Persist the chosen `organization_id` into the connection config (spec
    §5). Does NOT auto-enable — the admin still runs test-connection first."""
    conn = await _get_conn(db, user.tenantId)
    if conn is None or not conn.auth:
        raise HTTPException(400, "not connected")
    cfg = dict(conn.config or {})
    cfg["organization_id"] = body.organization_id
    conn.config = cfg
    await db.commit()
    return {"organization_id": body.organization_id, "is_enabled": bool(conn.is_enabled)}


# --- Sync (outbound) + status ----------------------------------------------

async def _load_snapshot(db, entity_type, entity_id):
    if entity_type == "part":
        obj = (await db.execute(select(Part).where(Part.id == entity_id))).scalar_one_or_none()
        return part_snapshot(obj) if obj else None
    if entity_type == "vendor":
        obj = (await db.execute(select(Vendor).where(Vendor.id == entity_id))).scalar_one_or_none()
        return vendor_snapshot(obj) if obj else None
    obj = (await db.execute(select(POHeader).where(POHeader.id == entity_id))).scalar_one_or_none()
    return po_snapshot(obj) if obj else None


@router.post("/sync/{entity_type}")
async def trigger_sync(
    entity_type: str,
    entity_id: int | None = Query(None),
    direction: str = Query("push"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_superuser),
):
    """Manual outbound sync trigger (spec §6). `direction=push` only in this
    increment; `pull`/`both` and `mode=reconcile` are inbound (increment 2b) and
    return an explicit 501 rather than a fake success.

    With an `entity_id`, enqueues that one entity; without, flushes this
    tenant's pending outbox rows. Delivery is scoped to the caller's tenant.
    """
    if entity_type not in _ENTITY_TYPES:
        raise HTTPException(422, "unknown entity_type")
    if direction != "push":
        raise HTTPException(501, "only direction=push is implemented in this increment")

    conn = await _get_conn(db, user.tenantId)
    if conn is None or not conn.is_enabled:
        raise HTTPException(400, "zoho_books is not connected/enabled")

    enqueued = 0
    if entity_id is not None:
        snap = await _load_snapshot(db, entity_type, entity_id)
        if snap is None:
            raise HTTPException(404, f"{entity_type} {entity_id} not found")
        enqueued = await emit_integration_event(
            db, user.tenantId, entity_type, entity_id, "manual_sync", snap)
        await db.commit()

    result = await deliver_pending(db, limit=50, tenant_id=user.tenantId)
    return {"enqueued": enqueued, "delivery": result}


@router.get("/sync/status")
async def sync_status(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Per-entity cursor + sync-state rollup for this tenant (spec §6)."""
    cursors = (await db.execute(select(ZohoSyncCursor).where(
        ZohoSyncCursor.tenantId == user.tenantId))).scalars().all()
    states = (await db.execute(select(ZohoSyncState).where(
        ZohoSyncState.tenantId == user.tenantId))).scalars().all()

    by_entity: dict[str, dict] = {}
    for s in states:
        b = by_entity.setdefault(s.entity_type, {"total": 0, "by_status": {}})
        b["total"] += 1
        b["by_status"][s.status] = b["by_status"].get(s.status, 0) + 1

    return {
        "cursors": [
            {
                "entity_type": c.entity_type,
                "high_water": c.high_water,
                "last_run_at": c.last_run_at.isoformat() if c.last_run_at else None,
                "last_run_status": c.last_run_status,
                "records_seen": c.records_seen,
            }
            for c in cursors
        ],
        "entities": by_entity,
    }


@router.get("/mappings/{entity_type}")
async def list_mappings(
    entity_type: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Read-only bom<->zoho id map + per-record sync state (spec §6)."""
    if entity_type not in _ENTITY_TYPES:
        raise HTTPException(422, "unknown entity_type")
    links = (await db.execute(select(IntegrationExternalLink).where(
        IntegrationExternalLink.tenantId == user.tenantId,
        IntegrationExternalLink.provider == PROVIDER,
        IntegrationExternalLink.entity_type == entity_type))).scalars().all()
    states = {
        s.entity_id: s
        for s in (await db.execute(select(ZohoSyncState).where(
            ZohoSyncState.tenantId == user.tenantId,
            ZohoSyncState.entity_type == entity_type))).scalars().all()
    }
    out = []
    for link in links:
        st = states.get(link.entity_id)
        out.append({
            "entity_id": link.entity_id,
            "external_id": link.external_id,
            "external_url": link.external_url,
            "status": st.status if st else None,
            "last_synced_at": st.last_synced_at.isoformat() if st and st.last_synced_at else None,
        })
    return {"entity_type": entity_type, "mappings": out}
