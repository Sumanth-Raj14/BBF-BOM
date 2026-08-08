# Audit: backend/app/services + backend/app/integrations

Scope read in full (line-by-line), skipping node_modules/dist/build/__pycache__/.venv/_archive/"reference ui":

services/: approval_service.py, auth_service.py, bom_service.py, catalog_service.py,
dashboard_service.py, derivative_service.py, document_service.py, eco_service.py,
email_service.py, formula_service.py, graph_service.py, inventory_service.py,
part11_service.py, part_service.py, planning_service.py, procurement_service.py,
quality_service.py, reference_seed.py, roles_service.py, search_service.py,
solidworks_contract_service.py, substance_compliance_service.py, webhook_service.py,
work_order_service.py, __init__.py (empty)

integrations/: clickup_client.py, cliq_client.py, crypto.py, events.py, worker.py,
zoho_client.py, zoho_inbound.py, zoho_oauth.py, zoho_snapshots.py, __init__.py (empty)

Total: 33 files read in full (2 are 0-byte __init__.py), ~10,900 lines.

---

## Finding 1 — CRITICAL — cross-tenant bulk delete of Parts (tenant isolation bypass)

File: `backend/app/services/part_service.py:122-127`

```python
async def bulk_delete_parts(db: AsyncSession, part_ids: list[int]) -> int:
    from sqlalchemy import delete

    result = await db.execute(delete(Part).where(Part.id.in_(part_ids)))
    await db.commit()
    return result.rowcount
```

Caller: `backend/app/api/endpoints/parts.py:125-135` — `require_parts_delete` only checks
the caller has the `parts:delete` permission in *their own* tenant; it does not scope
`req.ids` to that tenant at all:

```python
@router.post("/bulk-delete")
async def bulk_delete_parts(req: BulkDeleteRequest, db=..., current_user=Depends(require_parts_delete)):
    deleted = await part_service.bulk_delete_parts(db, req.ids)
```

`delete(Part).where(...)` is a SQLAlchemy Core bulk-DELETE statement. It is NOT caught by
either of the app's two tenant-isolation safety nets in
`backend/app/core/tenant_events.py`:
  - `_register_select_filter` only patches `is_select` ORM statements (`if not
    execute_state.is_select: return`).
  - `_register_update_delete_filter` runs on `before_flush` and only inspects
    `session.dirty` / `session.deleted` — i.e. ORM-tracked *instances already loaded into
    the session*. A Core `delete()` executed via `db.execute()` never touches the
    identity map, so this hook never sees it either.

So `bulk_delete_parts` has **zero** tenant scoping and nothing else in the stack adds it.
Any authenticated user holding `parts:delete` in ANY tenant can delete Part rows belonging
to ANY OTHER tenant by ID (IDs are small sequential integers, trivially guessable/
enumerable). This is silent, permanent data loss across tenant boundaries — a direct
violation of the isolation model documented and enforced everywhere else in this codebase.

Contrast with the correctly-scoped sibling `delete_part` (part_service.py:106-119, ORM
`select().where(Part.id==part_id)` — auto-filtered — then `db.delete(obj)` — checked by
`before_flush`), and with `cascade_clean` in `zoho_inbound.py:634-642`, which explicitly
filters every Core `delete()` by `tenantId == tenant_id`. `bulk_delete_parts` is the only
Core bulk-delete in the services layer missing that filter.

