# fixfe: src/components/ModalsHost.jsx

## Rendered-live check
`src/root/app.jsx` imports `App` from `src/screens/App.jsx` and renders it
(`React.createElement(App, null)`). `src/screens/App.jsx` imports and renders
`<ModalsHost />` at line 644. Confirmed live in the render tree from
`src/main.jsx`.

## Finding 1 — fabricated "release" (line ~249, now ~272-310)
`onConfirm` on the "release" `ConfirmModal` only called `setProject`/
`setNotifications` (local React state) and toasted success — no request ever
left the browser, despite the modal copy claiming a server-side lock,
immutable snapshot, and a changelog sent to engineering, procurement, and
finance.

Checked `frontend/api.js` for a matching real endpoint:
- `bomEnterpriseAPI.snapshots.create(bomId, data)` → `POST /bom/{bomId}/snapshots`
  — a real, already-wired endpoint that matches the "immutable snapshot" part
  of the claim. `project.id` is the bomId used elsewhere for this API
  (confirmed via `bom-editor.test.jsx`: "ctx.project.id, not a Part id").
- No endpoint anywhere in `api.js` sends notifications to other users/
  departments (`notificationsAPI` only has `list`/`update`, no `create`), and
  no other modal in the codebase wires "release" to anything.

Fix: `onConfirm` now `await api.bomEnterprise.snapshots.create(project.id, {
version, rev })` inside try/catch. On success, the existing local-state
update + local "System" notification + success toast still run (that local
notification is the in-app bell feed, same pattern already used by the
sibling "approve" ConfirmModal in this file — left as-is, not a new
fabrication). On failure, the local state is NOT mutated and an error toast is
shown instead — the UI no longer claims success when the persist call fails.

Also edited the modal body copy: dropped the unsupported "changelog will be
sent to engineering, procurement, and finance" claim (no such endpoint
exists anywhere in this codebase), kept only "create an immutable snapshot of
the current BOM," which is now true.

Approach: wired-to-real-api (for the snapshot half) + honest copy edit (for
the unsupported notify-departments half, since no real endpoint exists for
that piece).

## Finding 2 — rev-increment bug (line ~252, now nextRev helper at line 29)
`String.fromCharCode(project.rev.charCodeAt(0) + 1)` only read the first
character (so any multi-char rev, e.g. "AA", would silently produce garbage
from just the "A") and had no rollover past `'Z'` (`'Z'.charCodeAt(0)+1` →
`'['`, not a valid revision letter).

Fix: added `nextRev(rev)`, a small pure function that increments the whole
string like a spreadsheet column — `A→B…Y→Z→AA→AB…AZ→BA…` — handling both the
multi-char and the `Z` rollover cases correctly. `onConfirm` now calls
`nextRev(project.rev)` instead of the broken one-liner.

No dedicated util for this existed elsewhere to reuse (checked `src/utils`);
a near-identical bug exists independently in `src/root/detail-drawer.jsx:1640`
but that file is owned by another agent in this pass and was left untouched
per scope rules.

## Scope notes
- Touched only `src/components/ModalsHost.jsx`.
- Did not touch the pre-existing hardcoded `updated: "2026-05-25"` in the
  same `setProject` call — it's a separate, unreported fabricated-date issue
  outside the two assigned findings; left alone to keep the diff scoped.
- No git commands run.
