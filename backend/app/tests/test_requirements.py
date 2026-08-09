import pytest

from app.core.security import get_password_hash
from app.models.bom import BOM
from app.models.permission import Permission
from app.models.role import Role
from app.models.user import User
from app.tests.conftest import no_tenant_filter


async def _scoped_login(client, db_session, tenant_id, email):
    """Log in as a real, non-superuser, tenant-scoped user granted
    parts:read/parts:write (what require_parts_read/write checks) in their
    own tenant.

    auth_headers (conftest's test_user) is a superuser and bypasses tenant
    filtering entirely, so genuine cross-tenant isolation checks need an
    ordinary scoped user instead (same pattern as test_routing_api.py).

    The login lookup-by-email itself runs under whatever ambient tenant
    context the previous request left behind (nothing resets it for an
    unauthenticated route) -- logging in as a SECOND tenant's user right
    after the first would otherwise have its own email filtered out by the
    still-active tenant-1 context and 401. Bypass that for the lookup only,
    the same way conftest's no_tenant_filter documents.
    """
    user = User(
        email=email,
        username=email.split("@")[0],
        fullName="Scoped User",
        hashedPassword=get_password_hash("testpass123"),
        isActive=True,
        isSuperuser=False,
        tenantId=tenant_id,
    )
    role = Role(name=f"req-tester-{tenant_id}", tenantId=tenant_id)
    read_perm = Permission(name="parts:read", resource="parts", action="read", tenantId=tenant_id)
    write_perm = Permission(
        name="parts:write", resource="parts", action="write", tenantId=tenant_id
    )
    role.permissions = [read_perm, write_perm]
    role.users = [user]
    db_session.add_all([user, role, read_perm, write_perm])
    await db_session.commit()

    with no_tenant_filter():
        resp = await client.post(
            "/api/v1/auth/login",
            data={"username": email, "password": "testpass123"},
        )
    token = resp.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    csrf_cookie = client.cookies.get("csrf_token")
    if csrf_cookie:
        headers["X-CSRF-Token"] = csrf_cookie.split(".")[0]
    # get_current_user prefers request.cookies["access_token"] over the
    # explicit Bearer header, and login sets that cookie as a side effect.
    # With one shared test client logging in as two different users, the
    # cookie from whichever login ran LAST would silently override every
    # subsequent request's explicit `headers=` regardless of which tenant's
    # token was passed. Strip it so each call is actually scoped by the
    # headers dict returned here.
    client.cookies.delete("access_token")
    return headers


