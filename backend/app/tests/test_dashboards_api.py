import pytest

# Named GET dashboards (/dashboards/engineering, /procurement, ...). Exact-code.


@pytest.mark.asyncio
async def test_dashboards_engineering(client, auth_headers):
    resp = await client.get("/api/v1/dashboards/engineering", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_dashboards_procurement(client, auth_headers):
    resp = await client.get("/api/v1/dashboards/procurement", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_dashboards_without_auth(client):
    resp = await client.get("/api/v1/dashboards/engineering")
    assert resp.status_code == 401
