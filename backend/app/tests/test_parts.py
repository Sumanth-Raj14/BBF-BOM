import pytest


@pytest.mark.asyncio
async def test_list_parts(client, auth_headers):
    resp = await client.get("/api/v1/parts/", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_parts_without_auth(client):
    resp = await client.get("/api/v1/parts/")
    assert resp.status_code in (200, 401)


@pytest.mark.asyncio
async def test_create_part(client, auth_headers):
    resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={
            "pn": "TEST-001",
            "name": "Test Part",
            "category": "Electrical",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["pn"] == "TEST-001"
    assert data["name"] == "Test Part"


@pytest.mark.asyncio
async def test_get_part(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "GET-001", "name": "Get Test Part"},
    )
    part_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/parts/{part_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["pn"] == "GET-001"


@pytest.mark.asyncio
async def test_get_part_not_found(client, auth_headers):
    resp = await client.get("/api/v1/parts/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_check_duplicates(client, auth_headers):
    await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "DUP-001", "name": "Duplicate Part"},
    )
    resp = await client.post(
        "/api/v1/parts/check-duplicates",
        headers=auth_headers,
        json={"pn": "DUP-001"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