@pytest.mark.asyncio
async def test_list_requirements_empty(client, auth_headers):
    resp = await client.get("/api/v1/requirements/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_create_get_update_delete_requirement(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/requirements/",
        headers=auth_headers,
        json={
            "key": "REQ-0001",
            "title": "Enclosure must be IP67 rated",
            "type": "regulatory",
            "status": "draft",
            "priority": "high",
        },
    )
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["key"] == "REQ-0001"
    req_id = created["id"]

    get_resp = await client.get(f"/api/v1/requirements/{req_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["title"] == "Enclosure must be IP67 rated"

    upd_resp = await client.put(
        f"/api/v1/requirements/{req_id}",
        headers=auth_headers,
        json={"status": "approved", "priority": "critical"},
    )
    assert upd_resp.status_code == 200
    assert upd_resp.json()["status"] == "approved"
    assert upd_resp.json()["priority"] == "critical"

    del_resp = await client.delete(f"/api/v1/requirements/{req_id}", headers=auth_headers)
    assert del_resp.status_code == 200
    assert (await client.get(f"/api/v1/requirements/{req_id}", headers=auth_headers)).status_code == 404


@pytest.mark.asyncio
async def test_get_requirement_not_found(client, auth_headers):
    resp = await client.get("/api/v1/requirements/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_requirement_hierarchy_parent_id(client, auth_headers):
    parent = await client.post(
        "/api/v1/requirements/",
        headers=auth_headers,
        json={"key": "REQ-PARENT", "title": "System shall be waterproof", "type": "functional"},
    )
    parent_id = parent.json()["id"]
    child = await client.post(
        "/api/v1/requirements/",
        headers=auth_headers,
        json={
            "key": "REQ-CHILD",
            "title": "Enclosure gasket shall seal to IP67",
            "type": "performance",
            "parent_id": parent_id,
        },
    )
    assert child.status_code == 201
    assert child.json()["parent_id"] == parent_id

    listed = await client.get(
        "/api/v1/requirements/", headers=auth_headers, params={"parentId": parent_id}
    )
    keys = [r["key"] for r in listed.json()["items"]]
    assert "REQ-CHILD" in keys
    assert "REQ-PARENT" not in keys


@pytest.mark.asyncio
async def test_link_requirement_to_part_both_directions(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "REQ-PART-001", "name": "Sealed Enclosure"},
    )
    part_id = part_resp.json()["id"]

    req_resp = await client.post(
        "/api/v1/requirements/",
        headers=auth_headers,
        json={"key": "REQ-LINK-1", "title": "Must be dustproof", "type": "regulatory"},
    )
    req_id = req_resp.json()["id"]

    link_resp = await client.post(
        f"/api/v1/requirements/{req_id}/parts",
        headers=auth_headers,
        json={"partId": part_id},
    )
    assert link_resp.status_code == 201

    # Forward: which parts satisfy this requirement?
    parts_resp = await client.get(
        f"/api/v1/requirements/{req_id}/parts", headers=auth_headers
    )
    assert parts_resp.status_code == 200
    linked_part_ids = [p["part_id"] for p in parts_resp.json()]
    assert part_id in linked_part_ids

    # Reverse: which requirements does this part serve?
    reqs_resp = await client.get(
        f"/api/v1/requirements/by-part/{part_id}", headers=auth_headers
    )
    assert reqs_resp.status_code == 200
    linked_req_ids = [r["id"] for r in reqs_resp.json()]
    assert req_id in linked_req_ids

    # Duplicate link is rejected
    dup_resp = await client.post(
        f"/api/v1/requirements/{req_id}/parts",
        headers=auth_headers,
        json={"partId": part_id},
    )
    assert dup_resp.status_code == 409

    # Unlink removes it from both directions
    unlink_resp = await client.delete(
        f"/api/v1/requirements/{req_id}/parts/{part_id}", headers=auth_headers
    )
    assert unlink_resp.status_code == 200
    assert (
        await client.get(f"/api/v1/requirements/{req_id}/parts", headers=auth_headers)
    ).json() == []
    assert (
        await client.get(f"/api/v1/requirements/by-part/{part_id}", headers=auth_headers)
    ).json() == []


@pytest.mark.asyncio
async def test_link_requirement_to_bom(client, auth_headers, db_session, tenant_id):
    # No REST endpoint creates a bare BOM master row (see test_bom_instance_crud.py) —
    # insert directly, same as the rest of the suite does.
    bom = BOM(bom_number="REQ-BOM-001", name="Test BOM for requirement link", tenantId=tenant_id)
    db_session.add(bom)
    await db_session.commit()
    await db_session.refresh(bom)
    bom_id = bom.id

    req_resp = await client.post(
        "/api/v1/requirements/",
        headers=auth_headers,
        json={"key": "REQ-LINK-BOM", "title": "System shall meet weight target", "type": "performance"},
    )
    req_id = req_resp.json()["id"]

    link_resp = await client.post(
        f"/api/v1/requirements/{req_id}/boms",
        headers=auth_headers,
        json={"bomId": bom_id},
    )
    assert link_resp.status_code == 201

    boms_resp = await client.get(f"/api/v1/requirements/{req_id}/boms", headers=auth_headers)
    assert boms_resp.status_code == 200
    assert bom_id in [b["bom_id"] for b in boms_resp.json()]


@pytest.mark.asyncio
async def test_coverage_reports_uncovered_requirements(client, auth_headers):
    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "REQ-COV-PART", "name": "Covered Part"},
    )
    part_id = part_resp.json()["id"]

    covered = await client.post(
        "/api/v1/requirements/",
        headers=auth_headers,
        json={"key": "REQ-COVERED", "title": "Covered requirement", "type": "functional"},
    )
    covered_id = covered.json()["id"]
    await client.post(
        f"/api/v1/requirements/{covered_id}/parts",
        headers=auth_headers,
        json={"partId": part_id},
    )

    uncovered = await client.post(
        "/api/v1/requirements/",
        headers=auth_headers,
        json={"key": "REQ-UNCOVERED", "title": "Uncovered requirement", "type": "functional"},
    )
    uncovered_id = uncovered.json()["id"]

    resp = await client.get("/api/v1/requirements/coverage", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    uncovered_ids = [r["id"] for r in body["uncovered"]]
    assert uncovered_id in uncovered_ids
    assert covered_id not in uncovered_ids


@pytest.mark.asyncio
async def test_create_requirement_duplicate_key_returns_409(client, auth_headers):
    """uq_requirements_tenant_key is DB-enforced only; a collision used to
    surface as an unhandled IntegrityError -> generic 500 instead of a clean
    4xx, unlike the sibling link endpoints in this same file."""
    payload = {"key": "REQ-DUP-1", "title": "First", "type": "functional"}
    first = await client.post("/api/v1/requirements/", headers=auth_headers, json=payload)
    assert first.status_code == 201

    dup = await client.post(
        "/api/v1/requirements/",
        headers=auth_headers,
        json={"key": "REQ-DUP-1", "title": "Second", "type": "functional"},
    )
    assert dup.status_code == 409, dup.text


@pytest.mark.asyncio
async def test_update_requirement_duplicate_key_returns_409(client, auth_headers):
    await client.post(
        "/api/v1/requirements/",
        headers=auth_headers,
        json={"key": "REQ-DUP-EXISTING", "title": "Existing", "type": "functional"},
    )
    other = await client.post(
        "/api/v1/requirements/",
        headers=auth_headers,
        json={"key": "REQ-DUP-OTHER", "title": "Other", "type": "functional"},
    )
    other_id = other.json()["id"]

    resp = await client.put(
        f"/api/v1/requirements/{other_id}",
        headers=auth_headers,
        json={"key": "REQ-DUP-EXISTING"},
    )
    assert resp.status_code == 409, resp.text


@pytest.mark.asyncio
async def test_link_part_rejects_nonexistent_part(client, auth_headers):
    req_resp = await client.post(
        "/api/v1/requirements/",
        headers=auth_headers,
        json={"key": "REQ-BAD-PART", "title": "Needs a real part", "type": "functional"},
    )
    req_id = req_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/requirements/{req_id}/parts", headers=auth_headers, json={"partId": 999999}
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_link_bom_rejects_nonexistent_bom(client, auth_headers):
    req_resp = await client.post(
        "/api/v1/requirements/",
        headers=auth_headers,
        json={"key": "REQ-BAD-BOM", "title": "Needs a real BOM", "type": "functional"},
    )
    req_id = req_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/requirements/{req_id}/boms", headers=auth_headers, json={"bomId": 999999}
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_link_part_rejects_cross_tenant_part(client, db_session):
    headers_t1 = await _scoped_login(client, db_session, 1, "reqpart-t1@example.com")
    headers_t2 = await _scoped_login(client, db_session, 2, "reqpart-t2@example.com")

    part_b_resp = await client.post(
        "/api/v1/parts/",
        headers=headers_t2,
        json={"pn": "REQPART-SECRET-B", "name": "Tenant 2 secret part"},
    )
    part_b_id = part_b_resp.json()["id"]

    req_resp = await client.post(
        "/api/v1/requirements/",
        headers=headers_t1,
        json={"key": "REQ-CROSS-PART", "title": "Tenant 1 requirement", "type": "functional"},
    )
    req_id = req_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/requirements/{req_id}/parts", headers=headers_t1, json={"partId": part_b_id}
    )
    assert resp.status_code == 404, resp.text

    links = await client.get(f"/api/v1/requirements/{req_id}/parts", headers=headers_t1)
    assert links.json() == []


