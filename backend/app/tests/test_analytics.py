import pytest


@pytest.mark.asyncio
async def test_analytics_dashboard(client, auth_headers):
    resp = await client.get("/api/v1/analytics/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "totalParts" in data
    assert "totalVendors" in data
    assert "totalPOs" in data
    assert "poByStatus" in data
    assert "vendorSpend" in data


@pytest.mark.asyncio
async def test_analytics_trends(client, auth_headers):
    resp = await client.get("/api/v1/analytics/trends", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "range" in data
    assert "data" in data


@pytest.mark.asyncio
async def test_analytics_trends_with_range(client, auth_headers):
    resp = await client.get(
        "/api/v1/analytics/trends", headers=auth_headers, params={"range_": "1yr"}
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_analytics_categories(client, auth_headers):
    resp = await client.get("/api/v1/analytics/categories", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_analytics_vendor_scorecards(client, auth_headers):
    resp = await client.get("/api/v1/analytics/vendor-scorecards", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
