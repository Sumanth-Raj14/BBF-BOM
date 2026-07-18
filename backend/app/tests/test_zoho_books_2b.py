"""Increment 2b tests — Zoho Books INBOUND poll + CONFLICT engine + reconciliation
(spec §4.4/§4.5/§4.6). Fresh SQLite (RLS is a no-op there, so app-layer tenant
isolation + the conflict spine are exercised directly).

Conflict matrix (the load-bearing cases):
  * inbound cost pull APPLIES when only Books changed (Books wins);
  * a Books-side IDENTITY change is IGNORED (tool wins, local untouched);
  * a TRUE two-sided monetary change is ROUTED to the review queue
    (ZohoSyncLog status='conflict') and local is NOT overwritten;
  * resolving a conflict re-baselines so it does not re-detect;
  * natural-key reconciliation links unique matches with NO Books POST, and
    sends ambiguous/duplicate-key matches to review;
  * the high-water cursor advances; two tenants' inbound never cross;
  * a disconnected client is an honest failure (cursor error, no fake success).
"""

import time
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContext
from app.integrations.zoho_client import ZohoBooksClient
from app.integrations.zoho_inbound import (
    poll_connection,
    poll_zoho_inbound_once,
    reconcile_connection,
    resolve_conflict,
)
from app.models.integration import IntegrationConnection, IntegrationExternalLink
from app.models.part import Part
from app.models.tenant import Tenant
from app.models.zoho_sync import ZohoSyncCursor, ZohoSyncLog, ZohoSyncState


