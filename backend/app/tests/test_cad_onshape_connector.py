"""Onshape CAD connector — mocked HTTP (no live vendor credentials exist here).

Covers: a successful assembly fetch mapped to the normalised CadNode tree
(quantity grouping across occurrences + one nested sub-assembly), an auth
failure surfacing honestly as CadAuthError (never a fake ok), pagination
across `next` links, and a 429 surfacing as CadRateLimitError with the
Retry-After it was given.
"""

import httpx
import pytest

from app.integrations.cad.base import CadAuthError, CadRateLimitError
from app.integrations.cad.onshape import DEFAULT_BASE_URL, OnshapeConnector

CREDS = {"access_key": "ak_test", "secret_key": "sk_test"}


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url=DEFAULT_BASE_URL)


@pytest.mark.asyncio
async def test_verify_connection_success():
    def handler(request):
        assert request.url.path.endswith("/documents")
        assert request.headers["Authorization"].startswith("Basic ")
        return httpx.Response(200, json={"items": [], "totalCount": 3})

    conn = OnshapeConnector(CREDS, http=_client(handler))
    result = await conn.verify_connection()
    assert result == {"ok": True, "documentCount": 3}


@pytest.mark.asyncio
async def test_verify_connection_auth_failure_is_honest():
    def handler(request):
        return httpx.Response(401, text="Invalid API key")

    conn = OnshapeConnector(CREDS, http=_client(handler))
    with pytest.raises(CadAuthError):
        await conn.verify_connection()


@pytest.mark.asyncio
async def test_verify_connection_missing_credentials_never_calls_network():
    conn = OnshapeConnector({}, http=_client(lambda r: httpx.Response(200, json={})))
    with pytest.raises(CadAuthError):
        await conn.verify_connection()


@pytest.mark.asyncio
async def test_list_documents_follows_pagination():
    page1 = "https://cad.onshape.com/api/v10/documents?limit=20&offset=20"
    calls = []

    def handler(request):
        calls.append(str(request.url))
        if "offset=20" in str(request.url):
            return httpx.Response(200, json={"items": [{"id": "d2", "name": "Doc2"}], "next": None})
        return httpx.Response(
            200, json={"items": [{"id": "d1", "name": "Doc1"}], "next": page1}
        )

    conn = OnshapeConnector(CREDS, http=_client(handler))
    docs = await conn.list_documents()
    assert [d.id for d in docs] == ["d1", "d2"]
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_rate_limit_raises_with_retry_after():
    def handler(request):
        return httpx.Response(429, headers={"Retry-After": "7"})

    conn = OnshapeConnector(CREDS, http=_client(handler))
    with pytest.raises(CadRateLimitError) as exc_info:
        await conn.list_documents()
    assert exc_info.value.retry_after == 7.0


@pytest.mark.asyncio
async def test_get_assembly_structure_maps_normalised_tree():
    did, wid, eid = "DID1", "WID1", "EID1"
    sub_did, sub_eid = "SUBDID", "SUBEID"

    def handler(request):
        path = request.url.path
        if path == f"/api/v10/documents/{did}":
            return httpx.Response(
                200, json={"id": did, "name": "Widget Assembly", "defaultWorkspace": {"id": wid}}
            )
        if path == f"/api/v10/documents/d/{did}/w/{wid}/elements":
            return httpx.Response(
                200,
                json=[
                    {"id": eid, "name": "Main Assembly", "elementType": "ASSEMBLY"},
                    {"id": "psid", "name": "Part Studio 1", "elementType": "PARTSTUDIO"},
                ],
            )
        if path == f"/api/v10/assemblies/d/{did}/w/{wid}/e/{eid}":
            return httpx.Response(
                200,
                json={
                    "rootAssembly": {
                        "instances": [
                            {
                                "id": "i1", "name": "Bracket <1>", "type": "Part",
                                "documentId": did, "elementId": eid, "partId": "p1",
                                "fullConfiguration": "default", "suppressed": False,
                            },
                            {
                                "id": "i2", "name": "Bracket <2>", "type": "Part",
                                "documentId": did, "elementId": eid, "partId": "p1",
                                "fullConfiguration": "default", "suppressed": False,
                            },
                            {
                                "id": "i3", "name": "Sub <1>", "type": "Assembly",
                                "documentId": sub_did, "elementId": sub_eid,
                                "fullConfiguration": "default", "suppressed": False,
                            },
                            {
                                "id": "i4", "name": "Ghost <1>", "type": "Part",
                                "documentId": did, "elementId": eid, "partId": "p9",
                                "fullConfiguration": "default", "suppressed": True,
                            },
                        ]
                    },
                    "subAssemblies": [
                        {
                            "documentId": sub_did, "elementId": sub_eid,
                            "fullConfiguration": "default",
                            "instances": [
                                {
                                    "id": "i5", "name": "Screw <1>", "type": "Part",
                                    "documentId": sub_did, "elementId": sub_eid, "partId": "p2",
                                    "fullConfiguration": "default", "suppressed": False,
                                }
                            ],
                        }
                    ],
                    "parts": [
                        {
                            "documentId": did, "elementId": eid, "partId": "p1",
                            "fullConfiguration": "default", "name": "Bracket",
                            "partNumber": "BRK-100",
                        },
                        {
                            "documentId": sub_did, "elementId": sub_eid, "partId": "p2",
                            "fullConfiguration": "default", "name": "Screw",
                            "partNumber": "SCR-5",
                        },
                    ],
                },
            )
        raise AssertionError(f"unexpected request to {path}")

    conn = OnshapeConnector(CREDS, http=_client(handler))
    assembly = await conn.get_assembly_structure(did)

    assert assembly.document_id == did
    assert assembly.document_name == "Widget Assembly"
    assert assembly.root.is_assembly is True
    # Suppressed "Ghost" instance is dropped; two Bracket occurrences collapse
    # into one node with quantity=2; the sub-assembly nests its own child.
    assert len(assembly.root.children) == 2

    bracket = next(n for n in assembly.root.children if not n.is_assembly)
    assert bracket.part_number == "BRK-100"
    assert bracket.quantity == 2

    sub = next(n for n in assembly.root.children if n.is_assembly)
    assert sub.is_assembly is True
    assert len(sub.children) == 1
    assert sub.children[0].part_number == "SCR-5"
    assert sub.children[0].quantity == 1


@pytest.mark.asyncio
async def test_get_part_metadata_parses_properties():
    did = "DID1"

    def handler(request):
        assert request.url.path == "/api/v10/metadata/d/DID1/w/WID1/e/EID1/p/p1"
        return httpx.Response(
            200,
            json={
                "properties": [
                    {"name": "Part number", "value": "BRK-100"},
                    {"name": "Material", "value": "Aluminum 6061"},
                    {"name": "Vendor Note", "value": "custom"},
                ]
            },
        )

    conn = OnshapeConnector(CREDS, http=_client(handler))
    meta = await conn.get_part_metadata(did, "WID1:EID1:p1")
    assert meta.part_number == "BRK-100"
    assert meta.material == "Aluminum 6061"
    assert meta.custom_properties == {"Vendor Note": "custom"}
