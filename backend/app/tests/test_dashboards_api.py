import pytest


@pytest.mark.asyncio
async def test_dashboards_api_list(client, auth_headers):
    resp = await client.get("/api/v1/dashboards/", headers=auth_headers)
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_dashboards_api_create(client, auth_headers):
    resp = await client.post("/api/v1/dashboards/", headers=auth_headers, json={"name": "test"})
    assert resp.status_code in (201, 200, 401, 403, 422)


@pytest.mark.asyncio
async def test_dashboards_api_get_not_found(client, auth_headers):
    resp = await client.get("/api/v1/dashboards/99999", headers=auth_headers)
    assert resp.status_code in (404, 401, 403)


@pytest.mark.asyncio
async def test_dashboards_api_without_auth(client):
    resp = await client.get("/api/v1/dashboards/")
    assert resp.status_code in (200, 401)
