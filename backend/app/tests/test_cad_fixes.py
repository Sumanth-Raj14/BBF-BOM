"""Regression tests for two HIGH defects in the CAD import path:

1. `adapters._to_node` used `d.get("quantity") or 1`, which silently turns an
   explicit Altium DNP (Do-Not-Populate) quantity of 0 into a fitted quantity
   of 1 -- and disagreed with the dry_run preview, which returns the
   pre-adapter dict where 0 survives.
2. Fusion/Altium OAuth token rotation (APS/Altium 365 both document that a
   refresh call can mint a new refresh_token) was only ever held on the
   in-memory vendor client -- `cad_connectors.py` built a fresh connector per
   request and never read the rotated blob back, so the stale refresh_token
   left in `CadConnection.credentials` breaks the connection on the very next
   call.

Both tests fail against the pre-fix code:
  * quantity 0 -> BOMItem.quantity == 1 (dry_run says 0, commit says 1)
  * refresh_token stays "old-rt" in the stored (decrypted) credentials after
    a call that rotated it to "rotated-rt"
"""

import json

import httpx
import pytest
from sqlalchemy import select, text

from app.core.encryption import fernet_decrypt
from app.integrations.cad.adapters import _to_node
from app.models.bom import BOMItem
from app.models.part import Part

# ---------------------------------------------------------------------------
# Fix 1: quantity 0 (DNP) must survive _to_node, and dry_run/commit must agree
# ---------------------------------------------------------------------------


def test_to_node_preserves_explicit_zero_quantity():
    """`0 or 1` == 1 in Python -- this is the exact bug. An explicit DNP
    quantity of 0 must stay 0, not silently become "1 fitted part"."""
    node = _to_node({"external_id": "R99", "name": "DNP resistor", "quantity": 0})
    assert node.quantity == 0.0


def test_to_node_still_defaults_missing_quantity_to_one():
    """Only a genuinely MISSING quantity (None) should default -- not an
    explicit falsy value."""
    node = _to_node({"external_id": "R1", "name": "resistor"})
    assert node.quantity == 1.0


def test_to_node_preserves_empty_string_part_number():
    """Sibling coalescing check: part_number is passed through as-is (no `or`
    fallback that would corrupt a legitimate value) -- only quantity had the
    bug, but confirm the neighbouring field wasn't "fixed" into a new bug."""
    node = _to_node({"external_id": "x", "name": "n", "part_number": "", "quantity": 1})
    assert node.part_number == ""


ALTIUM_IMPORT_URL = "/api/v1/cad-connectors/altium/import-file"

_DNP_CSV = (
    "Designator,Comment,Footprint,Description,Quantity,Manufacturer,"
    "Manufacturer Part Number,Supplier,Supplier Part Number\n"
    "R1,10k,0603,Resistor 10k 1%,1,Yageo,RC0603FR-0710KL,Digikey,311-10KGRCT-ND\n"
    "R99,10k-DNP,0603,Do-Not-Populate resistor,0,Yageo,RC0603FR-0710KL-DNP,Digikey,311-DNPGRCT-ND\n"
)


@pytest.mark.asyncio
async def test_dry_run_and_commit_agree_on_dnp_quantity_zero(client, auth_headers, db_session):
    """The dry_run preview parses the file directly (pre-adapter) and always
    showed the correct 0. Before the fix, committing the SAME file wrote
    quantity=1 for that line -- the preview and the real import disagreed
    with no warning. After the fix, both must say 0."""
    dry_resp = await client.post(
        ALTIUM_IMPORT_URL,
        headers=auth_headers,
        files={"file": ("dnp.csv", _DNP_CSV.encode(), "text/csv")},
        data={"dry_run": "true"},
    )
    assert dry_resp.status_code == 200, dry_resp.text
    dnp_preview = next(
        c for c in dry_resp.json()["components"] if c["part_number"] == "RC0603FR-0710KL-DNP"
    )
    assert dnp_preview["quantity"] == 0  # dry_run was always correct

    commit_resp = await client.post(
        ALTIUM_IMPORT_URL,
        headers=auth_headers,
        files={"file": ("dnp.csv", _DNP_CSV.encode(), "text/csv")},
    )
    assert commit_resp.status_code == 200, commit_resp.text

    dnp_part = (
        await db_session.execute(select(Part).where(Part.pn == "RC0603FR-0710KL-DNP"))
    ).scalar_one()
    dnp_item = (
        await db_session.execute(select(BOMItem).where(BOMItem.part_id == dnp_part.id))
    ).scalar_one()
    # This is the assertion that fails on the old code: quantity comes back
    # as 1 (the `or 1` coalescing), not 0.
    assert float(dnp_item.quantity) == 0

    fitted_part = (
        await db_session.execute(select(Part).where(Part.pn == "RC0603FR-0710KL"))
    ).scalar_one()
    fitted_item = (
        await db_session.execute(select(BOMItem).where(BOMItem.part_id == fitted_part.id))
    ).scalar_one()
    assert float(fitted_item.quantity) == 1


