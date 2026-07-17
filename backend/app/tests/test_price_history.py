import pytest


@pytest.mark.asyncio
async def test_list_price_history(client, auth_headers):
    resp = await client.get("/api/v1/price-history/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_price_history(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "PH-001", "name": "Price History Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.post(
        "/api/v1/price-history/",
        headers=auth_headers,
        json={
            "partId": part_id,
            "price": 25.50,
            "currency": "USD",
            "source": "PO",
            "sourceReference": "PO-2026-001",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["partId"] == part_id
    assert data["price"] == 25.50
    assert data["currency"] == "USD"
    assert "id" in data
    assert "recordedAt" in data


@pytest.mark.asyncio
async def test_list_price_history_with_part_filter(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "PH-FIL", "name": "Filter Price Part"},
    )
    part_id = part_resp.json()["id"]
    await client.post(
        "/api/v1/price-history/",
        headers=auth_headers,
        json={"partId": part_id, "price": 15.0},
    )
    resp = await client.get(
        "/api/v1/price-history/",
        headers=auth_headers,
        params={"partId": part_id},
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
