"""Tests for typed CAD derivative links (part_derivatives table).

Covers: attach (incl. upsert-on-same-kind), list, remove, validation, and
surfacing derivatives when reading a Part / a BOM line — plus tenant
isolation across all of the above (see app/services/derivative_service.py).
"""

import pytest
import pytest_asyncio
from fastapi import APIRouter

from app.api.endpoints import derivatives as derivatives_endpoint
from app.core.security import get_password_hash
from app.core.tenant_context import TenantContext
from app.main import app
from app.models.bom_item import BomItem
from app.models.bom_template import BomTemplate
from app.models.part import Part
from app.models.tenant import Tenant
from app.models.user import User

BASE = "/api/v1/derivatives/"

# This router is intentionally NOT wired into app/api/api_v1.py by this
# batch (see the task's hard rule — shared wiring is out of scope; the
# needed `api_router.include_router(...)` line is returned separately for
# the integrating agent to add). Self-mount it here so this test module can
# still exercise the real endpoint end-to-end; once api_v1.py wires it for
# real, this becomes a no-op (guarded on the path not already existing).
# Routes are PREPENDED (not appended) because app/main.py registers a
# catch-all `GET /{full_path:path}` SPA fallback directly on `app` at import
# time — anything appended after that point is unreachable for GET.
if not any(getattr(r, "path", "").startswith(BASE) for r in app.routes):
    _scratch_router = APIRouter()
    _scratch_router.include_router(
        derivatives_endpoint.router, prefix="/api/v1/derivatives", tags=["derivatives"]
    )
    app.router.routes[:0] = _scratch_router.routes


async def _make_part(db_session, tenant_id, pn, name="Part"):
    part = Part(pn=pn, name=name, tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)
    return part


# ---------------------------------------------------------------------------
# Attach / list / remove
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_derivatives_requires_auth(client):
    resp = await client.get(BASE)
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_attach_step_and_pdf_then_list(client, db_session, auth_headers, test_user):
    part = await _make_part(db_session, test_user.tenantId, "PN-DERIV-001")

    step_resp = await client.post(
        BASE,
        headers=auth_headers,
        json={"partId": part.id, "kind": "step", "url": "cad/exports/PN-DERIV-001.step"},
    )
    assert step_resp.status_code == 201, step_resp.text
    step_body = step_resp.json()
    assert step_body["kind"] == "step"
    assert step_body["partId"] == part.id
    assert step_body["url"] == "cad/exports/PN-DERIV-001.step"

    pdf_resp = await client.post(
        BASE,
        headers=auth_headers,
        json={
            "partId": part.id,
            "kind": "pdf",
            "url": "cad/exports/PN-DERIV-001.pdf",
            "drawingStatus": "released",
        },
    )
    assert pdf_resp.status_code == 201, pdf_resp.text
    assert pdf_resp.json()["drawingStatus"] == "released"

    list_resp = await client.get(BASE, headers=auth_headers, params={"partId": part.id})
    assert list_resp.status_code == 200, list_resp.text
    items = list_resp.json()["items"]
    assert len(items) == 2
    kinds = {i["kind"] for i in items}
    assert kinds == {"step", "pdf"}


@pytest.mark.asyncio
async def test_attach_same_kind_upserts_instead_of_duplicating(
    client, db_session, auth_headers, test_user
):
    part = await _make_part(db_session, test_user.tenantId, "PN-DERIV-002")

    first = await client.post(
        BASE, headers=auth_headers, json={"partId": part.id, "kind": "dwg", "url": "v1.dwg"}
    )
    assert first.status_code == 201, first.text
    first_id = first.json()["id"]

    second = await client.post(
        BASE, headers=auth_headers, json={"partId": part.id, "kind": "dwg", "url": "v2.dwg"}
    )
    assert second.status_code == 201, second.text
    assert second.json()["id"] == first_id, "re-attaching the same kind must upsert, not insert"
    assert second.json()["url"] == "v2.dwg"

    list_resp = await client.get(BASE, headers=auth_headers, params={"partId": part.id})
    items = list_resp.json()["items"]
    assert len(items) == 1
    assert items[0]["url"] == "v2.dwg"


@pytest.mark.asyncio
async def test_remove_derivative(client, db_session, auth_headers, test_user):
    part = await _make_part(db_session, test_user.tenantId, "PN-DERIV-003")

    created = await client.post(
        BASE, headers=auth_headers, json={"partId": part.id, "kind": "dxf", "url": "a.dxf"}
    )
    derivative_id = created.json()["id"]

    delete_resp = await client.delete(f"{BASE}{derivative_id}", headers=auth_headers)
    assert delete_resp.status_code == 204

    list_resp = await client.get(BASE, headers=auth_headers, params={"partId": part.id})
    assert list_resp.json()["items"] == []

    delete_again = await client.delete(f"{BASE}{derivative_id}", headers=auth_headers)
    assert delete_again.status_code == 404


