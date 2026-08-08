# FE-core scan findings

## 1. [HIGH] Fabricated BOM ribbon/tab stats shown as real, hardcoded regardless of actual data
File: frontend/src/screens/BomEditorScreen.jsx
Lines: 264, 276, 283, 292, 298, 501

```jsx
<button className={"tab " + (bomTab === "hierarchy" ? "active" : "")} ...>
  {__t("bomShell.tabHierarchy")} <span className="count">87</span>
</button>
...
<button ...>{__t("bomShell.tabFlatList")} <span className="count">64</span></button>
...
<div className="delta up">▲ +3d STM32H7</div>          // Critical Lead ribbon cell
...
<div className="delta up">▲ 1 supplier · 1 dup · 1 origin</div>  // Risk Flags ribbon cell
...
<div className="delta flat">3 of 4 sub-assys approved</div>     // Status ribbon cell
...
<span className="hint">{bomTab === "flat" ? "64" : "87"} rows · 64 unique</span>
```
None of these literals are derived from `r` (rollup) or `data.rows`/`ctx.rows` — they are static strings baked into the JSX. Every user, regardless of their actual BOM size or real risk/approval state, sees "87"/"64" row counts, "3 of 4 sub-assys approved", and "1 supplier · 1 dup · 1 origin" on every BOM. This is fabricated data presented as live product data next to genuinely-computed fields like `r.parts`, `r.bomCost`, `r.lead` in the same ribbon.

## 2. [HIGH] Comments and approvals are permanently fabricated demo data, never replaced by real API data
Files: frontend/src/context/AppCtx.jsx (lines 231-232, 379, 441-444), frontend/src/utils/constants.js (lines 10-28)

```js
// AppCtx.jsx
const [comments, setComments] = React.useState(INITIAL_COMMENTS);
const [approvals, setApprovals] = React.useState(INITIAL_APPROVALS);
...
// comments and approvals sync removed from localStorage
```
`INITIAL_COMMENTS`/`INITIAL_APPROVALS` in utils/constants.js are hand-written fake records ("E. Chen", "M. Park" discussing "H743 errata ES0392", approval statuses for parts "ATL-MFR-CHS" etc. that don't exist in any real tenant's data). `dataService.refresh('comments')` and `dataService.refresh('approvals')` exist and call the real API (screenData.comments/approvals), but nothing in AppCtx.jsx ever calls `setComments`/`setApprovals` with that result — grepped every occurrence of `setComments`/`setApprovals` in the file; only the initial `useState` calls exist. So every screen reading `ctx.comments`/`ctx.approvals` (e.g. comment threads on parts, approval-status badges) permanently shows this fabricated seed data for the life of the session, for every tenant, regardless of what is actually in the database.

## 3. [MEDIUM] Dead duplicate module with a regressed/incompatible signature
File: frontend/src/utils/bom.ts (whole file)

`bom.ts` re-implements `convertApiPartsToTree(apiParts)` with only one parameter and no bomItems-linkage logic (bomItemId/refDes/findNumber/imageDocumentId/etc.), while the actually-used `frontend/src/utils/bom.js` takes `(apiParts, bomItems)` and threads bom_items_master fields through. Grepped all importers of `convertApiPartsToTree` across frontend/src — every one imports from `bom.js`; `bom.ts` has zero importers. It is dead code, and if anyone ever imports it by mistake (plausible: same base name, TS looks more "canonical"), BOM rows silently lose their bomItemId/refDes/find-number linkage, silently breaking structural edit/delete/reorder persistence described in bom.js's own header comment.

## Notes on things checked and found OK
- api.js: full CRUD surface (1607 lines) read start to finish. Retry/circuit-breaker/401-refresh logic (apiRequest) is coherent and well-guarded (idempotent-verb-only retry, 4xx short-circuit, entry-endpoint exclusion). No dead exports found; `tenantsAPI`/`api` aggregate object both defined and consistent with globals.js re-exports.
- config.js: sane same-origin defaults, override seam via window.__BBOX_CONFIG documented and correct.
- globals.js / main.jsx: re-export hub matches api.js exports; window.* shim migration is consistent. `window.useTweaks`/`TweaksPanel`/etc. referenced bare in App.jsx are in fact assigned via `Object.assign(window, {...})` in root/tweaks-panel.jsx (confirmed) — not a dead global.
- i18n.js: standard i18next setup, fine.
- dataService.js / screenDataBridge.js / navigation.js / offlineSim.js / poDraft.js: offline queue, registry-pattern navigation/offline-sim toggles, and R9 (no-silent-success-on-failed-write) logic all check out; matches their own header comments and tests.
- hooks/useAutosave.js, hooks/useKeyboardShortcuts.js: fine.
- context/appContext.js, context/AppCtx.jsx: single-context-object fix verified real (tests confirm); auth/session/theme/a11y effects are coherent. offline-login bypass fix (isOfflineCapableError) verified correct and tested.
- utils/accent.js, currency.js, storage.js, toast.js, offlineAuth.js, design-tokens.js, download.js: all internally consistent with their tests; no fabricated data, no unassigned globals found.
- screens/App.jsx: routing/auth/onboarding flow is consistent; no broken window globals.
- All 19 test files in scope (services/__tests__, utils/__tests__, hooks/__tests__, context/__tests__, and the listed frontend/src/__tests__ files) contain real, specific assertions — none are vacuous, and none point at a live/remote DB (all mock storage/api/fetch).
