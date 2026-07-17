Verified the two flagship core defects directly against source (explosion at `bom_service.py:148` seeds `_build_explosion_tree(db, None, ...)` â†’ `select(BOMItem).where(BOMItem.parent_item_id == parent_item_id)` at line 106 with no `bom_id`/no `tenantId`; quantity rollup emits literal `"levels": [1]` at line 176 with a flat per-part sum; cost rollup uses `unit_cost * item.quantity` at line 235 with no effective-quantity product). Both confirmed. Synthesizing the spec.

---

# P0 Core-Correctness Remediation Spec â€” BOM/PLM Platform

REPO ROOT: `C:\Users\tsuma\Downloads\bom tool\bom tool v1\bom-tool` (paths below are repo-relative). Scope excludes the concurrent WS3 workstream (`backend/app/integrations/*`, `work_queue.py`, frontend `LazyScreens`/`App`/`NavRail`).

## Summary

The BOM core â€” the single feature this platform exists to get right â€” is not correct today, and the defects reproduce **even in a single-tenant on-prem install**, which is the primary (local-first) deployment target.

- **The explosion is globally wrong, not just leaky.** `get_bom_explosion` never filters by `bom_id`: it walks every root `BOMItem` in the database (`parent_item_id IS NULL`) and returns the *same* tree for every BOM, then caches that identical tree under each BOM's cache key. On an on-prem single-tenant box this is already a correctness failure (every BOM renders the same merged structure). On any shared/multi-tenant deployment it is additionally a **cross-tenant data leak**, because `get_bom_or_404` validates the requested BOM's tenant but the traversal is unscoped.
- **Rollups are arithmetically wrong.** Quantity rollup is a flat per-part sum with a hardcoded `"levels": [1]`; cost rollup multiplies only by the line's own quantity. Neither multiplies quantity down the tree, so any component under a sub-assembly with qty > 1 is undercounted. These feed costing and procurement â€” the numbers are unsafe.
- **There is no persistence path for instance BOM data.** The BOM model is fragmented (instance `BOMItem`/`bom_items_master` vs template `BomItem`/`bom_items`), the only CRUD endpoint edits *template* items, and the editor "saves" by writing BOM-line fields into the shared global `Part` record via `api.parts.update` â€” corrupting the master part instead of storing a BOM line. Initial rows come from static seed data, never from an explosion endpoint.
- **Several flows report success without doing the work.** `dataService` resolves writes as success whether the API call succeeded, threw, or (for some domains) was never wired at all; bulk import parses CSV but creates zero Parts; ERP sync/test return `status: completed`/`success` with no network call.

**Local-first framing:** the primary deployment is on-prem, one tenant per install. That *reduces the blast radius* of the tenant-isolation defects for that deployment (one tenant means "all tenants" = "the one tenant"), but it does **not** make the core correct: the explosion cross-BOM bug, the rollup math, the editor corrupting global parts, the no-op bulk import, and the fake ERP results are all deployment-independent and corrupt the single source of truth. Tenant isolation (app + DB) is a hard prerequisite before any shared/cloud deployment. **UI refinement on top of a core that returns the wrong tree and wrong costs is low-value and should wait.**

## Confirmed P0 defects

