"""BOM service layer — business logic for BOM management, explosion, rollup, snapshots, variants."""

from datetime import UTC, datetime
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get, cache_invalidate, cache_set
from app.core.tenant_context import get_tenant_id
from app.models.bom import BOM, BOMItem
from app.models.bom_item import BomItem as TemplateBomItem
from app.models.bom_snapshot import BomBaseline, BomSnapshot
from app.models.bom_template import BomTemplate
from app.models.bom_variant import BomVariant, BomVariantItem
from app.models.part import Part

# Module-level part cache for explosion trees.
# Keyed by (tenant_id, part_id) — NEVER by part_id alone — so a cache hit can
# never resolve to a different tenant's part number/name.
_part_cache: dict[tuple[Any, int], tuple[str, str]] = {}
_MAX_PART_CACHE = 10000


def _cache_part(tid: Optional[int], pid: int, pn: str, name: str):
    if len(_part_cache) < _MAX_PART_CACHE:
        _part_cache[(tid, pid)] = (pn, name)


# ============ Basic CRUD ============


async def list_boms(db: AsyncSession, skip: int = 0, limit: int = 100) -> tuple[list[BOM], int]:
    tid = get_tenant_id()
    base = select(BOM)
    count_base = select(func.count()).select_from(BOM)
    if tid is not None:
        base = base.where(BOM.tenantId == tid)
        count_base = count_base.where(BOM.tenantId == tid)
    total = (await db.execute(count_base)).scalar() or 0
    result = await db.execute(base.offset(skip).limit(limit).order_by(BOM.id))
    return result.scalars().all(), total


async def get_bom_or_404(db: AsyncSession, bom_id: int) -> BOM:
    tid = get_tenant_id()
    stmt = select(BOM).where(BOM.id == bom_id)
    if tid is not None:
        stmt = stmt.where(BOM.tenantId == tid)
    result = await db.execute(stmt)
    bom = result.scalar_one_or_none()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    return bom


async def get_bom_detail(db: AsyncSession, bom_id: int) -> Optional[dict]:
    cache_key = f"bom:{bom_id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached
    bom = await get_bom_or_404(db, bom_id)
    tid = get_tenant_id()
    items_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items_result = await db.execute(items_stmt)
    items = items_result.scalars().all()
    data = {
        "id": bom.id,
        "name": bom.name,
        "description": bom.description,
        "status": bom.status,
        "version": bom.version,
        "items": [
            {
                "id": i.id,
                "part_id": i.part_id,
                "quantity": i.quantity,
                "reference_designator": i.reference_designator,
                "notes": i.notes,
            }
            for i in items
        ],
    }
    await cache_set(cache_key, data, 300)
    return data


async def create_bom(db: AsyncSession, data: dict) -> BOM:
    tid = get_tenant_id()
    bom = BOM(**{k: v for k, v in data.items() if hasattr(BOM, k)}, tenantId=tid)
    db.add(bom)
    await db.commit()
    await db.refresh(bom)
    return bom


# ============ Instance-line CRUD (X1 canonical-BOM model) ============
#
# BOM ("boms") + BOMItem ("bom_items_master") is the single source of truth
# for instance-BOM structure (P0-architectural design brief, X1). Every
# function below is scoped by BOTH bom_id AND tenantId — the P0 leak class —
# and reuses _compute_levels_and_effective_qty / get_quantity_rollup /
# get_bom_explosion rather than duplicating traversal logic.

_BOM_ITEM_WRITABLE_FIELDS = {
    "part_id",
    "quantity",
    "unit",
    "reference_designator",
    "find_number",
    "sort_order",
    "parent_item_id",
    "unit_cost_snapshot",
    "extended_cost",
    "notes",
}


async def _invalidate_bom_caches(bom_id: int) -> None:
    await cache_invalidate(f"bom:{bom_id}")
    await cache_invalidate(f"bom:explosion:{bom_id}:*")
    await cache_invalidate(f"bom:cost_rollup:{bom_id}")


def _serialize_bom_item(item: BOMItem, part: Optional[Part] = None) -> dict:
    return {
        "id": item.id,
        "bom_id": item.bom_id,
        "part_id": item.part_id,
        "part_number": part.pn if part else None,
        "part_name": part.name if part else None,
        "quantity": item.quantity,
        "unit": item.unit,
        "reference_designator": item.reference_designator,
        "find_number": item.find_number,
        "sort_order": item.sort_order,
        "parent_item_id": item.parent_item_id,
        "unit_cost_snapshot": item.unit_cost_snapshot,
        "extended_cost": item.extended_cost,
        "notes": item.notes,
    }


async def _get_bom_item_or_404(db: AsyncSession, bom_id: int, item_id: int, tid) -> BOMItem:
    """Fetch a BOMItem scoped by BOTH bom_id and tenantId. Never resolves an
    item that belongs to a different bom_id or a different tenant, even if
    the row's primary key alone would otherwise match."""
    stmt = select(BOMItem).where(BOMItem.id == item_id, BOMItem.bom_id == bom_id)
    if tid is not None:
        stmt = stmt.where(BOMItem.tenantId == tid)
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="BOM line item not found")
    return item