@pytest.mark.asyncio
async def test_attach_rejects_invalid_kind(client, db_session, auth_headers, test_user):
    part = await _make_part(db_session, test_user.tenantId, "PN-DERIV-004")

    resp = await client.post(
        BASE, headers=auth_headers, json={"partId": part.id, "kind": "exe", "url": "bad.exe"}
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_attach_requires_existing_part(client, auth_headers):
    resp = await client.post(
        BASE, headers=auth_headers, json={"partId": 999999, "kind": "pdf", "url": "x.pdf"}
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Surfacing on Part / BOM-line reads
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_part_read_surfaces_derivatives(client, db_session, auth_headers, test_user):
    part = await _make_part(db_session, test_user.tenantId, "PN-DERIV-005")
    await client.post(
        BASE, headers=auth_headers, json={"partId": part.id, "kind": "step", "url": "s.step"}
    )
    await client.post(
        BASE, headers=auth_headers, json={"partId": part.id, "kind": "pdf", "url": "s.pdf"}
    )

    resp = await client.get(f"/api/v1/parts/{part.id}", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    derivatives = resp.json()["derivatives"]
    assert len(derivatives) == 2
    assert {d["kind"] for d in derivatives} == {"step", "pdf"}


@pytest.mark.asyncio
async def test_part_read_without_derivatives_returns_empty_list(
    client, db_session, auth_headers, test_user
):
    part = await _make_part(db_session, test_user.tenantId, "PN-DERIV-006")
    resp = await client.get(f"/api/v1/parts/{part.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["derivatives"] == []


@pytest.mark.asyncio
async def test_bom_line_read_surfaces_derivatives(client, db_session, auth_headers, test_user):
    tid = test_user.tenantId
    part = await _make_part(db_session, tid, "PN-DERIV-007")

    template = BomTemplate(name="Widget BOM", createdById=test_user.id, tenantId=tid)
    db_session.add(template)
    await db_session.commit()
    await db_session.refresh(template)

    bom_item = BomItem(bomTemplateId=template.id, partId=part.id, quantity=1, tenantId=tid)
    db_session.add(bom_item)
    await db_session.commit()
    await db_session.refresh(bom_item)

    await client.post(
        BASE, headers=auth_headers, json={"partId": part.id, "kind": "step", "url": "line.step"}
    )

    resp = await client.get(f"/api/v1/bom-items/{bom_item.id}", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    derivatives = resp.json()["derivatives"]
    assert len(derivatives) == 1
    assert derivatives[0]["kind"] == "step"
    assert derivatives[0]["url"] == "line.step"


# ---------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def second_tenant(db_session):
    tenant = Tenant(id=2, tenant_name="Second Tenant", tenant_code="TEST2")
    db_session.add(tenant)
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture
async def user_t2(db_session, second_tenant):
    user = User(
        email="t2-user@example.com",
        username="t2user",
        fullName="Tenant Two User",
        hashedPassword=get_password_hash("testpass123"),
        isActive=True,
        isSuperuser=True,
        tenantId=second_tenant.id,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_headers_t2(client, user_t2, second_tenant):
    # Logging in updates the User row (failedLoginAttempts/lastLoginAt) via a
    # plain db.commit(); the tenant-scoped update guard in
    # app.core.tenant_events requires the ambient tenant context to match the
    # row's own tenantId at that moment. The autouse `setup_tenant_context`
    # fixture pins the ambient context to tenant 1 for the whole test, so
    # logging in as a tenant-2 user needs the context switched just for this
    # one call (see test_part11_esign.py for the same pattern).
    token = TenantContext.set(tenant_id=second_tenant.id)
    try:
        resp = await client.post(
            "/api/v1/auth/login",
            data={"username": "t2-user@example.com", "password": "testpass123"},
        )
        access_token = resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {access_token}"}
        csrf_cookie = client.cookies.get("csrf_token")
        if csrf_cookie:
            headers["X-CSRF-Token"] = csrf_cookie.split(".")[0]
        client.cookies.delete("access_token")
        client.cookies.delete("refresh_token")
        return headers
    finally:
        TenantContext.reset(token)


@pytest.mark.asyncio
async def test_list_does_not_leak_across_tenants(
    client, db_session, auth_headers, auth_headers_t2, test_user, second_tenant
):
    part_t1 = await _make_part(db_session, test_user.tenantId, "PN-DERIV-T1")
    attach = await client.post(
        BASE, headers=auth_headers, json={"partId": part_t1.id, "kind": "pdf", "url": "t1.pdf"}
    )
    assert attach.status_code == 201, attach.text

    # Tenant 2, querying by tenant 1's (numeric) part id, must see nothing.
    resp = await client.get(BASE, headers=auth_headers_t2, params={"partId": part_t1.id})
    assert resp.status_code == 200
    assert resp.json()["items"] == []

    # An unfiltered list for tenant 2 must also not include tenant 1's row.
    resp_all = await client.get(BASE, headers=auth_headers_t2)
    assert resp_all.status_code == 200
    assert resp_all.json()["items"] == []


@pytest.mark.asyncio
async def test_attach_to_other_tenants_part_is_not_found(
    client, db_session, auth_headers, auth_headers_t2, test_user
):
    part_t1 = await _make_part(db_session, test_user.tenantId, "PN-DERIV-T2-ATTACH")

    resp = await client.post(
        BASE,
        headers=auth_headers_t2,
        json={"partId": part_t1.id, "kind": "step", "url": "hijack.step"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_remove_across_tenants_is_not_found(
    client, db_session, auth_headers, auth_headers_t2, test_user
):
    part_t1 = await _make_part(db_session, test_user.tenantId, "PN-DERIV-T2-REMOVE")
    created = await client.post(
        BASE, headers=auth_headers, json={"partId": part_t1.id, "kind": "other", "url": "t1.bin"}
    )
    derivative_id = created.json()["id"]

    resp = await client.delete(f"{BASE}{derivative_id}", headers=auth_headers_t2)
    assert resp.status_code == 404

    # Still present for the owning tenant.
    list_resp = await client.get(BASE, headers=auth_headers, params={"partId": part_t1.id})
    assert len(list_resp.json()["items"]) == 1
