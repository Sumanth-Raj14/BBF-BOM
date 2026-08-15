# dead-fakes writeup

## Reachability check first — the FIX_COVERAGE.md premise was stale

Traced from `frontend/src/main.jsx` before touching anything. Result: **5 of the 6
"dead layer" targets are actually live and reachable today**, wired to real nav
triggers — the audit note is out of date. Only one file was genuinely unreachable.

- `main.jsx` eagerly imports `./root/modals-extra.jsx` and `./root/detail-drawer.jsx`.
- `modals-extra.jsx` re-exports `ProfileModal/SettingsModal/ImportRFQsModal/
  QuoteHistoryModal/AutoScrapeModal` onto `window.*`.
- `screens/App.jsx` (mounted via `root/app.jsx`) renders `<ModalsHost/>`, which
  renders all five behind `modal === "..."` gates.
- Real triggers exist: `NavRail.jsx` → `setModal("profile"|"settings")`,
  `TopBar.jsx` → `setModal("settings")`, `ProcurementScreen.jsx` →
  `openModal("import-rfqs")`, `VendorsScreen.jsx` → `openModal("quote-history", v)`,
  `detail-drawer.jsx` + `BomEditorScreen.jsx` → `openModal("auto-scrape", row)`.
- `BomEditorScreen.jsx` is lazy-loaded but for a real route: `LazyScreens.jsx`
  exports `BomShell`, mounted at `<Route path="/bom" .../>` in `App.jsx`.

So these 5 are landmines that are already armed, not dormant.

**`SourcingView.jsx` was the one genuine orphan**: no file anywhere does
`import`/`import()` on it, so `window.SourcingView` (line 236, self-assigned)
never executes even though `BomEditorScreen.jsx` renders `<window.SourcingView>`
on the sourcing tab. Also: its own fabrication (charCodeAt-based alt-vendor
counts) had **already been fixed** in a prior wave — it now calls the real
`GET /part-vendors` via `api.partVendors.list()` with proper loading/error/"no
data" states, and `src/__tests__/SourcingView.altVendors.test.jsx` already
covers it and passes. Nothing to fabricate-fix here; left untouched. The
missing-import wiring bug lives in `BomEditorScreen.jsx`, which is outside this
job's file list — flagging it rather than fixing it.

## Per-file decision

**AutoScrapeModal.jsx — (b) empty/unavailable state.** No endpoint exists for
"look up a part by number across 5 distributor sites and merge fields" — only
`POST /scraping/scrape`, which fetches ONE distributor URL (already wired
honestly in `InternetScrapeModal.jsx`, reachable via the real "scraping" modal).
Replaced the fake progress bar → hardcoded STM32H743 dataset → fake "applied"
toast with a static message pointing at the real Internet Scraping feature.
Same `(open, onClose, row)` signature, so `ModalsHost.jsx` / `detail-drawer.jsx`
/ `BomEditorScreen.jsx` (all out of scope) keep working unmodified.

**ImportRFQsModal.jsx — (b) empty/unavailable state.** "4 quotes detected from
inbox" needs an email-parsing backend that doesn't exist. The identical
feature was already fixed this way elsewhere in the codebase
(`EmailParseModal` in `root/power-features.jsx`) — matched that precedent
instead of inventing a new empty-state pattern. Dropped the accept/reject
list and the "Import accepted" button (it never imported anything).

**QuoteHistoryModal.jsx — (a) wired to a real endpoint.** No "quotes" table
exists, but `GET /price-history?vendorId=` does (`api.priceHistory.list`) —
the honest analog: real recorded prices over time per vendor, not invented
RFQ quote numbers/statuses. Added loading/error/empty states (mirrors the
SourcingView pattern: never falls back to a number on failure). Dropped the
fake "New RFQ" button (only toasted) and the fake per-row "Opening {id}" toast.

**ProfileModal.jsx — (a)+(b) hybrid.** Wired the display to the real
`GET /auth/me` (`api.auth.getMe`) with loading/error states, replacing the
hardcoded "Elena Chen". Checked `PUT`/`PATCH /users/{id}` in
`backend/app/api/endpoints/users.py` — both require `get_current_superuser`,
so there is no self-service profile-update endpoint for a regular user.
Dropped "Save changes" entirely (it only toasted before) rather than leave a
button that can't work; fields are read-only with an explicit note.

**SettingsModal.jsx — (a)+(b) mixed per tab.** This one had five fabricated
tabs; verified each against the backend individually:
- *Members* → real `GET /users` (`api.users.list`), loading/error/empty.
- *Roles & permissions* → real `GET /rbac/roles` + `GET /rbac/permissions`
  (`api.rbac.roles/permissions`); dropped the fabricated editable matrix
  since roles/permissions and the `usersAPI` list are separate systems with
  no per-member role field to render truthfully.
- *Integrations* → real `GET /integrations/` (via `apiRequest`, no new
  `api.js` helper needed since `apiRequest` is already exported). The fabricated
  cards named fake providers (SolidWorks/NetSuite/Slack/Drive/Jira); the real
  endpoint only knows `clickup/cliq/zoho_books`, and a full real management UI
  already exists (`components/screens/IntegrationsScreen.jsx`, with real
  connect/test-connection/disconnect). So this tab now shows a read-only
  summary of real connections plus a "Manage" button that navigates to the
  real screen, instead of duplicating fake connect/disconnect toasts.
- *Billing* → no billing backend exists anywhere in the API. Honest
  "not available in this deployment" empty state, no fake plan/invoice/buttons.
- *Danger zone* (Export/Delete workspace) → dropped entirely. The only
  candidate endpoint, `GET /user-sync/export-all`, only dumps a small
  per-user `user_data_store` table — using it to back a button labeled
  "archive of BOMs, vendors, documents, and audit logs" would just swap one
  false claim for another, so it's not wired.
- *General* tab kept only the one thing that was already real and working:
  the accessibility toggles (`toggleA11yMode`, persisted via `AppContext`).
  Dropped the fabricated workspace-name/currency/date-format/description
  inputs (nothing ever saved them); added a one-line pointer to the real
  Tenant Settings modal.
- Footer "Save changes" (only ever toasted) removed; footer is just Close.

## Files touched
- `frontend/src/components/modals/AutoScrapeModal.jsx`
- `frontend/src/components/modals/ImportRFQsModal.jsx`
- `frontend/src/components/modals/QuoteHistoryModal.jsx`
- `frontend/src/components/modals/ProfileModal.jsx`
- `frontend/src/components/modals/SettingsModal.jsx`
- `frontend/src/components/SourcingView.jsx` — verified only, **not modified**
  (already fixed by a prior wave; confirmed via existing passing test).
- New tests: `frontend/src/__tests__/AutoScrapeModal.test.jsx`,
  `ImportRFQsModal.test.jsx`, `ProfileModal.test.jsx`, `QuoteHistoryModal.test.jsx`,
  `SettingsModal.test.jsx`.

Did not touch `LazyScreens.jsx` / `NavRail.jsx` / `screens/App.jsx` /
`BomEditorScreen.jsx` / `api.js` (out of scope) — read-only for tracing.

## Tests
`npx vitest run src/__tests__` from `frontend/`: **80 passed, 1 failed**
(`dataService.test.js` — pre-existing, unrelated to this job's files, a
sync-status test elsewhere in the shared tree). All 9 tests touching the six
target files pass, including the pre-existing `SourcingView.altVendors.test.jsx`.
