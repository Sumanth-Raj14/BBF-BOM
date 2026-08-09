"""Tests for the Autodesk Fusion 360 / APS CAD connector (app.integrations.cad.fusion).

Covers, with MOCKED HTTP only (httpx.MockTransport — no live Autodesk calls):
  * authorize-URL construction (3-legged OAuth consent redirect);
  * authorization-code token exchange (Basic client auth, correct grant);
  * refresh-token handling, including refresh-token rotation;
  * an honest "not configured" error when no credentials/refresh token exist
    (and that NO HTTP call is made in that case);
  * Data Management hub/project listing mapped to {external_id, name};
  * a full assembly fetch (item versions -> translation job -> manifest poll
    -> object tree + properties) mapped to the normalised
    {external_id, part_number, name, revision, quantity, children} tree.
"""

import time

import httpx
import pytest

from app.integrations.cad.fusion import (
    APS_HOST,
    FusionConnector,
    FusionDerivativeFailedError,
    FusionDerivativeNotReadyError,
    FusionNotConfiguredError,
    build_authorize_url,
    dump_auth_blob,
    exchange_code,
    load_auth_blob,
    refresh_access_token,
)


def _connector(handler, *, auth_blob):
    return FusionConnector(
        auth_blob=auth_blob, http=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )


def _valid_token_blob(**extra):
    return {
        "client_id": "cid",
        "client_secret": "csecret",
        "refresh_token": "rtok",
        "access_token": "cached-tok",
        "access_token_expires_at": time.time() + 3600,
        **extra,
    }


# --- OAuth --------------------------------------------------------------


def test_authorize_url_builds_expected_params():
    url = build_authorize_url(
        client_id="cid", redirect_uri="https://app.example/cb", state="STATE123"
    )
    assert url.startswith(f"{APS_HOST}/authentication/v2/authorize?")
    assert "response_type=code" in url
    assert "client_id=cid" in url
    assert "redirect_uri=https%3A%2F%2Fapp.example%2Fcb" in url
    assert "state=STATE123" in url
    assert "scope=data%3Aread" in url


@pytest.mark.asyncio
async def test_exchange_code_posts_correct_grant_and_basic_auth():
    seen = {}

    def handler(request):
        seen["path"] = request.url.path
        seen["auth"] = request.headers.get("authorization")
        body = request.read().decode()
        seen["body"] = body
        return httpx.Response(
            200, json={"access_token": "at1", "refresh_token": "rt1", "expires_in": 3600}
        )

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    data = await exchange_code(
        code="AUTHCODE", client_id="cid", client_secret="csecret",
        redirect_uri="https://app.example/cb", http=http,
    )

    assert data["access_token"] == "at1"
    assert seen["path"] == "/authentication/v2/token"
    assert seen["auth"] and seen["auth"].startswith("Basic ")
    assert "grant_type=authorization_code" in seen["body"]
    assert "code=AUTHCODE" in seen["body"]


@pytest.mark.asyncio
async def test_refresh_access_token_sends_refresh_grant():
    def handler(request):
        assert "grant_type=refresh_token" in request.read().decode()
        return httpx.Response(200, json={"access_token": "at2", "expires_in": 1800})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    data = await refresh_access_token(
        refresh_token="rtok", client_id="cid", client_secret="csecret", http=http
    )
    assert data["access_token"] == "at2"


@pytest.mark.asyncio
async def test_authenticate_refreshes_expired_token_and_rotates_refresh_token():
    def handler(request):
        return httpx.Response(
            200, json={"access_token": "fresh-tok", "refresh_token": "rotated-rt", "expires_in": 3600}
        )

    connector = _connector(
        handler,
        auth_blob=_valid_token_blob(access_token=None, access_token_expires_at=None),
    )
    token = await connector.authenticate()
    assert token == "fresh-tok"
    assert connector.auth_blob()["refresh_token"] == "rotated-rt"


@pytest.mark.asyncio
async def test_authenticate_uses_cached_token_without_http_call():
    def handler(request):
        raise AssertionError("no HTTP call expected when the cached token is still valid")

    connector = _connector(handler, auth_blob=_valid_token_blob())
    token = await connector.authenticate()
    assert token == "cached-tok"


@pytest.mark.asyncio
async def test_not_configured_honest_error_no_http_call():
    def handler(request):
        raise AssertionError("no HTTP call expected for an unconfigured connector")

    connector = _connector(handler, auth_blob={})
    with pytest.raises(FusionNotConfiguredError):
        await connector.authenticate()

    # Missing refresh_token (but client creds present) is also honest not-configured.
    connector2 = _connector(handler, auth_blob={"client_id": "cid", "client_secret": "csecret"})
    with pytest.raises(FusionNotConfiguredError):
        await connector2.authenticate()


def test_auth_blob_roundtrip_encrypted():
    blob = {"client_id": "cid", "client_secret": "s3cret", "refresh_token": "rtok"}
    token = dump_auth_blob(blob)
    assert token and "s3cret" not in token and "rtok" not in token
    assert load_auth_blob(token) == blob
    assert load_auth_blob(None) == {}


# --- Data Management ------------------------------------------------------


@pytest.mark.asyncio
async def test_list_hubs_and_projects():
    def handler(request):
        if request.url.path == "/project/v1/hubs":
            return httpx.Response(
                200, json={"data": [{"id": "hub1", "attributes": {"name": "My Hub"}}]}
            )
        if request.url.path == "/project/v1/hubs/hub1/projects":
            return httpx.Response(
                200, json={"data": [{"id": "proj1", "attributes": {"name": "My Project"}}]}
            )
        raise AssertionError(f"unexpected path {request.url.path}")

    connector = _connector(handler, auth_blob=_valid_token_blob())
    hubs = await connector.list_hubs()
    assert hubs == [{"external_id": "hub1", "name": "My Hub"}]

    projects = await connector.list_projects("hub1")
    assert projects == [{"external_id": "proj1", "name": "My Project"}]


