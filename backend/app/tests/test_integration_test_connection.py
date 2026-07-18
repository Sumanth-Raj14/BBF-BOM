import httpx
import pytest

from app.integrations.clickup_client import ClickUpClient
from app.integrations.cliq_client import CliqClient


@pytest.mark.asyncio
async def test_valid_clickup_credentials_report_ok(client, auth_headers, monkeypatch):
    r = await client.put("/api/v1/integrations/clickup", headers=auth_headers,
                         json={"token": "pk_live_secretvalue", "config": {"space_id": "sp1"},
                               "is_enabled": True})
    assert r.status_code == 200, r.text

    async def fake_verify(self):
        return {"id": 7, "username": "tester"}

    monkeypatch.setattr(ClickUpClient, "verify", fake_verify)

    res = await client.post("/api/v1/integrations/clickup/test-connection", headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ok"] is True
    assert body["reason"] == "ok"
    assert body["checked_at"]
    assert "pk_live_secretvalue" not in res.text

    # the connection's health pill should reflect the live check
    lst = await client.get("/api/v1/integrations/", headers=auth_headers)
    conn = {c["provider"]: c for c in lst.json()}["clickup"]
    assert conn["status"] == "ok"


@pytest.mark.asyncio
async def test_auth_failure_reports_honest_failure_not_success(client, auth_headers, monkeypatch):
    r = await client.put("/api/v1/integrations/cliq", headers=auth_headers,
                         json={"token": "https://cliq.zoho.com/x?zapikey=SUPERSECRET",
                               "config": {"default_channel": "eng"}, "is_enabled": True})
    assert r.status_code == 200, r.text

    async def fake_verify_401(self):
        request = httpx.Request("POST", self._url)
        response = httpx.Response(401, request=request)
        raise httpx.HTTPStatusError("unauthorized", request=request, response=response)

    monkeypatch.setattr(CliqClient, "verify", fake_verify_401)

    res = await client.post("/api/v1/integrations/cliq/test-connection", headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ok"] is False
    assert body["reason"] == "auth_failed"
    assert "SUPERSECRET" not in res.text
    assert "zapikey" not in res.text

    lst = await client.get("/api/v1/integrations/", headers=auth_headers)
    conn = {c["provider"]: c for c in lst.json()}["cliq"]
    assert conn["status"] == "error"


@pytest.mark.asyncio
async def test_not_configured_is_honest_not_a_fake_success(client, auth_headers):
    res = await client.post("/api/v1/integrations/clickup/test-connection", headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ok"] is False
    assert body["reason"] == "not_configured"


@pytest.mark.asyncio
async def test_response_never_contains_raw_secret_on_timeout(client, auth_headers, monkeypatch):
    r = await client.put("/api/v1/integrations/clickup", headers=auth_headers,
                         json={"token": "pk_another_secret_token", "is_enabled": True})
    assert r.status_code == 200, r.text

    async def fake_verify_timeout(self):
        raise httpx.ConnectTimeout("timed out")

    monkeypatch.setattr(ClickUpClient, "verify", fake_verify_timeout)

    res = await client.post("/api/v1/integrations/clickup/test-connection", headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ok"] is False
    assert body["reason"] == "timeout"
    assert "pk_another_secret_token" not in res.text


@pytest.mark.asyncio
async def test_test_connection_is_tenant_scoped(client, auth_headers, db_session, monkeypatch):
    """A provider connection saved by one tenant must never be visible/testable by another.

    Calls the endpoint function directly for a second tenant (rather than
    provisioning a full second login) to isolate the assertion to query
    scoping — the thing this test cares about — without tripping the
    cross-tenant write guard that a real second-user/login flow would hit
    under the fixed single-tenant ambient TenantContext these tests run in
    (see test_bom_instance_crud.py for that pattern when full RLS coverage
    is needed).
    """
    from types import SimpleNamespace

    from app.api.endpoints.integrations import test_connection

    async def fake_verify(self):
        return {"id": 1}

    monkeypatch.setattr(ClickUpClient, "verify", fake_verify)

    r = await client.put("/api/v1/integrations/clickup", headers=auth_headers,
                         json={"token": "pk_tenant1_secret", "is_enabled": True})
    assert r.status_code == 200, r.text

    other_tenant_user = SimpleNamespace(tenantId=999999)
    body = await test_connection("clickup", db=db_session, user=other_tenant_user)
    # the other tenant has no clickup connection of its own -> honest
    # not_configured, never tenant 1's credentials/result.
    assert body["ok"] is False
    assert body["reason"] == "not_configured"
