# fixfe: src/screens/BomEditorScreen.jsx

## Rendered-live confirmation

`BomEditorScreen.jsx` **is** the live BOM editor, despite the misleading comment
in `LazyScreens.jsx` calling it "orphaned, never eagerly imported" (that comment
only means it isn't in the eager `main.jsx` bundle — it's still lazy-loaded and
rendered).

Trace:
- `frontend/src/screens/App.jsx` renders `<Route path="/bom" element={<BomShellWrapper />} />`.
- `BomShellWrapper` renders `<BomShell .../>`, where `BomShell` is imported from `../globals`.
- `frontend/src/globals.js:125` re-exports `BomShell` from `./components/LazyScreens.jsx`.
- `LazyScreens.jsx`'s `BomShell` is a `React.lazy` wrapper that dynamically imports
  `../root/bom-editor.jsx` then `../screens/BomEditorScreen.jsx`, then renders
  whatever is on `window["BomShell"]`.
- `bom-editor.jsx` never sets `window.BomShell` (confirmed via grep — zero matches).
- `BomEditorScreen.jsx` line 593: `window.BomShell = BomEditorScreen;` — this is the
  only file that registers it.

So the component the lazy wrapper resolves and renders at route `/bom` is
`BomEditorScreen`, confirming it is live. Note `src/root/bom-editor.jsx` is a
*different* component (`BomEditor`, used internally by `BomEditorScreen` for the
grid itself) — not to be confused with the screen shell.

## Fix

`data`/`ctx.rollup` (`r`) already provides real aggregate numbers
(`r.parts`, `r.unique`, `r.vendors`, `r.countries`, `r.risk`, `r.lead`,
`r.bomCost`, `r.lastCost`) and the ribbon cells already render most of them.
The ribbon's "Total Parts" (87) / "unique" (64) values are `r.parts` / `r.unique` —
exactly the numbers the tabs and filter-bar hint were duplicating as separate
hardcoded literals. Reused those instead of re-deriving/re-hardcoding:

- Tab `count` badges: `<span className="count">87</span>` / `64` →
  `{r.parts}` / `{r.unique}`.
- Filter-bar hint `"{...} rows · 64 unique"` → `{bomTab === "flat" ? r.unique : r.parts} rows · {r.unique} unique`.

For stats with no backing field in the data model at all, replaced the
fabricated text with an honest `"—"` (per instructions, rather than inventing a
number or a definition for "approved"/"breakdown" that doesn't exist in the
row schema):

- Critical-lead delta `"▲ +3d STM32H7"` → `—`. No previous-lead-time or
  per-part trend field exists on the rollup (`r` has only a current `lead`,
  no prior value, no "which part" reference).
- Risk-flags delta `"▲ 1 supplier · 1 dup · 1 origin"` → `—`. `r.risk` is a
  single total count; there's no breakdown-by-cause field.
- Status cell delta `"3 of 4 sub-assys approved"` → `—`. Rows have a
  `status` string (`Released`/`Draft`/`Review`/`Deprecated`) and an
  `assembly: true` flag, but no `approved` boolean — computing an "approved"
  count would mean inventing semantics not present in the data, which is the
  same fabrication problem in a different shape.

Each change has an inline `fixfe:` comment at its location naming the finding.

## Not touched

Spotted (but out of scope, pre-existing, unrelated to the fabricated-stats
finding): line 512 has `rows · unique` written as a literal JSX-text
escape sequence, which is *not* interpreted as a middot character in JSX text
(only inside JS string literals) — so it likely renders as literal
`·` text. Left as-is since it's a separate bug from a different agent's
assigned scope and fixing it isn't part of this finding.

## Verification

Re-read the full edited file: JSX structure intact, all braces/tags balanced,
`r.parts`/`r.unique`/`r.risk` are all pre-existing local variables already in
scope (derived from `ctx?.rollup || data.rollup` at the top of the
component), so no new imports or props needed. No test file exists under
`src/screens/__tests__` for this component to run.
