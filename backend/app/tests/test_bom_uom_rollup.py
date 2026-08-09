"""Multi-UOM roll-up wiring (bom_service <-> uom_service).

Proves the gap the standalone uom_service tests couldn't reach: a BOM whose
lines mix units of the SAME dimension rolls up to one correct total, a
cross-dimension/unrecognised-unit mismatch never gets silently folded in as
1:1, and every existing single-unit-BOM behaviour (the common case) is
unchanged.
"""

import pytest

from app.models.bom import BOM, BOMItem
from app.models.part import Part
from app.models.uom import UomConversion, UomUnit
from app.services import bom_service
from app.services.uom_service import STANDARD_CONVERSIONS, STANDARD_UNITS


@pytest.fixture(autouse=True)
async def seed_units(db_session, test_tenant, tenant_id):
    """Same seed as test_uom_service.py — conftest's schema comes from
    Base.metadata.create_all, not alembic, so the migration's seed never runs
    in tests."""
    for code, name, dimension, is_base in STANDARD_UNITS:
        db_session.add(
            UomUnit(tenantId=tenant_id, code=code, name=name, dimension=dimension, is_base=is_base)
        )
    await db_session.flush()
    for from_uom, to_uom, factor in STANDARD_CONVERSIONS:
        db_session.add(
            UomConversion(tenantId=tenant_id, from_uom=from_uom, to_uom=to_uom, factor=factor)
        )
    await db_session.commit()


@pytest.fixture(autouse=True)
def _clear_part_cache():
    bom_service._part_cache.clear()
    yield
    bom_service._part_cache.clear()


async def _make_part(db_session, tenant_id, pn, name="Part", cost=0.0, uom="EA"):
    part = Part(pn=pn, name=name, category="Electrical", cost=cost, uom=uom, tenantId=tenant_id)
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
    unit="EA",
    parent_item_id=None,
    unit_cost_snapshot=None,
):
    item = BOMItem(
        bom_id=bom_id,
        part_id=part_id,
        quantity=quantity,
        unit=unit,
        parent_item_id=parent_item_id,
        unit_cost_snapshot=unit_cost_snapshot,
        tenantId=tenant_id,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


@pytest.mark.asyncio
async def test_mixed_m_and_cm_lines_roll_up_to_correct_total(db_session, test_tenant):
    """2 M on one line + 150 CM on another, same part -> 3.5 (in the first
    line's unit, M), not the meaningless raw sum 152."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-WIRE")
    bom = await _make_bom(db_session, tid, bom_number="BOM-UOM-001")
    await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=2, unit="M")
    await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=150, unit="CM")

    rollup = await bom_service.get_quantity_rollup(db_session, bom.id)
    by_pn = {r["part_number"]: r for r in rollup["rollup"]}

    assert by_pn["PN-WIRE"]["total_quantity"] == pytest.approx(3.5)
    assert by_pn["PN-WIRE"]["unit"] == "M"
    assert rollup["uom_warnings"] == []


@pytest.mark.asyncio
async def test_cross_dimension_mismatch_never_silently_summed(db_session, test_tenant):
    """One line in M, another in KG for the SAME part: physically nonsense
    to add, must never collapse into one confidently-wrong number."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-MIXED-DIM")
    bom = await _make_bom(db_session, tid, bom_number="BOM-UOM-002")
    await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=2, unit="M")
    await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=5, unit="KG")

    rollup = await bom_service.get_quantity_rollup(db_session, bom.id)
    by_pn = {r["part_number"]: r for r in rollup["rollup"]}

    # The KG line must NOT be folded into the M total.
    assert by_pn["PN-MIXED-DIM"]["total_quantity"] == 2
    assert len(rollup["uom_warnings"]) == 1
    warning = rollup["uom_warnings"][0]
    assert warning["part_number"] == "PN-MIXED-DIM"
    assert warning["line_unit"] == "KG"


