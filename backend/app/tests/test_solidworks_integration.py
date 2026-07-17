"""SolidWorks integration router — real contract tests.

(Previously auto-generated stubs asserting a generic CRUD root the router never
had; rewritten to exercise the actual endpoints: list imported BOMs + auth guard.)"""

import pytest


@pytest.mark.asyncio
async def test_list_imported_boms_requires_auth(client):
    resp = await client.get("/api/v1/solidworks/")
    assert resp.status_code in (401, 403)  # authentication is required


@pytest.mark.asyncio
async def test_list_imported_boms_ok(client, auth_headers):
    resp = await client.get("/api/v1/solidworks/", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_sync_then_list_shows_bom(client, auth_headers):
    payload = {
        "source_file": "Widget.SLDASM",
        "model_type": "Assembly",
        "items": [
            {"component_name": "Widget", "part_number": "W-1", "quantity": 1,
             "level": 0, "is_assembly": True},
            {"component_name": "Screw", "part_number": "W-2", "quantity": 4,
             "level": 1, "cost": "0.05"},
        ],
    }
    r = await client.post("/api/v1/solidworks/sync", headers=auth_headers, json=payload)
    assert r.status_code == 200, r.text

    listing = await client.get("/api/v1/solidworks/", headers=auth_headers)
    assert listing.status_code == 200
    names = [b["name"] for b in listing.json()]
    assert "Widget.SLDASM" in names


@pytest.mark.asyncio
async def test_bom_structure_not_found(client, auth_headers):
    resp = await client.get(
        "/api/v1/solidworks/bom-structure",
        headers=auth_headers,
        params={"source_file": "DoesNotExist.SLDASM"},
    )
    assert resp.status_code == 404