| # | Defect | Verdict | Evidence (file:line) | Impact |
|---|--------|---------|----------------------|--------|
| D1 | `get_bom_explosion` ignores `bom_id` and tenant; returns a global tree cached per-BOM | Confirmed | `backend/app/services/bom_service.py:148` seeds `_build_explosion_tree(db, None, â€¦)`; `:106` queries `BOMItem WHERE parent_item_id==None` (no `bom_id`, no `tenantId`); cache key `:144`; global `_part_cache` `:20` | Every BOM shows the same wrong tree; cross-tenant leak on shared deploys; `_part_cache` returns another tenant's pn/name for a shared part id |
| D2 | Quantity/cost rollups are single-level; no quantity multiplication; `levels` hardcoded `[1]` | Confirmed | `bom_service.py:169-178` flat sum + literal `"levels":[1]` at `:176`; cost `extended = unit_cost * item.quantity` at `:235` (own qty only) | Components under multi-qty sub-assemblies undercounted â†’ wrong cost and buy quantities |
| D3 | Fragmented BOM source of truth; no instance-item CRUD; dead `explode_bom`; dual PO models | Confirmed | Instance `BOMItem` `models/bom.py:22,54` vs template `BomItem` `models/bom_item.py:12`; `/bom-items` edits template only `api/endpoints/bom_items.py:12,32`; dead `explode_bom` references non-existent `parent_bom_item_id` `bom_service.py:950` and `part.partNumber` `:941`; deprecated `PurchaseOrder` `models/procurement.py:35-38` still ORM-mapped vs active `POHeader/POLineItem` `models/po_models.py` | No runtime BOM-line CRUD; latent `AttributeError`; schema ambiguity; duplicate PO representations |
| D4 | BOM editor has no instance-persistence path; edits mutate the global Part record | Partial (stronger than "localStorage") | `frontend/src/root/bom-editor.jsx:425,494` call `api.parts.update`; `dataService.setLocal('parts')` is a no-op `dataService.js:419`; rows sourced from static seed `context/AppCtx.jsx:174-175,218` | Editing a BOM line corrupts the shared master part; edits are not stored as BOM lines and don't survive as BOM data |
| D5 | Open, unauthenticated self-registration assigns new users to the first existing tenant | Confirmed | `backend/app/services/auth_service.py:238-241` `select(Tenant).limit(1)`, assigns `tenantId=default_tenant.id` `:256`; `/register` unauthenticated `api/endpoints/auth.py:186-204`, returns tokens `:202-204` | On any deploy with â‰¥1 tenant, an anonymous registrant lands inside an existing tenant with valid tokens â€” cross-tenant breach |
| D6 | Tenant isolation is app-layer only; no DB Row-Level Security | Confirmed | No RLS anywhere (no `CREATE POLICY`/`FORCE ROW LEVEL SECURITY` in `backend`/`alembic`); enforced only via `tenant_middleware.py:16-45`, `deps.py:119,197`, `tenant_context.py:23-36` | Any forgotten tenant predicate (exactly D1) crosses tenants; superusers bypass entirely |
| D7 | ~80 raw SQL sites need a parameterization audit | Partial | ~29 `db.execute(text(...))` sites; f-string SQL in `analytics.py`, `dashboard_service.py`, `search_service.py`, `calendar_events.py:78`, `tenant_context.py:28`, `backup.py:222`, `encryption.py:91-116`; **values are bound**, **identifiers guarded** (`encryption.py:86,89` `_validate_identifier`) | Low live-injection surface; interpolated fragments are code-controlled. Audit + guardrail warranted, not a confirmed live injection |
| D8 | Business keys are globally unique instead of tenant-scoped | Confirmed | `models/part.py:57` `pn unique=True`, `:91` barcode global; pervasive across `bom_number`, `poNumber`, `serialNumber`, `eco_number`, etc.; contrast composite `uq_vendor_tenant_name` `models/vendor.py:10`, `models/integration.py:23` | Two tenants cannot share a part number; integrity + isolation hazard; inconsistent with existing composite patterns |
| D9 | ECO approval chain not enforced; any engineer can approve (incl. self); no state machine | Confirmed | `api/endpoints/eco_api.py:145-162` `/action` gated only by `require_engineering`; `services/eco_service.py:165-211` sets `status='approved'` with no source-state check, no approver check, no `EcoApproval` gating; `/approve` `eco_api.py:165-202` hardcodes `approval_order=1` | Any engineering user approves any ECO, including their own â€” change control is not real |
| D10 | Digital signature discarded; no 21 CFR Part 11 e-signature | Confirmed | `digital_signature` param accepted `eco_service.py:171`, never persisted `:187-211`; `DigitalSignature` model `models/digital_signature.py:26-72` never written by ECO code; `/approve` stores free-text `eco_api.py:185`, no re-auth/hash/immutability | No compliant signing meaning, re-auth, tamper-evidence, or manifest (fails Â§11.50/Â§11.70/Â§11.200) |
| D11 | ECR and Approvals Inbox screens render localStorage mocks despite live backends | Confirmed | `components/advanced/ECRScreen.jsx:27,32-93,96,154-192` seeds/reads/writes `storage.ecrs` only; `root/final-polish.jsx:8-233` mutates `ctx.setApprovals` in memory; real wiring exists but unused `services/screenDataBridge.js:114-117,134-140`; dead ECR migration `dataService.js:366` | Change requests/approvals shown in UI are fiction; never reach the backend |
| D12 | WO hold/scrap and ECN/ECR status values violate DB CHECK constraints â†’ unhandled 500s | Confirmed | `models/work_order.py:64-67` allows no `on_hold`/`scrapped`, but `work_order_service.py:193-194` writes them â†’ IntegrityError at `:208`; `models/eco.py:70-73` disallows `issued`/`submitted`, but `eco_api.py:288,319` write them â†’ 500 at `:293,323` | Core WO and ECN/ECR actions 500 on commit; enforcement lives in DB constraints so a migration is also required |
| D13 | Bulk import parses CSV but never creates Parts/BOM lines | Confirmed | `api/endpoints/bulk_import.py:33-54` reads rows into `BulkImportRow`; `:92-107` remaps keys and sets `status='processed'`; no `Part(...)`/`BOMItem(...)` construction anywhere (`:11` imports only job/row models) | Import reports success but writes nothing to `parts`/`bom` â€” silent data loss of user work |
| D14 | ERP integration is 100% simulated but reported as success | Confirmed | `api/endpoints/erp_connectors.py:148-183` `/sync` writes `ERPSyncLog(recordsCount=0, status='completed')`, no client; `:209-215,218-228` test-connection returns `status:'success'`/"simulated successfully"; no `httpx`/`requests` import | UI reports successful syncs/connections that never happened |
| D15 | Frontend treats localStorage writes as API success, masking failures | Confirmed | `services/dataService.js:285-297` `set()` writes local then `try{await writer.create}catch{enqueueWrite}` â€” resolves regardless; same in `update()` `:299-315`, `remove()` `:317-331`; `savedViews`/`calendarEvents`/`savedSearches` have no writer `:103-132` | Callers cannot distinguish a real save from a swallowed error; some domains never hit the backend at all |
| D16 | Money columns are FLOAT, not Numeric (mixed across the schema) | Partial | Float money: `models/part.py:80,103-105`, `bom_item.py:28-29`, `procurement.py:53-56`, `po_models.py:76-79`, `price_history.py:19`, `contract.py`, `should_cost.py`; Numeric elsewhere: `bom.py:66-67`, `po_models.py:40-42`, `part.py:61` | Binary-float rounding drift in costs; the Float/Numeric split is itself an integrity hazard |
| D17 | RoHS/REACH compliance is a name/date stub with no substance model | Confirmed | `models/compliance.py` is id/name/description/isActive only; `api/endpoints/compliance_api.py:45-50,330-346` store only `compliance_id`/dates/notes; packs `:171-235,402-535` are QMS clause checklists | No substances/CAS/ppm thresholds/SVHC/exemptions â€” cannot actually assess material compliance |

