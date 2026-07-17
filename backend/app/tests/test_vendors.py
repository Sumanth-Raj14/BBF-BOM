import pytest


@pytest.mark.asyncio
async def test_list_vendors(client, auth_headers):
    resp = await client.get("/api/v1/vendors/", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_create_vendor(client, auth_headers):
    resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={
            "name": "Test Vendor",
            "country": "US",
            "leadTime": 14,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Vendor"
    assert data["country"] == "US"


@pytest.mark.asyncio
async def test_get_vendor(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={"name": "Get Vendor", "country": "DE"},
    )
    vendor_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/vendors/{vendor_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Get Vendor"


@pytest.mark.asyncio
async def test_update_vendor(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={"name": "Update Vendor"},
    )
    vendor_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/vendors/{vendor_id}",
        headers=auth_headers,
        json={"name": "Updated Vendor"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Vendor"


@pytest.mark.asyncio
async def test_delete_vendor(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={"name": "Delete Vendor"},
    )
    vendor_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/vendors/{vendor_id}", headers=auth_headers)
    assert resp.status_code == 204
