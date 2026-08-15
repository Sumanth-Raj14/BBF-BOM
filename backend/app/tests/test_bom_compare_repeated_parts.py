"""compare_boms must account for a part appearing on more than one line.

The bug: items were collected as `{i.part_id: i for i in rows}`. A part used
on several lines of one BOM — the same resistor on four reference designators,
a fastener reused across sub-assemblies — collapsed to whichever line came
last. Earlier occurrences vanished, and the quantity compared was one
arbitrary line's instead of the part's total.

Worst case, shown below: two BOMs that genuinely differ (one uses a part twice,
the other once) compared as UNCHANGED.
"""

import pytest

from app.models.bom import BOM, BOMItem
from app.models.part import Part


async def _bom_with_lines(db_session, tid, number, name, lines):
    """lines: list of (part, quantity, refdes)."""
    bom = BOM(bom_number=number, name=name, tenantId=tid)
    db_session.add(bom)
    await db_session.flush()
    for part, qty, refdes in lines:
        db_session.add(
            BOMItem(
                bom_id=bom.id,
                part_id=part.id,
                quantity=qty,
                reference_designator=refdes,
                tenantId=tid,
            )
        )
    await db_session.flush()
    return bom


@pytest.mark.asyncio
async def test_repeated_part_quantities_are_totalled(
    db_session, test_tenant, tenant_id
):
    from app.services import bom_service

    tid = tenant_id
    res = Part(pn="CMP-RES-10K", name="10k resistor", tenantId=tid)
    cap = Part(pn="CMP-CAP-1U", name="1u capacitor", tenantId=tid)
    db_session.add_all([res, cap])
    await db_session.flush()

    # BOM A: the resistor on two lines, 2 + 3 = 5 total.
    bom_a = await _bom_with_lines(
        db_session,
        tid,
        "CMP-A",
        "Compare A",
        [(res, 2, "R1"), (res, 3, "R2"), (cap, 1, "C1")],
    )
    # BOM B: the same resistor on ONE line, total 5. Genuinely equivalent.
    bom_b = await _bom_with_lines(
        db_session,
        tid,
        "CMP-B",
        "Compare B",
        [(res, 5, "R1, R2"), (cap, 1, "C1")],
    )
    await db_session.commit()

    result = await bom_service.compare_boms(db_session, bom_a.id, bom_b.id)

    # Before the fix, BOM A's resistor read as quantity 3 (the last line only),
    # so this came back "modified 3 -> 5".
    mods = {m["part_number"]: m for m in result["modified"]}
    assert "CMP-RES-10K" not in mods, (
        "resistor reported as modified — repeated lines are not being totalled: "
        f"{mods.get('CMP-RES-10K')}"
    )
    assert result["added"] == []
    assert result["removed"] == []


@pytest.mark.asyncio
async def test_a_real_difference_in_repeat_count_is_detected(
    db_session, test_tenant, tenant_id
):
    """The inverse: dropping a duplicate line is a real change and must show."""
    from app.services import bom_service

    tid = tenant_id
    screw = Part(pn="CMP-SCREW-M3", name="M3 screw", tenantId=tid)
    db_session.add(screw)
    await db_session.flush()

    bom_a = await _bom_with_lines(
        db_session, tid, "CMP-C", "Compare C", [(screw, 4, "S1"), (screw, 4, "S2")]
    )
    bom_b = await _bom_with_lines(
        db_session, tid, "CMP-D", "Compare D", [(screw, 4, "S1")]
    )
    await db_session.commit()

    result = await bom_service.compare_boms(db_session, bom_a.id, bom_b.id)

    mods = {m["part_number"]: m for m in result["modified"]}
    assert "CMP-SCREW-M3" in mods, (
        "8 screws became 4 and the comparison did not notice — the duplicate "
        f"line is being discarded. result={result}"
    )
    assert mods["CMP-SCREW-M3"]["old_quantity"] == 8
    assert mods["CMP-SCREW-M3"]["new_quantity"] == 4
