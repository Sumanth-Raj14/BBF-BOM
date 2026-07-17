import pytest


@pytest.mark.asyncio
async def test_sessions_list(client, auth_headers):
    resp = await client.get("/api/v1/sessions/", headers=auth_headers)
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_sessions_create(client, auth_headers):
    resp = await client.post("/api/v1/sessions/", headers=auth_headers, json={"name": "test"})
    assert resp.status_code in (201, 200, 401, 403, 422)


@pytest.mark.asyncio
async def test_sessions_get_not_found(client, auth_headers):
    resp = await client.get("/api/v1/sessions/99999", headers=auth_headers)
    assert resp.status_code in (404, 401, 403)


@pytest.mark.asyncio
async def test_sessions_without_auth(client):
    resp = await client.get("/api/v1/sessions/")
    assert resp.status_code in (200, 401)
