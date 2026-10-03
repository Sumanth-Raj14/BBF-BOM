"""A BOM snapshot must carry its CONTENT, so the BOM can be diffed against it.

Snapshots used to store metadata plus an item_count: nothing to diff, which is
why "what changed between Rev B and Rev C of this assembly" could not be
answered at all.

Two things are pinned here:

  1. create_snapshot actually writes the rows, JSON-safely. quantity /
     unit_cost_snapshot are Numeric(10,4) and come back as Decimal, which the
     stock json.dumps the engine uses cannot encode - storing a raw Decimal
     raises TypeError on flush, so the snapshot could not even be created.

  2. compare_bom_to_snapshot agrees with compare_boms. Both go through the same
     per-part aggregation, so a part appearing on TWO lines is totalled rather
     than collapsed to whichever line came last (the bug fixed in
     test_bom_compare_repeated_parts.py). A snapshot-side copy of that logic
     would let the two comparisons disagree.
"""

from decimal import Decimal

import pytest

from app.models.bom import BOM, BOMItem
from app.models.part import Part


async def _bom_with_lines(db_session, tid, number, name, lines):
    """lines: list of (part, quantity, refdes)."""
    bom = BOM(bom_number=number, name=name, version="1.0", tenantId=tid)
    db_session.add(bom)
    await db_session.flush()
    for part, qty, refdes in lines:
        db_session.add(
            BOMItem(
                bom_id=bom.id,
                part_id=part.id,
                quantity=qty,
                unit="EA",
                reference_designator=refdes,
                find_number=refdes,
                unit_cost_snapshot=Decimal("1.2500"),
                tenantId=tid,
            )
        )
    await db_session.flush()
    return bom


@pytest.mark.asyncio
async def test_snapshot_stores_diffable_rows(db_session, test_tenant, tenant_id):
    """The snapshot must persist the lines themselves, JSON-safe."""
    from app.models.bom_snapshot import BomSnapshot
    from app.services import bom_service

    tid = tenant_id
    res = Part(pn="SNAP-RES-10K", name="10k resistor", tenantId=tid)
    db_session.add(res)
    await db_session.flush()
    bom = await _bom_with_lines(db_session, tid, "SNAP-1", "Snap 1", [(res, 2, "R1")])
    await db_session.commit()

    # Fails outright before the fix: Decimal quantity is not json-encodable.
    created = await bom_service.create_snapshot(db_session, bom.id, "Rev B", "baseline")
    assert created["item_count"] == 1

    snap = await db_session.get(BomSnapshot, created["id"])
    (row,) = snap.snapshot_data
    assert row["part_id"] == res.id
    assert row["part_number"] == "SNAP-RES-10K"
    assert float(row["quantity"]) == 2.0
    assert row["unit"] == "EA"
    assert row["reference_designator"] == "R1"
    assert row["find_number"] == "R1"
    assert row["parent_item_id"] is None
    assert float(row["unit_cost_snapshot"]) == 1.25
    # Everything stored must survive a real JSON round-trip.
    import json

    json.dumps(snap.snapshot_data)


@pytest.mark.asyncio
async def test_compare_bom_against_its_own_snapshot(db_session, test_tenant, tenant_id):
    """Snapshot, then change lines, then diff - exact added/removed/modified.

    The resistor sits on TWO lines, so its quantity must be TOTALLED (2 + 3 = 5
    at snapshot time). If the snapshot path collapsed repeated parts the way
    compare_boms once did, it would read 3 and this would report a phantom
    "modified 3 -> 5" for a part nobody touched.
    """
    from app.services import bom_service

    tid = tenant_id
    res = Part(pn="SNAP-RES", name="resistor", tenantId=tid)
    cap = Part(pn="SNAP-CAP", name="capacitor", tenantId=tid)
    ic = Part(pn="SNAP-IC", name="controller", tenantId=tid)
    db_session.add_all([res, cap, ic])
    await db_session.flush()

    bom = await _bom_with_lines(
        db_session,
        tid,
        "SNAP-2",
        "Snap 2",
        [(res, 2, "R1"), (res, 3, "R2"), (cap, 1, "C1")],
    )
    await db_session.commit()

    snap = await bom_service.create_snapshot(db_session, bom.id, "Rev B", "baseline")
    assert snap["item_count"] == 3

    # Now edit the live BOM: capacitor 1 -> 4, drop nothing, add the IC.
    # The resistor's two lines are left alone - it must NOT show as changed.
    items = await bom_service._bom_items(db_session, bom.id, tid)
    for item in items:
        if item.part_id == cap.id:
            item.quantity = Decimal("4")
    db_session.add(
        BOMItem(
            bom_id=bom.id,
            part_id=ic.id,
            quantity=Decimal("1"),
            unit="EA",
            reference_designator="U1",
            tenantId=tid,
        )
    )
    await db_session.commit()

    result = await bom_service.compare_bom_to_snapshot(db_session, bom.id, snap["id"])

    assert result["added"] == [{"part_number": "SNAP-IC", "quantity": Decimal(1)}]
    assert result["removed"] == []
    assert [m["part_number"] for m in result["modified"]] == ["SNAP-CAP"]
    (mod,) = result["modified"]
    assert mod["old_quantity"] == Decimal(1)
    assert mod["new_quantity"] == Decimal(4)
    assert mod["old_refdes"] == "C1"
    assert mod["new_refdes"] == "C1"
    # The untouched repeated part is the one that stays unchanged.
    assert result["unchanged"] == 1
    # Envelope matches compare_boms so DiffScreen renders it unchanged.
    assert result["bom_id_1"] == result["bom_id_2"] == bom.id
    assert result["version_1"] == "1.0"


