import pytest


@pytest.mark.asyncio
async def test_generate_barcode(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "BC-001", "name": "Barcode Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.get(f"/api/v1/barcodes/generate/{part_id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["partId"] == part_id
    assert data["pn"] == "BC-001"
    assert "barcode" in data
    assert "imageUrl" in data


@pytest.mark.asyncio
async def test_generate_barcode_not_found(client, auth_headers):
    resp = await client.get("/api/v1/barcodes/generate/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_generate_barcode_with_format(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "BC-FMT", "name": "Format Barcode Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.get(
        f"/api/v1/barcodes/generate/{part_id}",
        headers=auth_headers,
        params={"fmt": "code128"},
    )
    assert resp.status_code == 200
    assert resp.json()["format"] == "code128"


@pytest.mark.asyncio
async def test_get_barcode_image(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "BC-IMG", "name": "Image Barcode Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.get(f"/api/v1/barcodes/image/{part_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert "image" in resp.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_get_barcode_image_not_found(client, auth_headers):
    resp = await client.get("/api/v1/barcodes/image/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_qr_code(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "BC-QR", "name": "QR Code Part"},
    )
    part_id = part_resp.json()["id"]
    resp = await client.get(f"/api/v1/barcodes/qr/{part_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert "image" in resp.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_get_qr_code_not_found(client, auth_headers):
    resp = await client.get("/api/v1/barcodes/qr/99999", headers=auth_headers)
    assert resp.status_code == 404
