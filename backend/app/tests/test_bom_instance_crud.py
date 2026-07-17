"""TDD tests for X1: canonical-BOM instance-line CRUD (backend).

Per the P0-architectural design brief's X1 section: `BOM` (table `boms`) +
`BOMItem` (table `bom_items_master`) is the single source of truth for
instance-BOM structure. Today there is NO runtime CRUD for `BOMItem` — no
create/update/delete/reorder route or service function exists. These tests
drive that gap: every mutation must be scoped by BOTH `bom_id` and
`tenantId` (the P0 leak class), must reuse the existing effective-qty
rollup logic (not duplicate it), and must validate self-parent / duplicate
lines.
"""

from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.tenant_context import TenantContext
from app.models.bom import BOM, BOMItem
from app.models.part import Part
from app.models.tenant import Tenant
from app.services import bom_service


async def _make_part(db_session, tenant_id, pn, name="Part", category="Electrical", cost=0.0):
    part = Part(pn=pn, name=name, category=category, cost=cost, tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)
    return part


async def _make_bom(db_session, tenant_id, bom_number, name="BOM"):
    bom = BOM(bom_number=bom_number, name=name, tenantId=tenant_id)
    db_session.add(bom)
    await db_session.commit()
    await db_session.refresh(bom)
    return bom


@pytest.fixture(autouse=True)
def _clear_part_cache():
    bom_service._part_cache.clear()
    yield
    bom_service._part_cache.clear()


@pytest.mark.asyncio
async def test_create_bom_item_persists_to_bom_items_master(db_session, test_tenant):
    """Adding a line via the service must write a real row to bom_items_master,
    not merely mutate the shared Part (the bug X1 is closing)."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-CREATE-001")
    bom = await _make_bom(db_session, tid, bom_number="BOM-CREATE-001")

    created = await bom_service.create_bom_item(
        db_session,
        bom.id,
        {
            "part_id": part.id,
            "quantity": "2.5000",
            "unit": "EA",
            "reference_designator": "R1",
            "find_number": "10",
        },
    )

    assert created["part_id"] == part.id
    assert Decimal(str(created["quantity"])) == Decimal("2.5")
    assert created["reference_designator"] == "R1"
    assert created["find_number"] == "10"

    row = (
        await db_session.execute(
            select(BOMItem).where(BOMItem.bom_id == bom.id, BOMItem.tenantId == tid)
        )
    ).scalar_one()
    assert row.part_id == part.id
    assert row.find_number == "10"


@pytest.mark.asyncio
async def test_line_not_visible_or_mutable_under_different_tenant(db_session, test_tenant):
    """A line created under tenant A + bom X must not be readable, listable,
    updatable, or deletable when the ambient tenant context is tenant B —
    even if the caller somehow knows the bom_id/item_id."""
    tenant_a_id = test_tenant.id
    tenant_b = Tenant(id=tenant_a_id + 1000, tenant_name="Tenant B", tenant_code="TENB")
    db_session.add(tenant_b)
    await db_session.commit()
    tenant_b_id = tenant_b.id

    part_a = await _make_part(db_session, tenant_a_id, pn="PN-TENANT-A")
    bom_a = await _make_bom(db_session, tenant_a_id, bom_number="BOM-TENANT-A-CRUD")

    token = TenantContext.set(tenant_id=tenant_a_id)
    try:
        item = await bom_service.create_bom_item(
            db_session, bom_a.id, {"part_id": part_a.id, "quantity": 1}
        )
    finally:
        TenantContext.reset(token)

    # Now operate as tenant B.
    token = TenantContext.set(tenant_id=tenant_b_id)
    try:
        # The BOM header itself is tenant A's — tenant B can't even see it,
        # let alone its lines.
        with pytest.raises(HTTPException) as exc:
            await bom_service.list_bom_items(db_session, bom_a.id)
        assert exc.value.status_code == 404

        with pytest.raises(HTTPException) as exc:
            await bom_service.update_bom_item(
                db_session, bom_a.id, item["id"], {"quantity": 99}
            )
        assert exc.value.status_code == 404

        with pytest.raises(HTTPException) as exc:
            await bom_service.delete_bom_item(db_session, bom_a.id, item["id"])
        assert exc.value.status_code == 404
    finally:
        TenantContext.reset(token)

    # The line must still exist untouched for tenant A.
    token = TenantContext.set(tenant_id=tenant_a_id)
    try:
        items = await bom_service.list_bom_items(db_session, bom_a.id)
        assert any(i["id"] == item["id"] and i["quantity"] == 1 for i in items)
    finally:
        TenantContext.reset(token)


@pytest.mark.asyncio
async def test_line_not_visible_or_mutable_under_different_bom(db_session, test_tenant):
    """A line created under bom X (same tenant) must not be reachable through
    bom Y's scoped CRUD."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-BOM-SCOPE")
    bom_x = await _make_bom(db_session, tid, bom_number="BOM-X-SCOPE")
    bom_y = await _make_bom(db_session, tid, bom_number="BOM-Y-SCOPE")

    item = await bom_service.create_bom_item(
        db_session, bom_x.id, {"part_id": part.id, "quantity": 1}
    )

    items_under_y = await bom_service.list_bom_items(db_session, bom_y.id)
    assert all(i["id"] != item["id"] for i in items_under_y)

    with pytest.raises(HTTPException) as exc:
        await bom_service.update_bom_item(db_session, bom_y.id, item["id"], {"quantity": 5})
    assert exc.value.status_code == 404

    with pytest.raises(HTTPException) as exc:
        await bom_service.delete_bom_item(db_session, bom_y.id, item["id"])
    assert exc.value.status_code == 404

    # Still fine under its real bom.
    items_under_x = await bom_service.list_bom_items(db_session, bom_x.id)
    assert any(i["id"] == item["id"] for i in items_under_x)