*(No claims were refuted. D4/D7/D16 are Partial and retained with the corrected framing.)*

## Remediation plan

Ordered by (a) security / data-leak, (b) correctness, (c) integrity. Each item lists approach, files, acceptance criteria (testable), effort, and whether it needs its own dedicated design.

### (a) Security / data-leak

#### R1 â€” Scope BOM explosion to `bom_id` + tenant, and multiply quantities down the tree *(fixes D1; also the flagship correctness fix)*
- **Approach:** Rewrite `_build_explosion_tree`/`get_bom_explosion` so traversal is rooted in the requested BOM: seed with `BOMItem WHERE bom_id == bom_id AND parent_item_id IS NULL`, and constrain every recursive level to the same `bom_id` and to `get_tenant_id()` (mirror `get_bom_detail:63-65`). Propagate `effective_quantity = parent_effective_qty * item.quantity` and include it on each node. Add `bom_id` (and tenant) to the cache key. Key `_part_cache` by `(tenant_id, part_id)` or replace it with a per-call parts map.
- **Files:** `backend/app/services/bom_service.py`, `backend/app/api/endpoints/bom_enterprise.py`
- **Acceptance criteria:**
  - `get_bom_explosion(db, bom_id)` returns only items whose `bom_id` equals the requested BOM; items from other BOMs never appear.
  - Under tenant A, a request cannot return any `BOMItem` of tenant B (two-tenant fixture).
  - Each node carries `effective_quantity` = product of its own and all ancestor quantities.
  - Two different `bom_id`s requested in sequence return different trees (no cross-key cache poisoning).
  - `_part_cache` never returns another tenant's pn/name for the same `part_id`.
- **Effort:** M Â· **Dedicated design:** No (surgical)

#### R2 â€” Close open self-registration tenant assignment *(fixes D5)*
- **Approach:** In `register_new_user`, stop attaching self-registrants to `select(Tenant).limit(1)`. Default to an invite/tenant-token model (tenant is explicit); keep auto-tenant-creation only for the true bootstrap case (zero tenants). Gate the public `/register` behind `settings.ALLOW_OPEN_REGISTRATION` and require the invite token when open registration is disabled.
- **Files:** `backend/app/services/auth_service.py`, `backend/app/api/endpoints/auth.py`, `backend/app/core/config.py`
- **Acceptance criteria:**
  - With â‰¥1 tenant and no valid invite token, `POST /api/v1/auth/register` returns 4xx and creates no `User`.
  - With a valid invite token, the new user's `tenantId` equals the token's tenant â€” never `select(Tenant).limit(1)`.
  - With zero tenants, bootstrap registration still creates a fresh dedicated tenant.
  - No code path selects an existing tenant not explicitly supplied by the caller.
