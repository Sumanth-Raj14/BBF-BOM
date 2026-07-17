import pytest


@pytest.mark.asyncio
async def test_list_kanban_triggers(client, auth_headers):
    resp = await client.get("/api/v1/kanban/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_kanban_trigger(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "KB-001", "name": "Kanban Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.post(
        "/api/v1/kanban/",
        headers=auth_headers,
        json={
            "partId": part_id,
            "minStock": 10,
            "maxStock": 100,
            "reorderQuantity": 50,
            "safetyStock": 5,
            "currentStock": 80,
            "active": True,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["partId"] == part_id
    assert data["minStock"] == 10
    assert data["maxStock"] == 100
    assert data["status"] == "Normal"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_kanban_trigger_critical(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "KB-CRIT", "name": "Critical Kanban Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.post(
        "/api/v1/kanban/",
        headers=auth_headers,
        json={
            "partId": part_id,
            "minStock": 10,
            "maxStock": 100,
            "reorderQuantity": 50,
            "safetyStock": 5,
            "currentStock": 3,
            "active": True,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "Critical"


@pytest.mark.asyncio
async def test_get_kanban_trigger(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "KB-GET", "name": "Get KB Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/kanban/",
        headers=auth_headers,
        json={
            "partId": part_id,
            "minStock": 10,
            "maxStock": 100,
            "reorderQuantity": 50,
            "safetyStock": 5,
            "currentStock": 50,
        },
    )
    trigger_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/kanban/{trigger_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == trigger_id


@pytest.mark.asyncio
async def test_get_kanban_trigger_not_found(client, auth_headers):
    resp = await client.get("/api/v1/kanban/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_kanban_trigger(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "KB-UPD", "name": "Update KB Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/kanban/",
        headers=auth_headers,
        json={
            "partId": part_id,
            "minStock": 10,
            "maxStock": 100,
            "reorderQuantity": 50,
            "safetyStock": 5,
            "currentStock": 50,
        },
    )
    trigger_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/kanban/{trigger_id}",
        headers=auth_headers,
        json={"currentStock": 8, "safetyStock": 10},
    )
    assert resp.status_code == 200
    assert resp.json()["currentStock"] == 8
    assert resp.json()["status"] == "Critical"


@pytest.mark.asyncio
async def test_delete_kanban_trigger(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "KB-DEL", "name": "Delete KB Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/kanban/",
        headers=auth_headers,
        json={
            "partId": part_id,
            "minStock": 10,
            "maxStock": 100,
            "reorderQuantity": 50,
            "safetyStock": 5,
            "currentStock": 50,
        },
    )
    trigger_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/kanban/{trigger_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["detail"] == "Kanban trigger deleted"


@pytest.mark.asyncio
async def test_update_stock(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "KB-STK", "name": "Stock Update Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/kanban/",
        headers=auth_headers,
        json={
            "partId": part_id,
            "minStock": 10,
            "maxStock": 100,
            "reorderQuantity": 50,
            "safetyStock": 5,
            "currentStock": 50,
        },
    )
    trigger_id = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/kanban/{trigger_id}/update-stock",
        headers=auth_headers,
        params={"quantityChange": -30},
    )
    assert resp.status_code == 200
    assert resp.json()["currentStock"] == 20


@pytest.mark.asyncio
async def test_low_stock_alerts(client, auth_headers):
    resp = await client.get("/api/v1/kanban/alerts/low-stock", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