@pytest.mark.asyncio
async def test_update_bom_item_persists_changes(db_session, test_tenant):
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-UPDATE-001")
    bom = await _make_bom(db_session, tid, bom_number="BOM-UPDATE-001")
    item = await bom_service.create_bom_item(
        db_session, bom.id, {"part_id": part.id, "quantity": 1, "reference_designator": "R1"}
    )

    updated = await bom_service.update_bom_item(
        db_session, bom.id, item["id"], {"quantity": "4.0000", "notes": "updated note"}
    )
    assert Decimal(str(updated["quantity"])) == Decimal("4.0")
    assert updated["notes"] == "updated note"
    assert updated["reference_designator"] == "R1"  # untouched fields survive

    row = (await db_session.execute(select(BOMItem).where(BOMItem.id == item["id"]))).scalar_one()
    assert Decimal(str(row.quantity)) == Decimal("4.0")
    assert row.notes == "updated note"


@pytest.mark.asyncio
async def test_delete_bom_item_removes_row(db_session, test_tenant):
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-DELETE-001")
    bom = await _make_bom(db_session, tid, bom_number="BOM-DELETE-001")
    item = await bom_service.create_bom_item(
        db_session, bom.id, {"part_id": part.id, "quantity": 1}
    )

    await bom_service.delete_bom_item(db_session, bom.id, item["id"])

    row = (await db_session.execute(select(BOMItem).where(BOMItem.id == item["id"]))).scalar_one_or_none()
    assert row is None

    with pytest.raises(HTTPException) as exc:
        await bom_service.delete_bom_item(db_session, bom.id, item["id"])
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_reorder_bom_items_updates_sort_order(db_session, test_tenant):
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-REORDER-001")
    bom = await _make_bom(db_session, tid, bom_number="BOM-REORDER-001")
    item1 = await bom_service.create_bom_item(
        db_session, bom.id, {"part_id": part.id, "quantity": 1, "reference_designator": "R1"}
    )
    item2 = await bom_service.create_bom_item(
        db_session, bom.id, {"part_id": part.id, "quantity": 1, "reference_designator": "R2"}
    )
    item3 = await bom_service.create_bom_item(
        db_session, bom.id, {"part_id": part.id, "quantity": 1, "reference_designator": "R3"}
    )

    result = await bom_service.reorder_bom_items(
        db_session, bom.id, [item3["id"], item1["id"], item2["id"]]
    )
    assert result["count"] == 3

    rows = {
        r.id: r.sort_order
        for r in (
            await db_session.execute(select(BOMItem).where(BOMItem.bom_id == bom.id))
        ).scalars()
    }
    assert rows[item3["id"]] == 0
    assert rows[item1["id"]] == 1
    assert rows[item2["id"]] == 2