async def _validate_parent(
    db: AsyncSession, bom_id: int, tid, parent_item_id: Optional[int], self_id: Optional[int]
) -> None:
    if parent_item_id is None:
        return
    if self_id is not None and parent_item_id == self_id:
        raise HTTPException(status_code=400, detail="A BOM line cannot be its own parent")
    # The parent must live in the SAME bom_id and tenant — otherwise a
    # crafted parent_item_id could graft another BOM's (or tenant's)
    # subtree into this one's explosion tree.
    stmt = select(BOMItem).where(BOMItem.id == parent_item_id, BOMItem.bom_id == bom_id)
    if tid is not None:
        stmt = stmt.where(BOMItem.tenantId == tid)
    result = await db.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="parent_item_id must reference a line within the same BOM",
        )


async def _validate_no_duplicate(
    db: AsyncSession,
    bom_id: int,
    tid,
    part_id: Optional[int],
    parent_item_id: Optional[int],
    reference_designator: Optional[str],
    exclude_item_id: Optional[int] = None,
) -> None:
    if part_id is None:
        return
    stmt = select(BOMItem).where(
        BOMItem.bom_id == bom_id,
        BOMItem.part_id == part_id,
        BOMItem.parent_item_id == parent_item_id,
        BOMItem.reference_designator == reference_designator,
    )
    if tid is not None:
        stmt = stmt.where(BOMItem.tenantId == tid)
    if exclude_item_id is not None:
        stmt = stmt.where(BOMItem.id != exclude_item_id)
    result = await db.execute(stmt)
    if result.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="Duplicate BOM line: this part already exists under the same "
            "parent with the same reference designator",
        )


async def list_bom_items(db: AsyncSession, bom_id: int) -> list[dict]:
    await get_bom_or_404(db, bom_id)
    tid = get_tenant_id()
    stmt = select(BOMItem).where(BOMItem.bom_id == bom_id)
    if tid is not None:
        stmt = stmt.where(BOMItem.tenantId == tid)
    stmt = stmt.order_by(BOMItem.sort_order, BOMItem.id)
    items = (await db.execute(stmt)).scalars().all()

    part_ids = {i.part_id for i in items if i.part_id}
    parts_map: dict[int, Part] = {}
    if part_ids:
        pr_stmt = select(Part).where(Part.id.in_(part_ids))
        if tid is not None:
            pr_stmt = pr_stmt.where(Part.tenantId == tid)
        pr = await db.execute(pr_stmt)
        for p in pr.scalars().all():
            parts_map[p.id] = p

    return [_serialize_bom_item(i, parts_map.get(i.part_id)) for i in items]


async def create_bom_item(
    db: AsyncSession, bom_id: int, data: dict, tenant_id: Optional[int] = None
) -> dict:
    """Add a child line to a BOM (part + quantity/refdes/find-number/uom).
    Scoped by bom_id + tenantId; validates parent scoping, self-parent, and
    exact-duplicate lines before writing.

    `tenant_id`, when supplied, is used as the row's owning tenant instead of
    the ambient tenant context. This matters for superusers: `get_tenant_id()`
    resolves to None for a superuser request (by design, so reads aren't
    tenant-filtered), but a new row's `tenantId` column is NOT NULL and must
    still be stamped with a real tenant — callers with a concrete user (the
    API layer) should pass `current_user.tenantId` explicitly.
    """
    bom = await get_bom_or_404(db, bom_id)
    tid = tenant_id if tenant_id is not None else get_tenant_id()

    part_id = data.get("part_id")
    if part_id is not None:
        pr_stmt = select(Part).where(Part.id == part_id)
        if tid is not None:
            pr_stmt = pr_stmt.where(Part.tenantId == tid)
        if not (await db.execute(pr_stmt)).scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Part not found")

    parent_item_id = data.get("parent_item_id")
    await _validate_parent(db, bom_id, tid, parent_item_id, self_id=None)
    await _validate_no_duplicate(
        db, bom_id, tid, part_id, parent_item_id, data.get("reference_designator")
    )

    fields = {k: v for k, v in data.items() if k in _BOM_ITEM_WRITABLE_FIELDS}
    item = BOMItem(bom_id=bom.id, tenantId=tid, **fields)
    db.add(item)
    await db.commit()
    await db.refresh(item)

    await _invalidate_bom_caches(bom_id)

    part = None
    if item.part_id is not None:
        pr = await db.execute(select(Part).where(Part.id == item.part_id))
        part = pr.scalar_one_or_none()
    return _serialize_bom_item(item, part)


