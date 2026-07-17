import pytest


@pytest.mark.asyncio
async def test_list_make_vs_buy_analyses(client, auth_headers):
    resp = await client.get("/api/v1/make-vs-buy/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_make_vs_buy_analysis(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "MVB-001", "name": "Make Vs Buy Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.post(
        "/api/v1/make-vs-buy/",
        headers=auth_headers,
        json={
            "partId": part_id,
            "decision": "Make",
            "makeMaterialCost": 10.0,
            "makeLaborCost": 5.0,
            "makeOverheadCost": 2.0,
            "makeToolingCost": 3.0,
            "buyUnitPrice": 25.0,
            "buyNreCost": 500.0,
            "status": "Draft",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["partId"] == part_id
    assert data["makeTotalCost"] == 20.0
    assert data["buyTotalCost"] == 525.0
    assert "id" in data


@pytest.mark.asyncio
async def test_get_make_vs_buy_analysis(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "MVB-GET", "name": "Get MVB Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/make-vs-buy/",
        headers=auth_headers,
        json={"partId": part_id, "decision": "TBD", "buyUnitPrice": 10.0},
    )
    analysis_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/make-vs-buy/{analysis_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == analysis_id


@pytest.mark.asyncio
async def test_get_make_vs_buy_not_found(client, auth_headers):
    resp = await client.get("/api/v1/make-vs-buy/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_make_vs_buy_analysis(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "MVB-UPD", "name": "Update MVB Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/make-vs-buy/",
        headers=auth_headers,
        json={"partId": part_id, "decision": "TBD"},
    )
    analysis_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/make-vs-buy/{analysis_id}",
        headers=auth_headers,
        json={"decision": "Buy", "buyUnitPrice": 30.0},
    )
    assert resp.status_code == 200
    assert resp.json()["decision"] == "Buy"
    assert resp.json()["buyUnitPrice"] == 30.0


@pytest.mark.asyncio
async def test_delete_make_vs_buy_analysis(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "MVB-DEL", "name": "Delete MVB Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/make-vs-buy/",
        headers=auth_headers,
        json={"partId": part_id, "decision": "Make"},
    )
    analysis_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/make-vs-buy/{analysis_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["detail"] == "Analysis deleted"


@pytest.mark.asyncio
async def test_approve_make_vs_buy_analysis(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "MVB-APR", "name": "Approve MVB Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/make-vs-buy/",
        headers=auth_headers,
        json={"partId": part_id, "decision": "Make"},
    )
    analysis_id = create_resp.json()["id"]
    resp = await client.post(f"/api/v1/make-vs-buy/{analysis_id}/approve", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["detail"] == "Analysis approved"
