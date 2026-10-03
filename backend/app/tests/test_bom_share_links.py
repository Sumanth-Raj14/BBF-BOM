"""Public read-only BOM share links.

The endpoint under test takes NO authentication, so these tests exist mostly to
pin down what it must REFUSE to do: distinguish failure modes, and show one
byte of another tenant's data.
"""

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.security import get_password_hash
from app.models.bom_item import BomItem
from app.models.bom_share import BomShareLink
from app.models.bom_template import BomTemplate
from app.models.part import Part
from app.models.tenant import Tenant
from app.models.user import User
from app.tests.conftest import no_tenant_filter

# The single response every failure mode must produce. request_id is a
# per-request UUID added to every error by the global handler, so it carries no
# information about the token — everything else must match byte for byte.
INVALID_DETAIL = "Share link not found, expired, or revoked."

PUBLIC = "/api/v1/bom-shares/public/{}"


@pytest_asyncio.fixture
async def shared_bom(db_session, test_user, tenant_id):
    """A one-line BOM owned by tenant 1."""
    part = Part(
        pn="SHARE-PN-1",
        name="Shared Widget",
        description="visible to the supplier",
        manufacturer="Acme",
        mpn="ACME-1",
        tenantId=tenant_id,
    )
    db_session.add(part)
    await db_session.flush()

    bom = BomTemplate(
        name="Shared BOM",
        description="for the supplier",
        projectCode="PRJ-SHARE",
        createdById=test_user.id,
        tenantId=tenant_id,
    )
    db_session.add(bom)
    await db_session.flush()

    db_session.add(
        BomItem(
            bomTemplateId=bom.id,
            partId=part.id,
            quantity=3,
            referenceDesignator="R1",
            tenantId=tenant_id,
        )
    )
    await db_session.commit()
    return bom


@pytest_asyncio.fixture
async def other_tenant_bom(db_session):
    """A completely separate tenant with its own BOM, part and share link.

    Created under no_tenant_filter because the autouse fixture pins the test to
    tenant 1 and these rows must not be visible through it.
    """
    with no_tenant_filter():
        tenant = Tenant(id=999, tenant_name="Other Tenant", tenant_code="OTHER")
        db_session.add(tenant)
        await db_session.flush()

        user = User(
            email="other@example.com",
            username="otheruser",
            fullName="Other User",
            hashedPassword=get_password_hash("otherpass123"),
            isActive=True,
            tenantId=999,
        )
        part = Part(pn="SECRET-PN-999", name="Secret Widget", tenantId=999)
        db_session.add_all([user, part])
        await db_session.flush()

        bom = BomTemplate(
            name="Secret BOM", createdById=user.id, projectCode="PRJ-SECRET", tenantId=999
        )
        db_session.add(bom)
        await db_session.flush()

        db_session.add(
            BomItem(bomTemplateId=bom.id, partId=part.id, quantity=7, tenantId=999)
        )
        db_session.add(
            BomShareLink(
                token="other-tenant-token", bom_id=bom.id, created_by=user.id, tenantId=999
            )
        )
        await db_session.commit()
    return bom


