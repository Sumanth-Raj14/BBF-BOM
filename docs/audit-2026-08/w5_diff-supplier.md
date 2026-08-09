# diff-supplier — findings and fixes

## 1. /diff — 404s on `/api/v1/bom/compare` and `/api/v1/bom/2/snapshots`

**Root cause confirmed by curling the live sweep backend directly** (not a
SQLite-dialect artifact): the endpoints are named and mounted correctly
(`POST /api/v1/bom/compare`, `GET /api/v1/bom/{bom_id}/snapshots` both exist
and work). The fixture simply has one BOM — id 1. `DiffScreen.jsx` hardcoded
`bom1Id=1, bom2Id=2`; BOM id 2 doesn't exist ⇒ backend correctly returns 404
`"BOM not found"` for both calls.

```
GET /api/v1/bom/1        -> 200 (real BOM)
GET /api/v1/bom/2        -> 404 {"detail":"BOM not found"}
POST /api/v1/bom/compare {bom_id_1:1, bom_id_2:2} -> 404 BOM not found
```

Also found a second latent bug while tracing this: the snapshots call used
`bom2Id` (the hardcoded "2") instead of the current BOM's id — snapshots
should be listed for the BOM actually open, not the phantom comparison
target.

**Fix** (`frontend/src/components/screens/DiffScreen.jsx`,
`frontend/src/screens/App.jsx`, `frontend/api.js`):
- `AppCtx`'s real `bomId` is now threaded through `DiffScreenWrapper` as a
  prop, so `bom1Id` is the BOM the user is actually looking at, never a
  hardcoded literal.
- Added `bomEnterprise.list()` to `api.js` (already-existing backend route
  `GET /bom/`, just not wired into the client) and used it to discover
  whether any *other* real BOM exists to diff against. Only fires
  `compare()` when one genuinely does.
- Fixed the snapshots call to use the current BOM's id, not the old
  hardcoded partner id.
- When no second BOM/revision exists, the screen now renders an honest
  "Nothing to compare yet" empty state instead of firing a 404-bound
  request or falling back to fabricated demo diff data. Fixed a latent
  crash in that path too (`a.ver`/`b.ver` accessed when `a`/`b` are null).

Test: `frontend/src/__tests__/DiffScreen.test.jsx` — asserts `compare()` is
never called when only one BOM exists (empty state shown instead), and that
it's called with the real discovered ids `(1, 7)` when a second BOM exists,
never a hardcoded pair.

## 2. /supplier-portal — 403 on GET /supplier-portal/price-updates

**Correct-by-design, not a bug.** `list_price_updates` is intentionally
scoped to `get_current_supplier_user` (a supplier's own portal login), and
returns 403 (not 401) on purpose for non-supplier tokens — this is
documented in the endpoint's own test
(`backend/app/tests/test_supplier_portal.py::test_submit_price_update_unauthorized`,
comment: "the supplier-token realm intentionally returns 403 ... so the
app's shared API client doesn't log the user out"), and
`test_list_price_updates` proves it works correctly for a real supplier
session. An admin session genuinely has no supplier role — 403 is right.

The actual bug is on the frontend: the **admin-facing** `SupplierPortalScreen`
(`frontend/src/root/integration-screens.jsx`) calls this supplier-only
endpoint with the admin's own session, which can never succeed, and
silently swallowed the failure into an "0 submissions" empty table —
indistinguishable from "no data" when it's really "not permitted".

**Fix**: catch the 403 specifically and render an honest "Not available for
your role" panel in the price-updates card, explaining that a supplier
login is required to see submissions — while the (already-working,
admin-scoped) supplier-users list continues to load normally.

Backend was **not** touched — the permission there is correct.

Test: `frontend/src/root/__tests__/SupplierPortalScreen.test.jsx` — asserts
the "not available for your role" message renders on a 403, not a blank/
failed table.

## 3. Route sweep coverage gap

Added `"/cad-connectors"` to `ROUTES` in
`frontend/e2e/route-sweep.spec.js` (verified the route exists in
`frontend/src/screens/App.jsx`). No other lines in that file were touched.

## Files touched
- `frontend/src/components/screens/DiffScreen.jsx`
- `frontend/src/screens/App.jsx` (thread `bomId` into `DiffScreenWrapper`)
- `frontend/api.js` (added `bomEnterprise.list()`)
- `frontend/src/root/integration-screens.jsx` (`SupplierPortalScreen`)
- `frontend/e2e/route-sweep.spec.js` (ROUTES list only)
- `frontend/src/__tests__/DiffScreen.test.jsx` (new)
- `frontend/src/root/__tests__/SupplierPortalScreen.test.jsx` (new)

## Verification
- `npx vitest run` (frontend): 270/271 passing. The 1 failure
  (`api-contract.test.js`, doubled `/compliance/compliance/...` paths) is
  pre-existing and unrelated to this job's scope (it's the compliance
  500s/doubled-path bug called out for a different fix job).
- Curled the live sweep backend directly to confirm root cause before
  changing anything (BOM id 2 doesn't exist; endpoints are named/mounted
  correctly).
- No backend files were modified — the supplier-portal permission is
  correct-by-design and left as-is.
