import pytest


@pytest.mark.asyncio
async def test_list_supplier_scorecards(client, auth_headers):
    resp = await client.get("/api/v1/supplier-scorecards/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_supplier_scorecard(client, auth_headers):
    vendor_resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={"name": "Scorecard Vendor", "country": "US"},
    )
    vendor_id = vendor_resp.json()["id"]
    resp = await client.post(
        "/api/v1/supplier-scorecards/",
        headers=auth_headers,
        json={
            "vendorId": vendor_id,
            "period": "2026-Q1",
            "year": 2026,
            "quarter": 1,
            "qualityScore": 85.0,
            "deliveryScore": 90.0,
            "costScore": 75.0,
            "responsivenessScore": 80.0,
            "complianceScore": 95.0,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["vendorId"] == vendor_id
    assert data["weightedScore"] > 0
    assert data["grade"] is not None
    assert "id" in data


@pytest.mark.asyncio
async def test_get_supplier_scorecard(client, auth_headers):
    vendor_resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={"name": "Get SC Vendor", "country": "DE"},
    )
    vendor_id = vendor_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/supplier-scorecards/",
        headers=auth_headers,
        json={
            "vendorId": vendor_id,
            "period": "2026-Q2",
            "year": 2026,
            "quarter": 2,
            "qualityScore": 90.0,
            "deliveryScore": 85.0,
            "costScore": 80.0,
            "responsivenessScore": 70.0,
            "complianceScore": 90.0,
        },
    )
    scorecard_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/supplier-scorecards/{scorecard_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == scorecard_id


@pytest.mark.asyncio
async def test_get_supplier_scorecard_not_found(client, auth_headers):
    resp = await client.get("/api/v1/supplier-scorecards/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_supplier_scorecard(client, auth_headers):
    vendor_resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={"name": "Upd SC Vendor", "country": "JP"},
    )
    vendor_id = vendor_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/supplier-scorecards/",
        headers=auth_headers,
        json={
            "vendorId": vendor_id,
            "period": "2026-Q3",
            "year": 2026,
            "quarter": 3,
            "qualityScore": 70.0,
            "deliveryScore": 70.0,
            "costScore": 70.0,
            "responsivenessScore": 70.0,
            "complianceScore": 70.0,
        },
    )
    scorecard_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/supplier-scorecards/{scorecard_id}",
        headers=auth_headers,
        json={"qualityScore": 95.0, "notes": "Improved quality processes"},
    )
    assert resp.status_code == 200
    assert resp.json()["qualityScore"] == 95.0


@pytest.mark.asyncio
async def test_delete_supplier_scorecard(client, auth_headers):
    vendor_resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={"name": "Del SC Vendor", "country": "CN"},
    )
    vendor_id = vendor_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/supplier-scorecards/",
        headers=auth_headers,
        json={
            "vendorId": vendor_id,
            "period": "2026-Q4",
            "year": 2026,
            "quarter": 4,
            "qualityScore": 80.0,
            "deliveryScore": 80.0,
            "costScore": 80.0,
            "responsivenessScore": 80.0,
            "complianceScore": 80.0,
        },
    )
    scorecard_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/supplier-scorecards/{scorecard_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["detail"] == "Scorecard deleted"
