# JOB: import-mapping-ui

## What I found before touching anything

Read `backend/app/api/endpoints/bulk_import.py`, `backend/app/services/import_service.py`,
and `backend/app/schemas/bulk_import.py` first, per the job instructions. Confirmed the
real contract: `POST /import/upload` (multipart file+entity) -> `{job_id, detected_columns,
sample_rows, row_count}`; `POST /import/{job}/mapping` (`{mapping: {file_col: entity_field}}`)
-> `{valid, errors:[{row,column,message}], will_create, will_update}` WITHOUT writing;
`POST /import/{job}/commit` -> `{created, updated, failed, errors:[{row,message}]}`.
Part-importable fields come from `import_service.PART_FIELDS` (pn, name, description, rev,
qty, uom, category, subCategory, mpn, htsCode, unspscCode, eccn, vendor, manufacturer, cost,
lead, origin, status, assembly, barcode, material, weight, dimensions, imageUrl, freight,
tax, landedCost, cadUrl); required = {pn, name}; natural key = pn.

Then discovered the fix was already half-done by a concurrent agent/cluster
("CLUSTER export-import-frontend"):

- `frontend/api.js` already has `importAPI.upload/mapping/commit` (lines ~1072-1091) hitting
  exactly the three real endpoints above — no changes needed there.
- `frontend/src/components/modals/BulkImportModal.jsx` was **already fully rebuilt**: real
  upload -> auto-guessed mapping UI -> `/mapping` validate (blocks commit on errors, shows
  server row errors) -> `/commit` -> honest created/updated/failed report. Already covered by
  `frontend/src/__tests__/BulkImportModal.test.jsx` (6 tests, all passing).
- This modal is already mounted globally by `ModalsHost.jsx` under `modal === "bulk-import"`
  and already opened from NavRail's command palette, the onboarding checklist, and a CSV
  drag-drop handler in `App.jsx`.

What was **not** done: `BulkImportScreen` (the screen NavRail's "Bulk Import" nav item
actually routes to, via `/bulk-import`) still called the dead `bulkImportAPI.upload()` +
`bulkImportAPI.process(jobId, {})` path — same bug the job described, honestly reporting 0
created because no mapping was ever supplied.

## Fix (frontend/src/root/integration-screens.jsx, BulkImportScreen only)

Per the ladder: rather than rebuild a second mapping UI inside the screen, reuse the
already-correct, already-tested `BulkImportModal` the same way every other reachable entry
point already does (NavRail/command-palette/onboarding all just call
`ctx.openModal("bulk-import")` — ModalsHost renders the one shared modal instance).

- Deleted the screen's own dead dropzone/file-input/`handleUpload` (called `/process` with
  `{}`) — ~65 lines gone, no replacement mapping UI needed since one already exists.
- `BulkImportScreen`'s "Start Import" button now calls `ctx.openModal("bulk-import")`
  (`ctx = useAppStore()`, bare-global convention already used by this file for
  `Icon`/`bulkImportAPI`/`React`).
- Added a `ctx.modal` watcher (same pattern `VendorsScreen.jsx` already uses for its own
  bulk-import/new-vendor modals) that re-fetches `GET /import/jobs` when the modal transitions
  away from `"bulk-import"`, so a completed import shows up in the History table without a
  manual reload.
- Did not touch `BulkImportModal.jsx`, `ModalsHost.jsx`, `NavRail.jsx`, or `App.jsx` — the
  wiring (`modal === "bulk-import"` key, the route, the nav item) already existed and is
  untouched.

## Tests (new file, all passing)

`frontend/src/root/__tests__/BulkImportScreen.test.jsx` — renders `BulkImportScreen` together
with the real `BulkImportModal` under a minimal stand-in for the app's modal context (mirrors
how `ModalsHost` actually wires them), with a mocked `api.import.*`:

1. "Start Import" opens the real column-mapping modal (not the old `/process({})` call).
2. Upload -> mapping shown -> `/mapping` reports row errors -> commit button stays disabled,
   `commit` never called.
3. Upload -> mapping -> valid -> commit -> real `created/updated/failed` counts rendered ->
   closing the modal re-fetches `/import/jobs` (history reload proven via a second `list()`
   call).
4. A rejected upload surfaces the real error message; `mapping`/`commit` never called
   (honest failure path).

`npx vitest run` (full suite): **276 passed, 0 failed** — no regressions elsewhere.

## api_js_added

Nothing appended. `importAPI.upload/mapping/commit` in `frontend/api.js` (lines ~1072-1091)
already matched the backend contract exactly (added by a concurrent agent before this job
started) — verified against `backend/app/api/endpoints/bulk_import.py` request/response
shapes rather than guessing.

## Reachability (manual path a user takes)

NavRail -> "Bulk Import" -> `/bulk-import` route -> `BulkImportScreen` -> "Upload & Import"
button -> opens the same modal as the command palette's "Bulk import" action -> drop a
CSV/XLSX -> real detected columns shown -> map columns to part fields -> "Next: Review" runs
the real `/mapping` validate call and shows per-row errors if any -> "Import" runs the real
`/commit` call and shows real created/updated/failed counts -> "Done" closes the modal and the
screen's Import History table re-fetches and shows the new job row.
