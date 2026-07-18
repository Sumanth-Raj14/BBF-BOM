"""TDD tests for WS5: BOM closure table + fast explosion/where-used.

BomClosure (table `bom_closures`) is an adjacency-closure table maintained
incrementally by the canonical instance-line CRUD in app.services.bom_service
(create_bom_item / update_bom_item / delete_bom_item). It must let
explosion + where-used be computed from ONE query instead of recursive
per-level round trips, while returning results IDENTICAL to the existing
recursive computations (get_bom_explosion / get_where_used_tree) — and it
must be tenant_id + bom_id scoped, same as bom_items_master itself.
"""

from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContext
from app.models.bom import BOM, BOMItem
from app.models.bom_closure import BomClosure
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


async def _build_three_level_bom(db_session, tid):
    """root -> A -> B -> C, a genuine 3-level-deep chain, plus a sibling
    branch off root, so pruning/branching logic is exercised too."""
    part_root = await _make_part(db_session, tid, pn="PN-ROOT")
    part_a = await _make_part(db_session, tid, pn="PN-A")
    part_b = await _make_part(db_session, tid, pn="PN-B")
    part_c = await _make_part(db_session, tid, pn="PN-C")
    part_sibling = await _make_part(db_session, tid, pn="PN-SIBLING")
    bom = await _make_bom(db_session, tid, bom_number="BOM-3LEVEL")

    root = await bom_service.create_bom_item(
        db_session, bom.id, {"part_id": part_root.id, "quantity": 1}
    )
    a = await bom_service.create_bom_item(
        db_session,
        bom.id,
        {"part_id": part_a.id, "quantity": 2, "parent_item_id": root["id"]},
    )
    b = await bom_service.create_bom_item(
        db_session,
        bom.id,
        {"part_id": part_b.id, "quantity": 3, "parent_item_id": a["id"]},
    )
    c = await bom_service.create_bom_item(
        db_session,
        bom.id,
        {"part_id": part_c.id, "quantity": 4, "parent_item_id": b["id"]},
    )
    sibling = await bom_service.create_bom_item(
        db_session,
        bom.id,
        {"part_id": part_sibling.id, "quantity": 5, "parent_item_id": root["id"]},
    )
    return bom, {"root": root, "a": a, "b": b, "c": c, "sibling": sibling}, part_c


# ============ (a) closure-based explosion + where-used match recursive ============


@pytest.mark.asyncio
async def test_closure_explosion_matches_recursive_explosion(db_session, test_tenant):
    tid = test_tenant.id
    bom, _items, _part_c = await _build_three_level_bom(db_session, tid)

    recursive_tree = await bom_service.get_bom_explosion(db_session, bom.id)
    closure_tree = await bom_service.get_bom_explosion_via_closure(db_session, bom.id)

    assert closure_tree == recursive_tree


@pytest.mark.asyncio
async def test_closure_explosion_respects_level_limit_same_as_recursive(db_session, test_tenant):
    tid = test_tenant.id
    bom, _items, _part_c = await _build_three_level_bom(db_session, tid)

    for level in (0, 1, 2, 10):
        recursive_tree = await bom_service.get_bom_explosion(db_session, bom.id, level=level)
        closure_tree = await bom_service.get_bom_explosion_via_closure(
            db_session, bom.id, level=level
        )
        assert closure_tree == recursive_tree, f"mismatch at level={level}"


@pytest.mark.asyncio
async def test_closure_where_used_matches_recursive_where_used_tree(db_session, test_tenant):
    tid = test_tenant.id
    bom, items, part_c = await _build_three_level_bom(db_session, tid)

    recursive_result = await bom_service.get_where_used_tree(db_session, part_c.id)
    closure_result = await bom_service.get_where_used_via_closure(db_session, part_c.id)

    assert closure_result == recursive_result
    # Sanity: the part 3 levels deep really does have 3 ancestors above it
    # (B, A, root) — guards against a shallow/broken parity fixture.
    assert len(recursive_result["usages"][0]["parents"]) == 3


# ============ (b) closure rows are tenant + bom scoped ============