@pytest.mark.asyncio
async def test_list_documents_walks_top_folders_when_folder_id_omitted():
    def handler(request):
        path = request.url.path
        if path == "/project/v1/hubs/hub1/projects/proj1/topFolders":
            return httpx.Response(200, json={"data": [{"id": "f1", "attributes": {"name": "Designs"}}]})
        if path == "/data/v1/projects/proj1/folders/f1/contents":
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "item1", "type": "items", "attributes": {"displayName": "Bracket.f3d"}},
                        {"id": "sub1", "type": "folders", "attributes": {"displayName": "Sub"}},
                    ]
                },
            )
        raise AssertionError(f"unexpected path {path}")

    connector = _connector(handler, auth_blob=_valid_token_blob())
    docs = await connector.list_documents(hub_id="hub1", project_id="proj1")
    assert docs == [{"external_id": "item1", "name": "Bracket.f3d", "type": "items"}]


# --- verify_connection -----------------------------------------------------


@pytest.mark.asyncio
async def test_verify_connection_calls_userprofile():
    def handler(request):
        assert request.url.path == "/userprofile/v1/users/@me"
        assert request.headers["authorization"] == "Bearer cached-tok"
        return httpx.Response(200, json={"userId": "u1", "userName": "jdoe", "emailId": "j@x.com"})

    connector = _connector(handler, auth_blob=_valid_token_blob())
    result = await connector.verify_connection()
    assert result == {"ok": True, "user": {"user_id": "u1", "name": "jdoe", "email": "j@x.com"}}


# --- Model Derivative assembly structure ------------------------------------


def _assembly_handler():
    """Mocks: item versions -> translation job -> manifest (ready on first
    poll) -> object tree -> properties, for item 'item1' / project 'proj1'."""

    def handler(request):
        path = request.url.path
        if path == "/data/v1/projects/proj1/items/item1/versions":
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "urn:adsk.wipprod:fs.file:vf.ABC?version=2",
                            "attributes": {"versionNumber": 2},
                        }
                    ]
                },
            )
        if path == "/modelderivative/v2/designdata/job":
            return httpx.Response(200, json={"result": "created"})
        if path.endswith("/manifest"):
            return httpx.Response(
                200,
                json={
                    "status": "success",
                    "derivatives": [{"guid": "root-guid", "role": "3d", "children": []}],
                },
            )
        if "/metadata/root-guid/properties" in path:
            return httpx.Response(
                200,
                json={
                    "data": {
                        "collection": [
                            {"objectid": 1, "properties": {"Misc": {"Part Number": "PN-ASM"}}},
                            {"objectid": 2, "properties": {"Misc": {"Part Number": "PN-CHILD"}}},
                        ]
                    }
                },
            )
        if path.endswith("/metadata/root-guid"):
            return httpx.Response(
                200,
                json={
                    "data": {
                        "objects": [
                            {
                                "objectid": 1,
                                "name": "Assembly",
                                "objects": [{"objectid": 2, "name": "Bracket", "objects": []}],
                            }
                        ]
                    }
                },
            )
        raise AssertionError(f"unexpected path {path}")

    return handler


@pytest.mark.asyncio
async def test_get_assembly_structure_maps_to_normalised_tree():
    connector = _connector(_assembly_handler(), auth_blob=_valid_token_blob())
    tree = await connector.get_assembly_structure("item1", project_id="proj1")

    assert tree["external_id"] == "item1"
    assert tree["name"] == "Assembly"
    assert tree["part_number"] == "PN-ASM"
    assert tree["revision"] == "2"  # from the version, since the root has no Revision property
    assert tree["quantity"] == 1
    assert len(tree["children"]) == 1

    child = tree["children"][0]
    assert child == {
        "external_id": "2",
        "part_number": "PN-CHILD",
        "name": "Bracket",
        "revision": None,
        "quantity": 1,
        "children": [],
    }


@pytest.mark.asyncio
async def test_get_assembly_structure_raises_when_translation_never_finishes():
    def handler(request):
        path = request.url.path
        if path == "/data/v1/projects/proj1/items/item1/versions":
            return httpx.Response(
                200, json={"data": [{"id": "urn:adsk.wipprod:fs.file:vf.ABC?version=1"}]}
            )
        if path == "/modelderivative/v2/designdata/job":
            return httpx.Response(200, json={})
        if path.endswith("/manifest"):
            return httpx.Response(200, json={"status": "inprogress"})
        raise AssertionError(f"unexpected path {path}")

    connector = _connector(handler, auth_blob=_valid_token_blob())
    with pytest.raises(FusionDerivativeNotReadyError):
        await connector.get_assembly_structure(
            "item1", project_id="proj1", max_poll_attempts=2, poll_interval_seconds=0
        )


@pytest.mark.asyncio
async def test_get_assembly_structure_raises_on_failed_translation():
    def handler(request):
        path = request.url.path
        if path == "/data/v1/projects/proj1/items/item1/versions":
            return httpx.Response(
                200, json={"data": [{"id": "urn:adsk.wipprod:fs.file:vf.ABC?version=1"}]}
            )
        if path == "/modelderivative/v2/designdata/job":
            return httpx.Response(200, json={})
        if path.endswith("/manifest"):
            return httpx.Response(200, json={"status": "failed", "progress": "boom"})
        raise AssertionError(f"unexpected path {path}")

    connector = _connector(handler, auth_blob=_valid_token_blob())
    with pytest.raises(FusionDerivativeFailedError):
        await connector.get_assembly_structure("item1", project_id="proj1")
