import pytest


@pytest.mark.asyncio
async def test_list_fai_reports(client, auth_headers):
    resp = await client.get("/api/v1/fai/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_fai_report(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "FAI-001", "name": "FAI Test Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.post(
        "/api/v1/fai/",
        headers=auth_headers,
        json={
            "faiNumber": "FAI-2026-TEST-001",
            "partId": part_id,
            "partName": "FAI Test Part",
            "partNumber": "FAI-001",
            "status": "Draft",
            "totalCharacteristics": 0,
            "passedCharacteristics": 0,
            "failedCharacteristics": 0,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["faiNumber"] == "FAI-2026-TEST-001"
    assert data["partId"] == part_id
    assert "id" in data


@pytest.mark.asyncio
async def test_get_fai_report(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "FAI-GET", "name": "Get FAI Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/fai/",
        headers=auth_headers,
        json={
            "faiNumber": "FAI-2026-GET-001",
            "partId": part_id,
            "partName": "Get FAI Part",
            "partNumber": "FAI-GET",
        },
    )
    fai_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/fai/{fai_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == fai_id


@pytest.mark.asyncio
async def test_get_fai_report_not_found(client, auth_headers):
    resp = await client.get("/api/v1/fai/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_fai_report(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "FAI-UPD", "name": "Update FAI Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/fai/",
        headers=auth_headers,
        json={
            "faiNumber": "FAI-2026-UPD-001",
            "partId": part_id,
            "partName": "Update FAI",
            "partNumber": "FAI-UPD",
        },
    )
    fai_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/fai/{fai_id}",
        headers=auth_headers,
        json={
            "status": "In Progress",
            "inspectorName": "John Doe",
            "characteristics": [
                {
                    "name": "Dimension A",
                    "nominal": 10.0,
                    "tolerance": 0.1,
                    "pass": True,
                },
                {
                    "name": "Dimension B",
                    "nominal": 20.0,
                    "tolerance": 0.2,
                    "pass": False,
                },
            ],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "In Progress"
    assert resp.json()["totalCharacteristics"] == 2
    assert resp.json()["passedCharacteristics"] == 1
    assert resp.json()["failedCharacteristics"] == 1


@pytest.mark.asyncio
async def test_delete_fai_report(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "FAI-DEL", "name": "Delete FAI Part"},
    )
    part_id = part_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/fai/",
        headers=auth_headers,
        json={
            "faiNumber": "FAI-2026-DEL-001",
            "partId": part_id,
            "partName": "Delete FAI",
            "partNumber": "FAI-DEL",
        },
    )
    fai_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/fai/{fai_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["detail"] == "FAI report deleted"