@pytest.mark.asyncio
async def test_removed_line_shows_and_snapshot_to_snapshot_works(
    db_session, test_tenant, tenant_id
):
    """Deleting one of a repeated part's lines is a real change; snapshot-to-snapshot too."""
    from app.services import bom_service

    tid = tenant_id
    screw = Part(pn="SNAP-SCREW", name="M3 screw", tenantId=tid)
    washer = Part(pn="SNAP-WASHER", name="washer", tenantId=tid)
    db_session.add_all([screw, washer])
    await db_session.flush()

    bom = await _bom_with_lines(
        db_session,
        tid,
        "SNAP-3",
        "Snap 3",
        [(screw, 4, "S1"), (screw, 4, "S2"), (washer, 2, "W1")],
    )
    await db_session.commit()

    snap_a = await bom_service.create_snapshot(db_session, bom.id, "Rev A", "baseline")

    # Drop ONE of the two screw lines (8 -> 4) and remove the washer entirely.
    items = await bom_service._bom_items(db_session, bom.id, tid)
    for item in items:
        if item.reference_designator in ("S2", "W1"):
            await db_session.delete(item)
    await db_session.commit()

    snap_b = await bom_service.create_snapshot(db_session, bom.id, "Rev B", "release")

    for result in (
        await bom_service.compare_bom_to_snapshot(db_session, bom.id, snap_a["id"]),
        # snapshot-to-snapshot must agree with snapshot-to-live
        await bom_service.compare_bom_to_snapshot(
            db_session, bom.id, snap_a["id"], snap_b["id"]
        ),
    ):
        assert result["added"] == []
        assert result["removed"] == [{"part_number": "SNAP-WASHER", "quantity": Decimal(2)}]
        (mod,) = result["modified"]
        assert mod["part_number"] == "SNAP-SCREW"
        # 8, not 4: the repeated line must be totalled on the snapshot side.
        assert mod["old_quantity"] == Decimal(8)
        assert mod["new_quantity"] == Decimal(4)
        assert mod["old_refdes"] == "S1, S2"
        assert mod["new_refdes"] == "S1"
        assert result["unchanged"] == 0


@pytest.mark.asyncio
async def test_snapshot_of_another_bom_is_rejected(db_session, test_tenant, tenant_id):
    """A snapshot belongs to one BOM. Diffing it against a different BOM leaks it."""
    from fastapi import HTTPException

    from app.services import bom_service

    tid = tenant_id
    part = Part(pn="SNAP-OTHER", name="other", tenantId=tid)
    db_session.add(part)
    await db_session.flush()
    bom_a = await _bom_with_lines(db_session, tid, "SNAP-4", "Snap 4", [(part, 1, "X1")])
    bom_b = await _bom_with_lines(db_session, tid, "SNAP-5", "Snap 5", [(part, 1, "Y1")])
    await db_session.commit()

    snap_a = await bom_service.create_snapshot(db_session, bom_a.id, "Rev A", "baseline")

    with pytest.raises(HTTPException) as exc:
        await bom_service.compare_bom_to_snapshot(db_session, bom_b.id, snap_a["id"])
    assert exc.value.status_code == 404
