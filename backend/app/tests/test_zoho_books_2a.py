"""Increment 2a tests — Zoho Books OAuth connect flow + OUTBOUND sync (spec §4/§5/§6).

Covers, on a fresh SQLite DB (RLS is a no-op there, so app-layer isolation +
the delivery mechanics are exercised directly):

  * OAuth callback stores an ENCRYPTED credential blob (refresh token never at
    rest in plaintext) and clears the CSRF state;
  * outbound CREATE posts to Books and records an IntegrationExternalLink +
    ZohoSyncState + a push_create audit row;
  * outbound UPDATE uses the existing link (PUT, no duplicate create);
  * an UPDATE never pushes the Books-owned cost/pricing as authoritative;
  * an honest failure when the connector is disconnected (dead-letter, no fake
    success), and a disabled connector HOLDS its queued rows;
  * the producer respects config.enabled_entity_types.
"""

import time

import httpx
import pytest
from sqlalchemy import select

from app.integrations.crypto import decrypt_integration_secret
from app.integrations.events import emit_integration_event
from app.integrations.worker import deliver_pending
from app.integrations.zoho_client import ZohoBooksClient
from app.integrations.zoho_oauth import dump_auth_blob
from app.models.integration import (
    IntegrationConnection, IntegrationExternalLink, IntegrationOutbox,
)
from app.models.part import Part
from app.models.zoho_sync import ZohoSyncLog, ZohoSyncState


def _client(handler, *, org="org1"):
    """A ZohoBooksClient with a pre-cached (valid) access token so no live
    refresh is attempted, backed by a MockTransport."""
    return ZohoBooksClient(
        auth_blob={"access_token": "tok", "access_token_expires_at": time.time() + 3600},
        api_domain="https://api.test",
        organization_id=org,
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )


async def _enabled_conn(db, tid):
    conn = IntegrationConnection(
        tenantId=tid, provider="zoho_books", is_enabled=True, status="ok",
        config={"organization_id": "org1", "api_domain": "https://api.test", "region": "us"})
    db.add(conn)
    await db.commit()
    return conn


# --- OAuth ------------------------------------------------------------------

@pytest.mark.asyncio
async def test_oauth_callback_stores_encrypted_creds(db_session, test_tenant, tenant_id, monkeypatch):
    from app.api.endpoints import zoho_books as zb

    conn = IntegrationConnection(
        tenantId=tenant_id, provider="zoho_books",
        auth=dump_auth_blob({"client_id": "cid", "client_secret": "csecret"}),
        config={"region": "us", "redirect_uri": "https://app/cb", "oauth_state": "STATE123"})
    db_session.add(conn)
    await db_session.commit()

    async def fake_exchange(**kwargs):
        assert kwargs["code"] == "AUTHCODE"
        return {
            "refresh_token": "REFRESH_SECRET_XYZ",
            "access_token": "ACCESS_TOK",
            "expires_in": 3600,
            "api_domain": "https://www.zohoapis.com",
        }

    async def fake_orgs(self):
        return [{"organization_id": "org1", "name": "Acme"}]

    monkeypatch.setattr(zb, "exchange_code", fake_exchange)
    monkeypatch.setattr(ZohoBooksClient, "list_organizations", fake_orgs)

    body = await zb.oauth_callback(
        db=db_session, code="AUTHCODE", state="STATE123", error=None, location=None)
    assert body["status"] == "connected"
    assert body["organizations"][0]["organization_id"] == "org1"

    await db_session.refresh(conn)
    # Ciphertext at rest — the refresh token must NOT appear in plaintext.
    assert "REFRESH_SECRET_XYZ" not in (conn.auth or "")
    blob = eval_json(decrypt_integration_secret(conn.auth))
    assert blob["refresh_token"] == "REFRESH_SECRET_XYZ"
    assert blob["client_secret"] == "csecret"  # preserved from start
    # state consumed, api_domain persisted from the token response
    assert "oauth_state" not in conn.config
    assert conn.config["api_domain"] == "https://www.zohoapis.com"
    assert conn.status == "ok"


def eval_json(s):
    import json
    return json.loads(s)


# --- Outbound CREATE / UPDATE ----------------------------------------------

