import pytest


@pytest.mark.asyncio
async def test_list_bom_templates(client, auth_headers):
    resp = await client.get("/api/v1/bom-templates/", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_create_bom_template(client, auth_headers):
    resp = await client.post(
        "/api/v1/bom-templates/",
        headers=auth_headers,
        json={
            "name": "Test Template",
            "description": "A test BOM template",
            "projectCode": "PRJ-001",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Template"
    assert data["projectCode"] == "PRJ-001"


@pytest.mark.asyncio
async def test_get_bom_template(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/bom-templates/",
        headers=auth_headers,
        json={"name": "Get Template", "description": "Get me"},
    )
    template_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/bom-templates/{template_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Get Template"


@pytest.mark.asyncio
async def test_update_bom_template(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/bom-templates/",
        headers=auth_headers,
        json={"name": "Old Template"},
    )
    template_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/bom-templates/{template_id}",
        headers=auth_headers,
        json={"name": "New Template"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Template"


@pytest.mark.asyncio
async def test_delete_bom_template(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/bom-templates/",
        headers=auth_headers,
        json={"name": "Delete Template"},
    )
    template_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/bom-templates/{template_id}", headers=auth_headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_load_bom_template(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/bom-templates/",
        headers=auth_headers,
        json={"name": "Load Template"},
    )
    template_id = create_resp.json()["id"]
    resp = await client.post(f"/api/v1/bom-templates/{template_id}/load", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "bomData" in data
