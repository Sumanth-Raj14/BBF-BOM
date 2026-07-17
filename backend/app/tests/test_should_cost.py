import pytest


@pytest.mark.asyncio
async def test_list_should_cost_models(client, auth_headers):
    resp = await client.get("/api/v1/should-cost/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_should_cost_model(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "SC-001", "name": "Should Cost Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.post(
        "/api/v1/should-cost/",
        headers=auth_headers,
        json={
            "partId": part_id,
            "rawMaterialCost": 10.0,
            "materialWastePct": 5.0,
            "laborHours": 2.0,
            "laborRatePerHour": 50.0,
            "overheadPct": 30.0,
            "toolingCost": 1000.0,
            "toolingAmortizedQty": 1000,
            "profitMarginPct": 15.0,
            "actualVendorPrice": 200.0,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["partId"] == part_id
    assert data["shouldCostPerUnit"] > 0
    assert "id" in data


@pytest.mark.asyncio
async def test_get_should_cost_model(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "SC-GET", "name": "Get SC Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/should-cost/",
        headers=auth_headers,
        json={
            "partId": part_id,
            "rawMaterialCost": 5.0,
            "laborHours": 1.0,
            "laborRatePerHour": 50.0,
        },
    )
    model_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/should-cost/{model_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == model_id


@pytest.mark.asyncio
async def test_get_should_cost_not_found(client, auth_headers):
    resp = await client.get("/api/v1/should-cost/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_should_cost_model(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "SC-UPD", "name": "Update SC Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/should-cost/",
        headers=auth_headers,
        json={"partId": part_id, "rawMaterialCost": 5.0},
    )
    model_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/should-cost/{model_id}",
        headers=auth_headers,
        json={"rawMaterialCost": 15.0, "actualVendorPrice": 250.0},
    )
    assert resp.status_code == 200
    assert resp.json()["rawMaterialCost"] == 15.0


@pytest.mark.asyncio
async def test_delete_should_cost_model(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "SC-DEL", "name": "Delete SC Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/should-cost/",
        headers=auth_headers,
        json={"partId": part_id, "rawMaterialCost": 5.0},
    )
    model_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/should-cost/{model_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["detail"] == "Should-cost model deleted"