def _client(handler, *, org="org1"):
    return ZohoBooksClient(
        auth_blob={"access_token": "tok", "access_token_expires_at": time.time() + 3600},
        api_domain="https://api.test", organization_id=org,
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def _items_page(records, calls=None):
    def handler(request):
        if calls is not None:
            calls.append((request.method, request.url.path))
        return httpx.Response(
            200, json={"items": records, "page_context": {"has_more_page": False}})
    return handler


async def _enabled_conn(db, tid):
    conn = IntegrationConnection(
        tenantId=tid, provider="zoho_books", is_enabled=True, status="ok",
        config={"organization_id": "org1", "api_domain": "https://api.test", "region": "us"})
    db.add(conn)
    await db.commit()
    return conn


async def _linked_part(db, tid, *, pn, name, cost, external_id, base_cost):
    """A local Part with an external link and a seeded ZohoSyncState baseline."""
    part = Part(pn=pn, name=name, uom="EA", cost=Decimal(str(cost)), tenantId=tid)
    db.add(part)
    await db.commit()
    db.add(IntegrationExternalLink(
        tenantId=tid, provider="zoho_books", entity_type="part",
        entity_id=part.id, external_id=external_id))
    db.add(ZohoSyncState(
        tenantId=tid, entity_type="part", entity_id=part.id, external_id=external_id,
        last_cost=Decimal(str(base_cost)), status="in_sync", last_direction="outbound"))
    await db.commit()
    return part


# --- conflict matrix --------------------------------------------------------

@pytest.mark.asyncio
async def test_inbound_cost_pull_applies_books_only_change(db_session, test_tenant, tenant_id):
    conn = await _enabled_conn(db_session, tenant_id)
    part = await _linked_part(db_session, tenant_id, pn="PN-1", name="Widget",
                              cost=10, external_id="ZI-1", base_cost=10)

    # Books changed purchase_rate 10 -> 25; local unchanged (10 == baseline).
    handler = _items_page([{"item_id": "ZI-1", "sku": "PN-1",
                            "purchase_rate": 25, "last_modified_time": "2026-07-18T10:00:00-0700"}])
    await poll_connection(db_session, conn, _client(handler), entity_types=["part"])

    await db_session.refresh(part)
    assert part.cost == Decimal("25")             # Books wins
    st = (await db_session.execute(select(ZohoSyncState).where(
        ZohoSyncState.entity_id == part.id))).scalar_one()
    assert st.status == "in_sync"
    assert st.last_cost == Decimal("25")          # baseline advanced
    logs = (await db_session.execute(select(ZohoSyncLog))).scalars().all()
    assert any(x.event == "pull_update" and x.actor == "system-sync" for x in logs)
    assert not any(x.event == "conflict_detected" for x in logs)


@pytest.mark.asyncio
async def test_inbound_identity_change_ignored_tool_wins(db_session, test_tenant, tenant_id):
    conn = await _enabled_conn(db_session, tenant_id)
    part = await _linked_part(db_session, tenant_id, pn="PN-2", name="LocalName",
                              cost=10, external_id="ZI-2", base_cost=10)

    # Books changed identity (sku/name) but NOT cost. Identity is tool-owned.
    handler = _items_page([{"item_id": "ZI-2", "sku": "BOOKS-SKU", "name": "BooksName",
                            "purchase_rate": 10, "last_modified_time": "2026-07-18T11:00:00-0700"}])
    await poll_connection(db_session, conn, _client(handler), entity_types=["part"])

    await db_session.refresh(part)
    assert part.pn == "PN-2"        # unchanged (tool wins)
    assert part.name == "LocalName"  # unchanged (tool wins)
    logs = (await db_session.execute(select(ZohoSyncLog))).scalars().all()
    assert not any(x.event == "conflict_detected" for x in logs)


@pytest.mark.asyncio
async def test_true_money_conflict_routes_to_review_and_preserves_local(
        db_session, test_tenant, tenant_id):
    conn = await _enabled_conn(db_session, tenant_id)
    # baseline 10; LOCAL changed to 99; BOOKS changed to 25 -> both sides moved.
    part = await _linked_part(db_session, tenant_id, pn="PN-3", name="Bolt",
                              cost=99, external_id="ZI-3", base_cost=10)

    handler = _items_page([{"item_id": "ZI-3", "sku": "PN-3",
                            "purchase_rate": 25, "last_modified_time": "2026-07-18T12:00:00-0700"}])
    await poll_connection(db_session, conn, _client(handler), entity_types=["part"])

    await db_session.refresh(part)
    # Local is NOT overwritten while the conflict is pending.
    assert part.cost == Decimal("99")

    st = (await db_session.execute(select(ZohoSyncState).where(
        ZohoSyncState.entity_id == part.id))).scalar_one()
    assert st.status == "conflict"
    assert st.last_cost == Decimal("10")   # baseline NOT advanced

    conflicts = (await db_session.execute(select(ZohoSyncLog).where(
        ZohoSyncLog.event == "conflict_detected"))).scalars().all()
    assert len(conflicts) == 1
    c = conflicts[0]
    assert c.status == "conflict"
    # Canonical fixed 4-dp money serialization (spec §2).
    assert c.field_diffs["cost"] == {"base": "10.0000", "local": "99.0000", "zoho": "25.0000"}


@pytest.mark.asyncio
async def test_conflict_resolution_rebaselines_no_redetect(db_session, test_tenant, tenant_id):
    conn = await _enabled_conn(db_session, tenant_id)
    part = await _linked_part(db_session, tenant_id, pn="PN-4", name="Nut",
                              cost=99, external_id="ZI-4", base_cost=10)
    rec = {"item_id": "ZI-4", "sku": "PN-4", "purchase_rate": 25,
           "last_modified_time": "2026-07-18T12:00:00-0700"}

    await poll_connection(db_session, conn, _client(_items_page([rec])), entity_types=["part"])
    conflict = (await db_session.execute(select(ZohoSyncLog).where(
        ZohoSyncLog.event == "conflict_detected"))).scalar_one()

    # Resolve books_wins: apply Books value + re-baseline.
    await resolve_conflict(db_session, tenant_id, conflict.id, "books_wins", resolved_by=1)
    await db_session.commit()

    await db_session.refresh(part)
    assert part.cost == Decimal("25")
    st = (await db_session.execute(select(ZohoSyncState).where(
        ZohoSyncState.entity_id == part.id))).scalar_one()
    assert st.status == "in_sync"
    assert st.last_cost == Decimal("25")

    # A second poll of the SAME Books value must NOT re-detect the conflict.
    await poll_connection(db_session, conn, _client(_items_page([rec])), entity_types=["part"])
    open_conflicts = (await db_session.execute(select(ZohoSyncLog).where(
        ZohoSyncLog.event == "conflict_detected",
        ZohoSyncLog.resolution.is_(None)))).scalars().all()
    assert open_conflicts == []


# --- reconciliation ---------------------------------------------------------

@pytest.mark.asyncio
async def test_reconcile_links_unique_match_no_books_post(db_session, test_tenant, tenant_id):
    conn = await _enabled_conn(db_session, tenant_id)
    part = Part(pn="ABC", name="Alpha", uom="EA", cost=Decimal("5"), tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()

    calls = []
    handler = _items_page([{"item_id": "ZI-9", "sku": "ABC", "purchase_rate": 5,
                            "last_modified_time": "2026-07-18T09:00:00-0700"}], calls=calls)
    res = await reconcile_connection(db_session, conn, _client(handler), entity_types=["part"])

    assert res["part"]["linked"] == 1
    # Reconcile only READS Books — never POSTs (no duplicate creation).
    assert all(m == "GET" for m, _ in calls)
    link = (await db_session.execute(select(IntegrationExternalLink).where(
        IntegrationExternalLink.entity_type == "part"))).scalar_one()
    assert link.entity_id == part.id and link.external_id == "ZI-9"


@pytest.mark.asyncio
async def test_reconcile_duplicate_books_key_goes_to_review(db_session, test_tenant, tenant_id):
    conn = await _enabled_conn(db_session, tenant_id)
    part = Part(pn="DUP", name="Dupe", uom="EA", cost=Decimal("1"), tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()

    # Two Books items share sku 'DUP' -> ambiguous, never auto-linked.
    handler = _items_page([
        {"item_id": "ZI-A", "sku": "DUP", "purchase_rate": 1},
        {"item_id": "ZI-B", "sku": "DUP", "purchase_rate": 2},
    ])
    res = await reconcile_connection(db_session, conn, _client(handler), entity_types=["part"])

    assert res["part"]["linked"] == 0
    assert res["part"]["review"] == 2
    links = (await db_session.execute(select(IntegrationExternalLink).where(
        IntegrationExternalLink.entity_type == "part"))).scalars().all()
    assert links == []
    review = (await db_session.execute(select(ZohoSyncLog).where(
        ZohoSyncLog.status == "open"))).scalars().all()
    assert len(review) == 2


# --- cursor / tenant isolation / honesty ------------------------------------

@pytest.mark.asyncio
async def test_cursor_advances_to_max_last_modified_time(db_session, test_tenant, tenant_id):
    conn = await _enabled_conn(db_session, tenant_id)
    await _linked_part(db_session, tenant_id, pn="PN-C1", name="c1",
                       cost=1, external_id="ZC-1", base_cost=1)
    await _linked_part(db_session, tenant_id, pn="PN-C2", name="c2",
                       cost=1, external_id="ZC-2", base_cost=1)

    handler = _items_page([
        {"item_id": "ZC-1", "purchase_rate": 1, "last_modified_time": "2026-07-18T08:00:00-0700"},
        {"item_id": "ZC-2", "purchase_rate": 1, "last_modified_time": "2026-07-18T09:30:00-0700"},
    ])
    await poll_connection(db_session, conn, _client(handler), entity_types=["part"])

    cur = (await db_session.execute(select(ZohoSyncCursor).where(
        ZohoSyncCursor.entity_type == "part"))).scalar_one()
    assert cur.high_water == "2026-07-18T09:30:00-0700"
    assert cur.records_seen == 2
    assert cur.last_run_status == "ok"


@pytest.mark.asyncio
async def test_tenant_isolation_inbound_does_not_cross(db_session, test_tenant, tenant_id):
    # tenant 1 (from fixtures) + a second tenant with its own linked part.
    conn1 = await _enabled_conn(db_session, tenant_id)
    part1 = await _linked_part(db_session, tenant_id, pn="T1", name="t1",
                               cost=10, external_id="ZI-T1", base_cost=10)

    db_session.add(Tenant(id=2, tenant_name="T2", tenant_code="T2"))
    await db_session.commit()
    part2 = Part(pn="T2", name="t2", uom="EA", cost=Decimal("7"), tenantId=2)
    db_session.add(part2)
    await db_session.commit()
    db_session.add(IntegrationExternalLink(
        tenantId=2, provider="zoho_books", entity_type="part",
        entity_id=part2.id, external_id="ZI-T2"))
    db_session.add(ZohoSyncState(
        tenantId=2, entity_type="part", entity_id=part2.id, external_id="ZI-T2",
        last_cost=Decimal("7"), status="in_sync"))
    await db_session.commit()

    # tenant 1's poll returns BOTH ids; only its own (ZI-T1) resolves — ZI-T2 has
    # no tenant-1 mapping, so it is skipped, never reaching tenant 2's data.
    handler = _items_page([
        {"item_id": "ZI-T1", "purchase_rate": 50, "last_modified_time": "2026-07-18T10:00:00-0700"},
        {"item_id": "ZI-T2", "purchase_rate": 99, "last_modified_time": "2026-07-18T10:00:00-0700"},
    ])
    await poll_connection(db_session, conn1, _client(handler), entity_types=["part"])

    await db_session.refresh(part1)
    assert part1.cost == Decimal("50")   # tenant 1 applied

    tok = TenantContext.set(2)
    try:
        await db_session.refresh(part2)
    finally:
        TenantContext.reset(tok)
    assert part2.cost == Decimal("7")    # tenant 2 UNTOUCHED

    skipped = (await db_session.execute(select(ZohoSyncLog).where(
        ZohoSyncLog.event == "skipped", ZohoSyncLog.external_id == "ZI-T2"))).scalars().all()
    assert len(skipped) == 1


@pytest.mark.asyncio
async def test_disconnected_client_is_honest_failure(db_session, test_tenant, tenant_id):
    conn = await _enabled_conn(db_session, tenant_id)
    # A client with NO refresh token cannot mint a token -> ZohoAuthError on call.
    dead = ZohoBooksClient(auth_blob={}, api_domain="https://api.test", organization_id="org1")

    with pytest.raises(Exception):
        await poll_connection(db_session, conn, dead, entity_types=["part"])

    cur = (await db_session.execute(select(ZohoSyncCursor).where(
        ZohoSyncCursor.entity_type == "part"))).scalar_one()
    assert cur.last_run_status == "error"
    assert cur.last_error  # recorded, not a fabricated success


@pytest.mark.asyncio
async def test_poll_scheduler_skips_when_no_enabled_connection(db_session, tenant_id):
    # No enabled zoho_books connection -> the scheduler entry is a clean no-op.
    res = await poll_zoho_inbound_once(session_maker=_maker(db_session))
    assert res == {}


def _maker(db):
    """A session_maker stub that hands poll_zoho_inbound_once the test session."""
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _cm():
        yield db

    def factory():
        return _cm()

    return factory
