"""xBOM: multi-BOM types (EBOM/MBOM/SBOM) + EBOM -> MBOM derivation.

Covers migration 052 (`boms.bom_type`, default EBOM, backward compatible),
list-by-type filtering, the new mbom_api.py routes (previously dead-code
models with zero routes), and the EBOM->MBOM derivation helper: it must
copy structure, never mutate the source, and stay tenant-isolated.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.security import get_password_hash
from app.core.tenant_context import TenantContext
from app.models.bom import BOM, BOMItem
from app.models.mbom import MbomHeader, MbomItem
from app.models.part import Part
from app.models.role import Role, user_roles
from app.models.tenant import Tenant
from app.models.user import User
from app.services import bom_service
from app.tests.conftest import no_tenant_filter


async def _scoped_user(db_session, tenant_id, email, password="TestPass123!"):
    """A real, non-superuser, tenant-scoped user with the "engineering" role
    (satisfies both require_viewer and require_engineering — engineering
    inherits viewer per ROLE_HIERARCHY). auth_headers'/test_user's superuser
    has effective_tenant_id == None and bypasses tenant filtering entirely
    (by design), so cross-tenant isolation can only be proven with a user
    like this one.
    """
    role = Role(name="engineering", tenantId=tenant_id)
    db_session.add(role)
    user = User(
        email=email,
        username=email.split("@")[0],
        fullName="Tester",
        hashedPassword=get_password_hash(password),
        isActive=True,
        isSuperuser=False,
        tenantId=tenant_id,
    )
    db_session.add(user)
    await db_session.commit()  # expire_on_commit=False — role.id/user.id are already populated
    await db_session.execute(user_roles.insert().values(user_id=user.id, role_id=role.id))
    await db_session.commit()
    return user


async def _make_tenant_and_user(db_session, tenant_id, email, password="TestPass123!"):
    tenant = Tenant(id=tenant_id, tenant_name=f"Tenant {tenant_id}", tenant_code=f"T{tenant_id}")
    db_session.add(tenant)
    await db_session.commit()
    user = await _scoped_user(db_session, tenant_id, email, password)
    return tenant, user


async def _login(client, email, password="TestPass123!"):
    # login is unauthenticated (no tenant known yet) — the autouse
    # setup_tenant_context fixture pins every test to tenant A, which would
    # hide a tenant-B user's row from the login lookup. Bypass it here, same
    # as production (no ambient tenant context on this route at all).
    with no_tenant_filter():
        resp = await client.post(
            "/api/v1/auth/login", data={"username": email, "password": password}
        )
    assert resp.status_code == 200, resp.text
    # get_current_user prefers a cookie over the Authorization header, and
    # login sets an access_token cookie on the shared AsyncClient — clear it
    # immediately so a second tenant's login doesn't silently override the
    # first tenant's explicit Bearer header on later requests.
    client.cookies.clear()
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_part(db_session, tenant_id, pn):
    part = Part(pn=pn, name=pn, category="Electrical", cost=1.0, tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)
    return part


async def _make_ebom_with_items(db_session, tenant_id, bom_number, n_parted=2, n_partless=1):
    bom = BOM(bom_number=bom_number, name=bom_number, tenantId=tenant_id, bom_type="EBOM")
    db_session.add(bom)
    await db_session.commit()
    await db_session.refresh(bom)
    for i in range(n_parted):
        part = await _make_part(db_session, tenant_id, f"{bom_number}-PN-{i}")
        db_session.add(
            BOMItem(bom_id=bom.id, part_id=part.id, quantity=2, unit="EA", tenantId=tenant_id)
        )
    for _ in range(n_partless):
        # A line with no part attached — must be skipped, not faked, on derive.
        db_session.add(BOMItem(bom_id=bom.id, part_id=None, quantity=1, tenantId=tenant_id))
    await db_session.commit()
    return bom


# ============ 1. Backward compatibility ============


@pytest.mark.asyncio
async def test_existing_bom_defaults_to_ebom(db_session, test_tenant):
    """A BOM created with no bom_type at all (every pre-migration caller)
    reads back as EBOM."""
    tid = test_tenant.id
    bom = await bom_service.create_bom(db_session, {"name": "Legacy BOM"}, tenant_id=tid)
    assert bom.bom_type == "EBOM"

    fetched = await bom_service.get_bom_or_404(db_session, bom.id)
    assert fetched.bom_type == "EBOM"


# ============ 2. Creating each type ============


@pytest.mark.asyncio
async def test_create_each_bom_type(db_session, test_tenant):
    tid = test_tenant.id
    for t in ("EBOM", "MBOM", "SBOM"):
        bom = await bom_service.create_bom(
            db_session, {"name": f"{t} BOM", "bom_type": t}, tenant_id=tid
        )
        assert bom.bom_type == t


@pytest.mark.asyncio
async def test_create_bom_http_surfaces_type(client, auth_headers):
    resp = await client.post(
        "/api/v1/bom/", json={"name": "HTTP MBOM", "bom_type": "MBOM"}, headers=auth_headers
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["bom_type"] == "MBOM"

    get_resp = await client.get(f"/api/v1/bom/{body['id']}", headers=auth_headers)
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["bom_type"] == "MBOM"


# ============ 3. Filtering by type ============


@pytest.mark.asyncio
async def test_list_boms_filters_by_type(db_session, test_tenant):
    tid = test_tenant.id
    await bom_service.create_bom(db_session, {"name": "E1", "bom_type": "EBOM"}, tenant_id=tid)
    await bom_service.create_bom(db_session, {"name": "E2", "bom_type": "EBOM"}, tenant_id=tid)
    await bom_service.create_bom(db_session, {"name": "M1", "bom_type": "MBOM"}, tenant_id=tid)

    all_boms, all_total = await bom_service.list_boms(db_session)
    assert all_total == 3

    mboms, mtotal = await bom_service.list_boms(db_session, bom_type="MBOM")
    assert mtotal == 1
    assert all(b.bom_type == "MBOM" for b in mboms)

    eboms, etotal = await bom_service.list_boms(db_session, bom_type="EBOM")
    assert etotal == 2
    assert all(b.bom_type == "EBOM" for b in eboms)


@pytest.mark.asyncio
async def test_list_boms_http_filter(client, auth_headers):
    await client.post(
        "/api/v1/bom/", json={"name": "F-EBOM", "bom_type": "EBOM"}, headers=auth_headers
    )
    await client.post(
        "/api/v1/bom/", json={"name": "F-SBOM", "bom_type": "SBOM"}, headers=auth_headers
    )
    resp = await client.get("/api/v1/bom/?bom_type=SBOM", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["bom_type"] == "SBOM"


# ============ 4. Derivation copies structure, never mutates source ============


@pytest.mark.asyncio
async def test_derive_mbom_copies_structure_without_mutating_source(db_session, test_tenant):
    tid = test_tenant.id
    ebom = await _make_ebom_with_items(db_session, tid, "EBOM-DERIVE-1", n_parted=2, n_partless=1)

    before_items = (
        (await db_session.execute(select(BOMItem).where(BOMItem.bom_id == ebom.id)))
        .scalars()
        .all()
    )
    assert len(before_items) == 3

    header = await bom_service.derive_mbom_from_ebom(db_session, ebom.id, tenant_id=tid)

    assert header.ebom_id == ebom.id
    assert header.tenantId == tid
    assert header.mbom_number

    mbom_items = (
        (await db_session.execute(select(MbomItem).where(MbomItem.mbom_id == header.id)))
        .scalars()
        .all()
    )
    # Only the 2 parted lines copy — the partless line has nothing to
    # manufacture against (mbom_items.part_id is NOT NULL).
    assert len(mbom_items) == 2
    assert {i.part_id for i in mbom_items} == {i.part_id for i in before_items if i.part_id}

    # Source EBOM header + lines are untouched.
    after_bom = await bom_service.get_bom_or_404(db_session, ebom.id)
    assert after_bom.name == ebom.name
    assert after_bom.bom_type == "EBOM"
    after_items = (
        (await db_session.execute(select(BOMItem).where(BOMItem.bom_id == ebom.id)))
        .scalars()
        .all()
    )
    assert len(after_items) == 3
    assert {(i.id, i.part_id, float(i.quantity)) for i in after_items} == {
        (i.id, i.part_id, float(i.quantity)) for i in before_items
    }


@pytest.mark.asyncio
async def test_derive_mbom_preserves_explicit_zero_quantity(db_session, test_tenant):
    """`item.quantity or 1` silently turned an explicit 0 into 1 (same bug
    class fixed in the CAD adapter). A quantity of 0 is legitimate (e.g. a
    reference-only/do-not-build line) and must survive derivation as 0, not
    get coerced to 1.
    """
    tid = test_tenant.id
    ebom = await bom_service.create_bom(db_session, {"name": "ZERO-Q", "bom_type": "EBOM"}, tenant_id=tid)
    part = await _make_part(db_session, tid, "ZERO-Q-PN")
    db_session.add(BOMItem(bom_id=ebom.id, part_id=part.id, quantity=0, unit="EA", tenantId=tid))
    await db_session.commit()

    header = await bom_service.derive_mbom_from_ebom(db_session, ebom.id, tenant_id=tid)

    mbom_items = (
        (await db_session.execute(select(MbomItem).where(MbomItem.mbom_id == header.id)))
        .scalars()
        .all()
    )
    assert len(mbom_items) == 1
    assert float(mbom_items[0].quantity) == 0


@pytest.mark.asyncio
async def test_derive_mbom_rejects_non_ebom_source(db_session, test_tenant):
    tid = test_tenant.id
    mbom_tagged = await bom_service.create_bom(
        db_session, {"name": "Already MBOM", "bom_type": "MBOM"}, tenant_id=tid
    )
    with pytest.raises(HTTPException) as exc:
        await bom_service.derive_mbom_from_ebom(db_session, mbom_tagged.id, tenant_id=tid)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_derive_mbom_http_end_to_end(client, auth_headers, test_tenant):
    create_resp = await client.post(
        "/api/v1/bom/", json={"name": "HTTP EBOM"}, headers=auth_headers
    )
    ebom_id = create_resp.json()["id"]
    part_resp = await client.post(
        "/api/v1/parts/",
        json={"pn": "XBOM-PART-1", "name": "Part 1"},
        headers=auth_headers,
    )
    part_id = part_resp.json()["id"]
    await client.post(
        f"/api/v1/bom/{ebom_id}/items",
        json={"part_id": part_id, "quantity": 3},
        headers=auth_headers,
    )

    derive_resp = await client.post(
        "/api/v1/mbom/derive", json={"ebom_id": ebom_id}, headers=auth_headers
    )
    assert derive_resp.status_code == 200, derive_resp.text
    mbom = derive_resp.json()
    assert mbom["ebom_id"] == ebom_id
    assert len(mbom["items"]) == 1
    assert mbom["items"][0]["part_id"] == part_id
    assert float(mbom["items"][0]["quantity"]) == 3

    # Source EBOM's items are unchanged (still 1, same part/qty).
    ebom_items_resp = await client.get(f"/api/v1/bom/{ebom_id}/items", headers=auth_headers)
    ebom_items = ebom_items_resp.json()
    assert len(ebom_items) == 1
    assert ebom_items[0]["part_id"] == part_id


# ============ 5. Tenant isolation ============


@pytest.mark.asyncio
async def test_derive_mbom_tenant_isolation(db_session, test_tenant):
    tenant_a_id = test_tenant.id
    tenant_b = Tenant(id=tenant_a_id + 1000, tenant_name="Tenant B", tenant_code="XBOM-TENB")
    db_session.add(tenant_b)
    await db_session.commit()
    tenant_b_id = tenant_b.id

    token = TenantContext.set(tenant_id=tenant_a_id)
    try:
        ebom = await _make_ebom_with_items(db_session, tenant_a_id, "EBOM-ISOL-A", n_parted=1, n_partless=0)
    finally:
        TenantContext.reset(token)

    # Tenant B can't even see tenant A's EBOM, let alone derive from it.
    token = TenantContext.set(tenant_id=tenant_b_id)
    try:
        with pytest.raises(HTTPException) as exc:
            await bom_service.derive_mbom_from_ebom(db_session, ebom.id, tenant_id=tenant_b_id)
        assert exc.value.status_code == 404
    finally:
        TenantContext.reset(token)


@pytest.mark.asyncio
async def test_mbom_header_not_visible_cross_tenant_via_http(client, db_session, test_tenant):
    tid_a = test_tenant.id
    tid_b = tid_a + 2000
    await _make_tenant_and_user(db_session, tid_b, "xbom-tenant-b@example.com")
    # test_tenant (tid_a) already exists via the fixture — just add a user to it.
    tid_a_email = "xbom-tenant-a@example.com"
    await _add_user_to_tenant(db_session, tid_a, tid_a_email)
    headers_a = await _login(client, tid_a_email)
    headers_b = await _login(client, "xbom-tenant-b@example.com")

    create_resp = await client.post(
        "/api/v1/mbom/headers", json={"name": "Tenant A MBOM"}, headers=headers_a
    )
    assert create_resp.status_code == 201, create_resp.text
    mbom_id = create_resp.json()["id"]

    # Tenant B: 404 on direct get, absent from tenant B's list.
    get_as_b = await client.get(f"/api/v1/mbom/headers/{mbom_id}", headers=headers_b)
    assert get_as_b.status_code == 404

    list_as_b = await client.get("/api/v1/mbom/headers", headers=headers_b)
    assert all(h["id"] != mbom_id for h in list_as_b.json()["items"])

    # Tenant A still sees it.
    get_as_a = await client.get(f"/api/v1/mbom/headers/{mbom_id}", headers=headers_a)
    assert get_as_a.status_code == 200


async def _add_user_to_tenant(db_session, tenant_id, email):
    await _scoped_user(db_session, tenant_id, email)


async def _grant_parts_permissions(db_session, tenant_id, user):
    """mbom_api's RoleChecker (require_engineering) is satisfied by the
    "engineering" Role from _scoped_user, but parts.py's create_part uses
    PermissionChecker (require_parts_write), which checks Permission rows
    reached through Role.permissions — a separate grant.

    Linked via the raw association tables (like _scoped_user does for
    user_roles), not ORM relationship assignment: assigning role.users=[user]
    marks `user` dirty, and before_flush's cross-tenant-update guard then
    blocks the flush because the ambient (autouse) tenant context differs
    from this user's own tenant.
    """
    from app.models.permission import Permission
    from app.models.role import role_permissions

    role = Role(name=f"parts-writer-{user.id}", tenantId=tenant_id)
    read_perm = Permission(name="parts:read", resource="parts", action="read", tenantId=tenant_id)
    write_perm = Permission(
        name="parts:write", resource="parts", action="write", tenantId=tenant_id
    )
    db_session.add_all([role, read_perm, write_perm])
    await db_session.commit()
    await db_session.execute(
        role_permissions.insert().values(role_id=role.id, permission_id=read_perm.id)
    )
    await db_session.execute(
        role_permissions.insert().values(role_id=role.id, permission_id=write_perm.id)
    )
    await db_session.execute(user_roles.insert().values(user_id=user.id, role_id=role.id))
    await db_session.commit()


# ============ 6. mbom_api.py part_id validation (audit finding) ============
#
# create_mbom_item/update_mbom_item wrote MbomItem.part_id (a NOT NULL FK to
# parts.id) with no existence/tenant check at all. A bad id used to reach an
# unhandled IntegrityError -> generic 500 on commit; a real id belonging to
# another tenant would have been accepted outright, creating a cross-tenant
# reference. Both now validate via the same Part+tenant check bom_service's
# create_bom_item/update_bom_item already use.


@pytest.mark.asyncio
async def test_create_mbom_item_rejects_nonexistent_part(client, auth_headers):
    header_resp = await client.post(
        "/api/v1/mbom/headers", json={"name": "MBOM Bad Part"}, headers=auth_headers
    )
    mbom_id = header_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/mbom/headers/{mbom_id}/items",
        json={"part_id": 999999},
        headers=auth_headers,
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_create_mbom_item_rejects_cross_tenant_part(client, db_session, test_tenant):
    tid_a = test_tenant.id
    tid_b = tid_a + 3000
    tenant_b = Tenant(id=tid_b, tenant_name=f"Tenant {tid_b}", tenant_code=f"T{tid_b}")
    db_session.add(tenant_b)
    await db_session.commit()
    user_b = await _scoped_user(db_session, tid_b, "mbom-part-tenant-b@example.com")
    await _grant_parts_permissions(db_session, tid_b, user_b)
    user_a = await _scoped_user(db_session, tid_a, "mbom-part-tenant-a@example.com")
    await _grant_parts_permissions(db_session, tid_a, user_a)
    headers_a = await _login(client, "mbom-part-tenant-a@example.com")
    headers_b = await _login(client, "mbom-part-tenant-b@example.com")

    part_b_resp = await client.post(
        "/api/v1/parts/",
        json={"pn": "MBOM-SECRET-B", "name": "Tenant B secret part"},
        headers=headers_b,
    )
    part_b_id = part_b_resp.json()["id"]

    header_resp = await client.post(
        "/api/v1/mbom/headers", json={"name": "MBOM Tenant A"}, headers=headers_a
    )
    mbom_id = header_resp.json()["id"]

    # Tenant A tries to attach tenant B's real part.
    resp = await client.post(
        f"/api/v1/mbom/headers/{mbom_id}/items",
        json={"part_id": part_b_id},
        headers=headers_a,
    )
    assert resp.status_code == 404, resp.text

    items_resp = await client.get(
        f"/api/v1/mbom/headers/{mbom_id}/items", headers=headers_a
    )
    assert items_resp.json() == []


@pytest.mark.asyncio
async def test_update_mbom_item_rejects_cross_tenant_part(client, db_session, test_tenant):
    tid_a = test_tenant.id
    tid_b = tid_a + 4000
    tenant_b = Tenant(id=tid_b, tenant_name=f"Tenant {tid_b}", tenant_code=f"T{tid_b}")
    db_session.add(tenant_b)
    await db_session.commit()
    user_b = await _scoped_user(db_session, tid_b, "mbom-upd-tenant-b@example.com")
    await _grant_parts_permissions(db_session, tid_b, user_b)
    user_a = await _scoped_user(db_session, tid_a, "mbom-upd-tenant-a@example.com")
    await _grant_parts_permissions(db_session, tid_a, user_a)
    headers_a = await _login(client, "mbom-upd-tenant-a@example.com")
    headers_b = await _login(client, "mbom-upd-tenant-b@example.com")

    part_a_resp = await client.post(
        "/api/v1/parts/",
        json={"pn": "MBOM-OWN-A", "name": "Tenant A own part"},
        headers=headers_a,
    )
    part_a_id = part_a_resp.json()["id"]
    part_b_resp = await client.post(
        "/api/v1/parts/",
        json={"pn": "MBOM-SECRET-B-2", "name": "Tenant B secret part 2"},
        headers=headers_b,
    )
    part_b_id = part_b_resp.json()["id"]

    header_resp = await client.post(
        "/api/v1/mbom/headers", json={"name": "MBOM Tenant A 2"}, headers=headers_a
    )
    mbom_id = header_resp.json()["id"]
    item_resp = await client.post(
        f"/api/v1/mbom/headers/{mbom_id}/items",
        json={"part_id": part_a_id},
        headers=headers_a,
    )
    item_id = item_resp.json()["id"]

    resp = await client.put(
        f"/api/v1/mbom/headers/{mbom_id}/items/{item_id}",
        json={"part_id": part_b_id},
        headers=headers_a,
    )
    assert resp.status_code == 404, resp.text

    unchanged = await client.get(
        f"/api/v1/mbom/headers/{mbom_id}/items", headers=headers_a
    )
    assert unchanged.json()[0]["part_id"] == part_a_id


# ============ 7. Sub-assembly hierarchy survives derivation (057_mbom_hierarchy) ============


@pytest.mark.asyncio
async def test_derive_mbom_preserves_parent_child_structure(db_session, test_tenant):
    """A nested sub-assembly on the EBOM side (parent_item_id chain) must
    reproduce the same parent/child shape + quantities on the MBOM side —
    the actual value of a manufacturing BOM: it has to be able to express
    sub-assemblies, not just a flat parts list."""
    tid = test_tenant.id
    bom = BOM(bom_number="EBOM-NESTED-1", name="Nested EBOM", tenantId=tid, bom_type="EBOM")
    db_session.add(bom)
    await db_session.commit()
    await db_session.refresh(bom)

    assy_part = await _make_part(db_session, tid, "ASSY-1")
    sub_part = await _make_part(db_session, tid, "SUB-1")
    leaf_part = await _make_part(db_session, tid, "LEAF-1")

    top = BOMItem(bom_id=bom.id, part_id=assy_part.id, quantity=1, unit="EA", tenantId=tid)
    db_session.add(top)
    await db_session.flush()

    sub = BOMItem(
        bom_id=bom.id,
        part_id=sub_part.id,
        quantity=2,
        unit="EA",
        parent_item_id=top.id,
        tenantId=tid,
    )
    db_session.add(sub)
    await db_session.flush()

    leaf = BOMItem(
        bom_id=bom.id,
        part_id=leaf_part.id,
        quantity=5,
        unit="EA",
        parent_item_id=sub.id,
        tenantId=tid,
    )
    db_session.add(leaf)
    await db_session.commit()

    before_items = (
        (await db_session.execute(select(BOMItem).where(BOMItem.bom_id == bom.id)))
        .scalars()
        .all()
    )
    before_shape = {i.id: (i.part_id, float(i.quantity), i.parent_item_id) for i in before_items}

    header = await bom_service.derive_mbom_from_ebom(db_session, bom.id, tenant_id=tid)

    mbom_items = (
        (await db_session.execute(select(MbomItem).where(MbomItem.mbom_id == header.id)))
        .scalars()
        .all()
    )
    assert len(mbom_items) == 3
    by_part = {i.part_id: i for i in mbom_items}
    new_top, new_sub, new_leaf = by_part[assy_part.id], by_part[sub_part.id], by_part[leaf_part.id]

    # Same shape: top has no parent, sub's parent is the new top, leaf's parent is the new sub.
    assert new_top.parent_item_id is None
    assert new_sub.parent_item_id == new_top.id
    assert new_leaf.parent_item_id == new_sub.id

    # Same quantities, not silently coerced.
    assert float(new_top.quantity) == 1
    assert float(new_sub.quantity) == 2
    assert float(new_leaf.quantity) == 5

    # Source EBOM (header + every line's id/part/qty/parent) is untouched.
    after_bom = await bom_service.get_bom_or_404(db_session, bom.id)
    assert after_bom.name == bom.name
    after_items = (
        (await db_session.execute(select(BOMItem).where(BOMItem.bom_id == bom.id)))
        .scalars()
        .all()
    )
    after_shape = {i.id: (i.part_id, float(i.quantity), i.parent_item_id) for i in after_items}
    assert after_shape == before_shape


@pytest.mark.asyncio
async def test_derive_mbom_hierarchy_tenant_isolation(db_session, test_tenant):
    """Nested derivation, proven tenant-isolated: switching the ambient tenant
    context to tenant B must hide every row of tenant A's derived MBOM (ORM
    select() auto-filter, app/core/tenant_events.py), not just 404 a direct
    lookup by id."""
    tenant_a_id = test_tenant.id
    tenant_b = Tenant(id=tenant_a_id + 5000, tenant_name="Tenant B2", tenant_code="XBOM-TENB2")
    db_session.add(tenant_b)
    await db_session.commit()
    tenant_b_id = tenant_b.id

    token = TenantContext.set(tenant_id=tenant_a_id)
    try:
        bom = BOM(
            bom_number="EBOM-NESTED-ISO",
            name="Nested ISO",
            tenantId=tenant_a_id,
            bom_type="EBOM",
        )
        db_session.add(bom)
        await db_session.commit()
        await db_session.refresh(bom)
        p1 = await _make_part(db_session, tenant_a_id, "ISO-ASSY")
        p2 = await _make_part(db_session, tenant_a_id, "ISO-SUB")
        top = BOMItem(bom_id=bom.id, part_id=p1.id, quantity=1, tenantId=tenant_a_id)
        db_session.add(top)
        await db_session.flush()
        sub = BOMItem(
            bom_id=bom.id,
            part_id=p2.id,
            quantity=1,
            parent_item_id=top.id,
            tenantId=tenant_a_id,
        )
        db_session.add(sub)
        await db_session.commit()

        header = await bom_service.derive_mbom_from_ebom(db_session, bom.id, tenant_id=tenant_a_id)
        header_id = header.id
    finally:
        TenantContext.reset(token)

    token = TenantContext.set(tenant_id=tenant_b_id)
    try:
        visible = (
            (await db_session.execute(select(MbomItem).where(MbomItem.mbom_id == header_id)))
            .scalars()
            .all()
        )
        assert visible == []
    finally:
        TenantContext.reset(token)
