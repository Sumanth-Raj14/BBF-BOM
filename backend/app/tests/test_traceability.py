import pytest


@pytest.mark.asyncio
async def test_list_serial_numbers(client, auth_headers):
    resp = await client.get("/api/v1/traceability/serial-numbers", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_serial_number(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "SN-001", "name": "Serial Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.post(
        "/api/v1/traceability/serial-numbers",
        headers=auth_headers,
        json={
            "serialNumber": "SN-TEST-001",
            "partId": part_id,
            "status": "In Stock",
            "currentLocation": "Warehouse A",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["serialNumber"] == "SN-TEST-001"
    assert data["partId"] == part_id
    assert "id" in data


@pytest.mark.asyncio
async def test_get_serial_number(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "SN-GET", "name": "Get SN Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/traceability/serial-numbers",
        headers=auth_headers,
        json={
            "serialNumber": "SN-GET-001",
            "partId": part_id,
            "status": "In Stock",
        },
    )
    sn_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/traceability/serial-numbers/{sn_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["serialNumber"] == "SN-GET-001"


@pytest.mark.asyncio
async def test_get_serial_number_not_found(client, auth_headers):
    resp = await client.get("/api/v1/traceability/serial-numbers/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_serial_number(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "SN-UPD", "name": "Update SN Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/traceability/serial-numbers",
        headers=auth_headers,
        json={
            "serialNumber": "SN-UPD-001",
            "partId": part_id,
            "status": "In Stock",
            "currentLocation": "Warehouse B",
        },
    )
    sn_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/traceability/serial-numbers/{sn_id}",
        headers=auth_headers,
        json={"status": "Installed", "currentLocation": "Assembly Line 1"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "Installed"
    assert resp.json()["currentLocation"] == "Assembly Line 1"
    assert len(resp.json()["statusHistory"]) > 0


@pytest.mark.asyncio
async def test_list_lots(client, auth_headers):
    resp = await client.get("/api/v1/traceability/lots", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_lot(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "LOT-001", "name": "Lot Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.post(
        "/api/v1/traceability/lots",
        headers=auth_headers,
        json={
            "lotBatchNumber": "LOT-TEST-001",
            "partId": part_id,
            "quantityReceived": 100,
            "status": "Received",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["lotBatchNumber"] == "LOT-TEST-001"
    assert data["quantityReceived"] == 100
    assert "id" in data


@pytest.mark.asyncio
async def test_get_lot(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "LOT-GET", "name": "Get Lot Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/traceability/lots",
        headers=auth_headers,
        json={
            "lotBatchNumber": "LOT-GET-001",
            "partId": part_id,
            "quantityReceived": 50,
        },
    )
    lot_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/traceability/lots/{lot_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["lotBatchNumber"] == "LOT-GET-001"


@pytest.mark.asyncio
async def test_get_lot_not_found(client, auth_headers):
    resp = await client.get("/api/v1/traceability/lots/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_lot(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "LOT-UPD", "name": "Update Lot Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/traceability/lots",
        headers=auth_headers,
        json={
            "lotBatchNumber": "LOT-UPD-001",
            "partId": part_id,
            "quantityReceived": 100,
            "status": "Received",
        },
    )
    lot_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/traceability/lots/{lot_id}",
        headers=auth_headers,
        json={"quantityInspected": 100, "quantityAccepted": 98, "quantityRejected": 2},
    )
    assert resp.status_code == 200
    assert resp.json()["quantityAccepted"] == 98
    assert resp.json()["quantityRejected"] == 2
