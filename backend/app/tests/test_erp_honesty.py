"""R10 — Honest ERP connector responses.

Before this fix, POST /erp-connectors/{id}/sync always logged status="completed"
and POST /erp-connectors/test-connection (and the by-id variant) always returned
status="success" — even though neither endpoint makes any real network call to
an external ERP system. That silently misled users into believing a real sync
or connectivity check had succeeded. These tests assert the responses are
labeled honestly instead of masquerading as a genuine success/completion.
"""

import pytest


@pytest.mark.asyncio
async def test_sync_connector_is_not_labeled_completed_or_success(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/erp-connectors",
        headers=auth_headers,
        json={"name": "Honesty SAP", "type": "SAP", "baseUrl": "https://sap.example.com"},
    )
    assert create_resp.status_code == 200
    connector_id = create_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/erp-connectors/{connector_id}/sync",
        headers=auth_headers,
        json={"entityType": "parts", "direction": "export"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] not in ("completed", "success")
    # No records were actually exchanged — recordsCount must reflect that.
    assert data["recordsCount"] == 0


@pytest.mark.asyncio
async def test_sync_connector_logs_are_not_labeled_completed(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/erp-connectors",
        headers=auth_headers,
        json={"name": "Honesty Oracle", "type": "Oracle"},
    )
    connector_id = create_resp.json()["id"]

    await client.post(
        f"/api/v1/erp-connectors/{connector_id}/sync",
        headers=auth_headers,
        json={"entityType": "parts", "direction": "import"},
    )

    logs_resp = await client.get(
        f"/api/v1/erp-connectors/{connector_id}/logs", headers=auth_headers
    )
    assert logs_resp.status_code == 200
    logs = logs_resp.json()
    assert len(logs) == 1
    assert logs[0]["status"] not in ("completed", "success")


@pytest.mark.asyncio
async def test_test_connection_is_not_labeled_success(client, auth_headers):
    resp = await client.post(
        "/api/v1/erp-connectors/test-connection",
        headers=auth_headers,
        json={"baseUrl": "https://erp.example.com", "apiKey": "secret"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] not in ("success", "completed")


@pytest.mark.asyncio
async def test_test_connection_by_id_is_not_labeled_success(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/erp-connectors",
        headers=auth_headers,
        json={"name": "Honesty Odoo", "type": "Odoo", "baseUrl": "https://odoo.example.com"},
    )
    connector_id = create_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/erp-connectors/{connector_id}/test-connection", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] not in ("success", "completed")
