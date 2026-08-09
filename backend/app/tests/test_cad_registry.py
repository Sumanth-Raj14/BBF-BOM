"""Every CAD connector is discoverable through the registry, builds from a
credentials dict, and fails honestly when the credentials are missing."""

import pytest

from app.integrations.cad import (
    CadAssembly,
    CadAuthError,
    CadConnector,
    CadConnectorError,
    CadDocumentRef,
    CadPartMetadata,
    build_connector,
    list_connector_types,
)

CREDENTIALS = {
    "onshape": {"access_key": "ak", "secret_key": "sk"},
    "fusion": {"client_id": "cid", "client_secret": "cs", "refresh_token": "rt"},
    "altium": {"workspace_domain": "acme.365.altium.com", "access_token": "tok"},
}


def test_all_three_connector_types_are_registered():
    assert list_connector_types() == ["altium", "fusion", "onshape"]


@pytest.mark.parametrize("connector_type", ["altium", "fusion", "onshape"])
def test_builds_from_credentials_dict(connector_type):
    connector = build_connector(connector_type, CREDENTIALS[connector_type], {})
    assert isinstance(connector, CadConnector)
    assert connector.connector_type == connector_type


@pytest.mark.asyncio
@pytest.mark.parametrize("connector_type", ["altium", "fusion", "onshape"])
async def test_missing_credentials_raise_instead_of_faking_success(connector_type):
    connector = build_connector(connector_type, {}, {})
    with pytest.raises(CadConnectorError):  # CadAuthError for all three today
        await connector.verify_connection()


@pytest.mark.asyncio
async def test_fusion_missing_credentials_is_an_auth_error():
    with pytest.raises(CadAuthError):
        await build_connector("fusion", {}, {}).verify_connection()


@pytest.mark.asyncio
async def test_altium_missing_workspace_domain_is_an_auth_error():
    with pytest.raises(CadAuthError):
        await build_connector("altium", {"access_token": "tok"}, {}).verify_connection()


@pytest.mark.asyncio
async def test_fusion_without_project_scope_refuses_to_list_documents():
    """hub_id/project_id live in config; without them there is nothing to list."""
    connector = build_connector("fusion", CREDENTIALS["fusion"], {})
    with pytest.raises(CadConnectorError):
        await connector.list_documents()


@pytest.mark.asyncio
async def test_adapters_return_framework_types(monkeypatch):
    """The whole point of the adapters: vendor dicts come back as the shared
    normalised dataclasses, identical in shape to Onshape's."""
    connector = build_connector("altium", CREDENTIALS["altium"], {})
    vendor = connector._client()

    async def fake_documents():
        return [{"external_id": "p1", "name": "Board", "description": "rev B"}]

    async def fake_structure(document_id):
        return {
            "external_id": "p1",
            "name": "Board",
            "part_number": None,
            "revision": None,
            "quantity": 1,
            "children": [
                {
                    "external_id": "MPN-1",
                    "part_number": "MPN-1",
                    "name": "10k resistor",
                    "revision": None,
                    "quantity": 3,
                    "children": [],
                    "designators": ["R1", "R2", "R5"],
                    "description": "RES 10k",
                }
            ],
        }

    monkeypatch.setattr(vendor, "list_documents", fake_documents)
    monkeypatch.setattr(vendor, "get_assembly_structure", fake_structure)

    docs = await connector.list_documents()
    assert [type(d) for d in docs] == [CadDocumentRef] and docs[0].id == "p1"

    assembly = await connector.get_assembly_structure("p1")
    assert isinstance(assembly, CadAssembly)
    assert assembly.connector_type == "altium" and assembly.root.is_assembly
    (child,) = assembly.root.children
    assert (child.part_number, child.quantity, child.is_assembly) == ("MPN-1", 3.0, False)
    # vendor-only fields survive in custom_properties rather than being dropped
    assert child.metadata.custom_properties["designators"] == ["R1", "R2", "R5"]
    assert child.metadata.description == "RES 10k"

    meta = await connector.get_part_metadata("p1", "MPN-1")
    assert isinstance(meta, CadPartMetadata) and meta.part_number == "MPN-1"
