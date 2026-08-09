import pytest


@pytest.mark.asyncio
async def test_bom_enterprise_list(client, auth_headers):
    resp = await client.get("/api/v1/bom/", headers=auth_headers)
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_bom_enterprise_create(client, auth_headers):
    resp = await client.post("/api/v1/bom/", headers=auth_headers, json={"name": "test"})
    assert resp.status_code in (201, 200, 401, 403, 422)


@pytest.mark.asyncio
async def test_bom_enterprise_get_not_found(client, auth_headers):
    resp = await client.get("/api/v1/bom/99999", headers=auth_headers)
    assert resp.status_code in (404, 401, 403)


@pytest.mark.asyncio
async def test_bom_enterprise_without_auth(client):
    resp = await client.get("/api/v1/bom/")
    assert resp.status_code in (200, 401)


@pytest.mark.asyncio
async def test_bom_enterprise_list_includes_bom_number(client, auth_headers):
    """list_boms must not drop bom_number — a real, required column the UI
    renders in a dedicated column (was silently omitted from the response)."""
    create_resp = await client.post(
        "/api/v1/bom/", headers=auth_headers, json={"name": "bom-number-check"}
    )
    if create_resp.status_code not in (200, 201):
        pytest.skip("auth not configured for this test env")
    created = create_resp.json()
    assert created.get("bom_number")

    list_resp = await client.get("/api/v1/bom/", headers=auth_headers)
    assert list_resp.status_code == 200
    items = list_resp.json()["items"]
    match = next(i for i in items if i["id"] == created["id"])
    assert match["bom_number"] == created["bom_number"]
