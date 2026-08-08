# fixfe_low-trio — integration-screens.jsx, prod-additions.jsx, modals-extra.jsx

## Rendered-live confirmation
- `integration-screens.jsx`: lazy-loaded via `src/components/LazyScreens.jsx` (`import("../root/integration-screens.jsx")`) and re-exported through `src/globals.js`. Reached from the router. Rendered.
- `prod-additions.jsx`: side-effect-imported directly by `src/main.jsx`. Rendered.
- `modals-extra.jsx`: side-effect-imported directly by `src/main.jsx`. Rendered.

All three flagged spots are live code paths, not dead migration leftovers.

## Fix 1 — integration-screens.jsx (~line 470): non-crypto webhook secret
`Math.random().toString(36).slice(2)` produced a predictable, low-entropy webhook secret.
Changed to `crypto.randomUUID().replace(/-/g, "")` (browser Web Crypto, no new dependency) — 122 bits of CSPRNG-backed entropy, one line.

## Fix 2 — prod-additions.jsx (~line 980): fake 12% failure injection
`optimistic()` used `Math.random() < 0.12` to fabricate a save failure "for demo purposes" and call `opts.undo()` even though the real mutation succeeded — actively lying about outcomes.
Removed the injection. The helper now:
- calls `mutation()`, catching synchronous throws (existing behavior, kept).
- if `mutation()` returns a promise, awaits it and only shows the failure toast / calls `opts.undo()` if the promise actually rejects; shows the success toast only on real resolution.
- if `mutation()` is synchronous (not a promise) and doesn't throw, shows the success toast as before (this path has no async outcome to reflect, so this is the honest "success" case — the sync call already ran without error).

## Fix 3 — modals-extra.jsx (~line 538, plus a second Copy action at ~line 382): fake clipboard success
Both API-key "Copy" actions (`generate()`'s toast action, and the per-row key-prefix icon button) toasted "Copied…" unconditionally without ever calling `navigator.clipboard.writeText`, i.e. nothing was actually copied.
Fixed both to call `navigator.clipboard?.writeText(...)`, toast success only in `.then()` after the write resolves, and toast an error in `.catch()` on failure — matching the existing pattern already used elsewhere in the codebase (`src/root/overlays.jsx` doc-preview copy link).

## Approach summary
- integration-screens.jsx: `other` (swapped RNG primitive) — closest bucket is "other"/security-hardening, not fabricated-data-related.
- prod-additions.jsx: `removed-fake` — deleted the fabricated-failure branch, replaced with the real promise outcome.
- modals-extra.jsx: `wired-to-real-api` — wired the toast to the actual `navigator.clipboard.writeText` result instead of assuming it.

No new dependencies, no new files, no unrelated code touched.
