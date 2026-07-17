import pytest


@pytest.mark.asyncio
async def test_list_notifications(client, auth_headers):
    resp = await client.get("/api/v1/notifications/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_notification(client, auth_headers):
    resp = await client.post(
        "/api/v1/notifications/",
        headers=auth_headers,
        json={
            "title": "Test Notification",
            "message": "This is a test notification",
            "type": "info",
            "userId": 1,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Test Notification"
    assert data["message"] == "This is a test notification"
    assert data["status"] == "unread"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_notifications_with_status_filter(client, auth_headers):
    resp = await client.get(
        "/api/v1/notifications/",
        headers=auth_headers,
        params={"status": "unread"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_mark_notification_read(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/notifications/",
        headers=auth_headers,
        json={
            "title": "Mark Read",
            "message": "To be marked as read",
            "userId": 1,
        },
    )
    notif_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/notifications/{notif_id}",
        headers=auth_headers,
        json={"status": "read"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "read"


@pytest.mark.asyncio
async def test_delete_notification(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/notifications/",
        headers=auth_headers,
        json={
            "title": "Delete Notification",
            "message": "To be deleted",
            "userId": 1,
        },
    )
    notif_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/notifications/{notif_id}", headers=auth_headers)
    assert resp.status_code == 204
