# mbom-hierarchy

## What changed

1. **`backend/app/models/mbom.py`** — `MbomItem` gets `parent_item_id`
   (nullable, self-FK `mbom_items.id` ON DELETE CASCADE, indexed) plus
   `children`/`parent` relationship, mirroring `BOMItem.parent_item_id` in
   `app/models/bom.py` exactly (`remote_side=[id]`, `lazy="selectin"`).

2. **`backend/alembic/versions/057_mbom_hierarchy.py`** — new head,
   `revision = "057_mbom_hierarchy"`, `down_revision = "056_cad_connections"`.
   `batch_alter_table` add_column + separate `create_index`, same shape as
   045's `bom_items_master.image_document_id` addition. Nullable/additive,
   no Postgres-only DDL, no dialect guard needed (batch_alter_table already
   handles SQLite). Verified: `alembic heads` → single head, `057_mbom_hierarchy`.

3. **`backend/app/services/bom_service.py`** (`derive_mbom_from_ebom`) — was a
   flat copy. Now two passes: pass 1 creates every `MbomItem` (skipping
   partless lines, as before) and does one `flush()` to get their new ids;
   pass 2 walks an `old_id -> new_id` map and sets each new item's
   `parent_item_id` from its source `BOMItem.parent_item_id`. Doesn't assume
   source ordering (parent-before-child), since the map is built before any
   parent gets assigned. An old parent that was itself skipped (partless, or
   simply absent) leaves the child parentless rather than fabricating a link
   — same "skip, don't fake" rule the partless-line case already used.
   Source EBOM (`boms` + `bom_items_master`) is never written to — still
   pure `select()`.

4. **`backend/app/api/endpoints/mbom_api.py`**:
   - `_item_dict` now returns `parent_item_id` — the read path
     (`GET /mbom/headers/{id}` and `GET /mbom/headers/{id}/items`) exposes
     the flat parent-pointer list a consumer renders as a tree from
     (identical representation style to `BOMItem`'s own base serialization
     in `bom_service._serialize_bom_item`).
   - `MbomItemCreateRequest`/`MbomItemUpdateRequest` gained `parent_item_id`
     (was previously impossible to set except via derivation).
   - New `_require_parent()` helper (mirrors `bom_service._validate_parent`):
     rejects a parent that isn't a line in the *same* mbom_id + tenant, and
     rejects self-parenting. Wired into both create and update.

5. **`frontend/src/components/screens/MbomScreen.jsx`** — one contained
   change: the item detail table's Part column now indents by sub-assembly
   depth (walked from the flat `parent_item_id` list, cycle-guarded) and
   prefixes nested rows with "└ ". No nav/layout/screen changes.

## Proof (backend/app/tests/test_xbom.py, section 7, new)

- `test_derive_mbom_preserves_parent_child_structure` — 3-level EBOM
  (assembly → sub-assembly → leaf) derives to an MBOM with the *same*
  parent/child shape (via new ids) and the *same* quantities (1/2/5, not
  coerced), then re-reads the source EBOM afterward and asserts every
  line's `(id, part_id, quantity, parent_item_id)` is byte-for-byte
  unchanged.
- `test_derive_mbom_hierarchy_tenant_isolation` — same nested derivation
  under tenant A's context, then an explicit `TenantContext.set` to tenant B
  and a plain `select(MbomItem)` — asserts zero rows visible (ORM
  auto-filter, not just a 404 on direct lookup).

## Test run (this session, scratch sqlite dbs, deleted after)

```
TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_mbom_057.db python -m pytest app/tests/test_xbom.py -q
  -> 16 passed
TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_mbom_full.db python -m pytest app/tests/test_xbom.py app/tests/test_bom_enterprise.py -q
  -> 21 passed
cd frontend && npx vitest run src/__tests__/MbomScreen.test.jsx
  -> PASS (5) FAIL (0)
alembic heads -> 057_mbom_hierarchy (head)   # single head confirmed
```

No live Postgres touched, no `backend/sweep.db` touched, both scratch dbs deleted.

## Skipped (ponytail)

- No nested "children" JSON tree endpoint — the flat `parent_item_id` list
  is the same representation `BOMItem` itself uses; a consumer builds the
  tree client-side from it (that's what the MbomScreen depth-indent change
  does). Add a server-built nested tree only if a real consumer needs
  server-side tree assembly (e.g. an export format), not speculatively.
- No cycle-detection beyond "not self" on `_require_parent` — matches
  `bom_service._validate_parent`'s existing scope exactly; a longer-cycle
  guard would be new scope beyond parity with the EBOM side.
