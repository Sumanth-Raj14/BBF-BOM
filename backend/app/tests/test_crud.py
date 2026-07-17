"""Comprehensive CRUD integration tests for core API endpoints."""

import pytest


@pytest.mark.asyncio
async def test_crud_part_lifecycle(client, auth_headers):
    h = auth_headers
    # CREATE
    create = await client.post(
        "/api/v1/parts/",
        json={
            "pn": "CRUD-TEST-001",
            "name": "CRUD Test Part",
            "description": "Created during CRUD test",
            "uom": "ea",
            "category": "Electrical",
        },
        headers=h,
    )
    assert create.status_code == 201
    pid = create.json()["id"]

    # READ
    get = await client.get(f"/api/v1/parts/{pid}", headers=h)
    assert get.status_code == 200
    assert get.json()["pn"] == "CRUD-TEST-001"

    # UPDATE
    update = await client.put(
        f"/api/v1/parts/{pid}",
        json={
            "name": "CRUD Test Part Updated",
        },
        headers=h,
    )
    assert update.status_code == 200
    assert update.json()["name"] == "CRUD Test Part Updated"

    # LIST
    lst = await client.get("/api/v1/parts/", headers=h)
    assert lst.status_code == 200
    assert any(p["id"] == pid for p in lst.json()["items"])

    # DELETE
    delete = await client.delete(f"/api/v1/parts/{pid}", headers=h)
    assert delete.status_code == 204


@pytest.mark.asyncio
async def test_crud_vendor_lifecycle(client, auth_headers):
    h = auth_headers
    create = await client.post(
        "/api/v1/vendors/",
        json={
            "name": "CRUD Vendor",
            "country": "US",
            "contactEmail": "vendor@test.com",
        },
        headers=h,
    )
    assert create.status_code == 201
    vid = create.json()["id"]

    get = await client.get(f"/api/v1/vendors/{vid}", headers=h)
    assert get.status_code == 200
    assert get.json()["name"] == "CRUD Vendor"

    update = await client.put(
        f"/api/v1/vendors/{vid}",
        json={
            "name": "CRUD Vendor Updated",
        },
        headers=h,
    )
    assert update.status_code == 200

    delete = await client.delete(f"/api/v1/vendors/{vid}", headers=h)
    assert delete.status_code == 204


@pytest.mark.asyncio
async def test_crud_project_lifecycle(client, auth_headers):
    h = auth_headers
    create = await client.post(
        "/api/v1/projects/",
        json={
            "name": "CRUD Project",
            "code": "CRUD-PROJ",
            "description": "CRUD test project",
        },
        headers=h,
    )
    assert create.status_code == 201
    pid = create.json()["id"]

    get = await client.get(f"/api/v1/projects/{pid}", headers=h)
    assert get.status_code == 200

    update = await client.put(
        f"/api/v1/projects/{pid}",
        json={
            "name": "CRUD Project Updated",
        },
        headers=h,
    )
    assert update.status_code == 200

    delete = await client.delete(f"/api/v1/projects/{pid}", headers=h)
    assert delete.status_code == 204


@pytest.mark.asyncio
async def test_crud_bom_lifecycle(client, auth_headers):
    h = auth_headers
    create = await client.post(
        "/api/v1/projects/",
        json={
            "name": "BOM CRUD Project",
            "code": "BOM-CRUD",
        },
        headers=h,
    )
    assert create.status_code == 201
    proj_id = create.json()["id"]

    r = await client.post(
        "/api/v1/bom-templates/",
        json={
            "name": "CRUD BOM",
            "description": "BOM created during CRUD test",
            "projectCode": "BOM-CRUD",
        },
        headers=h,
    )
    assert r.status_code == 201
    bom_id = r.json()["id"]

    get = await client.get(f"/api/v1/bom-templates/{bom_id}", headers=h)
    assert get.status_code == 200

    delete = await client.delete(f"/api/v1/projects/{proj_id}", headers=h)
    assert delete.status_code == 204


@pytest.mark.asyncio
async def test_crud_document_lifecycle(client, auth_headers):
    import io

    h = auth_headers
    create = await client.post(
        "/api/v1/documents/upload",
        files={"file": ("crud-test-doc.txt", io.BytesIO(b"hello world"), "text/plain")},
        data={"category": "Test"},
        headers={k: v for k, v in h.items() if k != "Content-Type"},
    )
    assert create.status_code == 201
    did = create.json()["id"]

    get = await client.get(f"/api/v1/documents/{did}", headers=h)
    assert get.status_code == 200

    update = await client.put(
        f"/api/v1/documents/{did}",
        json={"tags": "updated"},
        headers=h,
    )
    assert update.status_code == 200

    delete = await client.delete(f"/api/v1/documents/{did}", headers=h)
    assert delete.status_code == 204


@pytest.mark.asyncio
async def test_crud_purchase_order_flow(client, auth_headers):
    h = auth_headers
    # Create a vendor first
    vendor = await client.post(
        "/api/v1/vendors/",
        json={"name": "PO Test Vendor", "country": "US"},
        headers=h,
    )
    assert vendor.status_code == 201
    vendor_id = vendor.json()["id"]

    # Create a part first
    part = await client.post(
        "/api/v1/parts/",
        json={"pn": "PO-PART-001", "name": "PO Test Part", "category": "Electrical"},
        headers=h,
    )
    assert part.status_code == 201
    part_id = part.json()["id"]

    po = await client.post(
        "/api/v1/procurement/",
        json={
            "partId": part_id,
            "vendorId": vendor_id,
            "qty": 10,
        },
        headers=h,
    )
    assert po.status_code == 201
    po_id = po.json()["id"]
    get = await client.get(f"/api/v1/procurement/{po_id}", headers=h)
    assert get.status_code == 200
