"""Where-used knowledge graph + simple part analytics (Track D).

Builds a nodes+edges graph for a single part showing:
  - upward: the BOM(s) it is placed in, and (recursively) every ancestor
    assembly/part above it in each of those BOMs' item trees.
  - downward: its own components -- i.e. when this part occurs as a
    sub-assembly line inside a BOM, the child lines nested beneath that
    occurrence (recursively).

Reads only the canonical instance-BOM model (`BOM`/`BOMItem` in
app/models/bom.py, table `bom_items_master`) -- the same source of truth
`bom_service.py`'s where-used functions use -- via parent_item_id /
bom_id, walked in-memory rather than through `BomClosure` (kept dependency-
free of bom_service.py's incremental-maintenance machinery). Every query is
scoped by tenantId exactly like the neighboring BOM service functions.
"""

from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bom import BOM, BOMItem
from app.models.part import Part

NodeId = str


def _part_node_id(part_id: int) -> NodeId:
    return f"part:{part_id}"


def _bom_node_id(bom_id: int) -> NodeId:
    return f"bom:{bom_id}"


async def _get_part_or_404(db: AsyncSession, tenant_id: Optional[int], part_id: int) -> Part:
    stmt = select(Part).where(Part.id == part_id)
    if tenant_id is not None:
        stmt = stmt.where(Part.tenantId == tenant_id)
    part = (await db.execute(stmt)).scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail=f"Part with ID {part_id} not found")
    return part