- **Effort:** S Â· **Dedicated design:** No (surgical)

#### R3 â€” Audit and harden raw-SQL construction *(addresses D7)*
- **Approach:** Review every `text(f"â€¦")` site (`analytics.py`, `dashboard_service.py`, `search_service.py`, `calendar_events.py`, `tenant_context.py`, `backup.py`, `encryption.py`) and prove no interpolated identifier fragment (`{tf}`,`{where}`,`{sets}`,`{field}`,`{table}`) derives from request input; route any that can through an allowlist / `_validate_identifier`. Keep all values bound. Add a CI/lint rule flagging f-string interpolation inside `text()`.
- **Files:** `backend/app/api/endpoints/analytics.py`, `backend/app/services/dashboard_service.py`, `backend/app/services/search_service.py`, `backend/app/api/endpoints/calendar_events.py`, `backend/app/core/backup.py`, `backend/app/core/encryption.py`
- **Acceptance criteria:**
  - Every interpolated SQL fragment is documented as constant or allowlisted; none derives from unvalidated request input.
  - All user-supplied values remain bound parameters across audited files.
  - CI fails when a new `text(f"â€¦")` interpolates a non-allowlisted identifier.
  - Injecting SQL metacharacters into filterable params (e.g. search terms, `event_type`) returns safely filtered results, no SQL error/leak.
- **Effort:** M Â· **Dedicated design:** No (bounded audit + guardrail)

#### R4 â€” Database-level tenant isolation via PostgreSQL RLS *(defense-in-depth for D6; backstops D1/D5)*
- **Approach:** Enable RLS + `FORCE ROW LEVEL SECURITY` on every `TenantAwareMixin` table with a policy keyed on a per-connection GUC (e.g. `app.current_tenant_id`) set from the tenant contextvar at session checkout and reset on release. Reconcile with the superuser/no-tenant bypass and the raw-SQL paths. Cross-cutting: touches pooling, every tenant-aware table, and migration ordering.
- **Files:** `backend/app/db/session.py`, `backend/app/core/tenant_context.py`, `backend/app/models/mixins.py`, `backend/alembic/versions/`
- **Acceptance criteria:**
  - Every `TenantAwareMixin` table has RLS enabled and `FORCE ROW LEVEL SECURITY` via migration.
  - A deliberately tenant-unfiltered query returns only the current connection's tenant rows (two-tenant seed).
  - The GUC is tied to connection acquire/release so pooled connections can't leak a prior request's tenant.
  - Superuser/no-tenant behavior is explicitly defined, documented, and tested (intentional bypass, not accidental full access); design doc covers migration/performance.
- **Effort:** XL Â· **Dedicated design:** **Yes â€” needs its own brainstorm/design cycle.**

### (b) Correctness

#### R5 â€” Multi-level quantity and cost rollups with true effective quantities *(fixes D2)*
- **Approach:** Replace the flat sums with a tree walk (reuse the corrected R1 traversal) accumulating `effective_quantity`. Quantity rollup aggregates effective quantity per part and emits the actual set of levels a part appears at (drop the `[1]` literal). Cost rollup computes `extended = unit_cost * effective_quantity`; keep `cost_by_level`/`cost_by_category` keyed off real depth. Add explicit tenant filter to the item queries.
- **Files:** `backend/app/services/bom_service.py`
- **Acceptance criteria:**
  - For sub-assembly S (qty 2) containing part P (qty 3), quantity rollup reports `total_quantity = 6`, not 3.
  - No response contains a hardcoded `"levels": [1]`; entries report the real level(s).
  - `total_cost` = Î£ `unit_cost * effective_quantity` over all leaf occurrences.
  - Rollup queries are tenant-scoped and match a recursive hand-computation on a fixture BOM.
- **Effort:** M Â· **Dedicated design:** No (surgical; depends on R1)

#### R6 â€” Remove or repair the dead `explode_bom` helper *(fixes D3 latent crash)*
- **Approach:** `explode_bom` is unreferenced and uses non-existent `BOMItem.parent_bom_item_id` (`:950`) and `part.partNumber` (`:941`). Confirm no imports, then delete it; or, if a flat explosion is still wanted, fix to `parent_item_id`/`pn` and route through the corrected tenant/`bom_id`-scoped traversal.
- **Files:** `backend/app/services/bom_service.py`
- **Acceptance criteria:**
  - No path can raise `AttributeError` for `parent_bom_item_id` or `partNumber`.
  - `grep` for `explode_bom` shows either no definition or a single wired definition that passes a smoke test.
  - If retained, it is `bom_id`- and tenant-scoped like `get_bom_explosion`.
