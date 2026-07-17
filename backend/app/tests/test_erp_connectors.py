import pytest


@pytest.mark.asyncio
async def test_list_erp_connectors(client, auth_headers):
    resp = await client.get("/api/v1/erp-connectors", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data


@pytest.mark.asyncio
async def test_create_erp_connector(client, auth_headers):
    resp = await client.post(
        "/api/v1/erp-connectors",
        headers=auth_headers,
        json={
            "name": "Test ERP",
            "type": "SAP",
            "baseUrl": "https://sap.example.com",
            "apiKey": "test-api-key",
            "active": True,
            "config": {"environment": "sandbox"},
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test ERP"
    assert data["type"] == "SAP"
    assert data["active"] is True
    assert "id" in data


@pytest.mark.asyncio
async def test_get_erp_connector(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/erp-connectors",
        headers=auth_headers,
        json={"name": "Get ERP", "type": "Oracle"},
    )
    connector_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/erp-connectors/{connector_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Get ERP"


@pytest.mark.asyncio
async def test_get_erp_connector_not_found(client, auth_headers):
    resp = await client.get("/api/v1/erp-connectors/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_erp_connector(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/erp-connectors",
        headers=auth_headers,
        json={"name": "Old ERP", "type": "NetSuite"},
    )
    connector_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/erp-connectors/{connector_id}",
        headers=auth_headers,
        json={"name": "New ERP", "active": False},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New ERP"
    assert resp.json()["active"] is False


@pytest.mark.asyncio
async def test_delete_erp_connector(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/erp-connectors",
        headers=auth_headers,
        json={"name": "Delete ERP", "type": "Microsoft Dynamics"},
    )
    connector_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/erp-connectors/{connector_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"


@pytest.mark.asyncio
async def test_sync_erp_connector(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/erp-connectors",
        headers=auth_headers,
        json={"name": "Sync ERP", "type": "SAP"},
    )
    connector_id = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/erp-connectors/{connector_id}/sync",
        headers=auth_headers,
        json={"entityType": "parts", "direction": "export"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Honest status (R10): no real ERP integration exists, so the sync must
    # NOT claim "completed" — see test_erp_honesty.py for the dedicated tests.
    assert data["status"] != "completed"
    assert data["connectorId"] == connector_id


@pytest.mark.asyncio
async def test_get_sync_logs(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/erp-connectors",
        headers=auth_headers,
        json={"name": "Logs ERP", "type": "SAP"},
    )
    connector_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/erp-connectors/{connector_id}/logs", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_test_connection(client, auth_headers):
    resp = await client.post(
        "/api/v1/erp-connectors/test-connection",
        headers=auth_headers,
        json={"baseUrl": "https://test.example.com", "apiKey": "test"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Honest status (R10): no real network call is made — see
    # test_erp_honesty.py for the dedicated tests.
    assert data["status"] != "success"