# ---------------------------------------------------------------------------
# Fix 2: a rotated OAuth refresh_token must be persisted back to the stored
# CadConnection, not lost on the throwaway in-memory connector.
# ---------------------------------------------------------------------------


async def _stored_credentials(db, connection_id: int) -> dict:
    """Read `credentials` straight off the row via raw SQL (bypassing the
    ORM's `load`-event decryption AND its identity map, which would otherwise
    just hand back the same in-memory object this test's own request already
    mutated) and decrypt it -- the same round-trip a brand new request would
    see."""
    raw = (
        await db.execute(
            text("SELECT credentials FROM cad_connections WHERE id = :id"), {"id": connection_id}
        )
    ).scalar()
    return json.loads(fernet_decrypt(raw))


def _mock_httpx_async_client(handler):
    """A drop-in replacement for `httpx.AsyncClient` that always talks to a
    `MockTransport` -- so `FusionConnector`'s internally-created clients
    (it builds its own when none is injected) hit our fake APS server."""

    class _Mock(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    return _Mock


@pytest.mark.asyncio
async def test_fusion_rotated_refresh_token_is_persisted_to_connection(
    client, auth_headers, db_session, monkeypatch
):
    create_resp = await client.post(
        "/api/v1/cad-connectors",
        headers=auth_headers,
        json={
            "name": "Fusion Rotation Test",
            "connector_type": "fusion",
            "credentials": {
                "client_id": "cid",
                "client_secret": "csecret",
                "refresh_token": "old-rt",
                # no cached access_token -- forces authenticate() to refresh
                # on the very first call, which is where APS may rotate it.
            },
            "config": {"hub_id": "hub1", "project_id": "proj1"},
        },
    )
    assert create_resp.status_code == 200, create_resp.text
    connection_id = create_resp.json()["id"]

    def handler(request):
        if request.url.path == "/authentication/v2/token":
            assert "refresh_token=old-rt" in request.content.decode()
            return httpx.Response(
                200,
                json={"access_token": "new-at", "refresh_token": "rotated-rt", "expires_in": 3600},
            )
        if request.url.path == "/userprofile/v1/users/@me":
            return httpx.Response(
                200, json={"userId": "u1", "userName": "jdoe", "emailId": "j@x.com"}
            )
        raise AssertionError(f"unexpected path {request.url.path}")

    monkeypatch.setattr(httpx, "AsyncClient", _mock_httpx_async_client(handler))

    resp = await client.post(f"/api/v1/cad-connectors/{connection_id}/test", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["ok"] is True

    stored = await _stored_credentials(db_session, connection_id)

    # This is the assertion that fails on the old code: the connector rotated
    # the token in memory, but nothing wrote it back, so `stored` still has
    # the now-invalidated "old-rt" -- and the very next call would 401.
    assert stored["refresh_token"] == "rotated-rt"
    assert stored["access_token"] == "new-at"


@pytest.mark.asyncio
async def test_fusion_no_rotation_means_no_spurious_write(
    client, auth_headers, db_session, monkeypatch
):
    """When the vendor does NOT rotate the refresh_token, the stored
    credentials must be left exactly as configured (proves the persistence
    hook is conditional on an actual change, not an unconditional overwrite
    that could reformat/lose fields)."""
    create_resp = await client.post(
        "/api/v1/cad-connectors",
        headers=auth_headers,
        json={
            "name": "Fusion No Rotation",
            "connector_type": "fusion",
            "credentials": {
                "client_id": "cid",
                "client_secret": "csecret",
                "refresh_token": "stable-rt",
            },
            "config": {"hub_id": "hub1", "project_id": "proj1"},
        },
    )
    connection_id = create_resp.json()["id"]

    def handler(request):
        if request.url.path == "/authentication/v2/token":
            # No refresh_token in the response -> vendor did not rotate it.
            return httpx.Response(200, json={"access_token": "new-at", "expires_in": 3600})
        if request.url.path == "/userprofile/v1/users/@me":
            return httpx.Response(200, json={"userId": "u1"})
        raise AssertionError(f"unexpected path {request.url.path}")

    monkeypatch.setattr(httpx, "AsyncClient", _mock_httpx_async_client(handler))

    resp = await client.post(f"/api/v1/cad-connectors/{connection_id}/test", headers=auth_headers)
    assert resp.status_code == 200, resp.text

    stored = await _stored_credentials(db_session, connection_id)
    assert stored["refresh_token"] == "stable-rt"
