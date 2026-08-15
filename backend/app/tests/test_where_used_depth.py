"""get_where_used must report the TRUE nesting level, not cap out at 2.

The bug: ancestor_map was populated only from the direct parents of the
matching BOM items. resolve_level_and_parent then walked up one hop, asked for
the grandparent, got None because it had never been fetched, and stopped. So
every part nested 3+ levels deep reported level 2, and parent_bom_id froze at
the first hop.

Nothing caught it because the existing where-used tests only ever build a
2-level tree, where the wrong answer and the right answer coincide.

This builds a 4-level chain: root -> sub -> subsub -> leaf(target part).
"""

import pytest

from app.models.bom import BOM, BOMItem
from app.models.part import Part


@pytest.mark.asyncio
async def test_where_used_reports_true_depth_beyond_two(db_session, test_tenant, tenant_id):
    from app.services import bom_service

    tid = tenant_id
    bom = BOM(bom_number="WU-DEPTH-1", name="Depth BOM", tenantId=tid)
    db_session.add(bom)
    await db_session.flush()

    target = Part(pn="DEPTH-TARGET", name="Deeply nested part", tenantId=tid)
    filler = Part(pn="DEPTH-FILLER", name="Structural part", tenantId=tid)
    db_session.add_all([target, filler])
    await db_session.flush()

    # root(1) -> sub(2) -> subsub(3) -> leaf(4), leaf holds the target part.
    root = BOMItem(bom_id=bom.id, part_id=filler.id, quantity=1, tenantId=tid)
    db_session.add(root)
    await db_session.flush()

    sub = BOMItem(
        bom_id=bom.id,
        part_id=filler.id,
        quantity=1,
        parent_item_id=root.id,
        tenantId=tid,
    )
    db_session.add(sub)
    await db_session.flush()

    subsub = BOMItem(
        bom_id=bom.id,
        part_id=filler.id,
        quantity=1,
        parent_item_id=sub.id,
        tenantId=tid,
    )
    db_session.add(subsub)
    await db_session.flush()

    leaf = BOMItem(
        bom_id=bom.id,
        part_id=target.id,
        quantity=7,
        parent_item_id=subsub.id,
        tenantId=tid,
    )
    db_session.add(leaf)
    await db_session.commit()

    rows = await bom_service.get_where_used(db_session, target.id)

    assert len(rows) == 1, rows
    # 4 levels of nesting. Before the fix this asserted-out at 2.
    assert rows[0]["level"] == 4, (
        f"where-used reported level {rows[0]['level']} for a part nested 4 deep "
        "— the ancestor chain is being walked only one hop again"
    )
    assert rows[0]["bom_id"] == bom.id
    assert rows[0]["quantity"] == 7


@pytest.mark.asyncio
async def test_where_used_root_is_level_1_and_its_child_is_level_2(
    db_session, test_tenant, tenant_id
):
    """The off-by-one that hid inside the depth cap.

    The walk incremented level only when a FURTHER ancestor existed, so a
    direct child of a root line reported level 1 — indistinguishable from the
    root itself. Convention is the one _compute_levels_and_effective_qty
    documents: root items are level 1.
    """
    from app.services import bom_service

    tid = tenant_id
    bom = BOM(bom_number="WU-TWO-1", name="Two Level BOM", tenantId=tid)
    db_session.add(bom)
    await db_session.flush()

    root_part = Part(pn="WU-ROOT-PART", name="Root part", tenantId=tid)
    child_part = Part(pn="WU-CHILD-PART", name="Child part", tenantId=tid)
    db_session.add_all([root_part, child_part])
    await db_session.flush()

    root = BOMItem(bom_id=bom.id, part_id=root_part.id, quantity=1, tenantId=tid)
    db_session.add(root)
    await db_session.flush()
    child = BOMItem(
        bom_id=bom.id,
        part_id=child_part.id,
        quantity=2,
        parent_item_id=root.id,
        tenantId=tid,
    )
    db_session.add(child)
    await db_session.commit()

    root_rows = await bom_service.get_where_used(db_session, root_part.id)
    child_rows = await bom_service.get_where_used(db_session, child_part.id)

    assert root_rows[0]["level"] == 1, root_rows
    assert child_rows[0]["level"] == 2, child_rows


@pytest.mark.asyncio
async def test_where_used_survives_a_cyclic_parent_chain(db_session, test_tenant, tenant_id):
    """A corrupt parent cycle must not hang the request.

    Walking the full chain (rather than one hop) makes an infinite loop
    reachable, so the walk carries a visited-set guard. This proves it.
    """
    from app.services import bom_service

    tid = tenant_id
    bom = BOM(bom_number="WU-CYCLE-1", name="Cycle BOM", tenantId=tid)
    db_session.add(bom)
    await db_session.flush()

    part = Part(pn="CYCLE-TARGET", name="Part in a cycle", tenantId=tid)
    db_session.add(part)
    await db_session.flush()

    a = BOMItem(bom_id=bom.id, part_id=part.id, quantity=1, tenantId=tid)
    db_session.add(a)
    await db_session.flush()
    b = BOMItem(
        bom_id=bom.id, part_id=part.id, quantity=1, parent_item_id=a.id, tenantId=tid
    )
    db_session.add(b)
    await db_session.flush()

    # Close the loop: a's parent is b, b's parent is a.
    a.parent_item_id = b.id
    await db_session.commit()

    rows = await bom_service.get_where_used(db_session, part.id)
    assert len(rows) == 2, rows
