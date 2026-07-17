import pytest


@pytest.mark.asyncio
async def test_get_country_history(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "CH-001", "name": "Country History Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.get(
        f"/api/v1/country-history/parts/{part_id}/country-history",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["partId"] == part_id
    assert "countryHistory" in data


@pytest.mark.asyncio
async def test_get_country_history_not_found(client, auth_headers):
    resp = await client.get(
        "/api/v1/country-history/parts/99999/country-history",
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_add_country_history(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "CH-ADD", "name": "Add Country History Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/country-history/parts/{part_id}/country-history",
        headers=auth_headers,
        json={
            "country": "China",
            "reason": "Supplier change",
            "notes": "Moved to new supplier",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["countryHistory"]) == 1
    assert data["countryHistory"][0]["country"] == "China"


@pytest.mark.asyncio
async def test_update_country_history(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "CH-UPD", "name": "Update Country History Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/country-history/parts/{part_id}/country-history",
        headers=auth_headers,
        json={
            "countryHistory": [
                {"country": "USA", "date": "2025-01-01", "reason": "Original"},
                {"country": "Germany", "date": "2025-06-01", "reason": "Relocation"},
            ]
        },
    )
    assert resp.status_code == 200
    assert len(resp.json()["countryHistory"]) == 2


@pytest.mark.asyncio
async def test_delete_country_history_entry(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "CH-DEL", "name": "Delete Country History Part"},
    )
    part_id = part_resp.json()["id"]
    await client.post(
        f"/api/v1/country-history/parts/{part_id}/country-history",
        headers=auth_headers,
        json={"country": "Japan", "reason": "Test"},
    )
    await client.post(
        f"/api/v1/country-history/parts/{part_id}/country-history",
        headers=auth_headers,
        json={"country": "Korea", "reason": "Test 2"},
    )
    resp = await client.delete(
        f"/api/v1/country-history/parts/{part_id}/country-history/0",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()["countryHistory"]) == 1


@pytest.mark.asyncio
async def test_delete_country_history_invalid_index(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "CH-IDX", "name": "Invalid Index Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.delete(
        f"/api/v1/country-history/parts/{part_id}/country-history/99",
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_country_stats(client, auth_headers):
    resp = await client.get("/api/v1/country-history/stats/by-country", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