async def _create_share(client, auth_headers, bom_id, **kw):
    resp = await client.post(
        "/api/v1/bom-shares/", headers=auth_headers, json={"bom_id": bom_id, **kw}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _load_share(db_session, token):
    return (
        await db_session.execute(select(BomShareLink).where(BomShareLink.token == token))
    ).scalar_one()


# --------------------------------------------------------------------------
# The happy path
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_valid_token_resolves_without_auth(client, auth_headers, shared_bom):
    share = await _create_share(client, auth_headers, shared_bom.id)
    assert len(share["token"]) >= 40  # secrets.token_urlsafe(32), not sequential
    assert share["token"] != str(share["id"])

    # No Authorization header at all.
    resp = await client.get(PUBLIC.format(share["token"]))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["readOnly"] is True
    assert body["bom"]["name"] == "Shared BOM"
    assert [i["partNumber"] for i in body["items"]] == ["SHARE-PN-1"]
    assert body["items"][0]["quantity"] == 3.0
    assert body["items"][0]["line"] == 1


@pytest.mark.asyncio
async def test_resolve_records_access_and_leaks_no_internals(
    client, auth_headers, shared_bom, db_session
):
    share = await _create_share(client, auth_headers, shared_bom.id)
    await client.get(PUBLIC.format(share["token"]))
    await client.get(PUBLIC.format(share["token"]))

    row = await _load_share(db_session, share["token"])
    await db_session.refresh(row)
    assert row.access_count == 2
    assert row.last_accessed_at is not None

    raw = (await client.get(PUBLIC.format(share["token"]))).text
    for forbidden in ("test@example.com", "tenantId", "tenant_id", "createdById", "cost"):
        assert forbidden not in raw, f"public payload leaks {forbidden}"


@pytest.mark.asyncio
async def test_password_protected_link_opens_with_the_password(
    client, auth_headers, shared_bom
):
    share = await _create_share(client, auth_headers, shared_bom.id, password="hunter2")
    assert share["has_password"] is True
    resp = await client.get(
        PUBLIC.format(share["token"]), headers={"X-Share-Password": "hunter2"}
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_password_is_stored_hashed_never_in_the_clear(
    client, auth_headers, shared_bom, db_session
):
    share = await _create_share(client, auth_headers, shared_bom.id, password="hunter2")
    row = await _load_share(db_session, share["token"])
    assert row.password_hash and row.password_hash.startswith("$2")
    assert "hunter2" not in row.password_hash
    assert "password" not in share  # never echoed back either


# --------------------------------------------------------------------------
# Every failure mode must be indistinguishable
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_expired_revoked_wrong_password_and_unknown_all_fail_identically(
    client, auth_headers, shared_bom, db_session
):
    responses = {}

    # 1. unknown token
    responses["unknown"] = await client.get(PUBLIC.format("no-such-token-at-all"))

    # 2. expired — set the timestamp directly; the API refuses to create one in
    #    the past, which is itself the point.
    expired = await _create_share(
        client,
        auth_headers,
        shared_bom.id,
        expires_at=(datetime.now(UTC) + timedelta(days=1)).isoformat(),
    )
    row = await _load_share(db_session, expired["token"])
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    responses["expired"] = await client.get(PUBLIC.format(expired["token"]))

    # 3. revoked
    revoked = await _create_share(client, auth_headers, shared_bom.id)
    rev_resp = await client.post(
        f"/api/v1/bom-shares/{revoked['id']}/revoke", headers=auth_headers
    )
    assert rev_resp.status_code == 200 and rev_resp.json()["revoked"] is True
    responses["revoked"] = await client.get(PUBLIC.format(revoked["token"]))

    # 4. wrong password
    locked = await _create_share(client, auth_headers, shared_bom.id, password="hunter2")
    responses["wrong_password"] = await client.get(
        PUBLIC.format(locked["token"]), headers={"X-Share-Password": "wrong"}
    )
    # 5. ...and no password at all on a protected link
    responses["no_password"] = await client.get(PUBLIC.format(locked["token"]))

    for name, resp in responses.items():
        assert resp.status_code == 404, f"{name}: {resp.status_code} {resp.text}"
        body = resp.json()
        assert body["detail"] == INVALID_DETAIL, f"{name} is distinguishable: {resp.text}"
        assert set(body) - {"request_id"} == {"detail"}, (
            f"{name} carries an extra field: {resp.text}"
        )


@pytest.mark.asyncio
async def test_expiry_must_be_in_the_future_at_creation(client, auth_headers, shared_bom):
    resp = await client.post(
        "/api/v1/bom-shares/",
        headers=auth_headers,
        json={
            "bom_id": shared_bom.id,
            "expires_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
        },
    )
    assert resp.status_code == 400


# --------------------------------------------------------------------------
# Tenant isolation — the public route runs with no tenant context at all
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_public_payload_contains_nothing_from_another_tenant(
    client, auth_headers, shared_bom, other_tenant_bom
):
    share = await _create_share(client, auth_headers, shared_bom.id)
    raw = (await client.get(PUBLIC.format(share["token"]))).text
    assert "SECRET-PN-999" not in raw
    assert "Secret BOM" not in raw
    assert "PRJ-SECRET" not in raw
    assert "other@example.com" not in raw

    body = (await client.get(PUBLIC.format(share["token"]))).json()
    assert body["bom"]["name"] == "Shared BOM"
    assert len(body["items"]) == 1


@pytest.mark.asyncio
async def test_share_row_pointing_at_a_foreign_bom_resolves_to_nothing(
    client, db_session, test_user, tenant_id, other_tenant_bom
):
    """The one test that actually exercises the explicit tenantId predicates.

    test_public_payload_contains_nothing_from_another_tenant passes even with
    every explicit tenant filter deleted, because the token resolves to its own
    BOM by primary key regardless. This forges the case the filters exist for:
    a share row owned by tenant 1 whose bom_id points into tenant 999.
    """
    with no_tenant_filter():
        db_session.add(
            BomShareLink(
                token="cross-tenant-token",
                bom_id=other_tenant_bom.id,
                created_by=test_user.id,
                tenantId=tenant_id,
            )
        )
        await db_session.commit()

    resp = await client.get(PUBLIC.format("cross-tenant-token"))
    assert resp.status_code == 404, resp.text
    assert resp.json()["detail"] == INVALID_DETAIL
    assert "SECRET-PN-999" not in resp.text and "Secret BOM" not in resp.text


@pytest.mark.asyncio
async def test_a_tenant_cannot_share_or_list_another_tenants_bom(
    client, auth_headers, shared_bom, other_tenant_bom
):
    resp = await client.post(
        "/api/v1/bom-shares/", headers=auth_headers, json={"bom_id": other_tenant_bom.id}
    )
    assert resp.status_code == 404

    await _create_share(client, auth_headers, shared_bom.id)
    listed = await client.get("/api/v1/bom-shares/", headers=auth_headers)
    assert listed.status_code == 200
    tokens = [s["token"] for s in listed.json()]
    assert "other-tenant-token" not in tokens
    assert all(s["bom_id"] == shared_bom.id for s in listed.json())


@pytest.mark.asyncio
async def test_revoking_another_tenants_share_is_a_404(
    client, auth_headers, other_tenant_bom, db_session
):
    with no_tenant_filter():
        other = (
            await db_session.execute(
                select(BomShareLink).where(BomShareLink.token == "other-tenant-token")
            )
        ).scalar_one()
        other_id = other.id
    resp = await client.post(f"/api/v1/bom-shares/{other_id}/revoke", headers=auth_headers)
    assert resp.status_code == 404


# --------------------------------------------------------------------------
# Rate limiting
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_public_route_is_rate_limited(client):
    """Unlimited guessing would make the 404-for-everything answer worthless."""
    statuses = set()
    for i in range(25):
        statuses.add((await client.get(PUBLIC.format(f"guess-{i}"))).status_code)
    assert 429 in statuses, f"public share route is not rate limited: {statuses}"


@pytest.mark.asyncio
async def test_password_header_survives_the_cors_preflight(client):
    """X-Share-Password must be in main.py's allow_headers allowlist.

    The ASGI test client never sends an Origin, so every other test here passes
    with the header banned — a real browser got "400 Disallowed CORS headers"
    on the preflight and password-protected links could not be opened at all.
    """
    resp = await client.options(
        PUBLIC.format("any-token"),
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-share-password",
        },
    )
    assert resp.status_code == 200, f"preflight refused: {resp.status_code} {resp.text}"
    allowed = resp.headers.get("access-control-allow-headers", "").lower()
    assert "x-share-password" in allowed, allowed


@pytest.mark.asyncio
async def test_management_routes_require_auth(client, shared_bom):
    assert (await client.get("/api/v1/bom-shares/")).status_code in (401, 403)
    assert (
        await client.post("/api/v1/bom-shares/", json={"bom_id": shared_bom.id})
    ).status_code in (401, 403)