@pytest.mark.asyncio
async def test_link_bom_rejects_cross_tenant_bom(client, db_session):
    headers_t1 = await _scoped_login(client, db_session, 1, "reqbom-t1@example.com")
    headers_t2 = await _scoped_login(client, db_session, 2, "reqbom-t2@example.com")

    from app.core.tenant_context import TenantContext

    bom_b = BOM(bom_number="REQ-CROSS-BOM-B", name="Tenant 2 BOM", tenantId=2)
    db_session.add(bom_b)
    token = TenantContext.set(tenant_id=2)
    try:
        await db_session.commit()
        await db_session.refresh(bom_b)
    finally:
        TenantContext.reset(token)
    bom_b_id = bom_b.id

    req_resp = await client.post(
        "/api/v1/requirements/",
        headers=headers_t1,
        json={"key": "REQ-CROSS-BOM", "title": "Tenant 1 requirement", "type": "functional"},
    )
    req_id = req_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/requirements/{req_id}/boms", headers=headers_t1, json={"bomId": bom_b_id}
    )
    assert resp.status_code == 404, resp.text

    links = await client.get(f"/api/v1/requirements/{req_id}/boms", headers=headers_t1)
    assert links.json() == []


@pytest.mark.asyncio
async def test_tenant_isolation(client, db_session):
    headers_t1 = await _scoped_login(client, db_session, 1, "req-t1@example.com")
    headers_t2 = await _scoped_login(client, db_session, 2, "req-t2@example.com")

    create_resp = await client.post(
        "/api/v1/requirements/",
        headers=headers_t1,
        json={"key": "REQ-TENANT-1", "title": "Tenant 1 requirement", "type": "functional"},
    )
    assert create_resp.status_code == 201
    req_id = create_resp.json()["id"]

    # Tenant 2 cannot see tenant 1's requirement in the list...
    list_t2 = await client.get("/api/v1/requirements/", headers=headers_t2)
    keys_t2 = [r["key"] for r in list_t2.json()["items"]]
    assert "REQ-TENANT-1" not in keys_t2

    # ...nor fetch it directly.
    get_t2 = await client.get(f"/api/v1/requirements/{req_id}", headers=headers_t2)
    assert get_t2.status_code == 404

    # Tenant 1 still sees its own requirement.
    list_t1 = await client.get("/api/v1/requirements/", headers=headers_t1)
    keys_t1 = [r["key"] for r in list_t1.json()["items"]]
    assert "REQ-TENANT-1" in keys_t1
