"""TDD tests for MASS rollup (Track A / #7): sub-assembly -> top mass rollup
via effective_qty * Part.weight, mirroring get_cost_rollup/get_quantity_rollup's
level computation (_compute_levels_and_effective_qty) and exclude_from_bom
cascade-drop semantics (_drop_excluded_subtrees). See test_bom_core_correctness.py
and test_bom_item_media_visibility.py for the sibling cost/quantity-rollup and
exclude_from_bom coverage this file parallels.
"""

import pytest

from app.models.bom import BOM, BOMItem
from app.models.part import Part
from app.services import bom_service


async def _make_part(db_session, tenant_id, pn, name="Part", category="Electrical", weight=0.0):
    part = Part(pn=pn, name=name, category=category, weight=weight, tenantId=tenant_id)
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
    exclude_from_bom=False,
):
    item = BOMItem(
        bom_id=bom_id,
        part_id=part_id,
        quantity=quantity,
        parent_item_id=parent_item_id,
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
    part cache that outlives any single test's DB session. Since the test DB
    is wiped (and SQLite recycles row ids) between tests, a stale cache entry
    from an earlier test could mask — or fake — a bug here."""
    bom_service._part_cache.clear()
    yield
    bom_service._part_cache.clear()


@pytest.mark.asyncio
async def test_mass_rollup_multiplies_effective_quantity_down_tree(db_session, test_tenant):
    """2-level BOM: a parent line (qty 2, part weight 10g) with a child line
    (qty 3, part weight 5g) under it must roll up using EFFECTIVE quantity —
    parent: 10.0 * 2 = 20.0; child: 5.0 * (2*3=6) = 30.0; total 50.0 — not
    line quantity alone (which would give 10*2 + 5*3 = 35.0)."""
    tid = test_tenant.id
    part_parent = await _make_part(db_session, tid, pn="PN-MASS-PARENT", weight=10.0)
    part_child = await _make_part(db_session, tid, pn="PN-MASS-CHILD", weight=5.0)

    bom = await _make_bom(db_session, tid, bom_number="BOM-MASS-001")
    parent_item = await _make_item(
        db_session, tid, bom.id, part_id=part_parent.id, quantity=2, parent_item_id=None
    )
    await _make_item(
        db_session,
        tid,
        bom.id,
        part_id=part_child.id,
        quantity=3,
        parent_item_id=parent_item.id,
    )

    result = await bom_service.get_mass_rollup(db_session, bom.id)

    assert result["total_mass"] == 50.0, f"Expected 50.0 (effective-qty mass), got {result}"
    assert result["mass_by_level"] == {1: 20.0, 2: 30.0}
    assert result["unit"] == "g"


@pytest.mark.asyncio
async def test_mass_rollup_omits_excluded_lines_and_their_subtree(db_session, test_tenant):
    """exclude_from_bom lines — and their entire subtree — must not
    contribute to the mass rollup, the same cascade-drop semantics already
    proven for cost/quantity rollup in test_bom_item_media_visibility.py."""
    tid = test_tenant.id
    part_included = await _make_part(db_session, tid, pn="PN-MASS-INCLUDED", weight=2.0)
    part_excluded = await _make_part(db_session, tid, pn="PN-MASS-EXCLUDED", weight=100.0)
    part_excluded_child = await _make_part(
        db_session, tid, pn="PN-MASS-EXCLUDED-CHILD", weight=50.0
    )

    bom = await _make_bom(db_session, tid, bom_number="BOM-MASS-EXC-001")
    await _make_item(db_session, tid, bom.id, part_id=part_included.id, quantity=2)
    excluded_item = await _make_item(
        db_session,
        tid,
        bom.id,
        part_id=part_excluded.id,
        quantity=5,
        exclude_from_bom=True,
    )
    # Child of the excluded line — must vanish along with its parent, not
    # re-root as a level-1 item.
    await _make_item(
        db_session,
        tid,
        bom.id,
        part_id=part_excluded_child.id,
        quantity=1,
        parent_item_id=excluded_item.id,
    )

    result = await bom_service.get_mass_rollup(db_session, bom.id)

    # included: 2.0 * 2 = 4.0. Excluded line's 100.0*5=500.0 and its child's
    # weight must NOT count, and must not appear in mass_by_level either.
    assert result["total_mass"] == 4.0, f"excluded subtree's mass leaked into rollup: {result}"
    assert result["mass_by_level"] == {1: 4.0}
