import pytest


@pytest.mark.asyncio
async def test_list_capas(client, auth_headers):
    resp = await client.get("/api/v1/capas/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_capa(client, auth_headers):
    resp = await client.post(
        "/api/v1/capas/",
        headers=auth_headers,
        json={
            "capaNumber": "CAPA-2026-TEST-001",
            "title": "Test CAPA",
            "type": "Corrective",
            "problemDescription": "Test defect in production line",
            "status": "Open",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["capaNumber"] == "CAPA-2026-TEST-001"
    assert data["title"] == "Test CAPA"
    assert data["type"] == "Corrective"
    assert data["status"] == "Open"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_capa(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/capas/",
        headers=auth_headers,
        json={
            "capaNumber": "CAPA-2026-GET-001",
            "title": "Get CAPA",
            "type": "Preventive",
            "problemDescription": "Preventive action needed",
        },
    )
    capa_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/capas/{capa_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == capa_id


@pytest.mark.asyncio
async def test_get_capa_not_found(client, auth_headers):
    resp = await client.get("/api/v1/capas/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_capa(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/capas/",
        headers=auth_headers,
        json={
            "capaNumber": "CAPA-2026-UPD-001",
            "title": "Old CAPA",
            "type": "Corrective",
            "problemDescription": "Old problem",
        },
    )
    capa_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/capas/{capa_id}",
        headers=auth_headers,
        json={
            "title": "Updated CAPA",
            "rootCause": "Root cause identified",
            "correctiveAction": "Action plan created",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated CAPA"
    assert resp.json()["rootCause"] == "Root cause identified"


@pytest.mark.asyncio
async def test_delete_capa(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/capas/",
        headers=auth_headers,
        json={
            "capaNumber": "CAPA-2026-DEL-001",
            "title": "Delete CAPA",
            "type": "Corrective",
            "problemDescription": "To be deleted",
        },
    )
    capa_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/capas/{capa_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["detail"] == "CAPA deleted"


@pytest.mark.asyncio
async def test_verify_capa_effective(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/capas/",
        headers=auth_headers,
        json={
            "capaNumber": "CAPA-2026-VER-001",
            "title": "Verify CAPA",
            "type": "Corrective",
            "problemDescription": "To be verified",
        },
    )
    capa_id = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/capas/{capa_id}/verify",
        headers=auth_headers,
        params={"result": "Effective"},
    )
    assert resp.status_code == 200
    assert "Effective" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_verify_capa_not_effective(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/capas/",
        headers=auth_headers,
        json={
            "capaNumber": "CAPA-2026-VER2-001",
            "title": "Verify CAPA 2",
            "type": "Preventive",
            "problemDescription": "Not effective test",
        },
    )
    capa_id = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/capas/{capa_id}/verify",
        headers=auth_headers,
        params={"result": "Not Effective"},
    )
    assert resp.status_code == 200
    assert "Not Effective" in resp.json()["detail"]
