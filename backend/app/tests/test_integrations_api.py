import pytest


@pytest.mark.asyncio
async def test_connect_and_list(client, auth_headers):
    r = await client.put("/api/v1/integrations/clickup", headers=auth_headers,
                         json={"token": "pk_123", "config": {"space_id": "sp1"}, "is_enabled": True})
    assert r.status_code == 200, r.text

    lst = await client.get("/api/v1/integrations/", headers=auth_headers)
    assert lst.status_code == 200
    conns = {c["provider"]: c for c in lst.json()}
    assert conns["clickup"]["is_enabled"] is True
    assert "token" not in str(conns["clickup"])  # secret never returned


@pytest.mark.asyncio
async def test_requires_auth(client):
    r = await client.get("/api/v1/integrations/")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_deliveries_endpoint(client, auth_headers):
    r = await client.get("/api/v1/integrations/deliveries", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
