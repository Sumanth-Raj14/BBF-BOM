import pytest


@pytest.mark.asyncio
async def test_generate_demand_forecast(client, auth_headers):
    resp = await client.post(
        "/api/v1/ai/demand-forecast/generate",
        headers=auth_headers,
        json={"partIds": [], "forecastMonths": 3},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data


@pytest.mark.asyncio
async def test_list_demand_forecasts(client, auth_headers):
    resp = await client.get("/api/v1/ai/demand-forecast", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data


@pytest.mark.asyncio
async def test_analyze_interchangeability(client, auth_headers):
    resp = await client.post(
        "/api/v1/ai/interchangeability/analyze",
        headers=auth_headers,
        json={"category": None, "minSimilarity": 0.3},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data


@pytest.mark.asyncio
async def test_list_interchangeability(client, auth_headers):
    resp = await client.get("/api/v1/ai/interchangeability", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data


@pytest.mark.asyncio
async def test_run_validation(client, auth_headers):
    await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "VAL-001", "name": "Validation Test Part"},
    )
    resp = await client.post(
        "/api/v1/ai/validation/run",
        headers=auth_headers,
        json={"partIds": [], "rules": ["missing_pn", "missing_name"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data
    assert data["total"] > 0


@pytest.mark.asyncio
async def test_list_validation_results(client, auth_headers):
    resp = await client.get("/api/v1/ai/validation/results", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data


@pytest.mark.asyncio
async def test_run_validation_with_specific_parts(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "AI-VAL-001", "name": "AI Validation Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.post(
        "/api/v1/ai/validation/run",
        headers=auth_headers,
        json={"partIds": [part_id], "rules": ["missing_pn"]},
    )
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1