- **Effort:** S Â· **Dedicated design:** No (surgical)

#### R7 â€” Fix status-value mismatches causing 500s (WO hold/scrap; ECN/ECR issued/submitted) *(fixes D12)*
- **Approach:** Reconcile the app status vocabulary with the DB constraints/enums. (1) Add `on_hold`/`scrapped` to `WorkOrder.status` and `issued`/`submitted` to `EcoHeader.status`. (2) New alembic migration (next id after 031) altering the corresponding CHECK/enum types â€” verify whether migration 023's enums make `status` a Postgres enum vs CHECK and alter accordingly. Wrap the commits in `perform_work_order_action` and the ECN/ECR creators so an `IntegrityError` surfaces a 4xx, never a raw 500.
- **Files:** `backend/app/models/work_order.py`, `backend/app/models/eco.py`, `backend/app/api/endpoints/eco_api.py`, `backend/app/services/work_order_service.py`, `backend/alembic/versions/`
- **Acceptance criteria:**
  - `action='hold'` persists `on_hold`; `action='scrap'` persists `scrapped`; no IntegrityError.
  - `POST /eco/ecn` persists `status='issued'`; `POST /eco/ecr` persists `status='submitted'`.
  - The new migration applies cleanly up and down and the DB accepts the new values.
  - A regression test exercises all six WO actions plus the ECN/ECR creators against a (transactional) DB and asserts no 500; any residual violation returns a descriptive 4xx.
- **Effort:** M Â· **Dedicated design:** No (surgical + migration)

### (c) Integrity

#### R8 â€” Enforce ECO approval state machine + approver-identity RBAC (surgical) *(fixes D9)*
- **Approach:** Add an explicit allowed-transitions map in `perform_eco_action` (`approve`/`reject` only from `review`, `implement` only from `approved`, `close` only from `implemented`). Reject self-approval (`eco.requested_by == current_user.id`) and require a designated-approver role/permission rather than any engineer â€” tighten `eco_api.py:150` off `require_engineering` to a dedicated approver permission in `rbac.py`, or validate against the `EcoApproval` rows. Flip to `approved` only when the required `EcoApproval` record(s) for the current `approval_order` are satisfied. Consolidate the divergent `/action` and `/approve` endpoints into one enforced path. (Full sequential engine deferred to X-item below.)
- **Files:** `backend/app/services/eco_service.py`, `backend/app/api/endpoints/eco_api.py`, `backend/app/core/rbac.py`
- **Acceptance criteria:**
  - `approve` on an ECO not in `review` returns 400, no status change.
  - A non-approver (lacking the role/permission) gets 403.
  - The requester cannot approve their own ECO (403/400).
  - Invalid transitions (`implement` from `draft`, `close` from `review`) return 400.
  - Only one enforced code path sets `status='approved'`; the redundant endpoint is removed or delegates to it.
  - Unit tests cover each valid/invalid transition + self-approval + wrong-role.
- **Effort:** M Â· **Dedicated design:** No (surgical hardening)

#### R9 â€” Surface write/sync failures instead of masking them in `dataService` *(fixes D15)*
- **Approach:** Change `set/update/remove` so that when a writer exists and the app is online, an API failure is not swallowed: rethrow, or return a discriminated `{ok:false, queued:true, error}`. Keep offline queueing but reflect queued-but-unconfirmed via the existing `SYNC_EVENT`/`pendingCount`. For writer-less domains (`savedViews`/`calendarEvents`/`savedSearches`), add a writer or explicitly mark them local-only in the return value.
- **Files:** `frontend/src/services/dataService.js`, `frontend/src/context/AppCtx.jsx`, `frontend/src/components/TopBar.jsx`
- **Acceptance criteria:**
  - When online and the API write throws, `set/update/remove` signals failure (reject or `{ok:false}`), not success.
  - UI shows a distinct "pending sync" / "save failed" state for queued/errored writes.
  - Local-only domains report as local-only, not persisted.
  - Offline writes still enqueue and replay via `processQueue` without data loss.
- **Effort:** M Â· **Dedicated design:** No (surgical)

#### R10 â€” Stop reporting simulated ERP sync/test as success *(fixes D14)*
- **Approach:** Until WS3's connector framework lands, make the endpoints honest: `/sync` returns 501 or persists `ERPSyncLog.status='simulated'` (never `completed` with `recordsCount=0`); both test-connection endpoints return `status='simulated'` with a message that states no real connection was attempted. Gate any simulation behind an explicit config flag. Real connectors are out of scope (WS3 owns `backend/app/integrations`).
- **Files:** `backend/app/api/endpoints/erp_connectors.py`, `backend/app/schemas/erp_connector.py`
- **Acceptance criteria:**
  - `/sync` no longer returns `status='completed'`; returns `simulated`/501 and the log row matches.
  - Test-connection responses have `status != 'success'` and don't claim a real connection.
  - `recordsCount` is never presented as a real transfer count while simulated.
  - A feature flag controls whether simulation responses are emitted at all.
