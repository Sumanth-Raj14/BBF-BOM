"""BOM service layer — business logic for BOM management, explosion, rollup, snapshots, variants."""

import hashlib
import os
from datetime import UTC, datetime
from typing import Any, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get, cache_invalidate, cache_set
from app.core.clamav import combined_scan
from app.core.config import settings
from app.core.file_scanning import ALLOWED_EXTENSIONS, validate_upload
from app.core.s3_storage import s3_storage
from app.core.tenant_context import get_tenant_id
from app.models.bom import BOM, BOMItem
from app.models.bom_closure import BomClosure
from app.models.bom_item import BomItem as TemplateBomItem
from app.models.bom_item_custom_value import BomItemCustomValue
from app.models.bom_snapshot import BomBaseline, BomSnapshot
from app.models.bom_template import BomTemplate
from app.models.bom_variant import BomVariant, BomVariantItem
from app.models.document import Document
from app.models.enterprise_extensions import CustomAttributeDefinition
from app.models.part import Part
from app.services import webhook_service

# Upload location comes from settings (env-configurable via UPLOAD_DIR), same as
# documents.py, so a packaged / read-only install can point it at a writable
# data dir. Best-effort at import: never crash module import on a read-only or
# missing path — the dir is created lazily on first write.
_UPLOAD_DIR = settings.UPLOAD_DIR
try:
    os.makedirs(_UPLOAD_DIR, exist_ok=True)
except OSError:
    pass

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


async def create_bom(db: AsyncSession, data: dict, tenant_id: Optional[int] = None) -> BOM:
    # Prefer an explicitly-passed tenant (from current_user.tenantId, matching
    # create_bom_item / catalog_service.create_catalog); fall back to the ambient
    # context. boms.tenantId is NOT NULL, so this must resolve to a real tenant.
    tid = tenant_id if tenant_id is not None else get_tenant_id()
    data = dict(data)
    # boms.bom_number is NOT NULL (unique per tenant) with no DB default — auto-
    # generate a tenant-scoped number when the caller didn't supply one.
    if not data.get("bom_number"):
        count_stmt = select(func.count()).select_from(BOM)
        if tid is not None:
            count_stmt = count_stmt.where(BOM.tenantId == tid)
        count = (await db.execute(count_stmt)).scalar() or 0
        data["bom_number"] = f"BOM-{datetime.now(UTC).year}-{count + 1:04d}"
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
    # Line-item media / visibility (migration 045).
    "image_document_id",
    "thumbnail_path",
    "exclude_from_bom",
}


async def _invalidate_bom_caches(bom_id: int) -> None:
    await cache_invalidate(f"bom:{bom_id}")
    await cache_invalidate(f"bom:explosion:{bom_id}:*")
    await cache_invalidate(f"bom:explosion_closure:{bom_id}:*")
    await cache_invalidate(f"bom:cost_rollup:{bom_id}")
    await cache_invalidate(f"bom:mass_rollup:{bom_id}")


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
        "image_document_id": item.image_document_id,
        "thumbnail_path": item.thumbnail_path,
        "exclude_from_bom": item.exclude_from_bom,
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


async def _validate_image_document(db: AsyncSession, tid, image_document_id: Optional[int]) -> None:
    """If an image_document_id is being set directly (create/update body,
    as opposed to via attach_bom_item_image), it must reference a real
    Document belonging to the same tenant — otherwise a crafted id could
    point a line at another tenant's document."""
    if image_document_id is None:
        return
    stmt = select(Document).where(Document.id == image_document_id)
    if tid is not None:
        stmt = stmt.where(Document.tenantId == tid)
    if not (await db.execute(stmt)).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")


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


# ---- BomClosure maintenance (WS5) ----
#
# Maintained incrementally, scoped by BOTH bom_id AND tenantId, alongside
# every write below. `item_id` MUST already be persisted (post-flush) before
# any of these run, since closure rows FK-reference it.


async def _closure_add_item(
    db: AsyncSession,
    bom_id: int,
    tid,
    item_id: int,
    parent_item_id: Optional[int],
) -> None:
    """New line: write its self row (depth 0), plus one row for every
    ancestor of its parent (depth+1) — i.e. it inherits its parent's full
    ancestor chain, one hop further away."""
    db.add(
        BomClosure(
            bom_id=bom_id,
            tenantId=tid,
            ancestor_item_id=item_id,
            descendant_item_id=item_id,
            depth=0,
        )
    )
    if parent_item_id is None:
        return
    stmt = select(BomClosure).where(
        BomClosure.bom_id == bom_id, BomClosure.descendant_item_id == parent_item_id
    )
    if tid is not None:
        stmt = stmt.where(BomClosure.tenantId == tid)
    parent_ancestors = (await db.execute(stmt)).scalars().all()
    for row in parent_ancestors:
        db.add(
            BomClosure(
                bom_id=bom_id,
                tenantId=tid,
                ancestor_item_id=row.ancestor_item_id,
                descendant_item_id=item_id,
                depth=row.depth + 1,
            )
        )


