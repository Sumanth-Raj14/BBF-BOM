import pytest

# GET file/summary exports (/export/summary, /export/parts/xlsx). Exact-code.


@pytest.mark.asyncio
async def test_export_summary(client, auth_headers):
    resp = await client.get("/api/v1/export/summary", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_export_parts_xlsx(client, auth_headers):
    resp = await client.get("/api/v1/export/parts/xlsx", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_export_summary_without_auth(client):
    resp = await client.get("/api/v1/export/summary")
    assert resp.status_code == 401