- **Effort:** S Â· **Dedicated design:** No (surgical)

#### R11 â€” Make bulk import actually create Parts (BOM lines phased) *(fixes D13)*
- **Approach:** In `/process`, after remapping each row, build a validated Part payload via the Parts create schema/service (not raw dicts), upsert by `pn` within `current_user.tenantId`, and record created/updated/skipped per row with real messages on `row.errors`. Use a per-row savepoint so one bad row doesn't poison the batch; derive job counters from real outcomes. Add a target-entity selector (`parts` vs `bom lines`); BOM-line creation depends on the canonical BOM model (X1) and is phased behind it.
- **Files:** `backend/app/api/endpoints/bulk_import.py`, `backend/app/schemas/bulk_import.py`, `backend/app/services/` (parts create/service), `backend/app/models/part.py`
- **Acceptance criteria:**
  - Valid mapping creates one Part per data row in the caller's tenant (verifiable via `GET /parts` count).
  - Duplicate-`pn`/constraint-failing rows are marked `status='error'` with a readable message and do not abort other rows.
  - `job.processedRows`/`errorRows` reflect real DB outcomes, not remap success.
  - Created Parts carry the caller's `tenantId`; a failed row leaves zero partial commits.
- **Effort:** L Â· **Dedicated design:** No (surgical; BOM-line phase depends on X1)

#### R12 â€” Wire ECR and Approvals Inbox screens to real backend APIs *(fixes D11)*
- **Approach:** Replace the localStorage/in-memory sources with the existing bridge: load ECRs via `screenData.ecrs.list()` and approvals via `screenData.approvals.list()`; route create/advance/approve/reject through `screenDataBridge` (which already falls back to local when offline). Align ECR status labels with the reconciled vocabulary from R7. Remove the dead ECR migration no-op (`dataService.js:366`). Confirm the bridge's expected endpoints (`getApi().eco.list/get/approve`, `getApi().approvals.*`) exist with the right shapes; add thin endpoints for any missing route.
- **Files:** `frontend/src/components/advanced/ECRScreen.jsx`, `frontend/src/root/final-polish.jsx`, `frontend/src/services/screenDataBridge.js`, `frontend/src/services/dataService.js`
- **Acceptance criteria:**
  - ECR screen renders ECRs fetched from the API, not the hardcoded seed.
  - Creating an ECR issues a persisting POST; the row survives a full reload with cache cleared.
  - Approve/reject/advance in both screens call backend endpoints and reflect server state.
  - Approvals Inbox lists pending items from the backend, not the hardcoded array.
  - Offline degrades gracefully via existing fallback and re-syncs on reconnect; no mock seeding when a backend response is available.
- **Effort:** L Â· **Dedicated design:** No (feature wiring)

#### R13 â€” Make business-key unique constraints tenant-scoped *(fixes D8)*
- **Approach:** Convert globally-unique business keys on tenant-scoped tables to composite `(tenantId, <key>)`, following `vendor.py:10` / `integration.py:23`. Start with `parts.pn`/`parts.barcode`, then sweep the enumerated `*_number`/`*_code` columns. Add an alembic migration that (1) dedups existing cross-tenant collisions, (2) drops the old global unique index, (3) creates the composite. Needs a short design decision on which keys are legitimately global (`users.email`, session `jti`) vs per-tenant, plus the dedup/backfill strategy.
- **Files:** `backend/app/models/part.py`, `backend/app/models/bom.py`, `backend/app/models/procurement.py`, `backend/app/models/po_models.py`, `backend/app/models/eco.py`, `backend/app/models/mbom.py`, `backend/app/models/work_order.py`, `backend/app/models/traceability.py`, `backend/alembic/versions/`
- **Acceptance criteria:**
  - `parts.pn`/`parts.barcode` are unique per `(tenantId, value)`; two tenants can each create the same `pn`.
  - No tenant-scoped model retains a bare global `unique=True` on a business key unless documented as intentionally global.
  - A reversible migration dedups pre-existing cross-tenant collisions before each composite constraint.
  - Duplicate key within the same tenant still fails with a unique violation.
- **Effort:** L Â· **Dedicated design:** Yes (short design for global-vs-scoped classification + dedup strategy)

