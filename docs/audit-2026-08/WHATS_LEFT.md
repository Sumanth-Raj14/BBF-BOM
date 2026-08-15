# What's left — everything except the UI

Answers "what is left and needs to be done, other than the UI — no breaks, no
inconsistencies." Scope excludes UI consolidation/redesign, which is on hold
until you direct it. A screen that is *broken* or *lies* is still in scope and
is covered below.

Method: six independent read-only audits (API surface, data layer, frontend
integration, service logic, ops/deploy, test integrity), then each finding
re-verified against the code before being accepted or rejected. Findings the
audit reported that turned out not to be real are listed at the bottom — they
are not quietly dropped.

---

## Fixed since the audit (all verified, all committed)

| # | What was broken | Why nothing caught it |
|---|---|---|
| 1 | `calendar_events` had no migration. A live CRUD router with live frontend calls sat on a table only `create_all()` ever made — any deploy on the incremental `alembic upgrade head` path 500s. | Every CI path bootstraps a *fresh* DB, which runs `create_all`. The incremental path is never exercised. |
| 2 | `POST /bom/variants/items` was permanently unreachable — registered after `/{bom_id}/items`, so Starlette matched the parameterised route with `bom_id="variants"` and died on int coercion. | Variant tests call the service layer directly. A service test cannot catch a routing bug. |
| 3 | `POST /bom/variants` 500'd on every call — the service read the tenant from ambient context only, which the HTTP path never sets, so it always hit `NOT NULL bom_variants.tenantId`. | Same reason. Found only because fixing #2 required a route-level test. |
| 4 | `get_where_used` capped `level` at 2. Ancestors were fetched one generation deep, so the walk up the tree stopped immediately. | Existing where-used tests only build 2-level trees, where right and wrong agree. |
| 5 | `get_where_used` was **also** off by one: a direct child of a root line reported level 1, same as the root. Convention (stated in `_compute_levels_and_effective_qty`) is root = 1. | Hidden inside #4. No test asserted on the level at all. |
| 6 | `compare_boms` keyed items by `part_id`, keeping only the **last** line. A part on several lines — one resistor across four designators, a fastener reused in sub-assemblies — silently lost every earlier occurrence, and compared one arbitrary line's quantity instead of the total. Two BOMs that genuinely differed compared as identical. | No test used a part more than once in a BOM. |
| 7 | Exported **Extended Cost** disagreed with the **Cost Rollup** screen for the same BOM: export did a naive `unit_cost x qty` with no UOM conversion (a part costed per M on a line counted in CM was off by 100x), and picked the snapshot cost with `is not None` where the rollup uses a truthy test (a $0 snapshot exported 0 while the rollup fell back to part cost). | Nothing compared the two code paths against each other. |
| 8 | `BOMDuplicationModal`'s "Reset revision to A" checkbox was a no-op — bound to state that `relabel()` never read. Ticked or not, the duplicate kept the source revision. | No test drove the modal's output. |