@pytest.mark.asyncio
async def test_unknown_free_text_uom_mismatch_is_reported_not_guessed(db_session, test_tenant):
    """A line in a registered unit and another in unregistered free text for
    the same part must be refused, not assumed 1:1."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-FREE-TEXT")
    bom = await _make_bom(db_session, tid, bom_number="BOM-UOM-003")
    await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=2, unit="M")
    await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=3, unit="reels")

    rollup = await bom_service.get_quantity_rollup(db_session, bom.id)
    by_pn = {r["part_number"]: r for r in rollup["rollup"]}

    assert by_pn["PN-FREE-TEXT"]["total_quantity"] == 2
    assert len(rollup["uom_warnings"]) == 1


@pytest.mark.asyncio
async def test_single_unit_bom_quantity_rollup_unchanged(db_session, test_tenant):
    """Same scenario as test_bom_core_correctness's R2 quantity test — every
    line defaults to EA, so this must total exactly like before this feature."""
    tid = test_tenant.id
    part_parent = await _make_part(db_session, tid, pn="PN-PARENT")
    part_child = await _make_part(db_session, tid, pn="PN-CHILD")
    bom = await _make_bom(db_session, tid, bom_number="BOM-UOM-004")
    parent_item = await _make_item(db_session, tid, bom.id, part_id=part_parent.id, quantity=2)
    await _make_item(
        db_session, tid, bom.id, part_id=part_child.id, quantity=3, parent_item_id=parent_item.id
    )

    rollup = await bom_service.get_quantity_rollup(db_session, bom.id)
    by_pn = {r["part_number"]: r for r in rollup["rollup"]}
    assert by_pn["PN-CHILD"]["total_quantity"] == 6
    assert by_pn["PN-PARENT"]["total_quantity"] == 2
    assert rollup["uom_warnings"] == []


@pytest.mark.asyncio
async def test_cost_rollup_converts_part_cost_per_different_uom(db_session, test_tenant):
    """Part costed per metre (part.uom="M", cost=4/M), BOM line counted in
    centimetres (unit="CM", qty 250, no snapshot -> falls back to part.cost):
    250 CM = 2.5 M; extended cost must be 2.5 * 4 = 10.0, not 250 * 4 = 1000."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-PER-METRE", cost=4.0, uom="M")
    bom = await _make_bom(db_session, tid, bom_number="BOM-UOM-005")
    await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=250, unit="CM")

    result = await bom_service.get_cost_rollup(db_session, bom.id)
    assert result["total_cost"] == 10.0
    assert result["uom_warnings"] == []


@pytest.mark.asyncio
async def test_cost_rollup_unresolvable_uom_falls_back_with_warning(db_session, test_tenant):
    """Part costed per KG, BOM line counted in EA (unrelated dimensions, no
    snapshot): must fall back to the naive qty*cost (never crash, never
    guess a real conversion) AND record a warning."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-KG-COST", cost=5.0, uom="KG")
    bom = await _make_bom(db_session, tid, bom_number="BOM-UOM-006")
    await _make_item(db_session, tid, bom.id, part_id=part.id, quantity=10, unit="EA")

    result = await bom_service.get_cost_rollup(db_session, bom.id)
    assert result["total_cost"] == 50.0  # naive fallback: 10 * 5
    assert len(result["uom_warnings"]) == 1
    assert result["uom_warnings"][0]["part_number"] == "PN-KG-COST"


@pytest.mark.asyncio
async def test_cost_rollup_snapshot_used_as_is_no_conversion(db_session, test_tenant):
    """unit_cost_snapshot is priced per the LINE's own unit, so no cross-uom
    conversion applies even if the part's stock uom differs (mirrors
    test_bom_core_correctness's R2 cost test, unchanged by this feature)."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-SNAPSHOT", cost=999.0, uom="KG")
    bom = await _make_bom(db_session, tid, bom_number="BOM-UOM-007")
    await _make_item(
        db_session, tid, bom.id, part_id=part.id, quantity=3, unit="EA", unit_cost_snapshot=5.0
    )

    result = await bom_service.get_cost_rollup(db_session, bom.id)
    assert result["total_cost"] == 15.0  # snapshot 5.0 * qty 3, part.cost ignored
    assert result["uom_warnings"] == []
