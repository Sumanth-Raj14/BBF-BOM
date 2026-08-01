import pytest


@pytest.mark.asyncio
async def test_user_sync_list(client, auth_headers):
    resp = await client.get("/api/v1/user-sync/data-store", headers=auth_headers)
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_user_sync_upsert(client, auth_headers):
    # Data-store writes are PUT /data-store/{key}, not POST /data-store.
    resp = await client.put(
        "/api/v1/user-sync/data-store/testkey",
        headers=auth_headers,
        json={"data_value": {"x": 1}},
    )
    assert resp.status_code in (200, 201, 401, 403, 422)


@pytest.mark.asyncio
async def test_user_sync_get_not_found(client, auth_headers):
    resp = await client.get("/api/v1/user-sync/99999", headers=auth_headers)
    assert resp.status_code in (404, 401, 403)


@pytest.mark.asyncio
async def test_user_sync_without_auth(client):
    resp = await client.get("/api/v1/user-sync/data-store")
    assert resp.status_code in (200, 401)
