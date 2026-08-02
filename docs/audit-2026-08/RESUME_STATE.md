# Session resume state — 2026-08-02

Written mid-flight because the session was about to hit its usage limit. Everything
below is on disk. Nothing here is committed except where stated.

## Where the work lives

- **Branch:** `test/e2e-ci-and-write-flows` (PR #10, open, NOT merged)
- **Remote:** `https://github.com/Sumanth-Raj14/BBF-BOM.git`
- **Committer must be** `Sumanth-Raj-BBF <sumanthraj@blackboxfactories.com>` — no pavan, no Claude co-author trailer.
- `master` has branch protection with `enforce_admins: true`. Direct push is blocked; use PRs.
- No `gh` CLI and no docker here. Read CI via the GitHub REST API using a token from
  `git credential fill` (piped through Python — bash `sed`/`grep` get mangled by the rtk hook).
  Job logs redirect to Azure blob storage, which 401s if you forward the auth header —
  use a redirect handler that strips it.

## Committed and pushed on this branch

| Commit | What |
|---|---|
| `56d92e9` | Local-first storage fix (`storage_type` default `"local"`, not `"s3"`) |
| `a63ce60` | Merge of master (brings in merged docs PR #13) |
| `b708265` | E2E: legacy specs run as a really-logged-in user |
| `b3fd54e` | E2E: scope the real session to the specs that need it |

### PR #10 CI state at time of writing
Three required checks green. E2E went **14 failures → 5 → 1**, 36 passing,
runtime 11.4m → 1.8m.

The one remaining failure is genuine: **93 axe-core violations, all of them
`color-contrast` (serious)**. Agent 7 (below) was dispatched to fix it.
Two `tests/accessibility.spec.js` tests are *flaky*, not failing — timing.

## Uncommitted work in the tree

**Mine, verified, ready to commit:**
- `frontend/src/root/bom-editor.jsx` + `frontend/src/__tests__/collabProvider.test.jsx` —
  real-time collaboration now actually connects. `CollaborationBar` was rendering outside
  any `CollabProvider`, so `useCollab()` returned the no-op fallback and the presence bar
  showed "offline" against a working WebSocket backend. Also switched from bare `window.*`
  globals to real imports, since the provider is now unconditional. **4/4 tests pass**,
  including a source-level guard that fails if anyone unwraps it again.
  (Note: the guard uses Vite's `?raw` import — `node:fs` + `import.meta.url` does NOT work
  under jsdom, where `import.meta.url` is an http URL.)
- `frontend/OPENBOM_GAP_ANALYSIS.md` — fully re-measured, see below. **Deliberately not
  committed**: it does not belong on an E2E branch. Give it its own PR.
- `docs/audit-2026-08/gap_domains_{1_3,4_6,7_9}.md` — the three raw verification reports,
  rescued out of the session scratchpad. These are the evidence behind the rewrite; the
  scratchpad is session-scoped and would have been lost.

**From subagents — NOT yet reviewed by me.** Review each diff before committing:
```
backend/app/api/endpoints/analytics.py      backend/app/services/part_service.py
backend/app/api/endpoints/cad.py            backend/app/services/webhook_service.py
backend/app/core/deps.py                    backend/app/tests/test_analytics.py
backend/app/services/bom_service.py         backend/app/tests/test_cad.py
backend/app/services/eco_service.py         backend/app/tests/test_eco_change_control.py
backend/app/services/email_service.py       backend/app/tests/test_rls_flag.py
                                            backend/app/tests/test_webhooks.py
backend/app/tests/test_api_key_scopes.py            (new)
frontend/src/components/LazyScreens.jsx
frontend/src/components/NavRail.jsx
frontend/src/components/SourcingView.jsx
frontend/src/components/advanced/ECRScreen.jsx
frontend/src/screens/App.jsx
frontend/src/components/screens/{TraceabilityScreen,DeviationsScreen,BomVariantsScreen}.jsx   (new)
frontend/src/__tests__/{ECRScreen.approvals,SourcingView.altVendors,TraceabilityScreen}.test.jsx  (new)
```
Some agents were still running when this was written, so a file may be half-written.
Check `git diff` compiles before trusting anything: `cd frontend && npx vite build`,
`cd backend && python -m pytest`.

## The subagent fleet

Seven agents, each given disjoint file ownership so they could not collide. Every one was
told: verify the claim first, reuse what exists, leave a runnable test, do NOT commit.

| # | Task | Owns | Status |
|---|---|---|---|
| 1 | Make webhooks fire on real business events | `webhook_service.py` + emit call sites | **DONE** |
| 2 | Create ECO notification rows (approvals are pull-only today) | `eco_service.py`, notification/queue | **DONE** |
| 3 | Enforce API-key scopes — read-only keys can currently write | `core/deps.py` | **DONE** |
| 4 | Stop `/cad/apply-sync` + vendor-scorecards fabricating results | `endpoints/cad.py`, `endpoints/analytics.py` | **DONE** |
| 5 | Stop `SourcingView` + `ECRScreen` fabricating data | those two components | running |
| 6 | Build traceability / deviations / BOM-variants screens | `screens/`, `LazyScreens`, `NavRail`, `App.jsx` | **DONE** |
| 7 | Fix the 93 WCAG contrast violations | `frontend/styles.css` | **KILLED by session limit — HALF DONE** |

### Agent 7 — INCOMPLETE, needs redoing
Killed mid-task by the session limit. `frontend/styles.css` has **~51 lines of partial
contrast edits** already committed in `b90988f`. Its last words were "now re-run the audit
in both modes", so light/dark verification never happened. **Do not assume the contrast work
is done.** Re-dispatch: write a WCAG relative-luminance script in the scratchpad, compute
every fg/bg text pair in `styles.css`, fix to 4.5:1 (small text) / 3:1 (large), verify both
light and dark themes, then confirm against the axe test in CI. Known failing pairs from the
CI run: white `#ffffff` on olive `#b5bc38` = 2.05; amber `#eab308` on white = 1.91.

### Agent 6 result — three screens shipped, 216/216 frontend tests pass
- **`TraceabilityScreen`** (Quality → "Serial & Lot Traceability", `/traceability`) — tabs over
  `/traceability/serial-numbers` and `/traceability/lots`, server-side filters, serial lookup,
  genealogy card, status-history timeline.
- **`DeviationsScreen`** (Quality → "Deviations & Waivers", `/deviations`) — list/create/submit/
  approve against `/deviations*`.
- **`BomVariantsScreen`** (Engineering → "BOM Variants", `/bom-variants`) — open-by-id + items.
- Registered in `LazyScreens.jsx`, `NavRail.jsx`, `App.jsx`. `vite build` clean, own chunks.
- **Backend bugs it found, out of its scope:** there is no variant *list* route (screen keeps a
  session-local recents list); and `POST /bom/variants/items` is shadowed by
  `POST /bom/{bom_id}/items` registered earlier, so `bom_id="variants"` 422s — **route-ordering
  bug, worth fixing.**

### Agent 3 result — API-key scopes enforced
- Confirmed `_authenticate_by_api_key` never read `api_key.scopes`. Guard added in `core/deps.py`.
- Enforced the existing `read`/`write` vocabulary only. GET/HEAD/OPTIONS→`read`, everything
  else→`write`; an **unlisted method defaults to `write`** so nothing falls through as readable.
- Default deny: empty, NULL, unknown-value and non-list scopes all 403. The `isinstance(list)`
  guard is load-bearing — `"read" in "read,write"` is True for a `str`, which would hand a
  malformed row full access. Raises rather than returning `None`, so it can't fall through to
  the bearer path and surface as a 401.
- **Red before the fix, verified:** with the guard neutered, `test_read_scoped_key_is_refused_a_write`
  returned **200 with a real newly-minted API key** — a read-only key writing. 8 passed after.
- Also fixed `test_rls_flag.py`, whose mocked ApiKey had a MagicMock `scopes`.

**Two holes agent 3 did NOT close (outside its owned files) — do these next:**
1. **`/api/v1/auth/plugin-login` (`auth.py:106`) exchanges any active API key for a full JWT
   without reading scopes.** A read-only key can still mint an unrestricted token there, which
   defeats the guard entirely. Highest-priority security follow-up.
2. Every key has the literal prefix `bkb` and lookup uses `scalar_one_or_none()` on
   `key_prefix` — **two active API keys anywhere break API-key auth with `MultipleResultsFound`.**

**Correction to the gap report:** it claimed scopes are "shown in the `APIKeysScreen` UI".
They are not — the create form (`enterprise-screens.jsx:1607`) offers only name/description/
expires_in_days, and the table has no scopes column. Every key the UI makes gets the
`["read","write"]` default; a scoped-down key is only reachable by POSTing `scopes` directly.
The misrepresentation is real, but its channel is the API, not the UI.

### Agent 4 result (reported, not yet reviewed by me)
- `/cad/apply-sync` now returns **501** instead of claiming success. Its rationale: the
  diffs `/cad/sync` produces carry no target field and no target value, so there is
  nothing an apply could write without inventing a mutation. Points callers at
  `POST /api/v1/solidworks/apply-sync`, which does real CAD→BOM writes. No frontend change
  needed — the success branch becomes unreachable and the existing catch surfaces `detail`.
- `/analytics/vendor-scorecards`: `onTimeRate` and `qualityScore` now computed from
  `part_vendors`; `null` when a vendor has no links. `responseTime` is **always null** —
  no source data exists. Ran as a separate query and merged in Python, because joining
  `part_vendors` into the PO aggregate fans out rows and inflates `totalSpend`.
- Tests pass. 4 pre-existing SQLite failures in dashboard/trends/inflation
  (`no such function: TO_CHAR`) are untouched and unrelated.

### Agent 1 result — webhooks now fire (reported, not yet reviewed by me)
- Confirmed the two-caller claim. Added `emit_event(db, event, payload, tenant_id)` to
  `webhook_service.py`, dispatching through the **existing** `_send_webhook` and writing the
  existing `WebhookDelivery` rows. Selects subscriptions by explicit `tenantId` equality.
- Emits after commit in `bom_service.create/update/delete_bom_item`
  (`bom.item.created|updated|deleted`), `part_service.create/update/delete_part`
  (`part.created|updated|deleted`), `eco_service.perform_eco_action`
  (`eco.approved|implemented`).
- **Contradicted the brief, usefully:** no event catalogue existed anywhere — `events` is a
  free-text column, free-text in the schema, free-text in the UI, and `FEATURE_CATALOG.md:929`
  lists a *different* set. It defined an explicit `EVENTS` constant following the docs' naming.
  Also: `eco_service` already calls `emit_integration_event` — that is the ERP/Zoho **outbox**,
  a separate system, so the "no producer" finding holds for customer webhooks only.
- Its failure test earned its keep: the first version called `db.rollback()` on error, which
  expired the caller's ORM objects and 500'd the request — exactly the bug it was guarding.
  Now a `begin_nested()` savepoint unwinds only the delivery rows.
- 9 passed in `test_webhooks.py`, 38 across related suites.
- **Known ceiling:** dispatch is inline, marked `ponytail:` with a drainer as the upgrade path.

### Agent 2 result — ECO notifications now created (reported, not yet reviewed by me)
- Confirmed zero construction sites for `EcoNotification` / `NotificationQueue`.
- Wired at the end of `perform_eco_action` **after** both commits. submit → pending approvers
  (falling back to holders of `ECO_APPROVER_ROLES`, since no `eco_approvals` rows are created
  anywhere yet); approve/reject → requester; implement → requester + approvers; close → silent.
  Actor always excluded. One `EcoNotification` + one `NotificationQueue` row each, no inline send.
- **Found two real bugs beyond the brief:**
  1. `not NotificationQueue.is_sent` compiles to `WHERE false` — the dispatcher was *doubly*
     dead. Fixed to `.is_not(True)` in both `email_service.py` and `eco_service.py:115`.
  2. **`process_notification_queue` has no caller — there is no scheduler.** Rows will queue
     and nothing drains them. **This is unfinished work: notifications are created but never
     delivered until someone schedules the drain.** Highest-priority follow-up.
- 33 passed across eco/notifications/approvals/part11.

**Follow-up this fleet exposed:** nothing anywhere creates `eco_approvals` rows. Agent 2 had
to fall back to a role query, and agent 5 was asked to render real approvals from that same
empty table. Creating approval rows on ECO submit is the missing link between the two.

**To resume an agent's work:** the prompts are reconstructable from the table above, but
their context is gone. Re-dispatch fresh rather than assuming; check `git diff` first to
see how far each got.

## The re-measured gap analysis

`frontend/OPENBOM_GAP_ANALYSIS.md` was 8 months stale (June 2026 / v1.19.0). 76 rows
marked ❌/⚠️ were re-verified against source by three agents; I rewrote the document and
mechanically recomputed every number derived from those rows.

| | Blackbox |
|---|---|
| Weighted (same half-credit formula as competitors) | **65%** |
| Reachable by an actual user today | **49%** |

OpenBOM sits at 61%. Counts: 115 rows, 56 full, 37 partial, 22 missing.

**The finding that matters:** the dominant pattern is not "not built", it is **built and
unreachable** — complete model + routes + `api.js` wrapper + `screenDataBridge` entry,
then no screen. That 16-point spread is UI work over finished, tested infrastructure.

**Four reversals of the old document:** 21 CFR Part 11 e-signatures were ❌ CRITICAL and
are properly implemented; webhooks were ✅ and never fire; ITAR/EAR was ⚠️ and is near-zero;
UNSPSC was ❌ and has existed since migration 001.

**Caveat on record:** competitor columns were NOT re-verified and do not reconcile —
OpenBOM's 61% matches its own appendix counts, Fusion Manage's 64% matches neither half
nor full credit. Do not quote a competitor number externally without re-measuring.

### The 90% target — arithmetic, not opinion
The user asked for ≥90%. With 115 rows, 90% weighted needs `full + 0.5×partial ≥ 103.5`.
**Finishing every one of the 37 partials tops out at 93/115 = 81%.** The remaining nine
points require building ~12 of the 22 genuinely-missing features. The current fleet is
wave one (wiring). Wave two is real engineering:

1. Effectivity on BOM lines (date/serial/lot) — zero occurrences of `effectivity` backend-wide
2. Multi-UOM with conversion — `parts.uom` is free text; model it on the working `exchange_rates`
3. CSV/XLSX import that creates records — `bulk_import.py:71-98` marks rows "processed" without touching `Part`; no XLSX reader exists at all
4. Non-SolidWorks CAD connectors — Fusion 360, Onshape, Altium are each zero lines
5. Requirements management — no table, no route, no UI; the only true zero
6. BOM type column on `boms` to complete EBOM/MBOM/SBOM

## Still-open items the user has not answered

- Two legacy `projects` rows have `status='active'`, outside the allowed CHECK values.
  I refused to guess a mapping — needs the user's call.
- Never confirmed by the user: does the dashboard look right, and **does a STEP file
  actually render in the CAD Vault**. Asked 3+ times.
- Offered, not authorised: delete the duplicate `frontend/` and `backend/docs/` copies of
  8 governance docs (~400 KB unmaintained), and `desktop/build/` artifacts.

## One correction worth keeping

An agent reported the SSO buttons as an authentication bypass. **They are not.**
`auth-onboarding.jsx:87` hands `onSignIn` a hardcoded `admin@blackbox.com` with an empty
password, but `App.jsx:301` passes it to the real `api.auth.login`, the backend rejects it,
and the user gets "login failed". It is a **dead button** in front of an unused OAuth2
backend. Separately and genuinely: when the server is unreachable, the local-first path at
`App.jsx:323` admits any credentials — `offlineAuth.js` says that is for "a previously-known
user" but the code never checks that they are known. Real residual gap in the A10 fix,
bounded by whatever is cached locally.