async def update_bom_item(db: AsyncSession, bom_id: int, item_id: int, data: dict) -> dict:
    """Update qty/refdes/find-number/notes/etc on an existing line. Scoped by
    bom_id + tenantId (an item_id from another BOM or tenant 404s)."""
    tid = get_tenant_id()
    item = await _get_bom_item_or_404(db, bom_id, item_id, tid)

    fields = {k: v for k, v in data.items() if k in _BOM_ITEM_WRITABLE_FIELDS}

    if "part_id" in fields and fields["part_id"] is not None:
        pr_stmt = select(Part).where(Part.id == fields["part_id"])
        if tid is not None:
            pr_stmt = pr_stmt.where(Part.tenantId == tid)
        if not (await db.execute(pr_stmt)).scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Part not found")

    if "parent_item_id" in fields:
        await _validate_parent(db, bom_id, tid, fields["parent_item_id"], self_id=item.id)

    new_part_id = fields.get("part_id", item.part_id)
    new_parent_id = fields.get("parent_item_id", item.parent_item_id)
    new_refdes = fields.get("reference_designator", item.reference_designator)
    if "part_id" in fields or "parent_item_id" in fields or "reference_designator" in fields:
        await _validate_no_duplicate(
            db, bom_id, tid, new_part_id, new_parent_id, new_refdes, exclude_item_id=item.id
        )

    for field, value in fields.items():
        setattr(item, field, value)

    await db.commit()
    await db.refresh(item)

    await _invalidate_bom_caches(bom_id)

    part = None
    if item.part_id is not None:
        pr_stmt = select(Part).where(Part.id == item.part_id)
        if tid is not None:
            pr_stmt = pr_stmt.where(Part.tenantId == tid)
        part = (await db.execute(pr_stmt)).scalar_one_or_none()
    return _serialize_bom_item(item, part)


async def delete_bom_item(db: AsyncSession, bom_id: int, item_id: int) -> None:
    tid = get_tenant_id()
    item = await _get_bom_item_or_404(db, bom_id, item_id, tid)
    await db.delete(item)
    await db.commit()
    await _invalidate_bom_caches(bom_id)


async def reorder_bom_items(db: AsyncSession, bom_id: int, item_ids: list[int]) -> dict:
    """Assign sort_order by position in item_ids. Scoped to bom_id + tenant —
    an id from another bom/tenant is silently skipped (not reassigned into
    this BOM), rather than being pulled cross-scope."""
    await get_bom_or_404(db, bom_id)
    tid = get_tenant_id()
    reordered = 0
    for idx, item_id in enumerate(item_ids):
        stmt = select(BOMItem).where(BOMItem.id == item_id, BOMItem.bom_id == bom_id)
        if tid is not None:
            stmt = stmt.where(BOMItem.tenantId == tid)
        result = await db.execute(stmt)
        item = result.scalar_one_or_none()
        if item:
            item.sort_order = idx
            reordered += 1

    await db.commit()
    await _invalidate_bom_caches(bom_id)
    return {"status": "reordered", "count": reordered}


# ============ BOM Explosion (Multi-level) ============


async def _build_explosion_tree(
    db: AsyncSession,
    bom_id: int,
    parent_item_id: Optional[int],
    current_level: int,
    max_level: int,
    tid: Optional[int],
) -> list[dict]:
    if current_level > max_level:
        return []
    stmt = select(BOMItem).where(
        BOMItem.bom_id == bom_id, BOMItem.parent_item_id == parent_item_id
    )
    if tid is not None:
        stmt = stmt.where(BOMItem.tenantId == tid)
    result = await db.execute(stmt)
    items = result.scalars().all()
    if not items:
        return []

    part_ids = [item.part_id for item in items if item.part_id]
    parts_map: dict[int, tuple[str, str]] = {}
    if part_ids:
        need_fetch = [pid for pid in part_ids if (tid, pid) not in _part_cache]
        if need_fetch:
            pr_stmt = select(Part).where(Part.id.in_(need_fetch))
            if tid is not None:
                # Never let a lookup resolve to another tenant's part.
                pr_stmt = pr_stmt.where(Part.tenantId == tid)
            pr = await db.execute(pr_stmt)
            for p in pr.scalars().all():
                _cache_part(tid, p.id, p.pn, p.name)
        for pid in part_ids:
            entry = _part_cache.get((tid, pid))
            if entry:
                parts_map[pid] = entry

    tree = []
    for item in items:
        pn, desc = parts_map.get(item.part_id, ("", "")) if item.part_id else ("", "")
        children = await _build_explosion_tree(
            db, bom_id, item.id, current_level + 1, max_level, tid
        )
        tree.append(
            {
                "part_id": item.part_id or 0,
                "part_number": pn,
                "description": desc,
                "quantity": item.quantity,
                "level": current_level,
                "parent_part_id": parent_item_id,
                "children": children,
            }
        )
    return tree


