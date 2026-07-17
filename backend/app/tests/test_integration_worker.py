import httpx
import pytest
from sqlalchemy import select

from app.integrations.clickup_client import ClickUpClient
from app.integrations.cliq_client import CliqClient
from app.integrations.worker import deliver_pending
from app.models.integration import (
    IntegrationConnection, IntegrationExternalLink, IntegrationOutbox,
)


async def _seed_conns(db, tid):
    db.add(IntegrationConnection(tenantId=tid, provider="clickup", is_enabled=True, status="ok",
                                 config={"space_id": "sp1"}))
    db.add(IntegrationConnection(tenantId=tid, provider="cliq", is_enabled=True, status="ok",
                                 config={"default_channel": "eng"}))
    await db.commit()


def _clickup(handler):
    return ClickUpClient("tok", http=httpx.AsyncClient(transport=httpx.MockTransport(handler),
                                                        base_url="https://api.clickup.com"))


def _cliq(handler):
    return CliqClient("https://cliq/x", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


@pytest.mark.asyncio
async def test_clickup_creates_then_reuses_external_link(db_session, test_user):
    tid = test_user.tenantId
    await _seed_conns(db_session, tid)
    calls = []

    def cu(request):
        calls.append((request.method, str(request.url)))
        if request.url.path.endswith("/space/sp1/list"):
            return httpx.Response(200, json={"lists": [{"name": "BBOM · Work Orders", "id": "L1"}]})
        if request.url.path.endswith("/team"):
            return httpx.Response(200, json={"teams": [{"members": [{"user": {"id": 7, "email": "a@x.com"}}]}]})
        if request.method == "POST":
            return httpx.Response(200, json={"id": "T100", "url": "u"})
        return httpx.Response(200, json={"id": "T100", "url": "u"})

    def cq(request):
        return httpx.Response(200, json={"ok": True})

    clients = {"clickup": _clickup(cu), "cliq": _cliq(cq)}

    # first delivery -> create
    db_session.add(IntegrationOutbox(tenantId=tid, provider="clickup", entity_type="work_order",
                                     entity_id=42, action="assigned",
                                     payload={"ref": "WO-42", "title": "Build", "status": "in_progress",
                                              "assignee_email": "a@x.com"}, status="pending"))
    await db_session.commit()
    res = await deliver_pending(db_session, clients=clients)
    assert res["sent"] == 1
    link = (await db_session.execute(select(IntegrationExternalLink).where(
        IntegrationExternalLink.entity_id == 42))).scalar_one()
    assert link.external_id == "T100"

    # second delivery for same entity -> update (PUT), not a new create
    db_session.add(IntegrationOutbox(tenantId=tid, provider="clickup", entity_type="work_order",
                                     entity_id=42, action="status_change",
                                     payload={"ref": "WO-42", "status": "closed"}, status="pending"))
    await db_session.commit()
    calls.clear()
    res2 = await deliver_pending(db_session, clients=clients)
    assert res2["sent"] == 1
    assert any(m == "PUT" and "/task/T100" in u for m, u in calls)


@pytest.mark.asyncio
async def test_failure_retries_then_dead_letters(db_session, test_user):
    tid = test_user.tenantId
    await _seed_conns(db_session, tid)

    def cq(request):
        return httpx.Response(500, json={"error": "boom"})

    clients = {"clickup": _clickup(lambda r: httpx.Response(200, json={"id": "x", "url": "u"})),
               "cliq": _cliq(cq)}
    ob = IntegrationOutbox(tenantId=tid, provider="cliq", entity_type="capa", entity_id=1,
                           action="assigned", payload={"ref": "CAPA-1"}, status="pending")
    db_session.add(ob)
    await db_session.commit()

    # exhaust attempts (max_attempts=2 for the test); each call re-processes the same row
    for _ in range(2):
        # clear next_attempt gate for the test
        ob.next_attempt_at = None
        await db_session.commit()
        await deliver_pending(db_session, clients=clients, max_attempts=2)
    await db_session.refresh(ob)
    assert ob.status == "dead"
    assert ob.attempts >= 2


@pytest.mark.asyncio
async def test_deliver_pending_redacts_secrets_in_last_error(db_session, test_user):
    tid = test_user.tenantId
    await _seed_conns(db_session, tid)

    def cq(request):
        return httpx.Response(500, json={"error": "boom"})

    clients = {"clickup": _clickup(lambda r: httpx.Response(200, json={"id": "x", "url": "u"})),
               "cliq": _cliq(cq)}
    ob = IntegrationOutbox(tenantId=tid, provider="cliq", entity_type="capa", entity_id=2,
                           action="assigned", payload={"ref": "CAPA-2"}, status="pending")
    db_session.add(ob)
    await db_session.commit()

    await deliver_pending(db_session, clients=clients, max_attempts=5)
    await db_session.refresh(ob)
    # HTTP errors persist only the status code — never the URL/webhook secret.
    assert ob.last_error == "HTTP 500"


@pytest.mark.asyncio
async def test_deliver_pending_redacts_url_in_generic_error(db_session, test_user):
    from app.integrations.worker import _sanitize_error

    class Boom(Exception):
        pass

    msg = _sanitize_error(Boom("connect fail https://cliq.zoho.com/x?zapikey=SECRET123"))
    assert "SECRET123" not in msg
    assert "zapikey" not in msg
    assert "cliq.zoho.com" not in msg


@pytest.mark.asyncio
async def test_deliver_pending_updates_connection_health(db_session, test_user):
    tid = test_user.tenantId
    await _seed_conns(db_session, tid)
    conn = (await db_session.execute(select(IntegrationConnection).where(
        IntegrationConnection.provider == "cliq"))).scalar_one()

    clients = {"clickup": _clickup(lambda r: httpx.Response(200, json={"id": "x", "url": "u"})),
               "cliq": _cliq(lambda r: httpx.Response(500, json={"error": "boom"}))}
    db_session.add(IntegrationOutbox(tenantId=tid, provider="cliq", entity_type="capa", entity_id=3,
                                     action="assigned", payload={"ref": "CAPA-3"}, status="pending"))
    await db_session.commit()

    await deliver_pending(db_session, clients=clients, max_attempts=5)
    await db_session.refresh(conn)
    assert conn.status == "error"
    assert conn.last_error == "HTTP 500"
    assert conn.last_checked_at is not None


@pytest.mark.asyncio
async def test_test_action_creates_no_external_link(db_session, test_user):
    tid = test_user.tenantId
    await _seed_conns(db_session, tid)
    clients = {"clickup": _clickup(lambda r: (
        httpx.Response(200, json={"lists": [{"name": "BBOM · Work Orders", "id": "L1"}]})
        if r.url.path.endswith("/list") and r.method == "GET"
        else httpx.Response(200, json={"id": "T1", "url": "u"}))),
        "cliq": _cliq(lambda r: httpx.Response(200, json={"ok": True}))}
    # sentinel test row: entity_id=0, action="test"
    db_session.add(IntegrationOutbox(tenantId=tid, provider="clickup", entity_type="work_order",
                                     entity_id=0, action="test",
                                     payload={"ref": "TEST", "status": "open"}, status="pending"))
    await db_session.commit()
    res = await deliver_pending(db_session, clients=clients, tenant_id=tid)
    assert res["sent"] == 1
    links = (await db_session.execute(select(IntegrationExternalLink))).scalars().all()
    assert links == []  # no spurious entity_id=0 link


@pytest.mark.asyncio
async def test_background_drainer_is_registered_and_uses_own_session(monkeypatch):
    """The periodic drainer must be schedulable on startup and drain with its OWN session."""
    import app.main as main_mod
    from app.integrations import worker as worker_mod

    # wiring exists and is callable
    assert callable(main_mod._run_integration_drainer)
    assert callable(worker_mod.drain_integration_outbox_once)

    seen = {}

    async def fake_deliver(db, **kw):
        seen["db"] = db
        seen["kw"] = kw
        return {"sent": 0, "failed": 0, "dead": 0}

    monkeypatch.setattr(worker_mod, "deliver_pending", fake_deliver)

    created = {"count": 0}

    class _FakeSession:
        async def __aenter__(self):
            created["count"] += 1
            return "OWNED_SESSION"

        async def __aexit__(self, *a):
            return False

    def fake_maker():
        return _FakeSession()

    res = await worker_mod.drain_integration_outbox_once(session_maker=fake_maker)
    assert seen["db"] == "OWNED_SESSION"   # not a request-scoped dependency
    assert created["count"] == 1
    assert res == {"sent": 0, "failed": 0, "dead": 0}