@pytest.mark.asyncio
async def test_closure_rows_scoped_by_tenant(db_session, test_tenant):
    """Closure rows written for tenant A must never be visible/joinable under
    tenant B's context, even via a raw query without tenant filtering being
    accidentally correct by luck of disjoint ids."""
    tenant_a_id = test_tenant.id
    tenant_b = Tenant(id=tenant_a_id + 1000, tenant_name="Tenant B", tenant_code="TENB")
    db_session.add(tenant_b)
    await db_session.commit()
    tenant_b_id = tenant_b.id

    token = TenantContext.set(tenant_id=tenant_a_id)
    try:
        bom_a, items_a, _ = await _build_three_level_bom(db_session, tenant_a_id)
    finally:
        TenantContext.reset(token)

    token = TenantContext.set(tenant_id=tenant_b_id)
    try:
        bom_b, items_b, _ = await _build_three_level_bom(db_session, tenant_b_id)
    finally:
        TenantContext.reset(token)

    rows_a = (
        await db_session.execute(select(BomClosure).where(BomClosure.tenantId == tenant_a_id))
    ).scalars().all()
    rows_b = (
        await db_session.execute(select(BomClosure).where(BomClosure.tenantId == tenant_b_id))
    ).scalars().all()

    assert len(rows_a) > 0
    assert len(rows_b) > 0
    for row in rows_a:
        assert row.bom_id == bom_a.id
        assert row.tenantId == tenant_a_id
    for row in rows_b:
        assert row.bom_id == bom_b.id
        assert row.tenantId == tenant_b_id

    # Cross-tenant explosion/where-used must not merge closures.
    token = TenantContext.set(tenant_id=tenant_a_id)
    try:
        tree_a = await bom_service.get_bom_explosion_via_closure(db_session, bom_a.id)
    finally:
        TenantContext.reset(token)

    def _flatten(tree):
        out = set()
        for node in tree:
            if node.get("part_number"):
                out.add(node["part_number"])
            out |= _flatten(node.get("children") or [])
        return out

    pns = _flatten(tree_a)
    assert pns == {"PN-ROOT", "PN-A", "PN-B", "PN-C", "PN-SIBLING"}


@pytest.mark.asyncio
async def test_closure_rows_scoped_by_bom(db_session, test_tenant):
    """Two BOMs in the SAME tenant must not share/leak closure rows."""
    tid = test_tenant.id
    bom_x, items_x, _ = await _build_three_level_bom(db_session, tid)

    part_y = await _make_part(db_session, tid, pn="PN-Y-ROOT")
    bom_y = await _make_bom(db_session, tid, bom_number="BOM-Y-SCOPE")
    y_root = await bom_service.create_bom_item(
        db_session, bom_y.id, {"part_id": part_y.id, "quantity": 1}
    )

    rows_x = (
        await db_session.execute(select(BomClosure).where(BomClosure.bom_id == bom_x.id))
    ).scalars().all()
    rows_y = (
        await db_session.execute(select(BomClosure).where(BomClosure.bom_id == bom_y.id))
    ).scalars().all()

    assert len(rows_x) > 0
    assert len(rows_y) == 1  # just y_root's self row
    assert rows_y[0].ancestor_item_id == y_root["id"]
    assert rows_y[0].descendant_item_id == y_root["id"]
    assert rows_y[0].depth == 0

    for row in rows_x:
        assert row.bom_id == bom_x.id, "bom X's closure rows must never reference bom Y"
    for row in rows_x + rows_y:
        assert row.ancestor_item_id not in (y_root["id"],) or row.bom_id == bom_y.id


# ============ (c) add then remove a line leaves closure consistent ============


@pytest.mark.asyncio
async def test_add_then_remove_leaf_leaves_closure_consistent(db_session, test_tenant):
    tid = test_tenant.id
    bom, items, _part_c = await _build_three_level_bom(db_session, tid)

    # Sanity: C (leaf, depth 3) currently has 4 ancestor rows (self, B, A, root).
    c_rows_before = (
        await db_session.execute(
            select(BomClosure).where(
                BomClosure.tenantId == tid,
                BomClosure.bom_id == bom.id,
                BomClosure.descendant_item_id == items["c"]["id"],
            )
        )
    ).scalars().all()
    assert len(c_rows_before) == 4

    await bom_service.delete_bom_item(db_session, bom.id, items["c"]["id"])

    # Every closure row mentioning C (as ancestor or descendant) must be gone.
    remaining = (
        await db_session.execute(
            select(BomClosure).where(
                BomClosure.bom_id == bom.id,
                (BomClosure.ancestor_item_id == items["c"]["id"])
                | (BomClosure.descendant_item_id == items["c"]["id"]),
            )
        )
    ).scalars().all()
    assert remaining == []

    # The rest of the tree (root, A, B, sibling) must be untouched.
    b_rows = (
        await db_session.execute(
            select(BomClosure).where(
                BomClosure.tenantId == tid,
                BomClosure.bom_id == bom.id,
                BomClosure.descendant_item_id == items["b"]["id"],
            )
        )
    ).scalars().all()
    assert len(b_rows) == 3  # self, A, root

    row = (
        await db_session.execute(select(BOMItem).where(BOMItem.id == items["c"]["id"]))
    ).scalar_one_or_none()
    assert row is None


