# fixfe: src/root/power-features.jsx

## Rendered-live check
Traced: `src/main.jsx` -> `src/root/app.jsx` side-effect-imports -> `src/screens/App.jsx`
routes `/work-orders` and `/ncr` to `GenericScreen` wrapping
`WorkOrdersScreen`/`NCRScreen` from `src/components/LazyScreens.jsx`, which
lazy-`import("../root/power-features.jsx")`. Both screens are genuinely
rendered in the live app.

## Fix 1 — WorkOrdersScreen (fake seed + local-only mutations)
- Removed the `DEFAULT_ORDERS` array (5 hardcoded work orders) that was
  substituted whenever `screenData.workOrders.list()` returned empty or
  errored. The `useEffect` now does `setOrders(data || [])` on success and
  `setOrders([])` on failure — the existing `DataTable`'s `empty` prop
  (`EmptyState`) already renders an honest "No work orders" message, so no
  new UI was needed.
- Removed the `persist(next)` helper, which only ever called `setOrders` —
  the reason none of its three call sites reached the server.
- "Report build" and "Report defect" (`Menu` items) now compute the updated
  order, apply it optimistically via `setOrders`, and call
  `screenData.workOrders.update(o.id, updated)` (wrapper already existed;
  confirmed real route in `frontend/api.js` — `PUT /work-orders/{id}`).
- "Create Work Order" now builds the new entry, applies it optimistically,
  and calls `screenData.workOrders.create(entry)` (confirmed real route —
  `POST /work-orders`).
- All three calls are `.catch(() => {})`'d because `screenDataBridge`'s
  `saveToAPI` already toasts a `kind: 'error'` message and writes to
  localStorage on failure (see its own "R9 fix" comment) — no need to
  duplicate that here, just avoid an unhandled rejection.

## Fix 2 — NCRScreen (fake seed + local-only create)
- Removed the 4 hardcoded fake NCRs from the `useState` initializer. Added a
  `useEffect` that loads via `screenData.quality.ncr.list()` (confirmed real
  route — `GET /quality/ncrs`), falling back to `[]` on error. The existing
  `DataTable`'s `empty` prop already renders an honest "No non-conformance
  reports" state.
- `createNcr()` now calls `screenData.quality.ncr.create(entry)` (confirmed
  real route — `POST /quality/ncrs`) alongside the existing `setNcrs`
  optimistic update, `.catch(() => {})`'d for the same reason as above.
- Incidental fabrication found while wiring: the payload was building
  `wo: "WO-2026-" + String(40 + ncrs.length).padStart(4, "0")` — a work-order
  reference invented from a counter, with no relation to any real work
  order (the NCR form never collects one). Sending that to a real backend
  would create non-conformance records pointing at work orders that don't
  exist. Changed to `wo: ""` (honest unknown) rather than carrying the
  fabrication into an actual API call — a one-line change made in-scope
  while touching that exact payload construction.

## What was NOT touched
Every other component in the file (`CommandPalette`, `LandedCostModal`,
`MarginModal`, `ShareLinkModal`, `WebhooksModal`, `ScheduledReportsModal`,
`EmailParseModal`, `Presence`, `UNDO`) was left untouched — out of scope for
this assignment, and several already have explicit "no backend configured
for this yet" honesty comments/empty-state handling from a prior pass.

## Verification
Re-read the full edited file top to bottom: braces/JSX balanced, no dangling
references to the removed `persist` helper or `DEFAULT_ORDERS` (confirmed via
grep — zero remaining call sites), both `useEffect` hooks correctly scoped,
both screens' exports/`window` assignments at the bottom unchanged. No test
file exists under `src/root/__tests__` for this file, so no unit test was
run (per instructions, only run if a sibling test exists).