@pytest.mark.asyncio
async def test_outbound_create_posts_and_records_link(db_session, test_tenant, tenant_id):
    await _enabled_conn(db_session, tenant_id)
    part = Part(pn="PN-1", name="Widget", uom="EA", cost=12.5, tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()

    calls = []

    def handler(request):
        calls.append((request.method, request.url.path))
        return httpx.Response(200, json={"item": {"item_id": "ZI-100"}})

    db_session.add(IntegrationOutbox(
        tenantId=tenant_id, provider="zoho_books", entity_type="part", entity_id=part.id,
        action="created",
        payload={"pn": "PN-1", "name": "Widget", "uom": "EA", "cost": 12.5}, status="pending"))
    await db_session.commit()

    res = await deliver_pending(db_session, clients={"zoho_books": _client(handler)})
    assert res["sent"] == 1
    assert any(m == "POST" and p.endswith("/items") for m, p in calls)

    link = (await db_session.execute(select(IntegrationExternalLink).where(
        IntegrationExternalLink.entity_type == "part"))).scalar_one()
    assert link.external_id == "ZI-100"
    st = (await db_session.execute(select(ZohoSyncState).where(
        ZohoSyncState.entity_id == part.id))).scalar_one()
    assert st.status == "in_sync"
    assert st.external_id == "ZI-100"
    log = (await db_session.execute(select(ZohoSyncLog))).scalars().all()
    assert any(x.event == "push_create" and x.actor == "system-sync" for x in log)


@pytest.mark.asyncio
async def test_outbound_update_uses_link_no_duplicate_create(db_session, test_tenant, tenant_id):
    await _enabled_conn(db_session, tenant_id)
    part = Part(pn="PN-2", name="Gadget", uom="EA", cost=5.0, tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    # A link already exists -> this is an update.
    db_session.add(IntegrationExternalLink(
        tenantId=tenant_id, provider="zoho_books", entity_type="part",
        entity_id=part.id, external_id="ZI-200"))
    await db_session.commit()

    calls = []
    bodies = []

    def handler(request):
        calls.append((request.method, request.url.path))
        if request.content:
            bodies.append(eval_json(request.content))
        return httpx.Response(200, json={"item": {"item_id": "ZI-200"}})

    db_session.add(IntegrationOutbox(
        tenantId=tenant_id, provider="zoho_books", entity_type="part", entity_id=part.id,
        action="updated",
        payload={"pn": "PN-2", "name": "Gadget X", "uom": "EA", "cost": 99.99}, status="pending"))
    await db_session.commit()

    res = await deliver_pending(db_session, clients={"zoho_books": _client(handler)})
    assert res["sent"] == 1
    # PUT to the linked id, and NO create POST.
    assert any(m == "PUT" and p.endswith("/items/ZI-200") for m, p in calls)
    assert not any(m == "POST" for m, p in calls)
    # Exactly one link — no duplicate created.
    links = (await db_session.execute(select(IntegrationExternalLink).where(
        IntegrationExternalLink.entity_type == "part"))).scalars().all()
    assert len(links) == 1


@pytest.mark.asyncio
async def test_update_does_not_push_books_owned_cost(db_session, test_tenant, tenant_id):
    await _enabled_conn(db_session, tenant_id)
    part = Part(pn="PN-3", name="Bolt", uom="EA", cost=3.0, tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    db_session.add(IntegrationExternalLink(
        tenantId=tenant_id, provider="zoho_books", entity_type="part",
        entity_id=part.id, external_id="ZI-300"))
    await db_session.commit()

    bodies = []

    def handler(request):
        if request.content:
            bodies.append(eval_json(request.content))
        return httpx.Response(200, json={"item": {"item_id": "ZI-300"}})

    db_session.add(IntegrationOutbox(
        tenantId=tenant_id, provider="zoho_books", entity_type="part", entity_id=part.id,
        action="updated",
        payload={"pn": "PN-3", "name": "Bolt", "cost": 250.0}, status="pending"))
    await db_session.commit()

    await deliver_pending(db_session, clients={"zoho_books": _client(handler)})
    assert bodies, "expected an update body"
    put_body = bodies[-1]
    # Field ownership: an update must not push Books-owned cost/pricing.
    assert "purchase_rate" not in put_body
    assert "rate" not in put_body
    # Tool-owned identity IS pushed.
    assert put_body.get("sku") == "PN-3"


# --- Honesty / kill switch / allowlist --------------------------------------

@pytest.mark.asyncio
async def test_disconnected_is_honest_failure(db_session, test_tenant, tenant_id):
    # No zoho connection exists at all -> dead-letter, never a fake success.
    db_session.add(IntegrationOutbox(
        tenantId=tenant_id, provider="zoho_books", entity_type="part", entity_id=1,
        action="created", payload={"pn": "X", "name": "X"}, status="pending"))
    await db_session.commit()

    res = await deliver_pending(db_session)  # no injected client
    assert res["dead"] == 1
    row = (await db_session.execute(select(IntegrationOutbox))).scalar_one()
    assert row.status == "dead"
    assert row.last_error == "no enabled connection"


@pytest.mark.asyncio
async def test_disabled_connection_holds_rows(db_session, test_tenant, tenant_id):
    # A connection exists but is DISABLED -> queued rows are held, not dead.
    db_session.add(IntegrationConnection(
        tenantId=tenant_id, provider="zoho_books", is_enabled=False, config={}))
    db_session.add(IntegrationOutbox(
        tenantId=tenant_id, provider="zoho_books", entity_type="vendor", entity_id=1,
        action="created", payload={"name": "V"}, status="pending"))
    await db_session.commit()

    res = await deliver_pending(db_session)
    assert res["dead"] == 0
    row = (await db_session.execute(select(IntegrationOutbox))).scalar_one()
    assert row.status == "pending"
    assert row.last_error == "connection disabled"


@pytest.mark.asyncio
async def test_enabled_entity_types_respected(db_session, test_tenant, tenant_id):
    db_session.add(IntegrationConnection(
        tenantId=tenant_id, provider="zoho_books", is_enabled=True,
        config={"enabled_entity_types": ["vendor"]}))
    await db_session.commit()

    # 'part' is NOT in the allowlist -> no outbox row emitted.
    n_part = await emit_integration_event(db_session, tenant_id, "part", 1, "created", {"pn": "P"})
    await db_session.commit()
    assert n_part == 0

    # 'vendor' IS allowed -> one row.
    n_vendor = await emit_integration_event(db_session, tenant_id, "vendor", 1, "created", {"name": "V"})
    await db_session.commit()
    assert n_vendor == 1

    rows = (await db_session.execute(select(IntegrationOutbox))).scalars().all()
    assert len(rows) == 1 and rows[0].entity_type == "vendor"
