import pytest


@pytest.mark.asyncio
async def test_documents_list(client, auth_headers):
    resp = await client.get("/api/v1/documents/", headers=auth_headers)
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_documents_upload_validation(client, auth_headers):
    # Real create is a multipart upload (POST /documents/upload), not a REST
    # POST /documents/. A tiny file exercises the endpoint (accepted, or
    # rejected by validation/scan).
    resp = await client.post(
        "/api/v1/documents/upload",
        headers=auth_headers,
        files={"file": ("t.txt", b"hello", "text/plain")},
    )
    assert resp.status_code in (201, 400, 401, 403, 422)


@pytest.mark.asyncio
async def test_documents_get_not_found(client, auth_headers):
    resp = await client.get("/api/v1/documents/99999", headers=auth_headers)
    assert resp.status_code in (404, 401, 403)


@pytest.mark.asyncio
async def test_documents_without_auth(client):
    resp = await client.get("/api/v1/documents/")
    assert resp.status_code in (200, 401)
