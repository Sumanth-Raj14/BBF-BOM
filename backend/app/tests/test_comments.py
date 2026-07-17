import pytest


@pytest.mark.asyncio
async def test_list_comments(client, auth_headers):
    resp = await client.get("/api/v1/comments/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_comment(client, auth_headers):
    resp = await client.post(
        "/api/v1/comments/",
        headers=auth_headers,
        json={
            "content": "This is a test comment",
            "entityType": "part",
            "entityId": 1,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["content"] == "This is a test comment"
    assert data["entityType"] == "part"
    assert "id" in data
    assert "userId" in data


@pytest.mark.asyncio
async def test_create_comment_with_mentions(client, auth_headers):
    resp = await client.post(
        "/api/v1/comments/",
        headers=auth_headers,
        json={
            "content": "Check this @user",
            "entityType": "vendor",
            "entityId": 1,
            "mentions": [1, 2],
        },
    )
    assert resp.status_code == 201
    assert resp.json()["mentions"] == [1, 2]


@pytest.mark.asyncio
async def test_list_comments_by_entity(client, auth_headers):
    await client.post(
        "/api/v1/comments/",
        headers=auth_headers,
        json={
            "content": "Entity filter comment",
            "entityType": "part",
            "entityId": 999,
        },
    )
    resp = await client.get(
        "/api/v1/comments/",
        headers=auth_headers,
        params={"entityType": "part", "entityId": 999},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_update_comment(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/comments/",
        headers=auth_headers,
        json={
            "content": "Original comment",
            "entityType": "part",
            "entityId": 1,
        },
    )
    comment_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/comments/{comment_id}",
        headers=auth_headers,
        json={"content": "Updated comment"},
    )
    assert resp.status_code == 200
    assert resp.json()["content"] == "Updated comment"


@pytest.mark.asyncio
async def test_delete_comment(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/comments/",
        headers=auth_headers,
        json={
            "content": "To be deleted",
            "entityType": "part",
            "entityId": 1,
        },
    )
    comment_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/comments/{comment_id}", headers=auth_headers)
    assert resp.status_code == 204