@pytest.mark.asyncio
async def test_reorder_ignores_item_from_another_bom(db_session, test_tenant):
    """Reorder must be bom-scoped: an item_id belonging to a different BOM
    must not be reassigned a sort_order under this bom_id."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-REORDER-LEAK")
    bom_x = await _make_bom(db_session, tid, bom_number="BOM-REORDER-X")
    bom_y = await _make_bom(db_session, tid, bom_number="BOM-REORDER-Y")
    item_x = await bom_service.create_bom_item(db_session, bom_x.id, {"part_id": part.id, "quantity": 1})
    item_y = await bom_service.create_bom_item(db_session, bom_y.id, {"part_id": part.id, "quantity": 1})

    await bom_service.reorder_bom_items(db_session, bom_x.id, [item_y["id"], item_x["id"]])

    row_y = (await db_session.execute(select(BOMItem).where(BOMItem.id == item_y["id"]))).scalar_one()
    assert row_y.bom_id == bom_y.id, "Item from another BOM must not be pulled into this bom's reorder"


@pytest.mark.asyncio
async def test_no_self_parent(db_session, test_tenant):
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-SELF-PARENT")
    bom = await _make_bom(db_session, tid, bom_number="BOM-SELF-PARENT")
    item = await bom_service.create_bom_item(db_session, bom.id, {"part_id": part.id, "quantity": 1})

    with pytest.raises(HTTPException) as exc:
        await bom_service.update_bom_item(
            db_session, bom.id, item["id"], {"parent_item_id": item["id"]}
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_parent_must_belong_to_same_bom_and_tenant(db_session, test_tenant):
    """A line's parent_item_id must reference an item in the SAME bom_id and
    tenant — otherwise the explosion tree could be hijacked to graft another
    BOM's (or tenant's) subtree in."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-CROSS-PARENT")
    bom_x = await _make_bom(db_session, tid, bom_number="BOM-CROSS-X")
    bom_y = await _make_bom(db_session, tid, bom_number="BOM-CROSS-Y")

    other_bom_item = await bom_service.create_bom_item(
        db_session, bom_y.id, {"part_id": part.id, "quantity": 1}
    )

    with pytest.raises(HTTPException) as exc:
        await bom_service.create_bom_item(
            db_session,
            bom_x.id,
            {"part_id": part.id, "quantity": 1, "parent_item_id": other_bom_item["id"]},
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_no_duplicate_identical_child_line(db_session, test_tenant):
    """Two lines under the same parent with the same part + refdes are an
    exact duplicate line and must be rejected."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-DUP-CHILD")
    bom = await _make_bom(db_session, tid, bom_number="BOM-DUP-CHILD")

    await bom_service.create_bom_item(
        db_session, bom.id, {"part_id": part.id, "quantity": 1, "reference_designator": "R1"}
    )

    with pytest.raises(HTTPException) as exc:
        await bom_service.create_bom_item(
            db_session,
            bom.id,
            {"part_id": part.id, "quantity": 1, "reference_designator": "R1"},
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_adding_line_changes_quantity_rollup_output(db_session, test_tenant):
    """Adding a line through the new CRUD must be reflected by the EXISTING
    (P0) rollup logic — this test would fail if the CRUD wrote lines the
    rollup couldn't see (wrong table/scope) or if rollup logic were
    duplicated/diverged."""
    tid = test_tenant.id
    part_parent = await _make_part(db_session, tid, pn="PN-ROLLUP-PARENT")
    part_child = await _make_part(db_session, tid, pn="PN-ROLLUP-CHILD")
    bom = await _make_bom(db_session, tid, bom_number="BOM-ROLLUP-CRUD")

    parent_item = await bom_service.create_bom_item(
        db_session, bom.id, {"part_id": part_parent.id, "quantity": 2}
    )

    rollup_before = await bom_service.get_quantity_rollup(db_session, bom.id)
    assert rollup_before["total_items"] == 1

    await bom_service.create_bom_item(
        db_session,
        bom.id,
        {"part_id": part_child.id, "quantity": 3, "parent_item_id": parent_item["id"]},
    )

    rollup_after = await bom_service.get_quantity_rollup(db_session, bom.id)
    assert rollup_after["total_items"] == 2
    by_pn = {r["part_number"]: r for r in rollup_after["rollup"]}
    assert by_pn["PN-ROLLUP-CHILD"]["total_quantity"] == 6  # 2 * 3 effective qty


# ============ HTTP-level wiring smoke tests ============


@pytest.mark.asyncio
async def test_http_create_and_list_bom_items(client, auth_headers, db_session, test_tenant):
    """Confirm the endpoints are actually mounted and reachable end-to-end,
    not just the service layer."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-HTTP-001")
    bom = await _make_bom(db_session, tid, bom_number="BOM-HTTP-001")

    resp = await client.post(
        f"/api/v1/bom/{bom.id}/items",
        headers=auth_headers,
        json={"part_id": part.id, "quantity": "3", "reference_designator": "R7"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["part_id"] == part.id
    assert body["reference_designator"] == "R7"

    list_resp = await client.get(f"/api/v1/bom/{bom.id}/items", headers=auth_headers)
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert any(i["id"] == body["id"] for i in items)

    update_resp = await client.put(
        f"/api/v1/bom/{bom.id}/items/{body['id']}",
        headers=auth_headers,
        json={"quantity": "9"},
    )
    assert update_resp.status_code == 200
    assert Decimal(str(update_resp.json()["quantity"])) == Decimal("9")

    delete_resp = await client.delete(
        f"/api/v1/bom/{bom.id}/items/{body['id']}", headers=auth_headers
    )
    assert delete_resp.status_code == 204

    list_resp2 = await client.get(f"/api/v1/bom/{bom.id}/items", headers=auth_headers)
    assert all(i["id"] != body["id"] for i in list_resp2.json())