Each fix ships with a test that fails on the old code. The migration gap (#1)
also ships a **guard** (`test_migration_table_coverage.py`) that fails when any
*new* model table arrives without a migration — verified by reproducing the
`calendar_events` case.

---

## What still needs doing

Items 1, 2, 5, 6 and 8 of the original list are **closed** — see "Closed in the
follow-up pass" below. What remains:

### 1. MEDIUM — four features have a backend and a client, but no screen

Verified three ways for each (no `api.X.*` caller in `src`, no `screenData.X`
caller, no screen or modal that even names the feature):

- **Contracts** — `contractAPI` (list/get/create/update/delete/pricing) plus a
  `screenData.contracts` wrapper. Zero callers.
- **Make-vs-Buy** — `makeVsBuyAPI` plus its bridge wrapper. Zero callers.
- **Supplier scorecard CRUD** — `supplierScorecardAPI` plus its wrapper. Zero
  callers. The analytics screen's "Vendor scorecards" tile is a *different*,
  already-wired read endpoint, so creating or editing a scorecard has no
  surface anywhere.
- **E-signature list** — `esignatureAPI.list` has no caller. The e-sign
  *workflow* (the ECR approve/implement re-auth dialog) is real and goes
  through a different endpoint; this is only the standalone list.

Not a break — nothing calls them, so nothing fails. But it is the largest
functional gap in the product: paid-for backend work with no way to reach it.
**Building these screens is UI work, so it waits for your go-ahead.**

### 2. LOW — a $0 `unit_cost_snapshot` is treated as "no snapshot"

The rollup's truthy fallback means a deliberate zero-cost line falls back to
the part's cost instead of costing zero. Export now matches the rollup exactly,
so the two agree — but whether zero *should* mean free is a semantics decision
that changes existing cost numbers, so it belongs to you, not to a patch.

### 3. Verification still requiring your credentials

The CAD cloud connectors (Onshape, Fusion/APS, Altium 365) are built and
unit-tested against mocks, but have never run against a live account. Needs an
Onshape API key, an Autodesk APS app, and Altium 365 credentials. Altium
**file** import needs nothing and does work.

---

## Closed in the follow-up pass

**Migration coverage — the HIGH item, now closed.** Migration
`059_formalize_create_all_tables` creates all 74 tables that previously existed
only via `create_all()`, including the tables behind RBAC, inventory, ECO and
PO. The DDL is a frozen snapshot compiled from the models for Postgres, using
the same `CREATE TABLE IF NOT EXISTS` convention as migration 022, ordered by
foreign-key dependency. Verified by executing all 306 statements against real
Postgres inside a transaction that was rolled back: 74 tables created, then
fully reverted, with the public schema unchanged at 161 tables before and
after.

`_migration_baseline.txt` is now **empty**, so the coverage guard enforces that
every model table has a migration rather than blessing a legacy list.

Note this does not make the chain buildable from base — migrations 004-021
still reference tables created earlier. `scripts/init_db.py` remains the
supported greenfield bootstrap. What changed is that an already-managed
database is no longer missing tables.

**Weak router tests — closed.** 73 assertions across 25 files were tightened.
The important ones were the 25 unauthenticated tests asserting
`status_code in (200, 401)`, which passed whether or not authentication
worked. They now require `(401, 403)`. Verified by stubbing out
`get_current_user` to accept anonymous requests and confirming the tightened
test fails, where the old assertion passed silently. Authenticated list/detail
tests now require exactly 200/404 instead of accepting 401/403.

**Dead code — closed.** `ComplianceRollupView.jsx` deleted (orphaned; the
endpoint it waited for does not exist) along with the gap-analysis line that
claimed it was live UI. `bom_service.export_bom` deleted — the endpoint of the
same name routes to `export_service.render_export`, so it was a second,
diverging definition of "export a BOM".

**Index drift — closed.** The `cad_connections` composite index on
`(tenantId, connector_type)` is now declared on the model, matching migration
056, so a `create_all` database and a migrated one agree.

### Corrected finding: the "four dead models" were not dead

The audit reported `audit_log_changes`, `contract_attachments`,
`deviation_attachments` and `fai_attachments` as models with no callers, safe
to delete. Three of the four have live ORM relationships from their parent
models (`Contract.attachment_items`, `Deviation.attachment_items`,
`FAIReport.attachment_items`); deleting the classes would break mapper
configuration at startup. The audit checked for endpoint and service callers
and missed the relationships. They were given migrations as part of 059
instead of being deleted.

---

## Reported by the audit, verified NOT real

- **"`docker-build` CI job will fail — missing compose secrets."** Every
  interpolated variable in `docker-compose.yml` has a default, and
  `docker compose build` consumes no runtime secrets. No fix needed.
- **"Route-sweep E2E does not fail on API errors."** Correct as written — it is
  a diagnostic sweep, not a gate.

---

## Current state

- Backend: 920 passed; the only 2 failures are the Postgres full-text search
  tests, which cannot pass on SQLite by design.
- Frontend: 282 passed, 53 files. Production build clean.
- Postgres CI, fresh-install + migration CI, and the SolidWorks plugin build
  are green.