#### R14 â€” Wire the BOM editor to real BOM-instance persistence *(fixes D4; depends on X1)*
- **Approach:** Stop persisting BOM-line edits through `api.parts.update` (`bom-editor.jsx:425`, save handler ~`:494`). Load initial rows from the corrected explosion endpoint (R1) instead of static seed; persist create/update/delete/reorder through the new instance-items CRUD API (from X1). Keep localStorage only for genuinely client-side state (saved views, prefs, offline queue). Update `AppCtx` row sourcing (`:174-240`) and `dataService` accordingly.
- **Files:** `frontend/src/root/bom-editor.jsx`, `frontend/src/context/AppCtx.jsx`, `frontend/src/services/dataService.js`, `frontend/src/screens/BomEditorScreen.jsx`
- **Acceptance criteria:**
  - Editing a BOM line quantity/vendor/cost persists to the BOM instance item and does NOT modify the shared part record.
  - Reloading shows persisted edits sourced from the explosion endpoint, not static seed.
  - Save/discard operate against server BOM-item state; a failed sync surfaces an error rather than silently succeeding.
  - localStorage no longer holds BOM structural data (only view/pref/offline-queue state).
- **Effort:** L Â· **Dedicated design:** No (surgical, but blocked on X1)

### XL / architectural â€” each needs its own dedicated design cycle

#### X1 â€” Canonical BOM model consolidation + instance-items CRUD API
- **Approach:** Define one authoritative runtime instance-item entity, disambiguate it from template items, resolve the `BOMItem` (`bom_items_master`) vs `BomItem` (`bom_items`) split and the `bom_templates`â†”`boms` relationship, and add a tenant-scoped CRUD + reorder API for instance items. Requires data migration and coordination with `export_report.py`/`service_bom.py`, which query `bom_items` directly. Underpins R14 and the BOM-line phase of R11.
- **Files:** `backend/app/models/bom.py`, `backend/app/models/bom_item.py`, `backend/app/api/endpoints/bom_items.py`, `backend/app/services/bom_service.py`, `backend/app/api/endpoints/export_report.py`, `backend/app/api/endpoints/service_bom.py`
- **Acceptance criteria:** one canonical instance-item entity with a documented template relationship and migration plan; a tenant-scoped CRUD + reorder API backed by it; no two near-identically-named classes/tables silently diverge; all readers (explosion, rollups, snapshots, export, service BOM) target the canonical model.
- **Effort:** XL Â· **Dedicated design:** **Yes.**

#### X2 â€” Retire the deprecated `PurchaseOrder` model; unify on `POHeader`/`POLineItem`
- **Approach:** Migrate FK references (`document.py`, `traceability.py`) off `procurement.py:PurchaseOrder` onto `po_models.py`, run the data migration (`scripts/consolidate_po.py` referenced in the deprecation note), then drop the model and table.
- **Files:** `backend/app/models/procurement.py`, `backend/app/models/po_models.py`, `backend/app/models/document.py`, `backend/app/models/traceability.py`, `backend/alembic/versions/`
- **Acceptance criteria:** no model/FK references `purchase_orders`/`PurchaseOrder` after migration; all PO data via `POHeader`/`POLineItem` with a verified backfill; an idempotent migration; PO create/list/advance/delete pass against the unified model.
- **Effort:** L Â· **Dedicated design:** Yes (schema migration + downstream references).

#### X3 â€” Money FLOAT â†’ Numeric migration with precision/rounding policy
- **Approach:** Standardize all monetary columns on `Numeric(p,s)` (e.g. `Numeric(14,4)` unit costs, `Numeric(14,2)` totals), eliminate the Float/Numeric split, define rounding (half-even) and currency handling, author a safe FLOATâ†’NUMERIC alembic cast + backfill + verification, and move Pydantic schemas to `Decimal`.
- **Files:** `backend/app/models/{part,bom_item,procurement,po_models,price_history,contract,should_cost,supplier_portal,part_vendor}.py`, `backend/alembic/versions/`, money-bearing `backend/app/schemas/`
- **Acceptance criteria:** no monetary column typed Float; migration converts without data loss under a documented rounding rule; API serializes money as fixed-scale decimals (no float drift); post-migration rollups match hand-computed totals to scale.
- **Effort:** L Â· **Dedicated design:** Yes.

