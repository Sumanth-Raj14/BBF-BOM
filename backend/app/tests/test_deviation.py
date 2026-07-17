import pytest


@pytest.mark.asyncio
async def test_list_deviations(client, auth_headers):
    resp = await client.get("/api/v1/deviations/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_deviation(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "DEV-001", "name": "Deviation Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.post(
        "/api/v1/deviations/",
        headers=auth_headers,
        json={
            "deviationNumber": "DEV-2026-TEST-001",
            "title": "Test Deviation",
            "type": "Deviation",
            "partId": part_id,
            "deviationDescription": "Material deviation from spec",
            "riskLevel": "Medium",
            "status": "Draft",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["deviationNumber"] == "DEV-2026-TEST-001"
    assert data["title"] == "Test Deviation"
    assert data["riskLevel"] == "Medium"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_deviation(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/deviations/",
        headers=auth_headers,
        json={
            "deviationNumber": "DEV-2026-GET-001",
            "title": "Get Deviation",
            "type": "Waiver",
            "deviationDescription": "Waiver for testing",
        },
    )
    deviation_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/deviations/{deviation_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == deviation_id


@pytest.mark.asyncio
async def test_get_deviation_not_found(client, auth_headers):
    resp = await client.get("/api/v1/deviations/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_deviation(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/deviations/",
        headers=auth_headers,
        json={
            "deviationNumber": "DEV-2026-UPD-001",
            "title": "Old Deviation",
            "type": "Deviation",
            "deviationDescription": "Old description",
        },
    )
    deviation_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/deviations/{deviation_id}",
        headers=auth_headers,
        json={
            "title": "Updated Deviation",
            "riskLevel": "High",
            "impactAssessment": "Critical impact on production",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Deviation"
    assert resp.json()["riskLevel"] == "High"


@pytest.mark.asyncio
async def test_delete_deviation(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/deviations/",
        headers=auth_headers,
        json={
            "deviationNumber": "DEV-2026-DEL-001",
            "title": "Delete Deviation",
            "type": "Deviation",
            "deviationDescription": "To be deleted",
        },
    )
    deviation_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/deviations/{deviation_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["detail"] == "Deviation deleted"


@pytest.mark.asyncio
async def test_submit_deviation(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/deviations/",
        headers=auth_headers,
        json={
            "deviationNumber": "DEV-2026-SUB-001",
            "title": "Submit Deviation",
            "type": "Deviation",
            "deviationDescription": "To be submitted",
        },
    )
    deviation_id = create_resp.json()["id"]
    resp = await client.post(f"/api/v1/deviations/{deviation_id}/submit", headers=auth_headers)
    assert resp.status_code == 200
    assert "submitted" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_approve_deviation(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/deviations/",
        headers=auth_headers,
        json={
            "deviationNumber": "DEV-2026-APR-001",
            "title": "Approve Deviation",
            "type": "Deviation",
            "deviationDescription": "To be approved",
        },
    )
    deviation_id = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/deviations/{deviation_id}/approve",
        headers=auth_headers,
        params={"approvalType": "engineering", "approverName": "Test Engineer"},
    )
    assert resp.status_code == 200
    assert "engineering" in resp.json()["detail"]