Fix: add `Part.tenantId == tenant_id` (passed in from `current_user.tenantId`, mirroring
`create_catalog`/`create_bom`'s explicit-tenant convention for superuser-safe callers) to
the `delete()` where-clause; the endpoint already has `current_user` available.

---

## Finding 2 — HIGH — `apply_template` bypasses BomClosure maintenance and event emission

File: `backend/app/services/bom_service.py:2050-2093`

```python
async def apply_template(db, template_id, project_id):
    ...
    for ti in template_items.scalars().all():
        db.add(
            BOMItem(
                bom_id=bom.id, part_id=ti.partId, quantity=ti.quantity or 1,
                reference_designator=ti.referenceDesignator, notes=ti.notes,
                sort_order=ti.sortOrder or 0, tenantId=tid,
            )
        )
        items_created += 1
    await db.commit()
```

Every other BOMItem-creating path (`create_bom_item`, bom_service.py:437-492) also calls
`_closure_add_item(db, bom.id, tid, item.id, item.parent_item_id)` to write the
corresponding `BomClosure` self-row (depth 0), and emits
`webhook_service.emit_event(db, "bom.item.created", ...)`. `apply_template` does neither.
I confirmed by grep that `_closure_add_item` (the only producer of `BomClosure` rows,
alongside `_closure_remove_subtree`/`_closure_reparent`) is called from exactly one place
in the whole backend — `create_bom_item` — so every BOMItem created via `apply_template`
permanently has no `BomClosure` row.

Concrete failure this causes: `get_where_used_via_closure` (bom_service.py:956-1036)
resolves ancestor chains *exclusively* through `BomClosure` — it never falls back to
`parent_item_id`. It's also the load-bearing bug for a *second-order* failure: if a user
later adds a child line under a template-created item via `create_bom_item`,
`_closure_add_item`'s ancestor-inheritance step (lines 296-311) queries
`BomClosure.descendant_item_id == parent_item_id` for the parent's own ancestor rows — but
the template-created parent has none — so the new child gets only its own self-row and
never inherits the (missing) ancestor chain. `get_where_used_via_closure` for that child
part will report "no usages above it" even though `BOMItem.parent_item_id` correctly shows
it nested under the template item. This is a real, permanent, silent data-integrity gap for
every BOM created via "apply template," not a transient bug.

Fix: call `await _closure_add_item(db, bom.id, tid, item.id, None)` after each item's
`db.flush()`-assigned id (template items have no `parent_item_id` today, so this is a
one-row self-insert per item), and emit `bom.item.created` for parity with
`create_bom_item`.

---

## Finding 3 — MEDIUM — `import_bom` never imports anything (half-implemented flow)

File: `backend/app/services/bom_service.py:1974-1998`

```python
async def import_bom(db, file_url, project_id, format="csv"):
    if not file_url:
        raise HTTPException(status_code=400, detail="file_url is required")
    ...
    bom = BOM(name=..., description=f"Imported from {file_url} ({format})", ...)
    db.add(bom)
    await db.commit()
    return {
        "bom_id": bom.id, "import_status": "success", "items_imported": 0,
        "warnings": ["BOM structure created. Import items via BOM Items API."],
    }
```

`file_url` is validated as required, stored only in a description string, and never
fetched or parsed — no HTTP GET/download, no CSV/Excel parsing, no `BOMItem` rows created.
The function unconditionally returns `"import_status": "success"` for a call that imported
zero items regardless of what `file_url` pointed to (a good CSV, a 404, a non-BOM file —
all identical outcomes). The one saving grace is the honest `warnings` message, but a
caller that only checks `import_status` (a very plausible pattern given the field's name)
would see "success" for what is actually a no-op stub. This is the "half-implemented flow"
pattern named in the audit brief: a producer (`import_bom`) that returns a positive status
for work it never actually did.

Fix: either implement real parsing (dispatch on `format`, fetch `file_url`, create
`BOMItem` rows) or rename the status/response so callers can't mistake "empty BOM created"
for "items imported."

---

## Finding 4 — LOW — duplicate dead query in `transfer_inventory`

File: `backend/app/services/inventory_service.py:214-243`

```python
wh_stmt = select(Warehouse).where(Warehouse.id == to_warehouse_id)     # 214
...
wh = await db.execute(wh_stmt)                                          # 217
if not wh.scalar_one_or_none(): raise HTTPException(...)                # 218-221  (dest-warehouse check #1)

from_inv_stmt = select(Inventory).where(...).with_for_update()          # 223-226
from_inv = await db.execute(from_inv_stmt)                              # 230        <- result never read

wh = await db.execute(select(Warehouse).where(Warehouse.id == to_warehouse_id))  # 232  (dest-warehouse check #2, identical to #1)
if not wh.scalar_one_or_none(): raise HTTPException(...)                # 233-236

from_inv = await db.execute(                                            # 238-242   <- re-runs the SAME query as line 230
    select(Inventory).where(Inventory.part_id == part_id,
                             Inventory.warehouse_id == from_warehouse_id).with_for_update()
)
from_inventory = from_inv.scalar_one_or_none()                          # 243
```

The destination-warehouse existence check (lines 214-221) and the source-inventory
`SELECT ... FOR UPDATE` (lines 223-230) are each executed, their results discarded, and
then re-executed verbatim (lines 232-236, 238-242). Not a correctness bug (the second run
of each query produces the same answer), but it is dead code left over from a refactor: two
extra round-trips per transfer, including an extra row-lock acquisition, for no behavioral
effect. Low severity, but a clear "delete this" candidate — collapse to one check + one
locked fetch each.

---

## Finding 5 — LOW — duplicate method definition shadows itself

File: `backend/app/integrations/zoho_client.py:329-337` and `:345-349`

```python
    async def list_records(self, module: str, *, params: dict | None = None) -> dict:
        """GET /{module} — one page of records for the incremental inbound poll
        ...
        """
        return await self._request("GET", f"/{module}", params=params)

    async def list_settings(self, kind: str) -> dict:
        ...

    async def list_records(self, module: str, *, params: dict | None = None) -> dict:
        """GET /{module} for the inbound incremental poll / reconciliation. ..."""
        return await self._request("GET", f"/{module}", params=params)
```

`list_records` is defined twice on `ZohoBooksClient` with identical bodies (only the
docstring differs). Python silently keeps the second definition; the first (lines 329-337)
is unreachable dead code — no caller can ever observe it. Harmless behaviorally (both
bodies are the same), but it's the kind of duplication that becomes a real bug the next
time only one copy gets edited. Delete the first definition.

---

## Observations checked and NOT flagged as findings (verified benign)

- **Sequential-count number generation** (`bom_service.create_bom`'s `bom_number`,
  `eco_service.create_eco`'s `eco_number`, `work_order_service.create_work_order`'s
  `wo_number`, `quality_service.create_ncr`'s `ncr_number`,
  `procurement_service.generate_po_number`, `planning_service.generate_po_from_bom`,
  `solidworks_contract_service.generate_part_number`) all read `COUNT(*)+1` without a
  lock, so two concurrent creates in the same tenant can compute the same number.
  Checked the models: every one of these columns has a `UniqueConstraint("tenantId",
  "<number>")` (bom.py:49, eco.py:67, work_order.py:67, quality.py:134,
  po_models.py:52). So a race produces an `IntegrityError`/500, not a silent duplicate
  or data-loss — an availability/UX nit under concurrent load, not a correctness bug.
  Not reported as a standalone finding per file to avoid noise; flagging the pattern once
  here.
- **`substance_compliance_service.py`**, **`zoho_inbound.py`** (both fully read): careful,
  well-documented three-way-merge / race-safe upsert logic (SAVEPOINT + re-select on
  `IntegrityError`); tenant scoping present on every query I checked. No defects found.
- **`webhook_service.emit_event`**: correctly uses `db.begin_nested()` (SAVEPOINT) rather
  than a bare rollback specifically so a webhook-delivery failure can never expire the
  caller's already-committed ORM objects — this is the exact "rollback expires caller ORM
  objects" failure mode the audit brief calls out, and it is handled correctly here.
- **`webhook_service.list_subscriptions`/`get_subscription`/etc.**: tenant checks are
  present (`current_user.isSuperuser` bypass + explicit `tenantId` equality), all sound.
- **`dashboard_service.py`, `search_service.py`**: build raw SQL via `text()` but only
  interpolate fixed literal fragments (`tf`/`tc_*` are internally-constructed strings, not
  user input); actual values always go through bound parameters. Not an injection risk.
- **`_check_ip_rate_limit`** (auth_service.py) and **`_default_rate_limiter`**
  (zoho_client.py) are in-process, single-instance state — fine for this app's stated
  single-tenant/on-prem-first deployment model; would need a shared store for a
  multi-process/horizontally-scaled deployment, not a bug in the current architecture.