#### X4 â€” Real 21 CFR Part 11 e-signatures + sequential multi-approver ECO chain *(supersedes R8; fixes D10)*
- **Approach:** Persist signatures via `DigitalSignature` (or an extension) capturing signer identity, signing meaning/reason, UTC timestamp, IP/UA, and a hash bound to the exact document version; require re-authentication (password and/or MFA via `UserMfa`) at signing; make records immutable and audited. Replace single-level approve with a configurable sequential chain driven by `EcoApproval.approval_order`.
- **Files:** `backend/app/models/digital_signature.py`, `backend/app/models/eco.py`, `backend/app/services/eco_service.py`, `backend/app/api/endpoints/eco_api.py`, `backend/alembic/versions/`
- **Acceptance criteria:** signing requires successful re-auth; each signature persists identity/meaning/timestamp/IP-UA/version-hash and is immutable; ECO reaches `approved` only after all ordered approvers sign; a tamper check detects post-signature modification; a queryable, export-ready audit trail links every signature to its ECO; design documented and reviewed first.
- **Effort:** XL Â· **Dedicated design:** **Yes.**

#### X5 â€” Real RoHS/REACH substance-declaration data model *(fixes D17)*
- **Approach:** Introduce `Substance` (name, CAS, regulatory/SVHC membership), `PartSubstance` (part, substance, ppm concentration, homogeneous-material context, exemption code, declaration doc), and codified threshold rules (RoHS max concentration, REACH SVHC 0.1% w/w). Derive compliance status from substance data + thresholds; keep existing certifications as attestations layered on top.
- **Files:** `backend/app/models/compliance.py`, `backend/app/api/endpoints/compliance_api.py`, new substance/material models + declaration schemas, `backend/alembic/versions/`
- **Acceptance criteria:** a part carries per-substance declarations (CAS, ppm, homogeneous-material/exemption context); RoHS/REACH pass/fail is computed from concentrations vs codified thresholds; SVHC >0.1% w/w and RoHS over-threshold substances are auto-flagged at the part level; existing certification records reference the derived status.
- **Effort:** XL Â· **Dedicated design:** **Yes.**

## Suggested sequencing

**Fix now â€” surgical (S/M), no dedicated design.** These are high-value, low-risk, and unblock everything else:
1. **R1** (explosion `bom_id`+tenant scoping + effective qty) â€” M. The single highest-value fix: closes the cross-tenant leak *and* corrects the tree; R5 and R14 depend on it.
2. **R2** (multi-level rollups) â€” M. Depends on R1; restores correct cost/quantity math.
3. **R6** (delete/repair dead `explode_bom`) â€” S. Removes a latent crash while touching the same file.
4. **R7** (WO/ECO status â†” CHECK-constraint 500s) â€” M. Core actions currently 500.
5. **R2b/R8** (ECO state machine + approver RBAC + no self-approval) â€” M. Makes change control real without the full compliance build.
6. **R2/R4-security block:** **R3** (raw-SQL audit) â€” M, and **R4-auth: R2** (close open self-registration) â€” S. Both bounded.
7. **R9** (unmask dataService write/sync failures) â€” M, and **R10** (honest ERP simulated status) â€” S. Stop lying to the user.

**Fix soon â€” larger surgical (L), still no full design cycle:** **R11** (bulk import creates Parts, parts phase), **R12** (wire ECR/Approvals screens), **R14** (BOM editor real persistence â€” blocked on X1). **R13** (tenant-scoped unique constraints) is L and needs a *short* classification design but is otherwise mechanical.

**Needs its own design cycle (XL / architectural) â€” do not bulk-patch:**
- **X1** Canonical BOM model consolidation (blocks R14 and the BOM-line phase of R11).
- **R4-security: RLS** (DB row-level security) â€” the defense-in-depth backstop for D1/D5/D6; required before any shared/cloud deployment.
- **X4** Real 21 CFR Part 11 e-signatures + sequential multi-approver chain (supersedes R8's surgical version).
- **X2** PO model unification, **X3** money FLOATâ†’Numeric, **X5** RoHS/REACH substance model.

**Recommended order:** R1 â†’ R2 â†’ R6 â†’ R7 â†’ R8 â†’ (R2-auth self-registration) â†’ R3 â†’ R9 â†’ R10 â†’ R11/R12 â†’ R13 â†’ then kick off the design cycles for X1 and RLS in parallel, with R14 and the R11 BOM-line phase landing after X1; X4, X2, X3, X5 follow their own designs.

**Program placement:** This core-correctness work should slot in **after WS3** (`backend/app/integrations/*`, `work_queue.py`, frontend `LazyScreens`/`App`/`NavRail`) to avoid merge conflicts with that in-flight workstream, and â€” per the program â€” **before the app-wide UI refinement**. Polishing the UI on top of a core that returns the wrong explosion tree, wrong rollup costs, silently-failing saves, and (on shared deploys) cross-tenant data is low-value; the UI should be refined once it renders correct, honestly-persisted data.