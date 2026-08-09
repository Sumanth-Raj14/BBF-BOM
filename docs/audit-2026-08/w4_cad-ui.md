# Job: cad-ui

Gave the CAD connector backend (framework + Onshape/Fusion/Altium connectors + routes in
`app/api/endpoints/cad_connectors.py`) a reachable frontend surface. Nothing here existed before
this — no route, no nav entry, no screen.

## Backend surface used (read, not changed)
- `GET /api/v1/cad-connectors/types`
- `GET/POST/DELETE /api/v1/cad-connectors[/{id}]`
- `POST /api/v1/cad-connectors/{id}/test`
- `GET /api/v1/cad-connectors/{id}/documents`
- `POST /api/v1/cad-connectors/{id}/import`
- `POST /api/v1/cad-connectors/altium/import-file` (multipart, credential-free, `dry_run`)

Credential/config field shapes came straight from each connector's own docstring:
- `onshape`: credentials `access_key`, `secret_key`; config `base_url` (optional)
  — `app/integrations/cad/onshape.py`
- `fusion`: credentials `client_id`, `client_secret`, `refresh_token`; config `hub_id`,
  `project_id` (required), `folder_id` (optional) — `FusionCadConnector` docstring in
  `app/integrations/cad/adapters.py`
- `altium` (cloud): credentials `workspace_domain` (required) + optional `access_token` /
  `refresh_token` / `client_id` / `client_secret`; config `bom_query` (optional) —
  `AltiumCadConnector` docstring in `app/integrations/cad/adapters.py`

Any connector type the backend registers later that isn't in this map still works — the form
falls back to raw JSON textareas for credentials/config rather than blocking connection creation.

## What was built
- `frontend/api.js` — new `cadConnectorsAPI` (types/list/create/delete/test/documents/
  importAssembly/importAltiumFile — the last a multipart upload mirroring `importAPI.upload`'s
  FormData/CSRF pattern), registered as `api.cadConnectors` + `window.cadConnectorsAPI`. Kept
  distinct from the pre-existing `cadAPI` (older CAD-sync/PDM-vault surface, different routes).
- `frontend/src/components/screens/CadConnectorsScreen.jsx` (new) — connections table (name,
  type, honest status pill, last error, last sync, Test/Delete actions), an "Add connection"
  modal with per-type credential fields, a connection detail panel with document browsing +
  import-into-BOM modal (new BOM or existing bom_id), and a separate no-credentials Altium
  file-import card with dry-run preview shown before commit.
- `frontend/src/components/LazyScreens.jsx` — registered `CadConnectorsScreen` the same way
  `TraceabilityScreen`/`RequirementsScreen` are (self-registers on `window`, lazy `import()`).
- `frontend/src/components/NavRail.jsx` — added `cad-connectors` nav item under the existing
  "Connectors" section (next to ERP Connectors / Zoho Books).
- `frontend/src/screens/App.jsx` — added the `/cad-connectors` route via `GenericScreen`.
- `frontend/src/components/screens/__tests__/CadConnectorsScreen.test.jsx` (new, 7 tests).

## Honesty requirements (from the job spec)
- Credentials are never echoed back: backend's `_public()` already omits `credentials`; the
  create modal simply closes on success and the list reloads from `_public()` output. Test
  asserts the typed secret values (`AK123`/`SK456`) never appear in the DOM after save.
- Connection status renders exactly as the backend reports it — `unconfigured` → "Not tested
  yet" (neutral), `ok` → "Connected" (success), `error` → "Connection error" (danger) with the
  real `last_error` text shown, never upgraded to "connected" just because a row exists.
- `Test` calls the real endpoint and toasts the honest `{ok, reason, detail}` — a bad/missing
  credential surfaces as `auth_failed`/etc., never a fabricated success.
- A failed document list (bad creds) shows the real error message, not a silent empty list.
- Altium file import always shows the dry-run preview (`items_to_create`/`parts_to_create`/
  component list with grouped designators) before the commit call is available.

## Tests run
- `npx vitest run src/components/screens/__tests__/CadConnectorsScreen.test.jsx` — 7/7 pass.
- `npx vitest run src/__tests__/AppShell.test.jsx` — 2/2 pass (exercises the real App.jsx +
  NavRail.jsx + LazyScreens.jsx wiring end to end, confirming the route/nav edits didn't break
  anything).
- `npx vitest run` (full frontend suite) — 261/261 pass, no regressions from the `api.js` edit.

No backend files were touched (read-only, per the job's file list). No git actions taken.