async def get_bom_explosion(db: AsyncSession, bom_id: int, level: int = 10) -> list[dict]:
    bom = await get_bom_or_404(db, bom_id)
    cache_key = f"bom:explosion:{bom_id}:{level}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    # Scope traversal to THIS BOM and its own tenant (not the ambient request
    # tenant context) so the tree can never mix in another BOM's or tenant's items.
    result = await _build_explosion_tree(db, bom.id, None, 0, level, bom.tenantId)
    await cache_set(cache_key, result, ttl=300)
    return result


# ============ Quantity Rollup ============


def _compute_levels_and_effective_qty(
    items: list[BOMItem],
) -> tuple[dict[int, int], dict[int, float]]:
    """Compute, for every BOMItem in a single BOM's tree, its depth level (root
    items are level 1) and its EFFECTIVE quantity — the quantity actually
    consumed per one unit of the top-level assembly, i.e. its own line quantity
    multiplied by every ancestor's line quantity down from the root.
    """
    id_map = {item.id: item for item in items}
    levels: dict[int, int] = {}
    effective: dict[int, float] = {}

    def resolve(item_id: int, visiting: set[int]) -> None:
        if item_id in effective:
            return
        item = id_map[item_id]
        parent_id = item.parent_item_id
        # quantity is a Numeric(10,4) column (Decimal at the ORM layer) so it
        # can hold fractional line quantities; cast to float here so the
        # effective-qty map stays plain float as declared, matching the
        # float-based cost arithmetic in get_cost_rollup/get_quantity_rollup
        # below (mixing float and Decimal raises TypeError).
        qty = float(item.quantity or 0)
        if parent_id is None or parent_id not in id_map or item_id in visiting:
            # Root item, or parent isn't part of this BOM's item set (shouldn't
            # happen for well-formed data), or a cycle — treat as a root so we
            # never recurse forever.
            levels[item_id] = 1
            effective[item_id] = qty
            return
        visiting.add(item_id)
        resolve(parent_id, visiting)
        visiting.discard(item_id)
        levels[item_id] = levels[parent_id] + 1
        effective[item_id] = qty * effective[parent_id]

    for item in items:
        resolve(item.id, set())
    return levels, effective


async def get_quantity_rollup(db: AsyncSession, bom_id: int) -> dict:
    await get_bom_or_404(db, bom_id)
    tid = get_tenant_id()
    items_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items = (await db.execute(items_stmt)).scalars().all()

    part_ids = {i.part_id for i in items if i.part_id}
    parts = {}
    if part_ids:
        pr_stmt = select(Part).where(Part.id.in_(part_ids))
        if tid is not None:
            pr_stmt = pr_stmt.where(Part.tenantId == tid)
        pr = await db.execute(pr_stmt)
        for p in pr.scalars().all():
            parts[p.id] = p

    levels, effective_qty = _compute_levels_and_effective_qty(items)

    total_quantity_map: dict[str, float] = {}
    levels_by_part: dict[str, set[int]] = {}
    for item in items:
        if item.part_id:
            pid = item.part_id
            pn = parts[pid].pn if pid in parts else f"ID:{pid}"
            total_quantity_map[pn] = total_quantity_map.get(pn, 0) + effective_qty[item.id]
            levels_by_part.setdefault(pn, set()).add(levels[item.id])

    rollup = [
        {
            "part_number": pn,
            "total_quantity": qty,
            "levels": sorted(levels_by_part.get(pn, {1})),
        }
        for pn, qty in sorted(total_quantity_map.items(), key=lambda x: -x[1])
    ]
    return {
        "bom_id": bom_id,
        "total_items": len(items),
        "unique_parts": len(part_ids),
        "rollup": rollup,
    }


# ============ Cost Rollup ============


async def get_cost_rollup(db: AsyncSession, bom_id: int) -> dict:
    cache_key = f"bom:cost_rollup:{bom_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    await get_bom_or_404(db, bom_id)
    tid = get_tenant_id()
    items_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items_result = await db.execute(items_stmt)
    items = items_result.scalars().all()

    part_ids = [item.part_id for item in items if item.part_id]
    parts_map: dict[int, Any] = {}
    if part_ids:
        pr_stmt = select(Part).where(Part.id.in_(set(part_ids)))
        if tid is not None:
            pr_stmt = pr_stmt.where(Part.tenantId == tid)
        pr = await db.execute(pr_stmt)
        for p in pr.scalars().all():
            parts_map[p.id] = p

    total_cost = 0.0
    cost_by_level: dict[int, float] = {}
    cost_by_category: dict[str, float] = {}

    levels, effective_qty = _compute_levels_and_effective_qty(items)

    for item in items:
        if item.part_id and item.part_id in parts_map:
            part = parts_map[item.part_id]
            unit_cost = float(item.unit_cost_snapshot or (part.cost or 0))
            extended = unit_cost * effective_qty[item.id]
            total_cost += extended
            level = levels[item.id]
            cost_by_level[level] = cost_by_level.get(level, 0) + extended
            cat = part.category or "uncategorized"
            cost_by_category[cat] = cost_by_category.get(cat, 0) + extended

    result = {
        "bom_id": bom_id,
        "total_cost": round(total_cost, 2),
        "cost_by_level": {k: round(v, 2) for k, v in cost_by_level.items()},
        "cost_by_category": {k: round(v, 2) for k, v in cost_by_category.items()},
    }
    await cache_set(cache_key, result, ttl=300)
    return result


