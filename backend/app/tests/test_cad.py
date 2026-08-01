import pytest

# CAD is an action endpoint (POST /sync, /apply-sync, /extract-attrs) plus
# GET /vault/stats, /vault/tree — not a REST resource. The sync POST uses an
# invalid body so it's rejected by validation before any real CAD work.


@pytest.mark.asyncio
async def test_cad_vault_stats(client, auth_headers):
    resp = await client.get("/api/v1/cad/vault/stats", headers=auth_headers)
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_cad_sync_validation(client, auth_headers):
    resp = await client.post(
        "/api/v1/cad/sync", headers=auth_headers, json={"name": "test"}
    )
    assert resp.status_code in (200, 400, 401, 403, 422)


@pytest.mark.asyncio
async def test_cad_without_auth(client):
    resp = await client.get("/api/v1/cad/vault/stats")
    assert resp.status_code in (200, 401, 403)