@pytest.mark.asyncio
async def test_remove_middle_node_removes_whole_subtree(db_session, test_tenant):
    """Deleting a mid-tree line (B) must remove its entire subtree (C too),
    both from bom_items_master AND from the closure table."""
    tid = test_tenant.id
    bom, items, _part_c = await _build_three_level_bom(db_session, tid)

    await bom_service.delete_bom_item(db_session, bom.id, items["b"]["id"])

    b_row = (
        await db_session.execute(select(BOMItem).where(BOMItem.id == items["b"]["id"]))
    ).scalar_one_or_none()
    c_row = (
        await db_session.execute(select(BOMItem).where(BOMItem.id == items["c"]["id"]))
    ).scalar_one_or_none()
    assert b_row is None
    assert c_row is None, "deleting B must cascade-remove its descendant C"

    remaining_closure = (
        await db_session.execute(
            select(BomClosure).where(
                BomClosure.bom_id == bom.id,
                (
                    BomClosure.ancestor_item_id.in_([items["b"]["id"], items["c"]["id"]])
                )
                | (
                    BomClosure.descendant_item_id.in_([items["b"]["id"], items["c"]["id"]])
                ),
            )
        )
    ).scalars().all()
    assert remaining_closure == []

    # root + A + sibling remain intact.
    root_self = (
        await db_session.execute(
            select(BomClosure).where(
                BomClosure.bom_id == bom.id,
                BomClosure.ancestor_item_id == items["root"]["id"],
                BomClosure.descendant_item_id == items["root"]["id"],
            )
        )
    ).scalar_one_or_none()
    assert root_self is not None


@pytest.mark.asyncio
async def test_reparent_updates_closure_ancestor_chain(db_session, test_tenant):
    """Moving B (with its child C) from under A to be a direct child of root
    must update the closure table: C's ancestor chain becomes
    {self, B, root} — A must drop out of it."""
    tid = test_tenant.id
    bom, items, _part_c = await _build_three_level_bom(db_session, tid)

    await bom_service.update_bom_item(
        db_session, bom.id, items["b"]["id"], {"parent_item_id": items["root"]["id"]}
    )

    c_ancestors = (
        await db_session.execute(
            select(BomClosure.ancestor_item_id).where(
                BomClosure.tenantId == tid,
                BomClosure.bom_id == bom.id,
                BomClosure.descendant_item_id == items["c"]["id"],
            )
        )
    ).scalars().all()
    assert set(c_ancestors) == {items["c"]["id"], items["b"]["id"], items["root"]["id"]}
    assert items["a"]["id"] not in c_ancestors

    # Re-fetch explosion via closure — must equal recursive after the move.
    recursive_tree = await bom_service.get_bom_explosion(db_session, bom.id)
    closure_tree = await bom_service.get_bom_explosion_via_closure(db_session, bom.id)
    assert closure_tree == recursive_tree


@pytest.mark.asyncio
async def test_delete_then_readd_leaves_closure_consistent(db_session, test_tenant):
    """(c) explicit add-then-remove-then-verify cycle for a fresh line under
    an existing parent: closure must reflect exactly the current tree, with
    no leftover rows from the removed line."""
    tid = test_tenant.id
    bom, items, _part_c = await _build_three_level_bom(db_session, tid)
    part_extra = await _make_part(db_session, tid, pn="PN-EXTRA")

    extra = await bom_service.create_bom_item(
        db_session,
        bom.id,
        {"part_id": part_extra.id, "quantity": 9, "parent_item_id": items["b"]["id"]},
    )
    extra_rows = (
        await db_session.execute(
            select(BomClosure).where(
                BomClosure.bom_id == bom.id, BomClosure.descendant_item_id == extra["id"]
            )
        )
    ).scalars().all()
    assert len(extra_rows) == 4  # self, B, A, root

    await bom_service.delete_bom_item(db_session, bom.id, extra["id"])

    leftover = (
        await db_session.execute(
            select(BomClosure).where(
                BomClosure.bom_id == bom.id,
                (BomClosure.ancestor_item_id == extra["id"])
                | (BomClosure.descendant_item_id == extra["id"]),
            )
        )
    ).scalars().all()
    assert leftover == []

    # C (still present, untouched sibling-in-subtree) must still resolve
    # identically through both paths.
    recursive_tree = await bom_service.get_bom_explosion(db_session, bom.id)
    closure_tree = await bom_service.get_bom_explosion_via_closure(db_session, bom.id)
    assert closure_tree == recursive_tree
