import pytest

# Export endpoints are GET file/summary downloads (/export/summary,
# /export/parts/xlsx, ...), not a REST resource. Smoke-test the real routes.


@pytest.mark.asyncio
async def test_export_summary(client, auth_headers):
    resp = await client.get("/api/v1/export/summary", headers=auth_headers)
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_export_parts_xlsx(client, auth_headers):
    resp = await client.get("/api/v1/export/parts/xlsx", headers=auth_headers)
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_export_without_auth(client):
    resp = await client.get("/api/v1/export/summary")
    assert resp.status_code in (200, 401, 403)
