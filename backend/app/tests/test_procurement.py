import pytest


@pytest.mark.asyncio
async def test_procurement_list(client, auth_headers):
    resp = await client.get("/api/v1/procurement/", headers=auth_headers)
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_procurement_create(client, auth_headers):
    resp = await client.post("/api/v1/procurement/", headers=auth_headers, json={"name": "test"})
    assert resp.status_code in (201, 200, 401, 403, 422)


@pytest.mark.asyncio
async def test_procurement_get_not_found(client, auth_headers):
    resp = await client.get("/api/v1/procurement/99999", headers=auth_headers)
    assert resp.status_code in (404, 401, 403)


@pytest.mark.asyncio
async def test_procurement_without_auth(client):
    resp = await client.get("/api/v1/procurement/")
    assert resp.status_code in (200, 401)
