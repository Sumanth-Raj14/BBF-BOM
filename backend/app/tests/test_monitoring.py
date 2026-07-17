import pytest


@pytest.mark.asyncio
async def test_health_check(client):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["service"] == "blackbox-bom-api"


@pytest.mark.asyncio
async def test_metrics_endpoint(client, auth_headers):
    resp = await client.get("/api/v1/metrics", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/plain")


@pytest.mark.asyncio
async def test_detailed_health(client, auth_headers):
    resp = await client.get("/api/v1/health/detailed", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "database" in data or "status" in data


@pytest.mark.asyncio
async def test_root_endpoint(client):
    resp = await client.get("/")
    assert resp.status_code == 200
    assert "message" in resp.json()
