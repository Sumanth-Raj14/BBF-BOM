"""TDD tests for Track-B (BOM grid) backend: line-item media (image),
visibility (exclude_from_bom), and ad-hoc custom-attribute values.

Covers migration 045's three new bom_items_master columns
(image_document_id, thumbnail_path, exclude_from_bom) plus the new
bom_item_custom_values table (migration 046) that pairs with the existing,
schema-change-free CustomAttributeDefinition(entity_type='bom_item').
"""

import io

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.bom import BOM, BOMItem
from app.models.bom_item_custom_value import BomItemCustomValue
from app.models.document import Document
from app.models.enterprise_extensions import CustomAttributeDefinition
from app.models.part import Part
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


async def _make_item(
    db_session,
    tenant_id,
    bom_id,
    part_id=None,
    quantity=1,
    parent_item_id=None,
    unit_cost_snapshot=None,
    exclude_from_bom=False,
):
    item = BOMItem(
        bom_id=bom_id,
        part_id=part_id,
        quantity=quantity,
        parent_item_id=parent_item_id,
        unit_cost_snapshot=unit_cost_snapshot,
        exclude_from_bom=exclude_from_bom,
        tenantId=tenant_id,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


@pytest.fixture(autouse=True)
def _clear_part_cache():
    """See test_bom_core_correctness.py — the service keeps a module-level
    part cache that outlives any single test's DB session."""
    bom_service._part_cache.clear()
    yield
    bom_service._part_cache.clear()


# ============ exclude_from_bom skips explosion/rollup, not the grid ============


@pytest.mark.asyncio
async def test_exclude_from_bom_omitted_from_explosion(db_session, test_tenant):
    tid = test_tenant.id
    part_parent = await _make_part(db_session, tid, pn="PN-EXC-PARENT")
    part_child = await _make_part(db_session, tid, pn="PN-EXC-CHILD")
    part_sibling = await _make_part(db_session, tid, pn="PN-EXC-SIBLING")

    bom = await _make_bom(db_session, tid, bom_number="BOM-EXC-001")
    excluded_parent = await _make_item(
        db_session, tid, bom.id, part_id=part_parent.id, quantity=2, exclude_from_bom=True
    )
    # Child of the excluded line — must vanish along with its parent (the
    # whole branch is skipped, not spliced up a level).
    await _make_item(
        db_session,
        tid,
        bom.id,
        part_id=part_child.id,
        quantity=3,
        parent_item_id=excluded_parent.id,
    )
    # Unrelated, non-excluded sibling line — must still appear.
    await _make_item(db_session, tid, bom.id, part_id=part_sibling.id, quantity=1)

    tree = await bom_service.get_bom_explosion(db_session, bom.id)
    pns = {node["part_number"] for node in tree}
    assert pns == {"PN-EXC-SIBLING"}, f"excluded line/subtree leaked into explosion: {tree}"

    tree_closure = await bom_service.get_bom_explosion_via_closure(db_session, bom.id)
    pns_closure = {node["part_number"] for node in tree_closure}
    assert pns_closure == {"PN-EXC-SIBLING"}, (
        f"excluded line/subtree leaked into closure-backed explosion: {tree_closure}"
    )


@pytest.mark.asyncio
async def test_exclude_from_bom_omitted_from_rollups(db_session, test_tenant):
    tid = test_tenant.id
    part_included = await _make_part(db_session, tid, pn="PN-ROLLUP-INCLUDED", cost=1.0)
    part_excluded = await _make_part(db_session, tid, pn="PN-ROLLUP-EXCLUDED", cost=100.0)

    bom = await _make_bom(db_session, tid, bom_number="BOM-EXC-ROLLUP-001")
    await _make_item(
        db_session, tid, bom.id, part_id=part_included.id, quantity=2, unit_cost_snapshot=1.0
    )
    await _make_item(
        db_session,
        tid,
        bom.id,
        part_id=part_excluded.id,
        quantity=5,
        unit_cost_snapshot=100.0,
        exclude_from_bom=True,
    )

    rollup = await bom_service.get_quantity_rollup(db_session, bom.id)
    by_pn = {r["part_number"]: r for r in rollup["rollup"]}
    assert "PN-ROLLUP-EXCLUDED" not in by_pn, f"excluded part leaked into rollup: {rollup}"
    assert by_pn["PN-ROLLUP-INCLUDED"]["total_quantity"] == 2
    assert rollup["total_items"] == 1

    cost = await bom_service.get_cost_rollup(db_session, bom.id)
    # included: 1.0 * 2 = 2.0; excluded line's 100.0 * 5 = 500.0 must NOT count.
    assert cost["total_cost"] == 2.0, f"excluded line's cost leaked into rollup: {cost}"


@pytest.mark.asyncio
async def test_exclude_from_bom_still_visible_in_list_bom_items(db_session, test_tenant):
    """exclude_from_bom hides a line from explosion/rollup, but the grid
    itself (list_bom_items) must keep showing it so it can be re-included."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-LIST-EXC")
    bom = await _make_bom(db_session, tid, bom_number="BOM-LIST-EXC-001")
    await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=1, exclude_from_bom=True)

    items = await bom_service.list_bom_items(db_session, bom.id)
    assert len(items) == 1
    assert items[0]["exclude_from_bom"] is True


@pytest.mark.asyncio
async def test_create_and_update_bom_item_persist_exclude_from_bom(db_session, test_tenant):
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-EXC-CRUD")
    bom = await _make_bom(db_session, tid, bom_number="BOM-EXC-CRUD-001")

    created = await bom_service.create_bom_item(
        db_session, bom.id, {"part_id": part.id, "quantity": 1, "exclude_from_bom": True}
    )
    assert created["exclude_from_bom"] is True

    updated = await bom_service.update_bom_item(
        db_session, bom.id, created["id"], {"exclude_from_bom": False}
    )
    assert updated["exclude_from_bom"] is False

    row = (await db_session.execute(select(BOMItem).where(BOMItem.id == created["id"]))).scalar_one()
    assert row.exclude_from_bom is False


# ============ Line-item image round-trips ============


@pytest.mark.asyncio
async def test_bom_item_image_attach_and_clear_round_trip(client, db_session, auth_headers, test_user):
    tid = test_user.tenantId
    part = await _make_part(db_session, tid, pn="PN-IMG-001")
    bom = await _make_bom(db_session, tid, bom_number="BOM-IMG-001")
    item = await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=1)

    resp = await client.post(
        f"/api/v1/bom/{bom.id}/items/{item.id}/image",
        files={"file": ("part.png", io.BytesIO(b"fake-image-bytes"), "image/png")},
        headers={k: v for k, v in auth_headers.items() if k != "Content-Type"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["image_document_id"] is not None
    assert body["thumbnail_path"]

    # A real Document row was created, tenant-scoped, category tagged.
    doc = (
        await db_session.execute(select(Document).where(Document.id == body["image_document_id"]))
    ).scalar_one()
    assert doc.tenantId == tid
    assert doc.category == "BomItemImage"

    # Persisted to bom_items_master, not just echoed in the response body.
    row = (await db_session.execute(select(BOMItem).where(BOMItem.id == item.id))).scalar_one()
    assert row.image_document_id == body["image_document_id"]
    assert row.thumbnail_path == body["thumbnail_path"]

    clear_resp = await client.delete(
        f"/api/v1/bom/{bom.id}/items/{item.id}/image", headers=auth_headers
    )
    assert clear_resp.status_code == 200, clear_resp.text
    cleared = clear_resp.json()
    assert cleared["image_document_id"] is None
    assert cleared["thumbnail_path"] is None

    row_after_clear = (
        await db_session.execute(select(BOMItem).where(BOMItem.id == item.id))
    ).scalar_one()
    assert row_after_clear.image_document_id is None
    assert row_after_clear.thumbnail_path is None
    # The Document row itself is left alone — clearing only unlinks the line.
    still_there = (
        await db_session.execute(select(Document).where(Document.id == doc.id))
    ).scalar_one_or_none()
    assert still_there is not None


# ============ Line-item custom-attribute (ad-hoc column) round-trips ============


@pytest.mark.asyncio
async def test_bom_item_custom_attribute_round_trip(db_session, test_tenant):
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-CATTR-001")
    bom = await _make_bom(db_session, tid, bom_number="BOM-CATTR-001")
    item = await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=1)

    definition = CustomAttributeDefinition(
        entity_type="bom_item",
        attribute_name="lead_time_weeks",
        display_name="Lead Time (weeks)",
        attribute_type="text",
        tenantId=tid,
    )
    db_session.add(definition)
    await db_session.commit()
    await db_session.refresh(definition)

    # Unset initially — the full ad-hoc schema is returned with value=None.
    attrs = await bom_service.get_bom_item_custom_attributes(db_session, bom.id, item.id)
    assert len(attrs) == 1
    assert attrs[0]["attribute_definition_id"] == definition.id
    assert attrs[0]["value"] is None

    written = await bom_service.set_bom_item_custom_attribute(
        db_session, bom.id, item.id, definition.id, "6", tenant_id=tid
    )
    assert written["value"] == "6"

    attrs_after = await bom_service.get_bom_item_custom_attributes(db_session, bom.id, item.id)
    assert attrs_after[0]["value"] == "6"

    # Second write UPDATEs the existing value row rather than inserting a duplicate.
    updated = await bom_service.set_bom_item_custom_attribute(
        db_session, bom.id, item.id, definition.id, "8", tenant_id=tid
    )
    assert updated["value"] == "8"
    rows = (
        (
            await db_session.execute(
                select(BomItemCustomValue).where(BomItemCustomValue.bom_item_id == item.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1, "second write must UPDATE the existing row, not insert a duplicate"
    assert rows[0].value == "8"


@pytest.mark.asyncio
async def test_bom_item_custom_attribute_ignores_other_entity_types(db_session, test_tenant):
    """A definition scoped to entity_type='part' must not leak into
    entity_type='bom_item' reads, and writing against it must 404."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-CATTR-002")
    bom = await _make_bom(db_session, tid, bom_number="BOM-CATTR-002")
    item = await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=1)

    other_def = CustomAttributeDefinition(
        entity_type="part",
        attribute_name="material",
        attribute_type="text",
        tenantId=tid,
    )
    db_session.add(other_def)
    await db_session.commit()
    await db_session.refresh(other_def)

    attrs = await bom_service.get_bom_item_custom_attributes(db_session, bom.id, item.id)
    assert attrs == []

    with pytest.raises(HTTPException) as exc_info:
        await bom_service.set_bom_item_custom_attribute(
            db_session, bom.id, item.id, other_def.id, "steel", tenant_id=tid
        )
    assert exc_info.value.status_code == 404
