"""TDD tests for P0 core-correctness defects in BOM explosion + rollups (R1/R2).

R1: get_bom_explosion built a GLOBAL tree (BOMItem WHERE parent_item_id IS NULL with
    no bom_id and no tenant filter) — every BOM returned the same tree, and it leaked
    across tenants.
R2: quantity_rollup / cost_rollup were single-level flat sums (hardcoded "levels":[1],
    cost = unit_cost * line_qty) instead of multiplying quantity DOWN the assembly tree.
"""

from app.core.tenant_context import TenantContext
from app.models.bom import BOM, BOMItem
from app.models.part import Part
from app.models.tenant import Tenant
from app.services import bom_service

import pytest


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
):
    item = BOMItem(
        bom_id=bom_id,
        part_id=part_id,
        quantity=quantity,
        parent_item_id=parent_item_id,
        unit_cost_snapshot=unit_cost_snapshot,
        tenantId=tenant_id,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


@pytest.fixture(autouse=True)
def _clear_part_cache():
    """The service keeps a module-level part cache that outlives any single test's
    DB session. Since the test DB is wiped (and SQLite recycles row ids) between
    tests, a stale cache entry from an earlier test could mask — or fake — a bug
    here. Clear it so each test observes only its own data."""
    bom_service._part_cache.clear()
    yield
    bom_service._part_cache.clear()


def _flatten_part_numbers(tree: list[dict]) -> set:
    out = set()
    for node in tree:
        if node.get("part_number"):
            out.add(node["part_number"])
        out |= _flatten_part_numbers(node.get("children") or [])
    return out


@pytest.mark.asyncio
async def test_two_distinct_boms_return_different_explosion_trees(db_session, test_tenant):
    """R1: explosion must be scoped to the requested BOM, not global."""
    tid = test_tenant.id

    part_a = await _make_part(db_session, tid, pn="PN-BOM-A-ROOT")
    part_b = await _make_part(db_session, tid, pn="PN-BOM-B-ROOT")

    bom1 = await _make_bom(db_session, tid, bom_number="BOM-A-001")
    bom2 = await _make_bom(db_session, tid, bom_number="BOM-B-001")

    await _make_item(db_session, tid, bom1.id, part_id=part_a.id, quantity=1)
    await _make_item(db_session, tid, bom2.id, part_id=part_b.id, quantity=1)

    tree1 = await bom_service.get_bom_explosion(db_session, bom1.id)
    tree2 = await bom_service.get_bom_explosion(db_session, bom2.id)

    pns1 = _flatten_part_numbers(tree1)
    pns2 = _flatten_part_numbers(tree2)

    assert pns1 != pns2, (
        f"Two distinct BOMs returned the same explosion tree: {pns1} == {pns2}"
    )
    assert pns1 == {"PN-BOM-A-ROOT"}
    assert pns2 == {"PN-BOM-B-ROOT"}


@pytest.mark.asyncio
async def test_explosion_does_not_leak_across_tenants(db_session, test_tenant):
    """R1: exploding a BOM owned by tenant A must never surface tenant B's items/parts."""
    tenant_a_id = test_tenant.id
    tenant_b = Tenant(id=tenant_a_id + 1000, tenant_name="Tenant B", tenant_code="TENB")
    db_session.add(tenant_b)
    await db_session.commit()
    tenant_b_id = tenant_b.id

    part_a = await _make_part(db_session, tenant_a_id, pn="PN-TENANT-A-PART")
    part_b = await _make_part(db_session, tenant_b_id, pn="PN-TENANT-B-PART")

    bom_a = await _make_bom(db_session, tenant_a_id, bom_number="BOM-TENANT-A-001")
    bom_b = await _make_bom(db_session, tenant_b_id, bom_number="BOM-TENANT-B-001")

    await _make_item(db_session, tenant_a_id, bom_a.id, part_id=part_a.id, quantity=1)
    await _make_item(db_session, tenant_b_id, bom_b.id, part_id=part_b.id, quantity=1)

    # Request tenant A's own BOM while operating under tenant A's context.
    token = TenantContext.set(tenant_id=tenant_a_id)
    try:
        tree = await bom_service.get_bom_explosion(db_session, bom_a.id)
    finally:
        TenantContext.reset(token)

    pns = _flatten_part_numbers(tree)
    assert "PN-TENANT-B-PART" not in pns, f"Tenant B's part leaked into tenant A's explosion: {pns}"
    assert pns == {"PN-TENANT-A-PART"}


@pytest.mark.asyncio
async def test_quantity_rollup_multiplies_effective_quantity_down_tree(db_session, test_tenant):
    """R2: a child under a parent line qty 2 with its own line qty 3 must roll up to 6."""
    tid = test_tenant.id

    part_parent = await _make_part(db_session, tid, pn="PN-PARENT-ASSY")
    part_child = await _make_part(db_session, tid, pn="PN-CHILD-COMPONENT")

    bom = await _make_bom(db_session, tid, bom_number="BOM-ROLLUP-001")
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

    rollup = await bom_service.get_quantity_rollup(db_session, bom.id)
    by_pn = {r["part_number"]: r for r in rollup["rollup"]}

    assert by_pn["PN-CHILD-COMPONENT"]["total_quantity"] == 6, (
        f"Expected effective quantity 6 (2 * 3), got {by_pn['PN-CHILD-COMPONENT']}"
    )
    assert by_pn["PN-PARENT-ASSY"]["total_quantity"] == 2
    # Real levels must be reported (not the hardcoded [1] for every part).
    assert by_pn["PN-PARENT-ASSY"]["levels"] == [1]
    assert by_pn["PN-CHILD-COMPONENT"]["levels"] == [2]


@pytest.mark.asyncio
async def test_cost_rollup_uses_effective_quantity(db_session, test_tenant):
    """R2: cost rollup must cost = unit_cost * EFFECTIVE qty, not unit_cost * line qty."""
    tid = test_tenant.id

    part_parent = await _make_part(db_session, tid, pn="PN-COST-PARENT", cost=2.0)
    part_child = await _make_part(db_session, tid, pn="PN-COST-CHILD", cost=0.0)

    bom = await _make_bom(db_session, tid, bom_number="BOM-COST-001")
    parent_item = await _make_item(
        db_session,
        tid,
        bom.id,
        part_id=part_parent.id,
        quantity=2,
        parent_item_id=None,
        unit_cost_snapshot=2.0,
    )
    await _make_item(
        db_session,
        tid,
        bom.id,
        part_id=part_child.id,
        quantity=3,
        parent_item_id=parent_item.id,
        unit_cost_snapshot=5.0,
    )

    result = await bom_service.get_cost_rollup(db_session, bom.id)

    # parent: unit_cost 2.0 * effective qty 2 = 4.0
    # child: unit_cost 5.0 * effective qty (2 * 3 = 6) = 30.0
    # total: 34.0 (flat/buggy behavior would give 2*2 + 5*3 = 19.0)
    assert result["total_cost"] == 34.0, f"Expected 34.0 (effective-qty costing), got {result}"
