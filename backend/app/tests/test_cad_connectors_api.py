"""CAD connector framework routes.

Uses a FakeConnector (monkeypatched in place of `build_connector`) to test the
routes' own responsibilities — encryption at rest, connector-type validation,
honest test-connection reporting, and the assembly-import mapping into real
Parts/BOMItems via the existing services — independent of any one vendor's
wire format (that's covered for Onshape in test_cad_onshape_connector.py).
"""

import json

import pytest
from sqlalchemy import text

import app.api.endpoints.cad_connectors as cad_connectors_mod
from app.integrations.cad.base import CadAssembly, CadAuthError, CadNode, CadPartMetadata
from app.main import app as _app

# The controller wires this router into app/api/api_v1.py (a file this wave
# must not touch) with:
#   api_router.include_router(endpoints.cad_connectors.router, prefix="/cad-connectors", tags=["cad-connectors"])
# Mount it here too so these tests exercise the real route wiring even before
# that line lands.
if not any(getattr(r, "path", "").startswith("/api/v1/cad-connectors") for r in _app.routes):
    _before = list(_app.router.routes)
    _app.include_router(cad_connectors_mod.router, prefix="/api/v1/cad-connectors", tags=["cad-connectors"])
    # main.py registers a desktop-SPA catch-all (`GET /{full_path:path}`) that
    # fully matches any GET path (see ApiTrailingSlashMiddleware's docstring),
    # so a router appended after it would be shadowed on every GET. Splice
    # ours in ahead of the pre-existing routes so it's matched first here,
    # same as it will be once mounted properly inside app/api/api_v1.py.
    _new = [r for r in _app.router.routes if r not in _before]
    _app.router.routes[:] = _new + _before


class FakeConnector:
    """Stands in for a real CadConnector so route tests don't depend on any
    vendor's wire format."""

    def __init__(self, credentials, config=None, *, fail_auth=False, assembly=None):
        self.credentials = credentials
        self.config = config or {}
        self.fail_auth = fail_auth
        self.assembly = assembly

    async def verify_connection(self):
        if self.fail_auth:
            raise CadAuthError("bad credentials")
        return {"ok": True}

    async def list_documents(self):
        return []

    async def get_assembly_structure(self, document_id):
        return self.assembly

    async def get_part_metadata(self, document_id, part_id):
        return CadPartMetadata()


def _fake_build_connector_factory(**kwargs):
    def _build(connector_type, credentials, config=None):
        return FakeConnector(credentials, config, **kwargs)

    return _build