def _quantity_out(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def build_where_used_graph(
    db: AsyncSession, tenant_id: Optional[int], part_id: int
) -> dict:
    """Return {"nodes": [...], "edges": [...]} for `part_id`'s where-used graph.

    Always includes a node for `part_id` itself, even if it has no BOM
    occurrences anywhere (an empty edge list in that case).
    """
    part = await _get_part_or_404(db, tenant_id, part_id)

    nodes: dict[NodeId, dict] = {}
    edges: dict[str, dict] = {}

    def add_part_node(p: Part) -> NodeId:
        nid = _part_node_id(p.id)
        if nid not in nodes:
            nodes[nid] = {
                "id": nid,
                "type": "part",
                "part_id": p.id,
                "pn": p.pn,
                "name": p.name,
                "category": p.category,
                "status": p.status,
            }
        return nid

    def add_bom_node(b: BOM) -> NodeId:
        nid = _bom_node_id(b.id)
        if nid not in nodes:
            nodes[nid] = {
                "id": nid,
                "type": "bom",
                "bom_id": b.id,
                "bom_number": b.bom_number,
                "name": b.name,
                "status": b.status,
            }
        return nid

    def add_edge(source_id: NodeId, target_id: NodeId, quantity: Any) -> None:
        key = f"{source_id}->{target_id}"
        if key not in edges:
            edges[key] = {
                "id": key,
                "source": source_id,
                "target": target_id,
                "type": "contains",
                "quantity": _quantity_out(quantity),
            }

    target_node_id = add_part_node(part)

    # Every placement of this part anywhere in any tenant BOM.
    occ_stmt = select(BOMItem).where(BOMItem.part_id == part_id)
    if tenant_id is not None:
        occ_stmt = occ_stmt.where(BOMItem.tenantId == tenant_id)
    occurrences = (await db.execute(occ_stmt)).scalars().all()
    if not occurrences:
        return {"nodes": list(nodes.values()), "edges": []}

    bom_ids = {o.bom_id for o in occurrences if o.bom_id}
    boms_map: dict[int, BOM] = {}
    if bom_ids:
        br_stmt = select(BOM).where(BOM.id.in_(bom_ids))
        if tenant_id is not None:
            br_stmt = br_stmt.where(BOM.tenantId == tenant_id)
        for b in (await db.execute(br_stmt)).scalars().all():
            boms_map[b.id] = b

    # Preload every item belonging to any BOM this part occurs in, so ancestor
    # chains and descendant subtrees can be walked in-memory (no per-level
    # round-trip), scoped by BOTH bom_id (implicitly, via IN) and tenantId.
    items_by_id: dict[int, BOMItem] = {}
    children_by_parent: dict[Optional[int], list[BOMItem]] = {}
    if bom_ids:
        all_items_stmt = select(BOMItem).where(BOMItem.bom_id.in_(bom_ids))
        if tenant_id is not None:
            all_items_stmt = all_items_stmt.where(BOMItem.tenantId == tenant_id)
        for it in (await db.execute(all_items_stmt)).scalars().all():
            items_by_id[it.id] = it
            children_by_parent.setdefault(it.parent_item_id, []).append(it)

    # Resolve every Part referenced anywhere in the ancestor chains / component
    # subtrees we're about to walk, in one query.
    needed_part_ids: set[int] = set()

    def collect_ancestor_parts(item: BOMItem) -> None:
        cur_parent_id = item.parent_item_id
        seen: set[int] = set()
        while cur_parent_id is not None and cur_parent_id not in seen:
            seen.add(cur_parent_id)
            anc = items_by_id.get(cur_parent_id)
            if anc is None:
                break
            if anc.part_id:
                needed_part_ids.add(anc.part_id)
            cur_parent_id = anc.parent_item_id

    def collect_descendant_parts(item: BOMItem) -> None:
        stack = list(children_by_parent.get(item.id, []))
        seen: set[int] = set()
        while stack:
            child = stack.pop()
            if child.id in seen:
                continue
            seen.add(child.id)
            if child.part_id:
                needed_part_ids.add(child.part_id)
            stack.extend(children_by_parent.get(child.id, []))

    for occ in occurrences:
        collect_ancestor_parts(occ)
        collect_descendant_parts(occ)
    needed_part_ids.discard(part_id)

    parts_map: dict[int, Part] = {part_id: part}
    if needed_part_ids:
        pr_stmt = select(Part).where(Part.id.in_(needed_part_ids))
        if tenant_id is not None:
            pr_stmt = pr_stmt.where(Part.tenantId == tenant_id)
        for p in (await db.execute(pr_stmt)).scalars().all():
            parts_map[p.id] = p

    def walk_children(parent_item: BOMItem, parent_node_id: NodeId, visiting: set[int]) -> None:
        for child in children_by_parent.get(parent_item.id, []):
            if child.id in visiting:
                continue  # defensive cycle guard; well-formed data has none
            child_node_id = parent_node_id
            if child.part_id and child.part_id in parts_map:
                child_node_id = add_part_node(parts_map[child.part_id])
                add_edge(parent_node_id, child_node_id, child.quantity)
            walk_children(child, child_node_id, visiting | {child.id})

    for occ in occurrences:
        bom = boms_map.get(occ.bom_id)
        if not bom:
            continue
        bom_node_id = add_bom_node(bom)

        # Root-first ancestor chain: bom -> ... -> occ's own part.
        chain: list[BOMItem] = []
        cur: Optional[BOMItem] = occ
        visited_ids: set[int] = set()
        while cur is not None and cur.id not in visited_ids:
            visited_ids.add(cur.id)
            chain.append(cur)
            cur = items_by_id.get(cur.parent_item_id) if cur.parent_item_id else None
        chain.reverse()

        prev_node_id = bom_node_id
        for item in chain:
            if item.part_id and item.part_id in parts_map:
                node_id = add_part_node(parts_map[item.part_id])
                add_edge(prev_node_id, node_id, item.quantity)
                prev_node_id = node_id

        # This occurrence's own components (its subtree within this BOM).
        walk_children(occ, target_node_id, {occ.id})

    return {"nodes": list(nodes.values()), "edges": list(edges.values())}


async def get_part_analytics(db: AsyncSession, tenant_id: Optional[int]) -> dict:
    """Simple counts-by-category / counts-by-status analytics over parts."""
    stmt = select(Part.category, Part.status, func.count()).select_from(Part)
    if tenant_id is not None:
        stmt = stmt.where(Part.tenantId == tenant_id)
    stmt = stmt.group_by(Part.category, Part.status)
    rows = (await db.execute(stmt)).all()

    by_category: dict[str, int] = {}
    by_status: dict[str, int] = {}
    total = 0
    for category, status, count in rows:
        cat_key = category or "Uncategorized"
        status_key = status or "Unknown"
        by_category[cat_key] = by_category.get(cat_key, 0) + count
        by_status[status_key] = by_status.get(status_key, 0) + count
        total += count

    return {
        "total_parts": total,
        "by_category": by_category,
        "by_status": by_status,
    }
