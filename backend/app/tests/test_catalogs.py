"""Tests for catalog CRUD + part<->catalog linking (app/api/endpoints/catalogs.py).

NOTE ON WIRING: per the schema-contract hard rules for this workstream,
app/api/api_v1.py (the shared router-registration file) is NOT edited here —
the real include line is reported in the build manifest for a later,
conflict-free merge. So this module self-registers the catalogs router onto
the app under its intended final path (guarded so it's a no-op once api_v1.py
is actually wired), letting these tests exercise the real router/service code
end-to-end today.
"""

import pytest

from app.main import app
from app.api.endpoints import catalogs as catalogs_module

_CATALOGS_PREFIX = "/api/v1/catalogs"

if not any(getattr(r, "path", "").startswith(_CATALOGS_PREFIX) for r in app.routes):
    _before_count = len(app.routes)
    app.include_router(catalogs_module.router, prefix=_CATALOGS_PREFIX, tags=["catalogs"])
    # include_router() appends new routes at the end of app.routes. In dev,
    # main.py registers a catch-all `GET /{full_path:path}` (SPA fallback) that
    # Starlette matches immediately for ANY GET path (full match wins as soon
    # as it's found while scanning app.routes in order), so routes appended
    # after it are never reached for GET. Move our newly-added routes to
    # before that catch-all (or to the front, if it isn't registered) so this
    # self-registration behaves like a normal startup-time include_router.
    _new_routes = app.routes[_before_count:]
    del app.routes[_before_count:]
    _insert_at = next(
        (i for i, r in enumerate(app.routes) if getattr(r, "path", None) == "/{full_path:path}"),
        0,
    )
    for _offset, _r in enumerate(_new_routes):
        app.routes.insert(_insert_at + _offset, _r)


