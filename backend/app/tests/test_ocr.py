import pytest

# Action endpoint (POST /extract, /confirm). Exact-code smoke tests.


@pytest.mark.asyncio
async def test_ocr_extract_empty(client, auth_headers):
    # OCRRequest fields are optional; empty request returns an empty result.
    resp = await client.post(
        "/api/v1/ocr/extract", headers=auth_headers, json={"name": "test"}
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_ocr_confirm_validation(client, auth_headers):
    resp = await client.post(
        "/api/v1/ocr/confirm", headers=auth_headers, json={"name": "test"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ocr_extract_without_auth(client):
    resp = await client.post("/api/v1/ocr/extract", json={"name": "test"})
    assert resp.status_code == 403