@pytest.mark.asyncio
async def test_create_connection_rejects_unknown_type(client, auth_headers):
    resp = await client.post(
        "/api/v1/cad-connectors",
        headers=auth_headers,
        json={"name": "Bad", "connector_type": "not-a-real-cad-system", "credentials": {}},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_connection_lists_onshape_type(client, auth_headers):
    resp = await client.get("/api/v1/cad-connectors/types", headers=auth_headers)
    assert resp.status_code == 200
    assert "onshape" in resp.json()["types"]


@pytest.mark.asyncio
async def test_create_connection_never_returns_credentials(client, auth_headers):
    resp = await client.post(
        "/api/v1/cad-connectors",
        headers=auth_headers,
        json={
            "name": "My Onshape",
            "connector_type": "onshape",
            "credentials": {"access_key": "AK123", "secret_key": "SUPERSECRET"},
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "credentials" not in data
    assert "SUPERSECRET" not in json.dumps(data)


@pytest.mark.asyncio
async def test_credentials_are_encrypted_at_rest(client, auth_headers, db_session):
    resp = await client.post(
        "/api/v1/cad-connectors",
        headers=auth_headers,
        json={
            "name": "Encrypted Onshape",
            "connector_type": "onshape",
            "credentials": {"access_key": "AK123", "secret_key": "SUPERSECRET"},
        },
    )
    connection_id = resp.json()["id"]

    # Raw SQL bypasses the ORM `load` event that would decrypt the column —
    # this is what an attacker with DB access (or a DB dump) would actually see.
    raw = (
        await db_session.execute(
            text("SELECT credentials FROM cad_connections WHERE id = :id"),
            {"id": connection_id},
        )
    ).scalar()
    assert raw is not None
    assert "SUPERSECRET" not in raw
    assert "AK123" not in raw
    assert raw.startswith("gAAAAA")  # Fernet ciphertext marker


@pytest.mark.asyncio
async def test_test_connection_reports_auth_failure_honestly(client, auth_headers, monkeypatch):
    create_resp = await client.post(
        "/api/v1/cad-connectors",
        headers=auth_headers,
        json={"name": "Broken", "connector_type": "onshape", "credentials": {"access_key": "x", "secret_key": "y"}},
    )
    connection_id = create_resp.json()["id"]

    monkeypatch.setattr(
        cad_connectors_mod, "build_connector", _fake_build_connector_factory(fail_auth=True)
    )
    resp = await client.post(f"/api/v1/cad-connectors/{connection_id}/test", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["reason"] == "auth_failed"

    # The connection's own stored status reflects the honest failure too.
    get_resp = await client.get("/api/v1/cad-connectors", headers=auth_headers)
    row = next(c for c in get_resp.json()["items"] if c["id"] == connection_id)
    assert row["status"] == "error"


@pytest.mark.asyncio
async def test_test_connection_reports_success(client, auth_headers, monkeypatch):
    create_resp = await client.post(
        "/api/v1/cad-connectors",
        headers=auth_headers,
        json={"name": "Good", "connector_type": "onshape", "credentials": {"access_key": "x", "secret_key": "y"}},
    )
    connection_id = create_resp.json()["id"]

    monkeypatch.setattr(cad_connectors_mod, "build_connector", _fake_build_connector_factory())
    resp = await client.post(f"/api/v1/cad-connectors/{connection_id}/test", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "reason": "ok", "detail": {"ok": True}}


@pytest.mark.asyncio
async def test_import_assembly_maps_normalised_tree_into_bom(client, auth_headers, monkeypatch):
    """A nested normalised tree (assembly -> part x2, sub-assembly -> part x1)
    becomes real Part/BOMItem rows with parent linkage and quantities intact —
    proving the importer works from the CadNode contract, not one vendor's shape.
    """
    create_resp = await client.post(
        "/api/v1/cad-connectors",
        headers=auth_headers,
        json={"name": "Importer", "connector_type": "onshape", "credentials": {"access_key": "x", "secret_key": "y"}},
    )
    connection_id = create_resp.json()["id"]

    tree = CadAssembly(
        document_id="doc-1",
        document_name="Widget",
        root=CadNode(
            id="root",
            name="Widget Assembly",
            is_assembly=True,
            children=[
                CadNode(id="n1", name="Bracket", part_number="BRK-100", quantity=2),
                CadNode(
                    id="n2",
                    name="Sub Assembly",
                    is_assembly=True,
                    quantity=1,
                    children=[CadNode(id="n3", name="Screw", part_number="SCR-5", quantity=4)],
                ),
            ],
        ),
    )
    monkeypatch.setattr(
        cad_connectors_mod, "build_connector", _fake_build_connector_factory(assembly=tree)
    )

    resp = await client.post(
        f"/api/v1/cad-connectors/{connection_id}/import",
        headers=auth_headers,
        json={"document_id": "doc-1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["items_created"] == 3
    assert data["parts_created"] == 3
    bom_id = data["bom_id"]

    items_resp = await client.get(f"/api/v1/bom/{bom_id}/items", headers=auth_headers)
    assert items_resp.status_code == 200
    items = items_resp.json()
    bracket = next(i for i in items if i["part_number"] == "BRK-100")
    assert float(bracket["quantity"]) == 2
    assert bracket["parent_item_id"] is None

    screw = next(i for i in items if i["part_number"] == "SCR-5")
    assert float(screw["quantity"]) == 4
    sub = next(i for i in items if i["id"] == screw["parent_item_id"])
    # The sub-assembly node has no vendor part_number, so its auto-created
    # Part falls back to a document/node-derived pn.
    assert sub["part_number"] == "CAD-doc-1-n2"

    parts_resp = await client.get("/api/v1/parts", headers=auth_headers, params={"search": "BRK-100"})
    assert parts_resp.status_code == 200
    assert any(p["pn"] == "BRK-100" for p in parts_resp.json()["items"])