async def _create_part(client, auth_headers, pn="CAT-PART-001", name="Catalog Test Part"):
    resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": pn, "name": name},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _create_catalog(
    client, auth_headers, catalog_code="CAT-001", catalog_name="Test Catalog"
):
    resp = await client.post(
        f"{_CATALOGS_PREFIX}/",
        headers=auth_headers,
        json={"catalog_code": catalog_code, "catalog_name": catalog_name, "description": "desc"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_create_and_get_catalog(client, auth_headers):
    created = await _create_catalog(client, auth_headers, "CAT-CREATE", "Create Catalog")
    assert created["catalog_code"] == "CAT-CREATE"
    assert created["catalog_name"] == "Create Catalog"
    assert created["is_active"] is True

    resp = await client.get(f"{_CATALOGS_PREFIX}/{created['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


@pytest.mark.asyncio
async def test_create_catalog_duplicate_code_rejected(client, auth_headers):
    await _create_catalog(client, auth_headers, "CAT-DUP", "First")
    resp = await client.post(
        f"{_CATALOGS_PREFIX}/",
        headers=auth_headers,
        json={"catalog_code": "CAT-DUP", "catalog_name": "Second"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_catalog_not_found(client, auth_headers):
    resp = await client.get(f"{_CATALOGS_PREFIX}/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_catalogs_and_search(client, auth_headers):
    await _create_catalog(client, auth_headers, "CAT-LIST-1", "Electrical Parts")
    await _create_catalog(client, auth_headers, "CAT-LIST-2", "Mechanical Parts")

    resp = await client.get(f"{_CATALOGS_PREFIX}/", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 2
    codes = {c["catalog_code"] for c in body["items"]}
    assert "CAT-LIST-1" in codes
    assert "CAT-LIST-2" in codes

    resp = await client.get(
        f"{_CATALOGS_PREFIX}/", headers=auth_headers, params={"search": "Electrical"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert all("Electrical" in c["catalog_name"] for c in body["items"])


@pytest.mark.asyncio
async def test_update_catalog(client, auth_headers):
    created = await _create_catalog(client, auth_headers, "CAT-UPD", "Original Name")
    resp = await client.put(
        f"{_CATALOGS_PREFIX}/{created['id']}",
        headers=auth_headers,
        json={"catalog_name": "Renamed", "description": "new desc"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["catalog_name"] == "Renamed"
    assert data["description"] == "new desc"
    assert data["catalog_code"] == "CAT-UPD"


@pytest.mark.asyncio
async def test_deactivate_catalog(client, auth_headers):
    created = await _create_catalog(client, auth_headers, "CAT-DEACT", "To Deactivate")
    resp = await client.post(
        f"{_CATALOGS_PREFIX}/{created['id']}/deactivate", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_add_part_to_catalog_and_list(client, auth_headers):
    catalog = await _create_catalog(client, auth_headers, "CAT-PARTS", "Parts Catalog")
    part_id = await _create_part(client, auth_headers, "PART-ADD-1", "Widget")

    resp = await client.post(
        f"{_CATALOGS_PREFIX}/{catalog['id']}/parts",
        headers=auth_headers,
        json={"partId": part_id},
    )
    assert resp.status_code == 200, resp.text
    link = resp.json()
    assert link["partId"] == part_id
    assert link["catalogId"] == catalog["id"]
    assert link["created"] is True

    # Idempotent add-or-update: same part again should not create a duplicate row.
    resp2 = await client.post(
        f"{_CATALOGS_PREFIX}/{catalog['id']}/parts",
        headers=auth_headers,
        json={"partId": part_id},
    )
    assert resp2.status_code == 200
    assert resp2.json()["created"] is False
    assert resp2.json()["id"] == link["id"]

    resp = await client.get(f"{_CATALOGS_PREFIX}/{catalog['id']}/parts", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["partId"] == part_id
    assert body["items"][0]["pn"] == "PART-ADD-1"


@pytest.mark.asyncio
async def test_add_part_to_catalog_missing_part(client, auth_headers):
    catalog = await _create_catalog(client, auth_headers, "CAT-MISSING-PART", "Catalog")
    resp = await client.post(
        f"{_CATALOGS_PREFIX}/{catalog['id']}/parts",
        headers=auth_headers,
        json={"partId": 999999},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_add_part_to_missing_catalog(client, auth_headers):
    part_id = await _create_part(client, auth_headers, "PART-NO-CAT", "Orphan Part")
    resp = await client.post(
        f"{_CATALOGS_PREFIX}/999999/parts",
        headers=auth_headers,
        json={"partId": part_id},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_remove_part_from_catalog(client, auth_headers):
    catalog = await _create_catalog(client, auth_headers, "CAT-REMOVE", "Removal Catalog")
    part_id = await _create_part(client, auth_headers, "PART-REMOVE-1", "Removable Widget")

    await client.post(
        f"{_CATALOGS_PREFIX}/{catalog['id']}/parts",
        headers=auth_headers,
        json={"partId": part_id},
    )

    resp = await client.delete(
        f"{_CATALOGS_PREFIX}/{catalog['id']}/parts/{part_id}", headers=auth_headers
    )
    assert resp.status_code == 204

    resp = await client.get(f"{_CATALOGS_PREFIX}/{catalog['id']}/parts", headers=auth_headers)
    assert resp.json()["total"] == 0

    # Removing again is a 404 (link no longer exists).
    resp = await client.delete(
        f"{_CATALOGS_PREFIX}/{catalog['id']}/parts/{part_id}", headers=auth_headers
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_catalogs_without_auth(client):
    resp = await client.get(f"{_CATALOGS_PREFIX}/")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_catalog_from_folder(client, auth_headers, tmp_path):
    folder = tmp_path / "parts_folder"
    folder.mkdir()
    (folder / "Bracket-100.step").write_text(
        "ISO-10303-21;\nPRODUCT('Bracket-100','A mounting bracket','',(#1));\nENDSEC;\n"
    )
    (folder / "readme.txt").write_text("just a note, not a part file")

    resp = await client.post(
        f"{_CATALOGS_PREFIX}/from-folder",
        headers=auth_headers,
        data={
            "catalog_code": "CAT-FOLDER",
            "catalog_name": "Folder Import",
            "folder_path": str(folder),
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["filesScanned"] == 2
    assert body["partsCreated"] == 2
    assert body["partsLinked"] == 2
    assert body["catalog"]["catalog_code"] == "CAT-FOLDER"

    resp = await client.get(
        f"{_CATALOGS_PREFIX}/{body['catalog']['id']}/parts", headers=auth_headers
    )
    assert resp.status_code == 200
    pns = {item["pn"] for item in resp.json()["items"]}
    assert "Bracket-100" in pns
    assert "readme" in pns


@pytest.mark.asyncio
async def test_create_catalog_from_folder_not_found(client, auth_headers):
    resp = await client.post(
        f"{_CATALOGS_PREFIX}/from-folder",
        headers=auth_headers,
        data={
            "catalog_code": "CAT-NOFOLDER",
            "catalog_name": "No Folder",
            "folder_path": "/definitely/not/a/real/path/xyz",
        },
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_catalog_from_folder_requires_source(client, auth_headers):
    resp = await client.post(
        f"{_CATALOGS_PREFIX}/from-folder",
        headers=auth_headers,
        data={"catalog_code": "CAT-NOSRC", "catalog_name": "No Source"},
    )
    assert resp.status_code == 400
