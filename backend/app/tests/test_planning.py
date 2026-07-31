"""Tests for Track B planning: PO-from-BOM generation (#8) and the
purchased-leaf explosion option (#15).

Mirrors test_bom_instance_crud.py's style: service-level calls against
db_session/test_tenant, relying on conftest's autouse setup_tenant_context
fixture (ambient tenant == test_tenant.id) rather than manually juggling
TenantContext.
"""

import pytest

from app.models.bom import BOM, BOMItem
from app.models.part import Part
from app.models.vendor import Vendor
from app.services import bom_service, planning_service


async def _make_part(db_session, tenant_id, pn, **kwargs):
    defaults = dict(name="Part", category="Electrical", cost=0.0)
    defaults.update(kwargs)
    part = Part(pn=pn, tenantId=tenant_id, **defaults)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)
    return part


async def _make_vendor(db_session, tenant_id, name):
    vendor = Vendor(name=name, tenantId=tenant_id)
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)
    return vendor


async def _make_bom(db_session, tenant_id, bom_number, name="BOM"):
    bom = BOM(bom_number=bom_number, name=name, tenantId=tenant_id)
    db_session.add(bom)
    await db_session.commit()
    await db_session.refresh(bom)
    return bom


async def _make_item(db_session, tenant_id, bom_id, part_id=None, quantity=1, parent_item_id=None):
    item = BOMItem(
        bom_id=bom_id,
        tenantId=tenant_id,
        part_id=part_id,
        quantity=quantity,
        parent_item_id=parent_item_id,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


# ---------------------------------------------------------------------------
# bom_service.get_required_quantities — purchased-leaf option
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_required_quantities_purchased_leaf_drops_children(db_session, test_tenant):
    tid = test_tenant.id
    top = await _make_part(db_session, tid, "TOP-001", name="Top Assembly")
    sub = await _make_part(
        db_session, tid, "SUB-001", name="Purchased Sub", part_kind="PURCHASED", assembly=True
    )
    screw = await _make_part(db_session, tid, "SCREW-001", name="Screw", cost=0.1)
    bom = await _make_bom(db_session, tid, "BOM-REQ-001")

    root = await _make_item(db_session, tid, bom.id, part_id=top.id, quantity=1)
    sub_item = await _make_item(
        db_session, tid, bom.id, part_id=sub.id, quantity=2, parent_item_id=root.id
    )
    await _make_item(
        db_session, tid, bom.id, part_id=screw.id, quantity=4, parent_item_id=sub_item.id
    )

    result = await bom_service.get_required_quantities(db_session, bom.id, purchased_as_leaf=True)
    by_part = {r["part_id"]: r for r in result}

    assert sub.id in by_part
    assert by_part[sub.id]["required_qty"] == 2  # own line kept, not multiplied further
    assert screw.id not in by_part, "purchased leaf's children must be dropped from the aggregate"


@pytest.mark.asyncio
async def test_required_quantities_purchased_as_leaf_false_keeps_children(db_session, test_tenant):
    """The flag is opt-in behavior — with it off, the purchased part's
    children are still aggregated (regression guard for the option itself)."""
    tid = test_tenant.id
    sub = await _make_part(
        db_session, tid, "SUB-002", name="Purchased Sub", part_kind="PURCHASED"
    )
    screw = await _make_part(db_session, tid, "SCREW-002", name="Screw", cost=0.1)
    bom = await _make_bom(db_session, tid, "BOM-REQ-002")

    sub_item = await _make_item(db_session, tid, bom.id, part_id=sub.id, quantity=2)
    await _make_item(
        db_session, tid, bom.id, part_id=screw.id, quantity=4, parent_item_id=sub_item.id
    )

    result = await bom_service.get_required_quantities(db_session, bom.id, purchased_as_leaf=False)
    by_part = {r["part_id"]: r for r in result}

    assert screw.id in by_part
    assert by_part[screw.id]["required_qty"] == 8  # 4 * 2


@pytest.mark.asyncio
async def test_required_quantities_aggregates_same_part_across_tree(db_session, test_tenant):
    """The same part appearing at multiple positions in the tree must sum
    its effective quantities into a single aggregated row."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, "MULTI-001", name="Common Fastener")
    bom = await _make_bom(db_session, tid, "BOM-REQ-003")

    root = await _make_item(db_session, tid, bom.id, quantity=1)
    branch = await _make_item(
        db_session, tid, bom.id, part_id=part.id, quantity=3, parent_item_id=root.id
    )
    # Same part again, nested one level deeper under its own first occurrence.
    await _make_item(
        db_session, tid, bom.id, part_id=part.id, quantity=4, parent_item_id=branch.id
    )

    result = await bom_service.get_required_quantities(db_session, bom.id)
    matches = [r for r in result if r["part_id"] == part.id]
    assert len(matches) == 1
    assert matches[0]["required_qty"] == 3 + 4 * 3  # 3 (direct) + 4*3 (nested under itself)


# ---------------------------------------------------------------------------
# planning_service.generate_po_from_bom
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_po_from_bom_aggregates_quantities_and_groups_by_vendor(
    db_session, test_tenant
):
    tid = test_tenant.id
    vendor1 = await _make_vendor(db_session, tid, "Vendor One")
    vendor2 = await _make_vendor(db_session, tid, "Vendor Two")
    part1 = await _make_part(
        db_session, tid, "P1-VEND", name="Widget", cost=2.0, primary_vendor_id=vendor1.id
    )
    part2 = await _make_part(
        db_session, tid, "P2-VEND", name="Gadget", cost=5.0, primary_vendor_id=vendor2.id
    )
    bom = await _make_bom(db_session, tid, "BOM-PO-001")

    root = await _make_item(db_session, tid, bom.id, quantity=1)
    item_a = await _make_item(
        db_session, tid, bom.id, part_id=part1.id, quantity=3, parent_item_id=root.id
    )
    await _make_item(
        db_session, tid, bom.id, part_id=part2.id, quantity=2, parent_item_id=root.id
    )
    # part1 also appears nested under its own first occurrence: effective 4*3=12,
    # so its aggregated required_qty across the whole BOM is 3 + 12 = 15.
    await _make_item(
        db_session, tid, bom.id, part_id=part1.id, quantity=4, parent_item_id=item_a.id
    )

    pos = await planning_service.generate_po_from_bom(db_session, bom.id)

    assert len(pos) == 2
    by_vendor = {po["vendorName"]: po for po in pos}
    assert set(by_vendor) == {"Vendor One", "Vendor Two"}

    po1 = by_vendor["Vendor One"]
    assert po1["vendor_id"] == vendor1.id
    assert len(po1["items"]) == 1
    assert po1["items"][0]["partId"] == part1.id
    assert po1["items"][0]["quantity"] == 15
    assert po1["poTotal"] == pytest.approx(30.0)

    po2 = by_vendor["Vendor Two"]
    assert po2["vendor_id"] == vendor2.id
    assert len(po2["items"]) == 1
    assert po2["items"][0]["partId"] == part2.id
    assert po2["items"][0]["quantity"] == 2
    assert po2["poTotal"] == pytest.approx(10.0)


@pytest.mark.asyncio
async def test_generate_po_from_bom_purchased_assembly_is_single_line(db_session, test_tenant):
    """A purchased/COTS sub-assembly must produce exactly one PO line for
    itself; its children must not appear as separate (or aggregated) lines
    in any generated PO."""
    tid = test_tenant.id
    vendor = await _make_vendor(db_session, tid, "Motor Supplier")
    top = await _make_part(db_session, tid, "TOP-PO", name="Top Assembly")
    sub = await _make_part(
        db_session,
        tid,
        "SUBASM-PO",
        name="Purchased Motor Assembly",
        part_kind="PURCHASED",
        assembly=True,
        cost=50.0,
        primary_vendor_id=vendor.id,
    )
    screw = await _make_part(db_session, tid, "SCREW-PO", name="Screw", cost=0.1)
    bracket = await _make_part(db_session, tid, "BRACKET-PO", name="Bracket", cost=0.5)
    bom = await _make_bom(db_session, tid, "BOM-PO-002")

    root = await _make_item(db_session, tid, bom.id, part_id=top.id, quantity=1)
    sub_item = await _make_item(
        db_session, tid, bom.id, part_id=sub.id, quantity=2, parent_item_id=root.id
    )
    await _make_item(
        db_session, tid, bom.id, part_id=screw.id, quantity=4, parent_item_id=sub_item.id
    )
    await _make_item(
        db_session, tid, bom.id, part_id=bracket.id, quantity=1, parent_item_id=sub_item.id
    )

    pos = await planning_service.generate_po_from_bom(db_session, bom.id, purchased_as_leaf=True)

    all_line_part_ids = [i["partId"] for po in pos for i in po["items"]]
    assert screw.id not in all_line_part_ids
    assert bracket.id not in all_line_part_ids

    sub_lines = [i for po in pos for i in po["items"] if i["partId"] == sub.id]
    assert len(sub_lines) == 1
    assert sub_lines[0]["quantity"] == 2


@pytest.mark.asyncio
async def test_generate_po_from_bom_unassigned_vendor_bucket(db_session, test_tenant):
    """A part with no primary_vendor_id and no preferred PartVendor row still
    generates a PO, grouped under the 'Unassigned' bucket rather than being
    silently dropped."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, "NOVEND-001", name="Orphan Part", cost=1.0)
    bom = await _make_bom(db_session, tid, "BOM-PO-003")
    await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=5)

    pos = await planning_service.generate_po_from_bom(db_session, bom.id)

    assert len(pos) == 1
    assert pos[0]["vendorName"] == "Unassigned"
    assert pos[0]["vendor_id"] is None
    assert pos[0]["items"][0]["quantity"] == 5


@pytest.mark.asyncio
async def test_generate_po_from_bom_empty_bom_raises(db_session, test_tenant):
    tid = test_tenant.id
    bom = await _make_bom(db_session, tid, "BOM-PO-EMPTY")

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await planning_service.generate_po_from_bom(db_session, bom.id)
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# planning_service.get_planning_summary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_planning_summary_returns_per_part_view(db_session, test_tenant):
    tid = test_tenant.id
    vendor = await _make_vendor(db_session, tid, "Summary Vendor")
    part = await _make_part(
        db_session, tid, "SUM-001", name="Summary Part", cost=3.0, primary_vendor_id=vendor.id
    )
    bom = await _make_bom(db_session, tid, "BOM-SUM-001")
    await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=6)

    summary = await planning_service.get_planning_summary(db_session, bom.id)

    assert summary["bom_id"] == bom.id
    assert summary["unique_parts"] == 1
    assert summary["total_required_qty"] == 6
    item = summary["items"][0]
    assert item["part_id"] == part.id
    assert item["vendor_id"] == vendor.id
    assert item["vendor_name"] == "Summary Vendor"
