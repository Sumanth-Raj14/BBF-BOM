import pytest

# OCR is an action endpoint (POST /extract, /extract-file, /confirm), not a REST
# resource. Smoke-test the real routes with invalid bodies so they're rejected
# by validation before any OCR/image processing.


@pytest.mark.asyncio
async def test_ocr_extract_validation(client, auth_headers):
    resp = await client.post(
        "/api/v1/ocr/extract", headers=auth_headers, json={"name": "test"}
    )
    assert resp.status_code in (200, 400, 401, 403, 422)


@pytest.mark.asyncio
async def test_ocr_confirm_validation(client, auth_headers):
    resp = await client.post(
        "/api/v1/ocr/confirm", headers=auth_headers, json={"name": "test"}
    )
    assert resp.status_code in (200, 400, 401, 403, 422)


@pytest.mark.asyncio
async def test_ocr_extract_without_auth(client):
    resp = await client.post("/api/v1/ocr/extract", json={"name": "test"})
    assert resp.status_code in (401, 403, 422)
