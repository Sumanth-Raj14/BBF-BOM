# Fix writeup: src/context/AppCtx.jsx

## Finding
`comments`/`approvals` state was seeded from `INITIAL_COMMENTS`/`INITIAL_APPROVALS`
in `utils/constants.js` — fake names ("E. Chen", "M. Park", "R. Sato") and fake
approval statuses keyed by demo part numbers (`EL-MCU-STM32H7`, `ATL-MFR-CHS`,
etc.). A comment at line 379 (`// comments and approvals sync removed from
localStorage`) confirms these were never wired to anything real — the fake
seed was permanent.

## Confirmed rendered live
`AppCtx.jsx` is the `AppContext.Provider` mounted by the app (imported via
`src/root/app.jsx` chain per the task brief). `ctx.comments`/`ctx.approvals`
are read directly in `src/components/ModalsHost.jsx`
(`ctx.comments[row.pn]`, `ctx.approvals[approvalKey]`) which is
import-reachable from the live root. Both consumers already guard missing
keys with `|| []` / `|| {}`, so an empty object is a safe, honest default.

## Fix
- Removed the `INITIAL_COMMENTS`/`INITIAL_APPROVALS` import from
  `utils/constants.js` (left the constants file untouched — out of scope for
  another owner).
- `comments`/`approvals` now initialize to `{}` instead of the fake seed,
  matching the file's own real-data pattern (`rows` starts `apiRows || []`,
  `apiVendors` starts `null`).
- Discovered `dataService.refresh('comments')` / `dataService.refresh('approvals')`
  (in `services/dataService.js`, not touched) already fetch and reshape live
  data from the real `commentsAPI`/`approvalsAPI` endpoints (`api.js`) into
  the exact grouped-by-key shape the demo constants used
  (`{ [partNumber]: [...] }` / `{ [key]: {engineering, procurement, finance} }`).
  These were already being called inside `dataService.syncAll()` but the
  result was discarded (`Promise.allSettled`, no return capture) — so real
  data was being fetched and thrown away every load.
- Added two more `try/catch` blocks in the existing `loadFromAPI` effect,
  directly mirroring the pattern already used for `parts` (explicit
  `dataService.refresh("parts")` call right after `syncAll()`, since
  `syncAll`'s internal refresh discards its result) and for `vendors`/`projects`
  (try/catch, `if (!cancelled) setX(...)`, `console.warn` on failure, never
  throws to break the outer load). On success, `setComments`/`setApprovals`
  populate the real grouped data; on failure or no backend rows, state stays
  `{}` — an honest empty state, never a fabricated one.

## Approach used
`wired-to-real-api` — real endpoints exist (`commentsAPI`/`approvalsAPI` in
`api.js`, already reshaped by `dataService.refresh`), so this is not the
"no endpoint, leave empty" fallback path; it's wiring to real data with an
honest empty fallback when the API errors or returns nothing.

## Scope discipline
Only `src/context/AppCtx.jsx` was touched. `utils/constants.js` (still has
the now-unused `INITIAL_COMMENTS`/`INITIAL_APPROVALS` exports — left for that
file's owner to decide whether to prune) and `services/dataService.js` were
read but not edited.

## Verification
Re-read the full edited file top to bottom: import block, state declarations,
the `loadFromAPI` effect, and the `ctxValue` object that still exposes
`comments`/`setComments`/`approvals`/`setApprovals` unchanged downstream —
all syntactically valid, no dangling references to the removed import. No
test file exists under `**/__tests__` for this component (context providers
aren't unit-tested here), so no vitest run was applicable.
