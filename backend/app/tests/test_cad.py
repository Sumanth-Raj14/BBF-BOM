import pytest

# Action endpoint (POST /sync, ...) + GET /vault/stats. Exact-code smoke tests.


@pytest.mark.asyncio
async def test_cad_vault_stats(client, auth_headers):
    resp = await client.get("/api/v1/cad/vault/stats", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_cad_sync(client, auth_headers):
    resp = await client.post(
        "/api/v1/cad/sync", headers=auth_headers, json={"name": "test"}
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_cad_vault_stats_without_auth(client):
    resp = await client.get("/api/v1/cad/vault/stats")
    assert resp.status_code == 401
