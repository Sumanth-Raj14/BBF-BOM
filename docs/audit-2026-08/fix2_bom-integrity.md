# fix2_bom-integrity writeup

File: `backend/app/services/bom_service.py`
Test: `backend/app/tests/test_apply_template_closure.py` (new)

## Finding 1 (HIGH) — apply_template skipped BomClosure + webhook — REAL, fixed

Verified in current code: the `apply_template` loop (was ~line 2076) built
`BOMItem` rows directly and committed them without ever calling
`_closure_add_item` (the sole producer of `BomClosure` rows, otherwise only
invoked from `create_bom_item`), and without emitting `bom.item.created`.
Any BOM assembled via "apply template" therefore had permanently broken
closure-backed where-used/explosion for every line it created, and no
downstream webhook subscriber ever saw those items.

Fix: `apply_template` now collects the created `BOMItem` objects, flushes once
to get their ids, calls `_closure_add_item(db, bom.id, tid, item.id,
item.parent_item_id)` for each (same call shape as `create_bom_item`), commits,
then emits `bom.item.created` per item after commit — matching
`create_bom_item`'s exact pattern.

Bonus root-cause fix (discovered while testing #1): the `BOM(...)` construction
in `apply_template` never set `bom_number`, which is `NOT NULL` with no DB
default on `boms`. This made `apply_template` fail its INSERT on *any* real
database (Postgres or SQLite) — it never worked at all, closure bug or not.
Replaced the bare `BOM(...)` + `db.add` + `db.flush()` with a call to the
existing `create_bom()` helper (same file, ~line 112), which already
auto-generates a tenant-scoped `bom_number` — reuse over reinventing, and it
fixes both bugs in the same small diff. Applied the identical fix to
`import_bom`'s `BOM(...)` construction, which had the exact same missing-
`bom_number` defect.

## Finding 2 (MEDIUM) — import_bom fabricates success — REAL, fixed

Verified: `import_bom` (was ~line 1974) never fetches or parses `file_url` —
no existing fetch/parse utility exists anywhere in the codebase to reuse
(checked: no csv/openpyxl/pandas import-from-URL helper). It created an empty
draft BOM and returned `"import_status": "success", "items_imported": 0"`,
which is indistinguishable from a real (if empty) successful import.

Fix (per the ladder: no existing parser to reuse, and building a full
fetch+parse pipeline is a real feature, not a bug fix) — made the function
honest instead of fabricating: `import_status` is now `"not_implemented"`,
`items_imported` stays `0`, and the warning explicitly says parsing isn't
implemented. Callers checking `import_status == "success"` can no longer be
fooled. Still creates the empty draft BOM (matches existing UX intent: "add
items via the BOM Items API") — only the claimed status changed.

## Test

Added `backend/app/tests/test_apply_template_closure.py`:
- `test_apply_template_writes_bom_closure_self_rows` — builds a
  `BomTemplate` + 2 `TemplateBomItem` rows directly, calls
  `bom_service.apply_template`, asserts a `BomClosure` self-row
  (ancestor==descendant==item.id, depth 0) exists for each created item.
  Fails against the pre-fix code with `IntegrityError: NOT NULL constraint
  failed: boms.bom_number` (the bonus bug) and, once that's patched
  separately, would fail with a missing closure row assertion against the
  pre-fix closure-skip bug. Passes after both fixes.
- `test_import_bom_does_not_claim_success_for_unparsed_file` — calls
  `bom_service.import_bom` with a URL, asserts `import_status != "success"`
  and `items_imported == 0`. Fails against pre-fix code (`import_status ==
  "success"`), passes after the fix.

## Verification run

```
TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_<random>.db
python -m pytest app/tests/test_bom_closure.py app/tests/test_bom_items.py \
  app/tests/test_bom_templates.py app/tests/test_bom_enterprise.py \
  app/tests/test_bom_core_correctness.py app/tests/test_apply_template_closure.py -q
=> 29 passed, no regressions.
```

Scratch sqlite db files only; live `bom_db` never touched. No git
add/commit/branch/push performed.
