import pytest

from app.services import webhook_service


async def _subscribe(client, auth_headers, events):
    resp = await client.post(
        "/api/v1/webhooks",
        headers=auth_headers,
        json={"url": "https://example.com/hook", "events": events, "active": True},
    )
    assert resp.status_code == 200
    return resp.json()["id"]


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


@pytest.mark.asyncio
async def test_business_mutation_dispatches_to_matching_subscription(
    client, auth_headers, monkeypatch
):
    """Creating a part actually delivers to a subscription for part.created."""
    sub_id = await _subscribe(client, auth_headers, "part.created,part.updated")
    await _subscribe(client, auth_headers, "eco.approved")  # non-matching: must NOT fire

    sent = []

    async def fake_send(sub, payload):
        sent.append((sub.id, payload))
        return 200, "ok", "delivered"

    monkeypatch.setattr(webhook_service, "_send_webhook", fake_send)

    resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "WH-EMIT-001", "name": "Webhook Emit Part"},
    )
    assert resp.status_code == 201

    assert len(sent) == 1, "exactly the matching subscription should be dispatched to"
    assert sent[0][0] == sub_id
    assert '"event": "part.created"' in sent[0][1]

    deliveries = await client.get("/api/v1/webhooks/deliveries", headers=auth_headers)
    recorded = [d for d in deliveries.json()["items"] if d["event"] == "part.created"]
    assert len(recorded) == 1
    assert recorded[0]["status"] == "delivered"
    assert recorded[0]["subscriptionId"] == sub_id


@pytest.mark.asyncio
async def test_failing_webhook_does_not_fail_the_mutation(client, auth_headers, monkeypatch):
    """A blown-up delivery must not roll back or 500 the business operation."""
    await _subscribe(client, auth_headers, "part.created")

    async def exploding_send(sub, payload):
        raise RuntimeError("subscriber is on fire")

    monkeypatch.setattr(webhook_service, "_send_webhook", exploding_send)

    resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "WH-FAIL-001", "name": "Survives Bad Webhook"},
    )
    assert resp.status_code == 201
    part_id = resp.json()["id"]

    # and the part is really committed, not rolled back with the webhook
    get_resp = await client.get(f"/api/v1/parts/{part_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["pn"] == "WH-FAIL-001"