async def _closure_remove_subtree(db: AsyncSession, bom_id: int, tid, item_id: int) -> None:
    """Delete `item_id` and its ENTIRE subtree — from bom_items_master and
    from the closure table — mirroring the ON DELETE CASCADE declared on
    parent_item_id (which Postgres enforces at the DB level but which SQLite,
    as used in tests, does not enforce by default), so behavior is identical
    on both backends regardless of FK-pragma state."""
    stmt = select(BomClosure.descendant_item_id, BomClosure.depth).where(
        BomClosure.bom_id == bom_id, BomClosure.ancestor_item_id == item_id
    )
    if tid is not None:
        stmt = stmt.where(BomClosure.tenantId == tid)
    subtree_rows = (await db.execute(stmt)).all()

    depth_by_id: dict[int, int] = {item_id: 0}
    for r in subtree_rows:
        depth_by_id[r.descendant_item_id] = r.depth
    subtree_ids = set(depth_by_id)

    # Delete deepest descendants first (regardless of backend FK enforcement)
    # so no ordering issue ever arises, then the root of the removed subtree.
    ordered_ids = sorted(subtree_ids, key=lambda i: -depth_by_id[i])
    items_stmt = select(BOMItem).where(BOMItem.id.in_(subtree_ids), BOMItem.bom_id == bom_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items_by_id = {i.id: i for i in (await db.execute(items_stmt)).scalars().all()}
    for iid in ordered_ids:
        row = items_by_id.get(iid)
        if row is not None:
            await db.delete(row)
    await db.flush()

    # Every closure row mentioning any removed item, in EITHER direction —
    # a removed descendant also appears as the descendant side of rows owned
    # by ancestors ABOVE item_id, which must go too.
    closure_stmt = select(BomClosure).where(
        BomClosure.bom_id == bom_id,
        (BomClosure.ancestor_item_id.in_(subtree_ids))
        | (BomClosure.descendant_item_id.in_(subtree_ids)),
    )
    if tid is not None:
        closure_stmt = closure_stmt.where(BomClosure.tenantId == tid)
    for crow in (await db.execute(closure_stmt)).scalars().all():
        await db.delete(crow)


async def _closure_reparent(
    db: AsyncSession,
    bom_id: int,
    tid,
    item_id: int,
    new_parent_item_id: Optional[int],
) -> None:
    """A line's parent_item_id changed: detach its whole subtree from every
    OLD external ancestor, then reattach the subtree beneath the new
    parent's own ancestor chain (or leave it rootless if the new parent is
    None). Internal (subtree-to-subtree) closure rows are untouched — only
    the tree's shape ABOVE item_id changed, not below it."""
    stmt = select(BomClosure.descendant_item_id, BomClosure.depth).where(
        BomClosure.bom_id == bom_id, BomClosure.ancestor_item_id == item_id
    )
    if tid is not None:
        stmt = stmt.where(BomClosure.tenantId == tid)
    subtree_rows = (await db.execute(stmt)).all()
    subtree_depth: dict[int, int] = {item_id: 0}
    for r in subtree_rows:
        subtree_depth[r.descendant_item_id] = r.depth
    subtree_ids = set(subtree_depth)

    old_links_stmt = select(BomClosure).where(
        BomClosure.bom_id == bom_id,
        BomClosure.descendant_item_id.in_(subtree_ids),
        BomClosure.ancestor_item_id.notin_(subtree_ids),
    )
    if tid is not None:
        old_links_stmt = old_links_stmt.where(BomClosure.tenantId == tid)
    for row in (await db.execute(old_links_stmt)).scalars().all():
        await db.delete(row)
    await db.flush()

    if new_parent_item_id is None:
        return

    new_parent_ancestors_stmt = select(BomClosure).where(
        BomClosure.bom_id == bom_id, BomClosure.descendant_item_id == new_parent_item_id
    )
    if tid is not None:
        new_parent_ancestors_stmt = new_parent_ancestors_stmt.where(BomClosure.tenantId == tid)
    new_parent_ancestors = (await db.execute(new_parent_ancestors_stmt)).scalars().all()
    for anc in new_parent_ancestors:
        for did, ddepth in subtree_depth.items():
            db.add(
                BomClosure(
                    bom_id=bom_id,
                    tenantId=tid,
                    ancestor_item_id=anc.ancestor_item_id,
                    descendant_item_id=did,
                    depth=anc.depth + ddepth + 1,
                )
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
    if "image_document_id" in data:
        await _validate_image_document(db, tid, data.get("image_document_id"))

    fields = {k: v for k, v in data.items() if k in _BOM_ITEM_WRITABLE_FIELDS}
    item = BOMItem(bom_id=bom.id, tenantId=tid, **fields)
    db.add(item)
    await db.flush()  # assigns item.id, needed by closure rows below

    await _closure_add_item(db, bom.id, tid, item.id, item.parent_item_id)

    await db.commit()
    await db.refresh(item)

    await _invalidate_bom_caches(bom_id)

    part = None
    if item.part_id is not None:
        pr = await db.execute(select(Part).where(Part.id == item.part_id))
        part = pr.scalar_one_or_none()
    await webhook_service.emit_event(
        db,
        "bom.item.created",
        {"bom_id": bom.id, "item_id": item.id, "part_id": item.part_id},
        item.tenantId,
    )
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

    if "image_document_id" in fields:
        await _validate_image_document(db, tid, fields["image_document_id"])

    if "parent_item_id" in fields:
        await _validate_parent(db, bom_id, tid, fields["parent_item_id"], self_id=item.id)

    new_part_id = fields.get("part_id", item.part_id)
    new_parent_id = fields.get("parent_item_id", item.parent_item_id)
    new_refdes = fields.get("reference_designator", item.reference_designator)
    if "part_id" in fields or "parent_item_id" in fields or "reference_designator" in fields:
        await _validate_no_duplicate(
            db, bom_id, tid, new_part_id, new_parent_id, new_refdes, exclude_item_id=item.id
        )

    if "parent_item_id" in fields and fields["parent_item_id"] != item.parent_item_id:
        await _closure_reparent(db, bom_id, tid, item.id, fields["parent_item_id"])

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
    await webhook_service.emit_event(
        db,
        "bom.item.updated",
        {"bom_id": bom_id, "item_id": item.id, "part_id": item.part_id},
        item.tenantId,
    )
    return _serialize_bom_item(item, part)


async def delete_bom_item(db: AsyncSession, bom_id: int, item_id: int) -> None:
    """Delete a line AND its entire subtree (children, grandchildren, ...) —
    both bom_items_master rows and their bom_closures rows — so the closure
    table (and the item tree it describes) never ends up with orphaned
    descendants pointing at a parent that no longer exists."""
    tid = get_tenant_id()
    item = await _get_bom_item_or_404(db, bom_id, item_id, tid)
    item_tenant_id = item.tenantId  # read before the row goes away
    await _closure_remove_subtree(db, bom_id, tid, item.id)
    await db.commit()
    await _invalidate_bom_caches(bom_id)
    await webhook_service.emit_event(
        db, "bom.item.deleted", {"bom_id": bom_id, "item_id": item_id}, item_tenant_id
    )


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


# ============ Line-item Image (OpenBOM-parity media) ============
#
# Attaches/clears the per-line image introduced by migration 045
# (image_document_id / thumbnail_path on bom_items_master). The upload
# pipeline (validate -> combined_scan -> content-hash filename -> S3-or-local)
# mirrors app/api/endpoints/documents.py's upload_document exactly, since that
# logic lives inline in the endpoint there rather than in a reusable service
# function — Track B is scoped to bom_service.py/bom_enterprise.py only, so it
# is reimplemented here rather than factored out of a file outside that scope.


async def attach_bom_item_image(
    db: AsyncSession,
    bom_id: int,
    item_id: int,
    file: UploadFile,
    tenant_id: Optional[int] = None,
    uploaded_by: Optional[str] = None,
) -> dict:
    """Attach (or replace) the image for a BOM line. Creates a new Document
    row for every call — including replacement — and simply repoints the
    line's image_document_id/thumbnail_path at it; the previous Document row
    (if any) is left alone rather than deleted, since it may still be
    referenced elsewhere (e.g. document history)."""
    tid = tenant_id if tenant_id is not None else get_tenant_id()
    item = await _get_bom_item_or_404(db, bom_id, item_id, tid)

    validate_upload(file)
    content = await file.read()

    scan_result = await combined_scan(content, file.filename or "unknown")
    if not scan_result["clean"]:
        raise HTTPException(status_code=400, detail="File rejected by security scan.")

    # Never build a path from the client-supplied filename — derive a safe
    # name from the content hash plus a whitelisted extension only (same rule
    # as documents.py's upload_document).
    file_hash = hashlib.md5(content).hexdigest()[:12]
    raw_ext = os.path.splitext(file.filename or "")[1].lower().lstrip(".")
    safe_ext = raw_ext if raw_ext.isalnum() and raw_ext in ALLOWED_EXTENSIONS else "bin"
    safe_filename = f"{file_hash}.{safe_ext}"

    s3_key = f"documents/BomItemImage/{safe_filename}"
    content_type = file.content_type or "application/octet-stream"
    s3_result = await s3_storage.upload_file(content, s3_key, content_type)

    file_path = s3_result.get("localPath") or os.path.join(_UPLOAD_DIR, safe_filename)
    if s3_result.get("storage") == "local_fallback":
        with open(file_path, "wb") as f:
            f.write(content)

    doc_url = s3_result.get("url") or f"/uploads/{safe_filename}"
    doc = Document(
        filename=safe_filename,
        originalName=file.filename or "upload",
        fileType=safe_ext,
        fileSize=len(content),
        filePath=file_path,
        url=doc_url,
        category="BomItemImage",
        uploadedBy=uploaded_by,
        tenantId=tid,
    )
    db.add(doc)
    await db.flush()  # assigns doc.id

    item.image_document_id = doc.id
    item.thumbnail_path = doc_url

    await db.commit()
    await db.refresh(item)
    await _invalidate_bom_caches(bom_id)

    part = None
    if item.part_id is not None:
        pr = await db.execute(select(Part).where(Part.id == item.part_id))
        part = pr.scalar_one_or_none()
    return _serialize_bom_item(item, part)


async def clear_bom_item_image(db: AsyncSession, bom_id: int, item_id: int) -> dict:
    """Detach a line's image (clears image_document_id/thumbnail_path). The
    underlying Document row is left in place — only the line's pointer to it
    is cleared."""
    tid = get_tenant_id()
    item = await _get_bom_item_or_404(db, bom_id, item_id, tid)
    item.image_document_id = None
    item.thumbnail_path = None

    await db.commit()
    await db.refresh(item)
    await _invalidate_bom_caches(bom_id)

    part = None
    if item.part_id is not None:
        pr = await db.execute(select(Part).where(Part.id == item.part_id))
        part = pr.scalar_one_or_none()
    return _serialize_bom_item(item, part)


# ============ Line-item Custom Attributes (ad-hoc columns) ============
#
# Reuses CustomAttributeDefinition (entity_type free-form, no CHECK constraint
# / allowlist — app/models/enterprise_extensions.py) as the *schema* for
# entity_type='bom_item' ad-hoc attributes, and BomItemCustomValue
# (app/models/bom_item_custom_value.py, migration 046) as the *value* store
# for one BOM line's answer to one of those definitions.


async def get_bom_item_custom_attributes(db: AsyncSession, bom_id: int, item_id: int) -> list[dict]:
    """Return one row per active entity_type='bom_item' CustomAttributeDefinition
    for this tenant, with this line's value (None if never set) — the caller
    always sees the full ad-hoc schema, not just the attributes that happen to
    have a value."""
    tid = get_tenant_id()
    item = await _get_bom_item_or_404(db, bom_id, item_id, tid)

    defs_stmt = select(CustomAttributeDefinition).where(
        CustomAttributeDefinition.entity_type == "bom_item",
        CustomAttributeDefinition.is_active.is_(True),
    )
    if tid is not None:
        defs_stmt = defs_stmt.where(CustomAttributeDefinition.tenantId == tid)
    definitions = (await db.execute(defs_stmt)).scalars().all()
    if not definitions:
        return []

    values_stmt = select(BomItemCustomValue).where(BomItemCustomValue.bom_item_id == item.id)
    if tid is not None:
        values_stmt = values_stmt.where(BomItemCustomValue.tenantId == tid)
    values_by_def = {
        v.attribute_definition_id: v for v in (await db.execute(values_stmt)).scalars().all()
    }

    return [
        {
            "attribute_definition_id": d.id,
            "attribute_name": d.attribute_name,
            "display_name": d.display_name,
            "value": values_by_def[d.id].value if d.id in values_by_def else None,
        }
        for d in definitions
    ]


async def set_bom_item_custom_attribute(
    db: AsyncSession,
    bom_id: int,
    item_id: int,
    attribute_definition_id: int,
    value: Optional[str],
    tenant_id: Optional[int] = None,
) -> dict:
    """Write (create or update) this line's value for one
    entity_type='bom_item' custom-attribute definition. Scoped by bom_id +
    tenantId on the line, and the definition must itself belong to the same
    tenant and be scoped to entity_type='bom_item'."""
    tid = tenant_id if tenant_id is not None else get_tenant_id()
    item = await _get_bom_item_or_404(db, bom_id, item_id, tid)

    def_stmt = select(CustomAttributeDefinition).where(
        CustomAttributeDefinition.id == attribute_definition_id,
        CustomAttributeDefinition.entity_type == "bom_item",
    )
    if tid is not None:
        def_stmt = def_stmt.where(CustomAttributeDefinition.tenantId == tid)
    definition = (await db.execute(def_stmt)).scalar_one_or_none()
    if not definition:
        raise HTTPException(
            status_code=404,
            detail="Custom attribute definition not found for entity_type='bom_item'",
        )

    row_stmt = select(BomItemCustomValue).where(
        BomItemCustomValue.bom_item_id == item.id,
        BomItemCustomValue.attribute_definition_id == attribute_definition_id,
    )
    if tid is not None:
        row_stmt = row_stmt.where(BomItemCustomValue.tenantId == tid)
    row = (await db.execute(row_stmt)).scalar_one_or_none()
    if row is None:
        row = BomItemCustomValue(
            bom_item_id=item.id,
            attribute_definition_id=attribute_definition_id,
            value=value,
            tenantId=tid,
        )
        db.add(row)
    else:
        row.value = value

    await db.commit()
    await db.refresh(row)

    return {
        "attribute_definition_id": definition.id,
        "attribute_name": definition.attribute_name,
        "display_name": definition.display_name,
        "value": row.value,
    }


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
        BOMItem.bom_id == bom_id,
        BOMItem.parent_item_id == parent_item_id,
        # exclude_from_bom lines (and, as a consequence, their entire subtree —
        # a skipped line's children are simply never recursed into below) are
        # omitted from the explosion tree.
        BOMItem.exclude_from_bom.is_(False),
    )
    if tid is not None:
        stmt = stmt.where(BOMItem.tenantId == tid)
    # Deterministic child order (matches get_bom_explosion_via_closure's id sort).
    # Without it, Postgres returns siblings in arbitrary order, so the recursive
    # and closure-backed explosions diverge (SQLite happened to match by rowid).
    stmt = stmt.order_by(BOMItem.id)
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


# ============ Closure-backed Explosion + Where-Used (WS5) ============
#
# BomClosure (maintained incrementally above, by create/update/delete_bom_item)
# holds one row per (ancestor, descendant) pair in a BOM's item tree,
# including a self row at depth 0. That lets these two functions fetch an
# entire subtree / ancestor chain in O(1) queries instead of the O(depth)
# recursive round-trips in get_bom_explosion / get_where_used_tree above —
# and they MUST return results identical to those two.


async def get_bom_explosion_via_closure(db: AsyncSession, bom_id: int, level: int = 10) -> list[dict]:
    bom = await get_bom_or_404(db, bom_id)
    tid = bom.tenantId
    cache_key = f"bom:explosion_closure:{bom_id}:{level}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    # exclude_from_bom lines are dropped from the source set entirely — since
    # `build()` below only visits a node by recursing into its PARENT's
    # children, a dropped line's own children (still in `items_by_parent`,
    # keyed by the dropped line's id) are never reached, so its whole subtree
    # disappears from the tree exactly as in get_bom_explosion.
    items_stmt = select(BOMItem).where(
        BOMItem.bom_id == bom_id, BOMItem.exclude_from_bom.is_(False)
    )
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items = (await db.execute(items_stmt)).scalars().all()

    items_by_parent: dict[Optional[int], list[BOMItem]] = {}
    for it in items:
        items_by_parent.setdefault(it.parent_item_id, []).append(it)
    for group in items_by_parent.values():
        group.sort(key=lambda i: i.id)

    # 1-indexed depth-from-root for every item, in ONE query: the count of
    # its own ancestor rows (including its self row) in bom_closures.
    closure_stmt = (
        select(BomClosure.descendant_item_id, func.count())
        .where(BomClosure.bom_id == bom_id)
        .group_by(BomClosure.descendant_item_id)
    )
    if tid is not None:
        closure_stmt = closure_stmt.where(BomClosure.tenantId == tid)
    level_by_item = {row[0]: row[1] for row in (await db.execute(closure_stmt)).all()}

    part_ids = [i.part_id for i in items if i.part_id]
    parts_map: dict[int, tuple[str, str]] = {}
    if part_ids:
        pr_stmt = select(Part).where(Part.id.in_(set(part_ids)))
        if tid is not None:
            pr_stmt = pr_stmt.where(Part.tenantId == tid)
        for p in (await db.execute(pr_stmt)).scalars().all():
            parts_map[p.id] = (p.pn, p.name)

    def build(parent_item_id: Optional[int]) -> list[dict]:
        tree = []
        for item in items_by_parent.get(parent_item_id, []):
            # get_bom_explosion's current_level is 0-indexed for roots and
            # prunes when current_level > level; closure level is 1-indexed
            # (self row counts), so current_level == closure_level - 1.
            item_level = level_by_item.get(item.id, 1)
            if item_level - 1 > level:
                continue
            pn, desc = parts_map.get(item.part_id, ("", "")) if item.part_id else ("", "")
            tree.append(
                {
                    "part_id": item.part_id or 0,
                    "part_number": pn,
                    "description": desc,
                    "quantity": item.quantity,
                    "level": item_level - 1,
                    "parent_part_id": parent_item_id,
                    "children": build(item.id),
                }
            )
        return tree

    result = build(None)
    await cache_set(cache_key, result, ttl=300)
    return result


async def get_where_used_via_closure(db: AsyncSession, part_id: int) -> dict:
    cache_key = f"bom:where_used_closure:{part_id}"
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
    items = (await db.execute(items_stmt)).scalars().all()
    if not items:
        result = {"part_id": part_id, "usages": []}
        await cache_set(cache_key, result, ttl=300)
        return result

    bom_ids = {item.bom_id for item in items if item.bom_id}
    boms_map: dict[int, Any] = {}
    if bom_ids:
        br = await db.execute(select(BOM).where(BOM.id.in_(bom_ids)))
        for b in br.scalars().all():
            boms_map[b.id] = b

    # Every ancestor (excluding self) of every occurrence, in ONE query,
    # ordered nearest-ancestor-first via `depth`.
    item_ids = [i.id for i in items]
    closure_stmt = select(BomClosure).where(
        BomClosure.bom_id.in_(bom_ids) if bom_ids else BomClosure.bom_id.is_(None),
        BomClosure.descendant_item_id.in_(item_ids),
        BomClosure.ancestor_item_id != BomClosure.descendant_item_id,
    )
    if tid is not None:
        closure_stmt = closure_stmt.where(BomClosure.tenantId == tid)
    closure_rows = (await db.execute(closure_stmt)).scalars().all()

    ancestors_by_item: dict[int, list[BomClosure]] = {}
    for row in closure_rows:
        ancestors_by_item.setdefault(row.descendant_item_id, []).append(row)
    for rows in ancestors_by_item.values():
        rows.sort(key=lambda r: r.depth)

    all_ancestor_item_ids = {row.ancestor_item_id for row in closure_rows}
    ancestor_items_map: dict[int, BOMItem] = {}
    if all_ancestor_item_ids:
        ai_stmt = select(BOMItem).where(BOMItem.id.in_(all_ancestor_item_ids))
        if tid is not None:
            ai_stmt = ai_stmt.where(BOMItem.tenantId == tid)
        for ai in (await db.execute(ai_stmt)).scalars().all():
            ancestor_items_map[ai.id] = ai

    usages = []
    for item in items:
        bom = boms_map.get(item.bom_id)
        if not bom:
            continue
        parents = []
        for row in ancestors_by_item.get(item.id, []):
            anc_item = ancestor_items_map.get(row.ancestor_item_id)
            if anc_item is None:
                continue
            anc_bom = boms_map.get(anc_item.bom_id)
            if anc_bom is None:
                continue
            parents.append(
                {"bom_id": anc_bom.id, "bom_name": anc_bom.name, "quantity": anc_item.quantity}
            )
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


def _drop_excluded_subtrees(items: list[BOMItem]) -> list[BOMItem]:
    """Return only items that are neither exclude_from_bom nor have any
    exclude_from_bom ancestor.

    The explosion views (get_bom_explosion / get_bom_explosion_via_closure) drop
    an excluded line AND its entire subtree — a skipped parent's children are
    never reached. The quantity/cost rollups MUST agree on the same data.
    Filtering ``exclude_from_bom == False`` in SQL alone does NOT: it removes the
    excluded parent but leaves its children, which then re-root as level-1 and
    are still counted (minus the excluded parent's qty multiplier), so explosion
    and rollup contradict each other. Walking ancestor chains over the FULL item
    set here reproduces the explosion's cascade-drop semantics.
    """
    id_map = {item.id: item for item in items}
    dropped: dict[int, bool] = {}

    def is_dropped(item_id: int, visiting: set[int]) -> bool:
        if item_id in dropped:
            return dropped[item_id]
        item = id_map[item_id]
        if bool(item.exclude_from_bom):
            dropped[item_id] = True
            return True
        parent_id = item.parent_item_id
        if parent_id is None or parent_id not in id_map or item_id in visiting:
            dropped[item_id] = False
            return False
        visiting.add(item_id)
        result = is_dropped(parent_id, visiting)
        visiting.discard(item_id)
        dropped[item_id] = result
        return result

    return [item for item in items if not is_dropped(item.id, set())]


# ============ Planning / Purchased-Leaf Required-Quantity Aggregation ============
#
# Track B (#8 PO-from-BOM, #15 purchased-leaf): a per-part_id counterpart to
# get_quantity_rollup's per-part-NUMBER-STRING rollup below, used by
# app/services/planning_service.py for the planning summary view and PO
# generation. Reuses _drop_excluded_subtrees + _compute_levels_and_effective_qty
# (identical cascade-drop / effective-qty semantics as get_quantity_rollup)
# rather than duplicating traversal logic, and adds ONE more cascade-drop pass:
# when purchased_as_leaf is True, a part flagged part_kind == 'PURCHASED'
# (Part.part_kind — see app/models/part.py) is treated as a NON-exploded leaf.
# Its own BOM line is kept, but every line beneath it in this BOM's tree
# (children, grandchildren, ...) is dropped from the aggregate — mirroring how
# exclude_from_bom drops a line's entire subtree above. This matters for
# planning/procurement: a purchased sub-assembly (e.g. an off-the-shelf motor)
# must be ordered as ONE line, not have its internal components separately
# aggregated/ordered.


def _drop_children_of_purchased(
    items: list[BOMItem], parts_map: dict[int, Part]
) -> list[BOMItem]:
    """Drop every line that has a part_kind == 'PURCHASED' part ANYWHERE in
    its ancestor chain (the purchased line itself is always kept — only its
    descendants are removed)."""
    id_map = {item.id: item for item in items}
    dropped: dict[int, bool] = {}

    def has_purchased_ancestor(item_id: int, visiting: set[int]) -> bool:
        if item_id in dropped:
            return dropped[item_id]
        item = id_map[item_id]
        parent_id = item.parent_item_id
        if parent_id is None or parent_id not in id_map or item_id in visiting:
            dropped[item_id] = False
            return False
        parent = id_map[parent_id]
        parent_part = parts_map.get(parent.part_id) if parent.part_id else None
        if parent_part is not None and (parent_part.part_kind or "").upper() == "PURCHASED":
            dropped[item_id] = True
            return True
        visiting.add(item_id)
        result = has_purchased_ancestor(parent_id, visiting)
        visiting.discard(item_id)
        dropped[item_id] = result
        return result

    return [item for item in items if not has_purchased_ancestor(item.id, set())]


async def get_required_quantities(
    db: AsyncSession, bom_id: int, purchased_as_leaf: bool = True
) -> list[dict]:
    """Planning/PO-generation view: aggregated required quantity per part_id
    across a BOM's full exploded tree (effective qty = own line qty * every
    ancestor's line qty down from the root), honoring the same
    exclude_from_bom cascade-drop as get_quantity_rollup.

    purchased_as_leaf (default True — the sensible default for planning and
    PO generation, unlike the explosion views above which default this
    behavior off to stay backward compatible): see _drop_children_of_purchased.
    """
    await get_bom_or_404(db, bom_id)
    tid = get_tenant_id()
    items_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items = _drop_excluded_subtrees((await db.execute(items_stmt)).scalars().all())

    part_ids = {i.part_id for i in items if i.part_id}
    parts_map: dict[int, Part] = {}
    if part_ids:
        pr_stmt = select(Part).where(Part.id.in_(part_ids))
        if tid is not None:
            pr_stmt = pr_stmt.where(Part.tenantId == tid)
        for p in (await db.execute(pr_stmt)).scalars().all():
            parts_map[p.id] = p

    if purchased_as_leaf:
        items = _drop_children_of_purchased(items, parts_map)

    _, effective_qty = _compute_levels_and_effective_qty(items)

    agg: dict[int, dict] = {}
    for item in items:
        if not item.part_id:
            continue
        part = parts_map.get(item.part_id)
        entry = agg.get(item.part_id)
        if entry is None:
            entry = {
                "part_id": item.part_id,
                "part_number": part.pn if part else None,
                "part_name": part.name if part else None,
                "part_kind": part.part_kind if part else None,
                "unit": item.unit,
                "unit_cost": float(part.cost) if part and part.cost is not None else 0.0,
                "primary_vendor_id": part.primary_vendor_id if part else None,
                "required_qty": 0.0,
            }
            agg[item.part_id] = entry
        entry["required_qty"] += effective_qty[item.id]

    return sorted(agg.values(), key=lambda r: (r["part_number"] or ""))


async def get_quantity_rollup(db: AsyncSession, bom_id: int) -> dict:
    await get_bom_or_404(db, bom_id)
    tid = get_tenant_id()
    # Fetch the FULL item set, then drop each exclude_from_bom line together with
    # its entire subtree (see _drop_excluded_subtrees) so this rollup agrees with
    # the explosion views. Filtering exclude_from_bom in SQL alone would re-root
    # an excluded parent's children and keep counting them.
    items_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items = _drop_excluded_subtrees((await db.execute(items_stmt)).scalars().all())

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
    # Same exclude_from_bom cascade-drop semantics as get_quantity_rollup above.
    items_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items = _drop_excluded_subtrees((await db.execute(items_stmt)).scalars().all())

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


# ============ Mass Rollup (and generic numeric-property rollup) ============
#
# Same sub-assembly -> top multiplication as get_cost_rollup/get_quantity_rollup
# above (effective_qty from _compute_levels_and_effective_qty, exclude_from_bom
# cascade-drop from _drop_excluded_subtrees) but generalized to ANY numeric Part
# column instead of hardcoding cost. get_mass_rollup is the concrete case for
# Part.weight (grams — see app/models/part.py), reached via get_property_rollup
# so a future numeric roll-up (e.g. a custom numeric spec) can reuse the same
# engine without duplicating the level/exclude bookkeeping.


def _rollup_numeric_part_property(
    items: list[BOMItem],
    parts_map: dict[int, Any],
    levels: dict[int, int],
    effective_qty: dict[int, float],
    attribute: str,
) -> tuple[float, dict[int, float]]:
    """Sum getattr(part, attribute) * EFFECTIVE quantity per item, grouped by
    level. Items with no linked part, or whose part has no value for
    `attribute` (None), contribute nothing — mirroring get_cost_rollup's
    `item.part_id in parts_map` guard so an unset property doesn't silently
    count as 0 alongside parts that are genuinely zero.
    """
    total = 0.0
    by_level: dict[int, float] = {}
    for item in items:
        if not item.part_id or item.part_id not in parts_map:
            continue
        part = parts_map[item.part_id]
        raw_value = getattr(part, attribute, None)
        if raw_value is None:
            continue
        extended = float(raw_value) * effective_qty[item.id]
        total += extended
        level = levels[item.id]
        by_level[level] = by_level.get(level, 0) + extended
    return total, by_level


async def get_property_rollup(db: AsyncSession, bom_id: int, part_attribute: str) -> dict:
    """Generic sub-assembly -> top rollup of any numeric Part attribute
    (e.g. "weight" for mass), respecting exclude_from_bom the same way
    get_cost_rollup/get_quantity_rollup do. Not cached itself — callers with a
    stable, named property (like get_mass_rollup below) cache their own
    wrapped result.
    """
    await get_bom_or_404(db, bom_id)
    tid = get_tenant_id()
    # Same exclude_from_bom cascade-drop semantics as get_cost_rollup/get_quantity_rollup.
    items_stmt = select(BOMItem).where(BOMItem.bom_id == bom_id)
    if tid is not None:
        items_stmt = items_stmt.where(BOMItem.tenantId == tid)
    items = _drop_excluded_subtrees((await db.execute(items_stmt)).scalars().all())

    part_ids = [item.part_id for item in items if item.part_id]
    parts_map: dict[int, Any] = {}
    if part_ids:
        pr_stmt = select(Part).where(Part.id.in_(set(part_ids)))
        if tid is not None:
            pr_stmt = pr_stmt.where(Part.tenantId == tid)
        pr = await db.execute(pr_stmt)
        for p in pr.scalars().all():
            parts_map[p.id] = p

    levels, effective_qty = _compute_levels_and_effective_qty(items)
    total, by_level = _rollup_numeric_part_property(
        items, parts_map, levels, effective_qty, part_attribute
    )

    return {
        "bom_id": bom_id,
        "property": part_attribute,
        "total": total,
        "by_level": by_level,
    }


async def get_mass_rollup(db: AsyncSession, bom_id: int) -> dict:
    """Sub-assembly -> top mass rollup: effective_qty * Part.weight (grams)
    per line, grouped by level, excluding exclude_from_bom lines (and their
    entire subtree) exactly like get_cost_rollup/get_quantity_rollup.
    """
    cache_key = f"bom:mass_rollup:{bom_id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    generic = await get_property_rollup(db, bom_id, "weight")
    result = {
        "bom_id": bom_id,
        "total_mass": round(generic["total"], 4),
        "mass_by_level": {k: round(v, 4) for k, v in generic["by_level"].items()},
        "unit": "g",
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
