"""ops-hardening #2: bom_closures is the scalability risk for BOM explosion/
rollup and nothing measured it. This builds a deliberately deep (8 levels)
and wide (300+ items at the deepest level) BOM, then proves the closure-
backed explosion and the quantity/cost rollups still return numerically
correct totals and complete in a sane amount of time. This is a
correctness-at-scale guard, not a micro-benchmark.
"""

import time

import pytest

from app.services import bom_service

SPINE_DEPTH = 7  # + 1 leaf level below it = 8 levels total
SPINE_QTY = 2
LEAF_COUNT = 300
LEAF_QTY = 1
LEAF_COST = 1.0


@pytest.fixture(autouse=True)
def _clear_part_cache():
    bom_service._part_cache.clear()
    yield
    bom_service._part_cache.clear()


async def _make_part(db_session, tid, pn, cost=0.0):
    from app.models.part import Part

    part = Part(pn=pn, name=pn, category="Electrical", cost=cost, tenantId=tid)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)
    return part


@pytest.mark.asyncio
async def test_deep_wide_bom_explosion_and_rollup_totals_correct(db_session, test_tenant):
    """Depth-8, ~300-item BOM: closure-backed explosion + both rollups must
    complete quickly and report totals matching hand-computed expectations."""
    tid = test_tenant.id
    from app.models.bom import BOM

    bom = BOM(bom_number="BOM-SCALE", name="Scale Test", tenantId=tid)
    db_session.add(bom)
    await db_session.commit()
    await db_session.refresh(bom)

    # Build a SPINE_DEPTH-level chain, quantity SPINE_QTY at every level after
    # the root, so the effective (compounded) quantity at the bottom of the
    # spine is deterministic: SPINE_QTY ** (SPINE_DEPTH - 1).
    spine_part = await _make_part(db_session, tid, "PN-SPINE", cost=0.0)
    parent_id = None
    for level in range(1, SPINE_DEPTH + 1):
        qty = 1 if level == 1 else SPINE_QTY
        node = await bom_service.create_bom_item(
            db_session,
            bom.id,
            {"part_id": spine_part.id, "quantity": qty, "parent_item_id": parent_id},
        )
        parent_id = node["id"]
    bottom_of_spine_id = parent_id
    expected_leaf_effective_qty = float(SPINE_QTY) ** (SPINE_DEPTH - 1)

    # Attach LEAF_COUNT sibling lines at the bottom of the spine (level 8) —
    # the "wide" part of the tree. Distinct reference_designator per line so
    # the duplicate-line guard (same part + same parent) doesn't reject them.
    leaf_part = await _make_part(db_session, tid, "PN-LEAF", cost=LEAF_COST)
    for i in range(LEAF_COUNT):
        await bom_service.create_bom_item(
            db_session,
            bom.id,
            {
                "part_id": leaf_part.id,
                "quantity": LEAF_QTY,
                "parent_item_id": bottom_of_spine_id,
                "reference_designator": f"REF{i}",
            },
        )

    start = time.monotonic()

    closure_tree = await bom_service.get_bom_explosion_via_closure(db_session, bom.id)
    quantity_rollup = await bom_service.get_quantity_rollup(db_session, bom.id)
    cost_rollup = await bom_service.get_cost_rollup(db_session, bom.id)

    elapsed = time.monotonic() - start
    # Correctness-at-scale guard, not a micro-benchmark: generous ceiling so
    # it only fails on a genuine quadratic/N+1 blowup, never on CI jitter.
    assert elapsed < 10.0, f"explosion+rollup took {elapsed:.2f}s for a {LEAF_COUNT}-item BOM"

    # --- Structural sanity: the spine is 1 wide all the way down (levels
    # 1..SPINE_DEPTH), then fans out to LEAF_COUNT children at the bottom. ---
    node_list = closure_tree
    for level in range(SPINE_DEPTH):
        assert len(node_list) == 1, f"spine level {level + 1} must be single-child"
        node_list = node_list[0]["children"]
    assert len(node_list) == LEAF_COUNT

    # --- Quantity rollup: LEAF_COUNT lines of the same part, each with
    # effective qty = expected_leaf_effective_qty, must sum exactly. ---
    assert quantity_rollup["total_items"] == SPINE_DEPTH + LEAF_COUNT
    leaf_rollup_row = next(r for r in quantity_rollup["rollup"] if r["part_number"] == "PN-LEAF")
    assert leaf_rollup_row["total_quantity"] == pytest.approx(
        LEAF_COUNT * expected_leaf_effective_qty
    )

    # --- Cost rollup: spine parts cost 0, so total_cost is exactly the
    # leaves' contribution. ---
    expected_total_cost = round(LEAF_COUNT * expected_leaf_effective_qty * LEAF_COST, 2)
    assert cost_rollup["total_cost"] == pytest.approx(expected_total_cost)
