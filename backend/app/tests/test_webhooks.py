import pytest


@pytest.mark.asyncio
async def test_list_webhook_subscriptions(client, auth_headers):
    resp = await client.get("/api/v1/webhooks", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_create_webhook_subscription(client, auth_headers):
    resp = await client.post(
        "/api/v1/webhooks",
        headers=auth_headers,
        json={
            "url": "https://example.com/webhook",
            "events": "po.created,po.updated",
            "secret": "test-secret-key",
            "active": True,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["url"] == "https://example.com/webhook"
    assert data["events"] == "po.created,po.updated"
    assert data["active"] is True
    assert "id" in data


@pytest.mark.asyncio
async def test_get_webhook_subscription_not_found(client, auth_headers):
    resp = await client.get("/api/v1/webhooks/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_webhook_subscription(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/webhooks",
        headers=auth_headers,
        json={
            "url": "https://example.com/original",
            "events": "test.event",
            "active": True,
        },
    )
    sub_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/webhooks/{sub_id}",
        headers=auth_headers,
        json={"url": "https://example.com/updated", "active": False},
    )
    assert resp.status_code == 200
    assert resp.json()["url"] == "https://example.com/updated"
    assert resp.json()["active"] is False


@pytest.mark.asyncio
async def test_delete_webhook_subscription(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/webhooks",
        headers=auth_headers,
        json={
            "url": "https://example.com/to-delete",
            "events": "test.event",
        },
    )
    sub_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/webhooks/{sub_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"


@pytest.mark.asyncio
async def test_delete_webhook_not_found(client, auth_headers):
    resp = await client.delete("/api/v1/webhooks/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_webhook_deliveries(client, auth_headers):
    resp = await client.get("/api/v1/webhooks/deliveries", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data
