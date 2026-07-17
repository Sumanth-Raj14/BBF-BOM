import pytest


@pytest.mark.asyncio
async def test_list_contracts(client, auth_headers):
    resp = await client.get("/api/v1/contracts/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_contract(client, auth_headers):
    vendor_resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={"name": "Contract Vendor", "country": "US"},
    )
    vendor_id = vendor_resp.json()["id"]
    resp = await client.post(
        "/api/v1/contracts/",
        headers=auth_headers,
        json={
            "contractNumber": "CTR-2026-TEST-001",
            "title": "Test Contract",
            "vendorId": vendor_id,
            "contractType": "blanket_po",
            "status": "Draft",
            "currency": "USD",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["contractNumber"] == "CTR-2026-TEST-001"
    assert data["title"] == "Test Contract"
    assert data["vendorId"] == vendor_id
    assert "id" in data


@pytest.mark.asyncio
async def test_get_contract(client, auth_headers):
    vendor_resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={"name": "Get Contract Vendor", "country": "DE"},
    )
    vendor_id = vendor_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/contracts/",
        headers=auth_headers,
        json={
            "contractNumber": "CTR-2026-GET-001",
            "title": "Get Contract",
            "vendorId": vendor_id,
        },
    )
    contract_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/contracts/{contract_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == contract_id


@pytest.mark.asyncio
async def test_get_contract_not_found(client, auth_headers):
    resp = await client.get("/api/v1/contracts/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_contract(client, auth_headers):
    vendor_resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={"name": "Upd Contract Vendor", "country": "JP"},
    )
    vendor_id = vendor_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/contracts/",
        headers=auth_headers,
        json={
            "contractNumber": "CTR-2026-UPD-001",
            "title": "Old Contract",
            "vendorId": vendor_id,
        },
    )
    contract_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/contracts/{contract_id}",
        headers=auth_headers,
        json={"title": "Updated Contract", "status": "Active"},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Contract"
    assert resp.json()["status"] == "Active"


@pytest.mark.asyncio
async def test_delete_contract(client, auth_headers):
    vendor_resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={"name": "Del Contract Vendor", "country": "CN"},
    )
    vendor_id = vendor_resp.json()["id"]
    create_resp = await client.post(
        "/api/v1/contracts/",
        headers=auth_headers,
        json={
            "contractNumber": "CTR-2026-DEL-001",
            "title": "Delete Contract",
            "vendorId": vendor_id,
        },
    )
    contract_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/contracts/{contract_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["detail"] == "Contract deleted"