# ============ Where Used Analysis ============


async def get_where_used(db: AsyncSession, part_id: int) -> list[dict]:
    cache_key = f"bom:where_used:{part_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    pr = await db.execute(select(Part).where(Part.id == part_id))
    if not pr.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Part not found")

    tid = get_tenant_id()
    items_stmt = select(BOMItem).where(BOMItem.part_id == part_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items_result = await db.execute(items_stmt)
    items = items_result.scalars().all()
    if not items:
        return []

    bom_ids = {item.bom_id for item in items if item.bom_id}
    boms_map: dict[int, Any] = {}
    if bom_ids:
        br = await db.execute(select(BOM).where(BOM.id.in_(bom_ids)))
        for b in br.scalars().all():
            boms_map[b.id] = b

    parent_item_ids = {item.parent_item_id for item in items if item.parent_item_id}
    ancestor_map: dict[int, Optional[int]] = {}
    ancestor_bom_map: dict[int, Optional[int]] = {}
    if parent_item_ids:
        ancestors = await db.execute(
            select(BOMItem.id, BOMItem.parent_item_id, BOMItem.bom_id).where(
                BOMItem.id.in_(parent_item_ids)
            )
        )
        for row in ancestors:
            ancestor_map[row.id] = row.parent_item_id
            ancestor_bom_map[row.id] = row.bom_id

    def resolve_level_and_parent(pid: Optional[int]) -> tuple[int, Optional[int]]:
        level = 1
        pbom_id = None
        cur = pid
        while cur:
            pbom_id = ancestor_bom_map.get(cur, pbom_id)
            nxt = ancestor_map.get(cur)
            if nxt is None:
                break
            level += 1
            cur = nxt
        return level, pbom_id

    results = []
    for item in items:
        bom = boms_map.get(item.bom_id)
        if not bom:
            continue
        level, pbom_id = resolve_level_and_parent(item.parent_item_id)
        results.append(
            {
                "bom_id": bom.id,
                "bom_name": bom.name,
                "quantity": item.quantity,
                "level": level,
                "parent_bom_id": pbom_id,
            }
        )

    await cache_set(cache_key, results, ttl=300)
    return results


async def get_where_used_tree(db: AsyncSession, part_id: int) -> dict:
    cache_key = f"bom:where_used_tree:{part_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    pr = await db.execute(select(Part).where(Part.id == part_id))
    if not pr.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Part not found")

    tid = get_tenant_id()
    items_stmt = select(BOMItem).where(BOMItem.part_id == part_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items_result = await db.execute(items_stmt)
    items = items_result.scalars().all()
    if not items:
        return {"part_id": part_id, "usages": []}

    bom_ids = {item.bom_id for item in items if item.bom_id}
    boms_map: dict[int, Any] = {}
    if bom_ids:
        br = await db.execute(select(BOM).where(BOM.id.in_(bom_ids)))
        for b in br.scalars().all():
            boms_map[b.id] = b

    all_parent_ids: set[int] = set()
    for item in items:
        pid = item.parent_item_id
        while pid:
            all_parent_ids.add(pid)
            pid = None
    parent_items_map: dict[int, Any] = {}
    parent_boms_map: dict[int, Any] = {}
    if all_parent_ids:
        remaining = set(all_parent_ids)
        while remaining:
            batch = list(remaining)
            remaining.clear()
            pi_r = await db.execute(select(BOMItem).where(BOMItem.id.in_(batch)))
            for pi in pi_r.scalars().all():
                parent_items_map[pi.id] = pi
                if pi.parent_item_id:
                    remaining.add(pi.parent_item_id)
        parent_bom_ids = {pi.bom_id for pi in parent_items_map.values() if pi.bom_id}
        if parent_bom_ids:
            pb_r = await db.execute(select(BOM).where(BOM.id.in_(parent_bom_ids)))
            for pb in pb_r.scalars().all():
                parent_boms_map[pb.id] = pb

    usages = []
    for item in items:
        bom = boms_map.get(item.bom_id)
        if not bom:
            continue
        parents = []
        pid = item.parent_item_id
        while pid:
            pi = parent_items_map.get(pid)
            if pi:
                pb = parent_boms_map.get(pi.bom_id)
                if pb:
                    parents.append({"bom_id": pb.id, "bom_name": pb.name, "quantity": pi.quantity})
                pid = pi.parent_item_id
            else:
                break
        usages.append(
            {
                "bom_id": bom.id,
                "bom_name": bom.name,
                "quantity": item.quantity,
                "parents": parents,
            }
        )
    result = {"part_id": part_id, "usages": usages}
    await cache_set(cache_key, result, ttl=300)
    return result


# ============ BOM Snapshots and Baselines ============


async def create_snapshot(
    db: AsyncSession,
    bom_id: int,
    snapshot_name: str,
    snapshot_type: str,
    change_description: Optional[str] = None,
    user_id: int = None,
) -> dict:
    bom = await get_bom_or_404(db, bom_id)
    tid = get_tenant_id()
    items_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items_result = await db.execute(items_stmt)
    items = items_result.scalars().all()

    part_ids = [item.part_id for item in items if item.part_id]
    parts_map: dict[int, Any] = {}
    if part_ids:
        pr = await db.execute(select(Part).where(Part.id.in_(set(part_ids))))
        for p in pr.scalars().all():
            parts_map[p.id] = p

    snapshot_data = []
    for item in items:
        part = parts_map.get(item.part_id) if item.part_id else None
        snapshot_data.append(
            {
                "part_id": item.part_id,
                "part_number": part.pn if part else "",
                "part_name": part.name if part else "",
                "quantity": item.quantity,
                "unit": item.unit,
                "reference_designator": item.reference_designator,
                "parent_item_id": item.parent_item_id,
                "unit_cost_snapshot": float(item.unit_cost_snapshot)
                if item.unit_cost_snapshot
                else None,
                "extended_cost": float(item.extended_cost) if item.extended_cost else None,
                "notes": item.notes,
                "sort_order": item.sort_order,
            }
        )

    snapshot = BomSnapshot(
        bom_id=bom_id,
        snapshot_name=snapshot_name,
        snapshot_type=snapshot_type,
        snapshot_data=snapshot_data,
        version=bom.version,
        change_description=change_description,
        created_by=user_id,
        tenantId=tid,
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)

    return {
        "id": snapshot.id,
        "bom_id": bom_id,
        "snapshot_name": snapshot_name,
        "snapshot_type": snapshot_type,
        "version": bom.version,
        "item_count": len(snapshot_data),
        "created_at": snapshot.created_at.isoformat()
        if snapshot.created_at
        else datetime.now().isoformat(),
    }


async def list_snapshots(db: AsyncSession, bom_id: int) -> list[dict]:
    await get_bom_or_404(db, bom_id)
    tid = get_tenant_id()
    snapshots_stmt = (
        select(BomSnapshot)
        .where(BomSnapshot.bom_id == bom_id)
        .order_by(BomSnapshot.created_at.desc())
    )
    if tid is not None:
        snapshots_stmt = snapshots_stmt.where(BomSnapshot.tenantId == tid)
    snapshots_result = await db.execute(snapshots_stmt)
    snapshots = snapshots_result.scalars().all()
    return [
        {
            "id": s.id,
            "snapshot_name": s.snapshot_name,
            "snapshot_type": s.snapshot_type,
            "version": s.version,
            "item_count": len(s.snapshot_data) if s.snapshot_data else 0,
            "change_description": s.change_description,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in snapshots
    ]


# ============ BOM Comparison ============


async def compare_boms(db: AsyncSession, bom_id_1: int, bom_id_2: int) -> dict:
    bom1 = await get_bom_or_404(db, bom_id_1)
    bom2 = await get_bom_or_404(db, bom_id_2)

    tid = get_tenant_id()
    items1_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id_1)
    items2_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id_2)
    if tid is not None:
        items1_stmt = items1_stmt.where(BOMItem.tenantId == tid)
        items2_stmt = items2_stmt.where(BOMItem.tenantId == tid)
    items1_r = await db.execute(items1_stmt)
    items2_r = await db.execute(items2_stmt)
    items1 = {i.part_id: i for i in items1_r.scalars().all() if i.part_id}
    items2 = {i.part_id: i for i in items2_r.scalars().all() if i.part_id}

    all_ids = set(items1.keys()) | set(items2.keys())
    parts_r = await db.execute(select(Part).where(Part.id.in_(all_ids)))
    parts = {p.id: p for p in parts_r.scalars().all()}

    added, removed, modified, unchanged = [], [], [], []
    for pid, item in items2.items():
        pn = parts[pid].pn if pid in parts else f"ID:{pid}"
        if pid not in items1:
            added.append({"part_number": pn, "quantity": item.quantity})
        elif (
            items1[pid].quantity != item.quantity
            or items1[pid].reference_designator != item.reference_designator
        ):
            modified.append(
                {
                    "part_number": pn,
                    "old_quantity": items1[pid].quantity,
                    "new_quantity": item.quantity,
                    "old_refdes": items1[pid].reference_designator,
                    "new_refdes": item.reference_designator,
                }
            )
        else:
            unchanged.append({"part_number": pn, "quantity": item.quantity})
    for pid, item in items1.items():
        pn = parts[pid].pn if pid in parts else f"ID:{pid}"
        if pid not in items2:
            removed.append({"part_number": pn, "quantity": item.quantity})

    return {
        "bom_id_1": bom_id_1,
        "bom_id_2": bom_id_2,
        "version_1": bom1.version,
        "version_2": bom2.version,
        "added": added,
        "removed": removed,
        "modified": modified,
        "unchanged": len(unchanged),
    }


# ============ Baseline ============


async def create_baseline(
    db: AsyncSession,
    bom_id: int,
    baseline_name: str,
    user_id: int,
) -> dict:
    bom = await get_bom_or_404(db, bom_id)
    tid = get_tenant_id()

    old_baselines_stmt = select(BomBaseline).where(
        BomBaseline.bom_id == bom_id, BomBaseline.is_current
    )
    if tid is not None:
        old_baselines_stmt = old_baselines_stmt.where(BomBaseline.tenantId == tid)
    old_baselines = await db.execute(old_baselines_stmt)
    for bl in old_baselines.scalars().all():
        bl.is_current = False

    items_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items_result = await db.execute(items_stmt)
    items = items_result.scalars().all()
    part_ids = [item.part_id for item in items if item.part_id]
    parts_map: dict[int, Any] = {}
    if part_ids:
        pr = await db.execute(select(Part).where(Part.id.in_(set(part_ids))))
        for p in pr.scalars().all():
            parts_map[p.id] = p

    snapshot_data = []
    for item in items:
        part = parts_map.get(item.part_id) if item.part_id else None
        snapshot_data.append(
            {
                "part_id": item.part_id,
                "part_number": part.pn if part else "",
                "part_name": part.name if part else "",
                "quantity": item.quantity,
                "unit": item.unit,
                "parent_item_id": item.parent_item_id,
            }
        )

    snapshot = BomSnapshot(
        bom_id=bom_id,
        snapshot_name=f"baseline_{baseline_name}",
        snapshot_type="baseline",
        snapshot_data=snapshot_data,
        version=bom.version,
        created_by=user_id,
        tenantId=tid,
    )
    db.add(snapshot)
    await db.flush()

    baseline = BomBaseline(
        bom_id=bom_id,
        baseline_name=baseline_name,
        snapshot_id=snapshot.id,
        is_current=True,
        created_by=user_id,
        tenantId=tid,
    )
    db.add(baseline)
    await db.commit()
    await db.refresh(baseline)

    return {
        "id": baseline.id,
        "bom_id": bom_id,
        "baseline_name": baseline_name,
        "snapshot_id": snapshot.id,
        "is_current": True,
        "item_count": len(snapshot_data),
        "created_at": baseline.created_at.isoformat()
        if baseline.created_at
        else datetime.now().isoformat(),
    }


# ============ BOM Variants ============


async def create_variant(
    db: AsyncSession,
    base_bom_id: int,
    variant_name: str,
    description: Optional[str] = None,
    configuration_rules: Optional[dict[str, Any]] = None,
    user_id: int = None,
) -> BomVariant:
    await get_bom_or_404(db, base_bom_id)
    tid = get_tenant_id()
    variant = BomVariant(
        base_bom_id=base_bom_id,
        variant_name=variant_name,
        description=description,
        configuration_rules=configuration_rules,
        created_by=user_id,
        tenantId=tid,
    )
    db.add(variant)
    await db.commit()
    await db.refresh(variant)
    return variant


async def get_variant(db: AsyncSession, variant_id: int) -> dict:
    tid = get_tenant_id()
    variant_stmt = select(BomVariant).where(BomVariant.id == variant_id)
    if tid is not None:
        variant_stmt = variant_stmt.where(BomVariant.tenantId == tid)
    result = await db.execute(variant_stmt)
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    items_stmt = select(BomVariantItem).where(BomVariantItem.variant_id == variant_id)
    if tid is not None:
        items_stmt = items_stmt.where(BomVariantItem.tenantId == tid)
    items = await db.execute(items_stmt)
    variant_items = items.scalars().all()
    part_ids = {i.part_id for i in variant_items if i.part_id}
    parts_map = {}
    if part_ids:
        pr = await db.execute(select(Part).where(Part.id.in_(part_ids)))
        for p in pr.scalars().all():
            parts_map[p.id] = p

    item_list = []
    for item in variant_items:
        p = parts_map.get(item.part_id) if item.part_id else None
        item_list.append(
            {
                "id": item.id,
                "part_id": item.part_id,
                "part_number": p.pn if p else None,
                "quantity": item.quantity,
                "is_optional": item.is_optional,
                "substitute_part_id": item.substitute_part_id,
                "condition_expression": item.condition_expression,
            }
        )

    return {
        "id": variant.id,
        "base_bom_id": variant.base_bom_id,
        "variant_name": variant.variant_name,
        "description": variant.description,
        "status": variant.status,
        "configuration_rules": variant.configuration_rules,
        "created_at": variant.created_at.isoformat() if variant.created_at else None,
        "items": item_list,
    }


async def add_variant_item(
    db: AsyncSession,
    variant_id: int,
    part_id: int,
    quantity: int,
    substitute_part_id: Optional[int] = None,
    is_optional: bool = False,
    condition_expression: Optional[str] = None,
) -> BomVariantItem:
    tid = get_tenant_id()
    variant_stmt = select(BomVariant).where(BomVariant.id == variant_id)
    if tid is not None:
        variant_stmt = variant_stmt.where(BomVariant.tenantId == tid)
    result = await db.execute(variant_stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Variant not found")
    part = await db.execute(select(Part).where(Part.id == part_id))
    if not part.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Part not found")

    item = BomVariantItem(
        variant_id=variant_id,
        part_id=part_id,
        quantity=quantity,
        substitute_part_id=substitute_part_id,
        is_optional=is_optional,
        condition_expression=condition_expression,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


# ============ Import/Export ============


async def export_bom(db: AsyncSession, bom_id: int, format: str) -> dict:
    bom = await get_bom_or_404(db, bom_id)
    tid = get_tenant_id()
    items_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items_result = await db.execute(items_stmt)
    items = items_result.scalars().all()

    part_ids = [i.part_id for i in items if i.part_id]
    parts_map = {}
    if part_ids:
        pr = await db.execute(select(Part).where(Part.id.in_(set(part_ids))))
        for p in pr.scalars().all():
            parts_map[p.id] = p

    export_data = []
    for item in items:
        part = parts_map.get(item.part_id) if item.part_id else None
        export_data.append(
            {
                "part_number": part.pn if part else "",
                "part_name": part.name if part else "",
                "quantity": item.quantity,
                "reference_designator": item.reference_designator,
                "notes": item.notes,
            }
        )

    return {
        "bom_id": bom_id,
        "bom_name": bom.name,
        "format": format,
        "item_count": len(export_data),
        "items": export_data,
    }


async def import_bom(
    db: AsyncSession,
    file_url: str,
    project_id: int,
    format: str = "csv",
) -> dict:
    if not file_url:
        raise HTTPException(status_code=400, detail="file_url is required")
    tid = get_tenant_id()
    bom = BOM(
        name=f"Imported BOM ({datetime.now(UTC).strftime('%Y-%m-%d')})",
        description=f"Imported from {file_url} ({format})",
        project_id=project_id,
        status="draft",
        tenantId=tid,
    )
    db.add(bom)
    await db.commit()
    await db.refresh(bom)
    return {
        "bom_id": bom.id,
        "import_status": "success",
        "items_imported": 0,
        "warnings": ["BOM structure created. Import items via BOM Items API."],
    }


# ============ BOM Templates ============


async def create_template(
    db: AsyncSession,
    name: str,
    description: Optional[str] = None,
    source_bom_id: Optional[int] = None,
    user_id: int = None,
) -> BomTemplate:
    ptc = 0
    if source_bom_id:
        src = await db.execute(select(BOM).where(BOM.id == source_bom_id))
        if src.scalar_one_or_none():
            items = await db.execute(select(BOMItem).where(BOMItem.bom_id == source_bom_id))
            ptc = len(items.scalars().all())
    tid = get_tenant_id()
    tmpl = BomTemplate(
        name=name,
        description=description,
        partCount=ptc,
        createdById=user_id,
        tenantId=tid,
    )
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return tmpl


async def list_templates(db: AsyncSession) -> list[dict]:
    tid = get_tenant_id()
    tmpl_stmt = select(BomTemplate).order_by(BomTemplate.createdAt.desc())
    if tid is not None:
        tmpl_stmt = tmpl_stmt.where(BomTemplate.tenantId == tid)
    result = await db.execute(tmpl_stmt)
    templates = result.scalars().all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "partCount": t.partCount,
            "createdAt": t.createdAt.isoformat() if t.createdAt else None,
        }
        for t in templates
    ]


async def apply_template(
    db: AsyncSession,
    template_id: int,
    project_id: int,
) -> dict:
    tid = get_tenant_id()
    tmpl_stmt = select(BomTemplate).where(BomTemplate.id == template_id)
    if tid is not None:
        tmpl_stmt = tmpl_stmt.where(BomTemplate.tenantId == tid)
    result = await db.execute(tmpl_stmt)
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    bom = BOM(
        name=f"{tmpl.name} (from template)",
        project_id=project_id,
        status="draft",
        tenantId=tid,
    )
    db.add(bom)
    await db.flush()

    template_items = await db.execute(
        select(TemplateBomItem).where(TemplateBomItem.bomTemplateId == template_id)
    )
    items_created = 0
    for ti in template_items.scalars().all():
        db.add(
            BOMItem(
                bom_id=bom.id,
                part_id=ti.partId,
                quantity=ti.quantity or 1,
                reference_designator=ti.referenceDesignator,
                notes=ti.notes,
                sort_order=ti.sortOrder or 0,
                tenantId=tid,
            )
        )
        items_created += 1

    await db.commit()
    await db.refresh(bom)
    return {"bom_id": bom.id, "template_id": template_id, "items_created": items_created}
