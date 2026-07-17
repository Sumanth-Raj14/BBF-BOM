import pytest


@pytest.mark.asyncio
async def test_list_revisions(client, auth_headers):
    resp = await client.get("/api/v1/revisions/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_revision(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "REV-001", "name": "Revision Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.post(
        "/api/v1/revisions/",
        headers=auth_headers,
        json={
            "entityId": part_id,
            "entityType": "part",
            "revisionNumber": "A",
            "description": "Initial revision",
            "bomSnapshot": {"pn": "REV-001", "name": "Revision Part"},
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["entityId"] == part_id
    assert data["revisionNumber"] == "A"
    assert data["description"] == "Initial revision"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_revision(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "REV-GET", "name": "Get Rev Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/revisions/",
        headers=auth_headers,
        json={
            "entityId": part_id,
            "entityType": "part",
            "revisionNumber": "B",
            "description": "Get revision",
        },
    )
    revision_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/revisions/{revision_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["revisionNumber"] == "B"


@pytest.mark.asyncio
async def test_get_revision_not_found(client, auth_headers):
    resp = await client.get("/api/v1/revisions/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_revisions_with_part_filter(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "REV-FIL", "name": "Filter Rev Part"},
    )
    part_id = part_resp.json()["id"]
    await client.post(
        "/api/v1/revisions/",
        headers=auth_headers,
        json={"entityId": part_id, "entityType": "part", "revisionNumber": "1.0"},
    )
    resp = await client.get(
        "/api/v1/revisions/",
        headers=auth_headers,
        params={"partId": part_id},
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
