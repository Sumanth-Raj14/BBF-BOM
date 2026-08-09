# honest-import — writeup

## JOB 1 — /process fabricated-success path

**Chosen: (a) — made /process genuinely perform the import**, delegating to the
same write logic /commit uses. Chose (a) over removing the route because it
has a live caller: `frontend/src/root/integration-screens.jsx` line 835
(`BulkImportScreen.handleUpload`) calls `bulkImportAPI.process(jobId, {})`
after upload and shows a "processing started (N processed)" toast — exactly
the fabricated-success surface the audit flagged, reachable from the real UI,
not dead code. `frontend/api.js` line 1008 is the only other reference
(the API wrapper itself). Removing the route would have broken that screen;
"superseded" error would have regressed it further. No test file besides
`backend/app/tests/test_bulk_import.py` calls it.

**What changed:**
- Extracted the row-mapping+validate+upsert loop that used to live only
  inside `commit_import` into a new shared function
  `import_service.commit_rows(db, import_rows, mapping, entity, tenant_id)`
  — the ONE place that writes Part rows for a bulk import. `/commit` now
  calls it too (no behavior change there, pure extraction — same tests pass
  unmodified).
- `/process` (`process_import` in `bulk_import.py`) now: validates the
  mapping targets, stores `{"entity", "mapping"}` on the job (same shape
  `/mapping` uses), then calls `import_service.commit_rows` on the job's
  pending rows. A "processed" row now means a real `Part` was actually
  created/updated — created=0 with errorRows>0 is what an empty/bad mapping
  now honestly reports, instead of a blanket "completed, N processed".
- `mappingConfig`'s shape changed from the old (buggy) `{target_field:
  source_field}` reversed convention to the same `{file_column:
  entity_field}` shape `/mapping`'s `mapping` field uses — the two "shapes
  lined up" once you invert the old convention, so no duplicate write path
  was needed. The one live caller passes `{}` either way, so this is not a
  behavioral regression for it; a real column-mapping UI (not built) would
  need to follow the same convention `/mapping` already documents.
- Removed the now-dead `IntegrityError` import from `bulk_import.py`
  (write-path error handling moved into `import_service.commit_rows`).

Files touched: `backend/app/api/endpoints/bulk_import.py`,
`backend/app/services/import_service.py`.

## JOB 2 — quantity coalescing

Fixed `backend/app/services/bom_service.py`:
- `derive_mbom_from_ebom`: `quantity=item.quantity or 1` →
  `quantity=item.quantity if item.quantity is not None else 1`.
- `apply_template`: same bug, same fix —
  `quantity=ti.quantity or 1` → `quantity=ti.quantity if ti.quantity is not None else 1`.
  (Found via the grep below; same "0 becomes 1" pattern, same file.)

**Grep of `X or <default>` on numeric fields in bom_service.py** (and
`uom_service.py`/`export_service.py`, since they're on the same import path)
— everything else found uses `or 0`, where the fallback already equals the
only falsy legitimate value, so there's no information loss (`0 or 0 == 0`,
same as an explicit `is not None` check would give):
- `bom_service.py:922,1015` — `item.part_id or 0` — placeholder for a
  nullable FK in tree serialization; part ids are never 0, not a quantity
  field. Left alone.
- `bom_service.py:1139` — `qty = float(item.quantity or 0)` in
  `_compute_levels_and_effective_qty` — default 0 matches the only falsy
  legit value. Left alone.
- `bom_service.py:1441` — `float(part.cost or 0)` — same reasoning. Left alone.
- `bom_service.py:2257` — `sort_order=ti.sortOrder or 0` — same reasoning
  (0 is both the legit first-position value and the fallback). Left alone.
- `uom_service.py:296-297` — `quantity or 0` / `unit_cost or 0` — same
  reasoning. Left alone.
- `export_service.py:345,360` — `item.quantity or 0` / `unit_cost or 0` —
  same reasoning. Left alone.

Only the two `or 1` occurrences actually swallow a legitimate 0 into a wrong
nonzero default; both are fixed.

## Tests

- `backend/app/tests/test_xbom.py::test_derive_mbom_preserves_explicit_zero_quantity`
  (new) — EBOM line with `quantity=0` survives derivation as `0`, not `1`.
- `backend/app/tests/test_bulk_import.py::test_process_import` (updated) —
  now asserts the `Part` row was actually created (`processedRows == 1`,
  `Part.pn == "PROC-001"` exists), not just a status-completed response.
- `backend/app/tests/test_bulk_import.py::test_process_import_does_not_fabricate_success_on_bad_mapping`
  (new) — empty mapping → `processedRows == 0`, `errorRows == 1`, and no
  `Part` row created — proves /process no longer reports success without
  doing the work.

Ran: `TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_*.db python -m pytest
app/tests/test_bulk_import.py app/tests/test_xbom.py
app/tests/test_apply_template_closure.py app/tests/test_export_service.py -q`
→ **51 passed** (36 + 15), scratch DBs deleted after.

## Not touched
- Frontend (`integration-screens.jsx`, `api.js`) — not in the file list for
  this job; only grepped to find/confirm the live caller. The UI still
  passes `{}` as mappingConfig (no column-mapping step in that screen), so
  after this fix it will now honestly report 0 created / N errors on a
  real file, rather than fabricated success. Wiring an actual mapping UI
  into that screen is a separate follow-up, not done here.
