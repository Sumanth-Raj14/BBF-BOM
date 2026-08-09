# frontend-new audit — detail notes

Files read in full:
- frontend/src/components/screens/CadConnectorsScreen.jsx
- frontend/src/components/modals/ExportDialog.jsx
- frontend/src/components/screens/MbomScreen.jsx
- frontend/src/components/screens/RequirementsScreen.jsx
- frontend/src/components/modals/BulkImportModal.jsx
- frontend/src/services/dataService.js
- frontend/src/utils/download.js
- frontend/api.js (full, 1811 lines, read in two chunks)
Cross-referenced (to verify claims, not part of the assigned scope but load-bearing
for findings below):
- backend/app/api/endpoints/bom_enterprise.py (list_boms)
- backend/app/models/bom.py (Bom.bom_number column)
- backend/app/api/endpoints/mbom_api.py (_header_dict, get_mbom_header)
- backend/app/api/endpoints/requirements_api.py, backend/app/schemas/requirement.py
- frontend/src/context/AppCtx.jsx (migrateToBackend call site)
- frontend/src/components/ui/Toast.jsx + ui.css (toast kind styling — confirmed fine)
- frontend/src/utils/toast.js

## Finding 1 — MbomScreen "BOM #" column always blank (bom_number omitted from API response)

MbomScreen.jsx bomColumns (line ~129-131):
```
key: "bom_number",
render: (b) => <span className="font-mono fs-11">{b.bom_number}</span>,
```
Backed by `api.bomEnterprise.list(params)` -> `GET /bom/` (bomEnterpriseAPI.list override,
api.js line 1736). Backend `list_boms()` in backend/app/api/endpoints/bom_enterprise.py
(lines 113-136) returns per-row dict:
```
{"id": b.id, "name": b.name, "description": b.description, "status": b.status,
 "version": b.version, "bom_type": b.bom_type}
```
`bom_number` is never included, even though it's a real, required column
(`backend/app/models/bom.py:28` `bom_number = Column(String, nullable=False)`, unique per
tenant). Every row of the new "Bills of Material" table in MbomScreen will render an empty
BOM # cell for every BOM, on every load — not a corner case, 100% of rows. This is exactly
the "endpoint that cannot work as intended" / silent-wrongness class the audit is hunting
for: the column exists in the UI, the field exists on the model, but the serializer between
them drops it.
Fix: add `"bom_number": b.bom_number` to the dict comprehension in list_boms.

## Finding 2 — RequirementsScreen swallows linked-parts fetch failures as "uncovered"

RequirementsScreen.jsx `openRow()`:
```js
const openRow = async (row) => {
  setSelected(row);
  setLinkPartId("");
  try {
    const parts = await api.requirement.linkedParts(row.id);
    setLinkedParts(Array.isArray(parts) ? parts : []);
  } catch {
    setLinkedParts([]);
  }
};
```
Any failure (network blip, 500, auth hiccup) is caught and silently mapped to an empty
array, with no error state, no toast, nothing shown to the user. The detail panel then
renders: "No parts linked yet — this requirement is uncovered." This is indistinguishable
from the real "genuinely has zero links" case. The file's own header comment frames
coverage as *the* differentiator feature ("the coverage view that answers the question a
quality/regulatory user actually asks: which requirements have NO part behind them yet"),
so a masked fetch failure here can make a fully-covered requirement look uncovered to a
quality/regulatory reviewer — a textbook "silent wrongness" case. Note this is inconsistent
with the same file's own `loadCoverage()` (surfaces a toast on failure) and with
CadConnectorsScreen's `openConnection()` (explicitly comments that it must not produce "a
silent empty list that reads as 'no documents exist'" and sets a visible `docsError`
instead) — i.e. the correct pattern already exists elsewhere in this same PR/wave and just
wasn't applied here.
Fix: track a `linkedPartsError` (mirroring `docsError` in CadConnectorsScreen) and render it
instead of pretending the requirement has 0 links.

## Finding 3 (low) — dataService.migrateToBackend() is dead code, always a no-op

frontend/src/services/dataService.js lines 426-488: `bomRows = null`, `ecrs = null`,
`templates = null` are hardcoded (never populated from anywhere), so every conditional body
in the function is unreachable and it always resolves to
`{migrated: [], skipped: [], errors: []}`. It's invoked fire-and-forget (no `.then`/`.catch`)
from `frontend/src/context/AppCtx.jsx:207` (`dataService.migrateToBackend();`) right after a
"connected" success toast. It doesn't fabricate a success message on its own (it just quietly
does nothing), so this is dead code / vestigial migration shim rather than a fabrication bug —
flagging as low severity / cleanup candidate, not a functional defect users will notice.

## Things checked and found OK (no finding)

- **dataService.js sync-queue poison fix**: `isPoisonEntry()` correctly identifies
  create/update entries whose payload is an Array (the shape that can never succeed against
  a single-entity endpoint) and drops them at `loadQueue()` time, rewriting localStorage so
  the drop is permanent. `processQueue()`'s permanent-vs-transient split
  (`status>=400 && <500 && !=408 && !=429` => drop; otherwise => re-enqueue + break) correctly
  drops deterministic 4xx failures (e.g. 409/422) and correctly retries network errors / 5xx /
  408 / 429, matching the description and api.js's own circuit-breaker distinction. Verified by
  tracing both the localStorage-load path and the runtime processQueue path; no gap found.
- **CadConnectorsScreen credential handling**: secret fields render as `type="password"`,
  `autoComplete="off"`; the create() success path never re-populates the form with the
  submitted values — it just closes the modal and reloads the connection list. The backend
  create response is documented as omitting `credentials` entirely, and the screen never
  attempts to read/display them back. openAdd() also fully resets form state on every open,
  so no stale credential state leaks across sessions. No DOM echo found.
- **CadConnectorsScreen honesty**: load(), openConnection() (documents), and altium
  import/preview all show explicit error banners on failure rather than falling back to
  empty/fabricated rows; status pills render the backend's literal
  `unconfigured|ok|error` + `last_error`, never upgraded to "connected" just because a row
  exists.
- **BulkImportModal**: fully driven by the real upload -> mapping -> commit job lifecycle;
  no client-side fabricated "imp-<timestamp>" rows (per its own header comment describing the
  prior bug it replaced). Loading/error states present at every step (uploading, validating,
  committing spinners + `error` banner).
  - ExportDialog: fixed FORMATS list is documented/justified as a backend contract constant;
  columns and templates are always fetched live; the actual file always comes from
  `POST /export` (server-generated blob), no client-side CSV/XLSX synthesis path here.
- **api.js apiRequest()**: 401 handling correctly distinguishes auth-entry endpoints from
  session refresh; the client-error/circuit-breaker split (A4 audit fix comments) correctly
  avoids retrying non-idempotent verbs and avoids treating 4xx as a circuit-breaker health
  signal. No new issues found in the ~1800 lines beyond what's already flagged/commented by
  prior audit passes in the file itself.
