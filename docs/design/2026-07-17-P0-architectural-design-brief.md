Citations verified (bom.py:59 Integer qty, tenant_events.py:51-55 raw-SQL warning, po_models.py:63-82 column names + itemName NOT NULL, pgbouncer transaction mode). Synthesizing the brief.

# P0 ARCHITECTURAL DESIGN BRIEF

> DESIGN PREP for a stakeholder brainstorm. Read-only analysis of the BOM/PLM platform (FastAPI + async SQLAlchemy/asyncpg + PostgreSQL; React + Vite). LOCAL-FIRST (on-prem primary, cloud optional). A concurrent P0 branch is fixing core logic (BOM explosion scoping, ECO RBAC); everything below is designed against the **model/schema structure**, not that branch's in-flight edits.

## Summary

These are the **architectural** items pulled out of the surgical P0 remediation batch because they are structural (new tables/roles/migrations, cross-cutting rewrites, or product-behavior changes) rather than point fixes. They were deferred from the surgical batch for three reasons: (1) they carry **schema/migration blast radius** that needs a maintenance window and reversible Alembic revisions, not a hotfix; (2) two of them (X1, RLS) are **XL** and touch the same files the concurrent P0 logic branch is editing, so they must be sequenced to avoid merge collisions; and (3) several require an explicit **stakeholder decision** (product behavior, regulatory depth, precision policy) before any code is written.

There are two XL anchors and a cluster of smaller items:

- **X1 â€” Canonical BOM model.** Unblocks editor persistence (R14) and bulk-import BOM-line phase (R11). Recommended posture is **additive** (new CRUD + editor rewire), lowest merge risk.
- **RLS â€” Row-level security.** The database-layer security backstop for multi-tenant isolation; closes the raw-SQL "forgotten predicate" leak class the ORM filter cannot cover.
- **Smaller items** â€” PO unify, money Numeric + UOM, tenant-scoped unique keys, 21 CFR Part 11 e-sign, RoHS/REACH substance model.

**Recommended order to tackle:** integrity/hygiene first, features last.
1. **Data-integrity foundation** â€” money FLOATâ†’Numeric + fractional qty + UOM table, and tenant-scoped unique keys (both **L**).
2. **X1 â€” Canonical BOM model** (**L**) â€” additive, unblocks R11/R14; includes finishing PO dedup.
3. **RLS** (**XL**) â€” security backstop; build behind a flag, staged enforcement.
4. **Regulated features** â€” Part 11 e-sign, then RoHS/REACH substance model (both **Lâ€“XL**).

X1 unblocks the most product value soonest and is the lowest-risk XL; RLS is the security backstop and can proceed in parallel behind a flag because it is purely additive to the schema (policies + role split). Do the money/qty/key hygiene **before** the regulated features so FLOAT rounding and global-unique keys never contaminate a Part-11 signed record or a substance-mass roll-up.

---

## X1 â€” Canonical BOM model

Consolidate the instance-BOM data model, add server-side editor persistence, and finish PO-model dedup. **Effort: L.** Blocks **R14** (editor persistence) and **R11** (bulk-import BOM-line phase).

### Current state

The BOM domain has **three parallel line-item worlds** plus a frontend that persists to none of them, and a **fourth** dedup sub-track for POs.

1. **Instance BOM** â€” `BOM` (table `boms`) + `BOMItem` (table `bom_items_master`), `backend/app/models/bom.py:21-78`. Snake_case + `Integer` qty (`bom.py:59`), `Numeric(10,4)` costs (`bom.py:66-67`), `parent_item_id` self-FK for multi-level (`bom.py:63-65`), `sort_order`, `reference_designator`, `unit`. **This is the model the entire enterprise stack is built on**: explosion (`bom_service.py:103-170`), qty/cost rollup (`211-307`), where-used (`313-461`), snapshots (`467-535`), baselines (`626-704`), compare (`567-620`), export (`820-855`); plus snapshots (`bom_snapshot.py:24-72`), variants (`bom_variant.py:29-46`, `base_bom_idâ†’boms.id`), MBOM (`mbom.py:30`, `ebom_idâ†’boms.id`), and `BOM.relationships` (`bom.py:38-42`). **CRITICAL GAP: there is NO runtime CRUD for `BOMItem`** â€” no create/update/delete route exists. `bom_enterprise.py` (mounted at `/bom`, `api_v1.py:207-210`) exposes only analytics + snapshots + variants + template-apply + import. `import_bom` creates a header with **0 items** and tells the caller to "Import items via BOM Items API" (`bom_service.py:880-882`) â€” but that API operates on the *template* model. `create_bom` (`bom_service.py:91-97`) has no endpoint.

2. **Template BOM** â€” `BomTemplate` (table `bom_templates`) + `BomItem` (table `bom_items`). camelCase + `Integer` qty + **`Float`** cost. **This is the ONLY model with full runtime CRUD**: create/bulk/get/update/patch/delete/bulk-delete/reorder (`bom_items.py:39-191`) plus template CRUD + `/{id}/load` (`bom_templates.py:162-186`). `apply_template` copies template rows into `BOMItem` rows (`bom_service.py:955-976`) â€” the only place the two worlds connect.

3. **Frontend editor** â€” `frontend/src/root/bom-editor.jsx`. Rows come from `convertApiPartsToTree(apiParts)` which maps the **global parts catalog** to rows with `id = "api-"+part.id` (`utils/bom.js:1-34`); qty/rev are read off the `Part`, not a BOM line. Line edits persist via `api.parts.update(realId, patch)` â€” **mutating the shared global Part record** (`bom-editor.jsx:421-434` inline, `487-514` bulk Save). Structural edits â€” add (`258-283`), delete (`918-951`, `1067-1096`), duplicate (`883-912`), drag-reorder (`388-420`) â€” mutate **local React state only** and are never persisted. No `bom_id` is ever involved: the editor edits the parts catalog, not a BOM. This is exactly why R14 and R11 are blocked â€” **there is no instance-line write path.**

4. **Dual PO models** â€” `POHeader`/`POLineItem` (`po_models.py:20-89`) is canonical and what `procurement_service.py` (+ po_order/order_tracking/supplier_portal) use. `PurchaseOrder` (`procurement.py:34-83`) is explicitly **DEPRECATED and now ORPHANED** â€” the only live reference is the import in `models/__init__.py:76` (its docstring's claim of document.py/traceability.py FKs is stale; grep confirms none remain). A finished-looking migration path exists: `migrated_to_po_headers` + `po_header_id` bridge columns (`procurement.py:59-60`) and `scripts/consolidate_po.py` (with `--dry-run`/`--force`). *Note: the smaller-items triage found this script is column-drifted against the real `po_line_items` schema â€” see Smaller items (a).*

*Naming/type divergence:* snake_case+Integer+Numeric (instance) vs camelCase+Integer+Float (template). `quantity` is `Integer` in both â€” a logic concern owned by the concurrent P0 branch and by the money/qty item below; noted only here.

### Options

| Option | Approach | Pros | Cons |
|---|---|---|---|
| **A â€” Canonicalize `BOM`/`BOMItem` (`bom_items_master`); keep template model as a pure library** *(recommended)* | Declare `BOM`+`BOMItem` the single source of truth for instance BOMs. Build the missing instance-line CRUD (mechanical mirror of `bom_items.py`), add `GET /bom/{bom_id}/items`, optionally `/boms` header CRUD wrapping `create_bom`. Repoint editor to load lines for a `bom_id` and persist to `BOMItem` (never `Part`). Keep `BomTemplate`/`BomItem` strictly as the template library; `apply_template` stays the bridge. Point R11 at `BOMItem`. | **Near-zero consumer migration** â€” explosion, rollup, where-used, snapshots, baselines, compare, export, variants, MBOM already read `BOMItem`/`boms.id`. **All-additive** (new endpoints + editor rewire + import target) â€” does NOT rewrite the P0 branch's explosion/rollup, so **lowest merge risk**. `bom_items_master` already has every needed column â€” **no item-table schema change**. Clear split: `bom_items` = template library, `bom_items_master` = project instances. | Two item tables persist (acceptable, with clear roles). Must build CRUD that duplicates the template shape. Requires a real `bom_id`/BOM-selection context in the editor â€” a **product-behavior change**. Two CRUD surfaces to maintain. |
| **B â€” Unify on the template model (`BomItem`/`bom_items`)** | Extend `BomItem` to carry both a template parent and an instance parent (new nullable `bom_id` or polymorphic `parent_type/parent_id`), reuse existing `/bom-items` CRUD for the editor, migrate the enterprise stack to read `BomItem`. | Fastest to unblock R14/R11 â€” CRUD + reorder already exist and are tested. | **Massive downstream churn** â€” every enterprise consumer is written against `BOMItem`/`boms.id` and needs rewrite or a shim. Polymorphic/dual-nullable parent is an anti-pattern (orphan/ambiguity bugs). camelCase+Float clash with house style. Collapses the template/instance distinction. **High collision risk with the concurrent P0 branch**, which edits the very consumers this rewrites. |
| **C â€” New unified `bom_lines` + typed header** | One normalized line table (Numeric qty/cost, snake_case) under a header typed template\|instance\|variant; migrate both existing line tables (and optionally variant/service/MBOM) into it; one CRUD for all. | Cleanest long-term single source of truth; consistent naming/types; could subsume variant/service/MBOM lines and kill JSON-snapshot drift over time. | **Largest, highest-risk migration** â€” touches every consumer plus snapshot JSON and revision snapshot items. Big-bang schema change is especially painful for on-prem installs. **Directly overlaps the P0 branch's models** â€” worst merge/timing risk. Over-engineered for the immediate R11/R14 unblock. |

### Recommendation

**Adopt Option A.** Canonicalize `BOM`+`BOMItem` (`bom_items_master`) as the instance-BOM model because the entire enterprise machinery, snapshots, baselines, variants, MBOM, and service-BOM already reference it â€” so consolidation is almost entirely **additive** (new CRUD + editor rewire + import target) rather than a destructive schema merge. That is the safest posture while the P0 branch is concurrently editing explosion/rollup logic in `bom_service.py`: Option A adds endpoints and leaves that logic untouched, whereas B and C rewrite exactly the code the P0 branch is changing.

Keep `BomTemplate`/`BomItem` as the reusable template library (`bom_items` = template, `bom_items_master` = instance), with `apply_template` (`bom_service.py:955-976`) as the sanctioned templateâ†’instance instantiation. **Editor persistence fix:** the editor must operate on a selected `bom_id`, load `BOMItem` rows (row id = `BOMItem.id`, replacing `"api-"+part.id` in `utils/bom.js`/`convertApiPartsToTree`), persist line fields to `BOMItem` via the new CRUD, and **stop writing qty/structure into the shared `Part`** (`bom-editor.jsx:421-434`, `487-514`). Part-intrinsic fields become read-only in BOM context or route through an explicit "edit part master" action. Treat **PO dedup** as an independent, low-risk sub-task (see Smaller items (a) for the script-fix prerequisite). Defer Option C to a later phase.

### Migration strategy

No column changes on `bom_items_master` â€” it already has `parent_item_id`, `sort_order`, `unit`, `unit_cost_snapshot`, `extended_cost`. Work is **new endpoints + editor rewire**, packaged as repeatable Alembic revisions (not manual steps) for on-prem installs.

1. **Backend** â€” add instance-line CRUD for `BOMItem` mirroring `bom_items.py` (create/bulk/update/patch/delete/bulk-delete/reorder) + `GET /bom/{bom_id}/items` joined to `Part` for display fields; optionally `/boms` header CRUD around `create_bom`.
2. **R11** â€” point bulk import at `BOMItem` (fix `import_bom`, which today creates 0 items, `bom_service.py:858-882`).
3. **Frontend** â€” replace `convertApiPartsToTree` with `convertBomItemsToTree` (real `BOMItem` ids, preserve `parent_item_id` hierarchy), load by `bom_id`, route add/delete/reorder/duplicate/inline edits to the new endpoints, remove the `parts.update` line-persistence path.
4. **Verify** enterprise consumers unchanged (they already read `BOMItem`); confirm snapshot/compare still serialize from `BOMItem` (they do â€” `bom_snapshot.py`, `bom_service.py:490-509`).

Data migration is mostly **greenfield** â€” no persisted instance lines exist today (structural edits were never saved), so decide backfill vs clean cutover. **Coordinate timing with the P0 branch:** land Option A's additive endpoints after/alongside P0's `bom_service` changes; do NOT modify explosion/rollup logic here.

### Decisions needed

*(consolidated and numbered in the final section)* â€” canonical model choice; editor scoping product change; Part-level edits from the editor; backfill vs clean cutover; qty Integer vs Numeric; add `/boms` header CRUD; keep template library separate; run `consolidate_po.py` + drop legacy PO now.

### Risks

- **Merge collision** with the P0 branch editing `bom_service.py` explosion/rollup â€” mitigate by keeping X1 additive (no logic edits).
- **Product-behavior change** â€” users today "Save" edits that silently mutate the shared parts catalog (`bom-editor.jsx:487-514`); line-scoped persistence changes existing workflows â€” needs comms.
- **Silent data expectation gap** â€” structural BOM edits were never persisted; users may believe multi-level BOMs exist that were never saved. Communicate clean-cutover implications.
- **Stale deprecated-PO docstring** â€” trust grep, not the docstring, before dropping `purchase_orders`.
- **camelCase/Float vs snake_case/Numeric divergence** â€” shared frontend/serialization code assuming one shape can break when both are live.
- **On-prem** â€” migrations must be idempotent/repeatable; a manual/cloud-only step would strand self-hosted deployments.
- **Instance reorder with hierarchy** is harder than template reorder (`bom_items.py:175-191` is `sortOrder`-only, no cross-parent moves) â€” scope the drag/reorder semantics explicitly.

---

## RLS â€” Row-level security

Postgres database row-level security for multi-tenant isolation, as a **defense-in-depth backstop** to app-layer tenant filtering. **Effort: XL.**

### Current state

Tenant isolation today is **100% application-layer, with no database enforcement.**

- **Model:** `TenantAwareMixin` adds a non-null, indexed `tenantId` FK to `tenants.id` (`backend/app/models/mixins.py:5-14`). ~103 tables were made tenant-aware in one migration (`backend/alembic/versions/021_add_tenant_id_to_all_tables.py:21-124`), plus `users`/`audit_logs` (`026_tenant_id_not_null.py`) and integration tables (`031_integration_tables.py:28,47,64`) â€” **~105+** total.
- **Request path:** `TenantIsolationMiddleware` parses the JWT before DI and pushes tenant into a contextvar (`tenant_middleware.py:16-45`); `get_current_user`/`_authenticate_by_api_key` also call `set_tenant_id(...)` (`deps.py:119,197`); contextvar in `tenant_context.py:10-16`.
- **Enforcement is ORM-only:** `tenant_events.py` registers a `do_orm_execute` SELECT filter, `before_insert` auto-populate, and a `before_flush` cross-tenant UPDATE/DELETE guard (`tenant_events.py:43-95`). **Non-ORM / raw SQL is NOT filtered â€” it only logs a warning** (`tenant_events.py:51-55`). Raw `db.execute(text(...))` exists in services (dashboard_service.py, document_service.py); `tenant_sql_clause()` (`tenant_context.py:23-36`) must be added manually â€” exactly the "forgotten predicate" class behind the BOM-explosion cross-tenant leak (audit finding D6, `docs/audit/2026-07-17-P0-core-remediation-spec.md:29`).
- **Superuser bypass:** `User.effective_tenant_id` returns `None` for superusers (`user.py:24-26`) and the middleware skips setting a tenant (`tenant_middleware.py:32-34`) â†’ superusers see all tenants, **no DB backstop.**
- **DB engine:** async `create_async_engine` (asyncpg), QueuePool 10/overflow 20, one session per request (`session.py:45-114`). **No per-connection/per-transaction SET anywhere today.**
- **Pooling (the key constraint):** prod routes the API through **pgbouncer in TRANSACTION pool mode** (`docker-compose.prod.yml:91/222/291` â†’ `@pgbouncer:6432`; `PGBOUNCER_POOL_MODE: transaction`, `docker-compose.prod.yml:158`). Dev connects to Postgres directly. **Session-level GUCs do not survive across transactions under transaction pooling.**
- **DB role:** app connects as `bom_user` with ALL PRIVILEGES, effectively owning the tables (`backend/init.sql:14-16`). **Table owners BYPASS RLS unless `FORCE ROW LEVEL SECURITY` is set** â€” so FORCE (or a non-owner role) is mandatory.
- **Testing (Postgres-only implication):** a Postgres test track already exists â€” `TEST_DATABASE_URL`, a `requires_postgres` marker that auto-skips on SQLite, `docker-compose.test.yml`, CI always on Postgres (`conftest.py:49-81`). **But test schema is built via `Base.metadata.create_all` (`conftest.py:96`), which will NOT contain RLS policies** (policies live in Alembic, not ORM metadata). SQLite cannot run RLS at all. This is the central testing gotcha: RLS could appear "tested" while never actually enforced in the suite unless migrations drive the test schema.
- **Migrations** run through an async engine as the owner role (`env.py:75-84`); `op.execute(...)` raw DDL is the established style (`026_tenant_id_not_null.py:24-38`).

### Options

| Option | Approach | Pros | Cons |
|---|---|---|---|
| **A â€” Transaction-scoped GUC + FORCE RLS + dedicated non-owner role** *(recommended)* | Policy on every `TenantAwareMixin` table: `USING ("tenantId" = current_setting('app.current_tenant_id', true)::int)` with matching `WITH CHECK`, plus `ENABLE`+`FORCE ROW LEVEL SECURITY`. Set tenant **per transaction** via `SELECT set_config('app.current_tenant_id', :tid, true)` (the `true` = transaction-local) from a SQLAlchemy `after_begin` listener reading the contextvar. Introduce a non-owner login role (`bom_app`) RLS applies to; keep `bom_user` as owner/migration role. Superuser/service jobs use a `BYPASSRLS` service role or iterate per tenant. Policies via Alembic in the `op.execute` style. | **Correct under pgbouncer TRANSACTION pooling** â€” `set_config(...,true)` is transaction-scoped and cannot leak to the next borrower. **Backstops both ORM and raw-SQL/forgotten-predicate paths** (the D6 class). FORCE closes the owner-bypass hole. Shared-schema unchanged (no data movement). `tenantId` already indexed (021) â€” negligible predicate cost. Works identically in dev (direct) and prod (pgbouncer). | Every transaction must set the GUC before its first statement or queries silently return empty / writes fail â€” needs a robust central checkout hook + hard guard. Non-owner role means auditing all GRANTs and updating both compose files. Superuser "see-all" must be re-implemented explicitly. asyncpg statement caching requires `set_config` via **bind parameter** (not literal `SET`). Cross-tenant workers must be re-plumbed. |
| **B â€” Session-scoped GUC at connection checkout; app off transaction pooling** | Set the GUC once per connection at pool checkout via a `checkout`/`connect` event (`SET app.current_tenant_id = ...`) and RESET at check-in. Requires the app to use SESSION pooling or bypass pgbouncer. Same policies/FORCE. | Simplest mapping from the current contextvar model; one SET per checkout; dev already connects directly. | **Directly conflicts with prod's pgbouncer TRANSACTION mode** (`docker-compose.prod.yml:158`): a session-level SET on a pooled connection would **bleed one tenant's GUC into another client's transaction â€” a critical cross-tenant leak, worse than today.** Forcing session pooling / removing pgbouncer sacrifices multiplexing and raises connection pressure. Reset-on-checkin must be flawless. |
| **C â€” Physical isolation: role-per-tenant (SET ROLE) or schema-per-tenant** | Each tenant gets its own Postgres role and/or schema; `SET ROLE`/`search_path` per request; object-level GRANTs. RLS optional. | Strongest blast-radius reduction; enforced by ownership/roles. Attractive if regulated tenants ever need physical separation / per-tenant backup-restore. | **Massive divergence** from the single shared-schema model (021/026) â€” effectively a re-architecture. Schema-per-tenant multiplies ~105 tables Ã— N; migrations fan out. `SET ROLE` has the **same transaction-pooling reset hazard** as B. Over-engineered for a LOCAL-FIRST, mostly single-tenant deployment. |

### Recommendation

**Adopt Option A.** Transaction-scoped GUC via `set_config('app.current_tenant_id', :tid, true)` from a central `after_begin` hook, with `ENABLE`+`FORCE ROW LEVEL SECURITY` and per-table `USING`/`WITH CHECK` policies on all ~105 `TenantAwareMixin` tables. It is the **only option provably safe under prod's pgbouncer transaction pooling** (`docker-compose.prod.yml:158`) while leaving the shared-schema model (mixins.py + 021/026) untouched, and it directly backstops the raw-SQL/forgotten-predicate leak class (`tenant_events.py:51-55`, D6) the ORM filter cannot cover. Introduce a dedicated non-owner app role so RLS actually applies, keep the owner role for migrations, and model superuser/service access as an explicit `BYPASSRLS` service role rather than "no tenant = see everything."

**For LOCAL-FIRST single-tenant:** keep RLS enabled but always set the GUC (tenant 1) so defense-in-depth is on without breaking anything; expose a config flag to fall back to a `BYPASSRLS` role if an on-prem operator must opt out.

**Postgres-only testing implication:** slot RLS tests into the existing `requires_postgres`/CI Postgres track â€” SQLite cannot express RLS, so these tests must be Postgres-gated. Critically, **build the test schema by running `alembic upgrade head` (not `metadata.create_all`, `conftest.py:96`)** so policies are present; otherwise the suite will pass against a schema that has no policies and enforcement is never actually exercised.

### Migration strategy

Build behind a flag; do not depend on the P0 logic branch.

1. **Preconditions met:** `tenantId` is NOT NULL (026) and indexed (021) â€” no backfill. Verify no residual NULLs first.
2. **Plumbing first (no enforcement):** add the `after_begin` GUC-setter + a guard that raises if a tenant-scoped request reaches a query with no GUC set. Ship and observe in prod with policies NOT yet enabled.
3. **Role split:** create non-owner `bom_app` login role, GRANT DML (not ownership) on all tables/sequences (`init.sql:14-16` grants everything to `bom_user` today); switch `DATABASE_URL` to `bom_app` in both compose files; keep `bom_user` as owner/migration role; create a `BYPASSRLS` `bom_service` role for cross-tenant jobs (integration outbox, backups, admin).
4. **Policy migration** in Alembic (`op.execute` style like 026): loop the canonical table list (reuse the 021 `TABLES` list as source of truth) emitting `ENABLE`+`FORCE` + `CREATE POLICY USING/WITH CHECK`. Provide a real downgrade (DROP POLICY / DISABLE).
5. **Staged enforcement:** gate via an enforcement toggle â€” enable RLS on a few low-risk tables first, run the suite, then expand, rather than flipping all ~105 at once. A policy that also honors an `app.bypass_rls` GUC lets you soft-disable during rollout without a migration.
6. **Cross-tenant workers:** audit every raw-SQL site (dashboard_service.py, document_service.py, `tenant_sql_clause` callers) and background job; route through `bom_service` or explicit per-tenant loops before enforcement.
7. **Test track:** Postgres fixture that runs `alembic upgrade head`, a fixture that sets the GUC per test, and `requires_postgres` tests proving (a) tenant A cannot read/write tenant B even via raw SQL, (b) missing GUC denies, (c) service role bypasses, (d) single-tenant on-prem still works.

**Rollout:** staging/shared tenant first; on-prem single-tenant gets RLS-on-with-GUC-always-set by default, with a documented `BYPASSRLS` opt-out.

### Decisions needed

*(consolidated below)* â€” GUC scope (transaction-local vs session); app DB role (non-owner vs single owner + FORCE); superuser/service bypass mechanism; single-tenant posture; rollout style; test-schema build method (+ CI gate); raw-SQL/background-job handling.

### Risks

- **CRITICAL:** under pgbouncer transaction pooling, a session-level SET (Option B) leaks one tenant's GUC into another client's transaction â€” worse than today. **Must use transaction-local `set_config`.**
- **Fail-closed lockout:** if the GUC is unset before the first statement, RLS returns empty sets and rejects writes â€” a forgotten hook can silently break features (and on-prem). Needs central hook + hard guard + missing-GUC tests.
- **Owner bypass:** `bom_user` owns the tables and bypasses RLS silently; forgetting FORCE (or not moving to a non-owner role) makes the feature a no-op with no error.
- **asyncpg statement caching / SET interactions:** use `set_config` with a bind parameter, not literal `SET`.
- **Test blind spot:** `metadata.create_all` builds schema without policies (`conftest.py:96`); SQLite can't run RLS â€” enforcement can appear tested but never run unless migrations drive the test schema.
- **Cross-tenant workers / raw-SQL sites** will break or need the bypass role once FORCE is on; missing one causes incidents at enable time.
- **P0 coordination:** both touch tenant scoping; design against 021/026 structure; expect a merge/ordering conflict on the tenant table list and any new tables.
- **Superuser tooling regressions:** features relying on `effective_tenant_id=None` to see all tenants must be explicitly re-authorized via the service/bypass role or they return empty.

---

## Smaller items

All LOCAL-FIRST, single primary DB â€” maintenance windows are viable, but ship each as its own reversible Alembic revision with a tested downgrade. **Recommended sequencing across these five: integrity first (b + c), then a, then d, then e.**

### (a) PO-model unification

- **Current state:** Two live models â€” new `POHeader`/`POLineItem` (`po_models.py:20,63`) and legacy `PurchaseOrder`, explicitly DEPRECATED (`procurement.py:34-38`) with bridge columns `migrated_to_po_headers`/`po_header_id` (`procurement.py:59-60`). Endpoints, analytics, exports, and `traceability.py` FKs (`:26-28,103-105`) already point at `po_headers`. **CRITICAL:** the migration script is **column-drifted** â€” `consolidate_po.py:107-131` INSERTs `po_header_id, line_number, part_id, unit_price, total_price, tax_amount, freight_amount`, but the real table has `headerId, itemName (NOT NULL), quantity, itemPrice, amount, gst, total` (`po_models.py:63-82` / `010_po_consolidation.py:38-55`). Run as-is it **fails** (missing columns + `itemName` NOT NULL never supplied).
- **Recommended approach:** FIX `consolidate_po.py` to match the real `po_line_items` columns (supply `itemName`), run `--dry-run` backfill, gate legacy drop on `migrated_to_po_headers=TRUE` for all rows, repoint the remaining `models/__init__.py:76` import, keep the legacy table one release for rollback, then Alembic-drop.
- **Effort:** Mâ€“L.
- **Key decision:** commit to removing legacy `procurement.PurchaseOrder` next release, or keep for backward-compat? Confirm no external integration reads `purchase_orders`.

### (b) Money FLOATâ†’Numeric + fractional qty + UOM table

- **Current state:** ~50 money columns are `Column(Float)` across ~15 files (e.g. `po_models.py:30,76-79`; `part.py:80,103-105`; `bom_item.py:28-29`), **inconsistently** â€” `POHeader.subtotal/tax_total/freight_total` are already `Numeric(12,2)` (`po_models.py:40-42`) while `poTotal` on the same row is `Float` (`:30`); `bom_items_master` uses `Numeric(10,4)` (`bom.py:66-67`) but `bom_items` uses `Float`. **Fractional qty:** `Part.qty` is `Numeric(10,4)` (`part.py:61`) but line-item quantities are `Integer` (`bom_item.py:19`, `bom.py:59`, `po_models.py:75`, `procurement.py:48`) â€” a BOM cannot hold 2.5 m of cable. **UOM:** free-text `String` (`Part.uom` default "EA", `part.py:62`; `BOMItem.unit`, `bom.py:60`); no table, no validation, no conversion.
- **Recommended approach:** add a `uom` table (code, description, dimension, base-unit, conversion factor) seeded from existing values; convert all money `Float`â†’`Numeric(12,4)` (or a shared `MoneyType`) in one Alembic pass with `ALTER COLUMN TYPE NUMERIC USING col::numeric` table-by-table; widen line-item qty `Integer`â†’`Numeric(14,4)`; make `Part.uom`/`BOMItem.unit` FKs to `uom`.
- **Effort:** L.
- **Key decision:** money scale/precision + rounding policy (e.g. `Numeric(12,4)` vs `(18,4)`; shared `MoneyType`?); confirm fractional line-item qty is wanted; UOM scope (validated code list vs full conversion engine; global vs tenant-customizable). *Fractional qty intersects P0 explosion math â€” coordinate.*

### (c) Tenant-scoped unique keys

- **Current state:** `Column(String, unique=True)` creates a **global** unique constraint that ignores `tenantId`: `Part.pn` (`part.py:57`), `Part.barcode` (`part.py:91`), `BOM.bom_number` (`bom.py:25`), `POHeader.poNumber` (`po_models.py:26`), `PurchaseOrder.poNumber` (`procurement.py:43`), `EcoHeader.eco_number` (`eco.py:30`), `SerialNumber.serialNumber`/`LotBatch.lotBatchNumber` (`traceability.py:23,98`), plus contract/deviation/capa/fai/quality/mbom/service_bom/routing/work_order numbers. **Two tenants cannot both have part "PN-001".** `tenantId` was retrofitted (021) and made NOT NULL in 026.
- **Recommended approach:** classify each key as tenant-scoped (pn, bom_number, poNumber, eco_number, serialNumber, lotBatchNumber, most `*_number`) vs truly global (user.email/username, tenant_code, jti, sessionToken). Two-phase: (1) add composite `UniqueConstraint(tenantId, key)` while the global unique is still present to surface cross-tenant collisions; (2) drop the global unique. Audit code paths that look up entities by key alone. Verify no NULL `tenantId` rows first.
- **Effort:** L.
- **Key decision:** ratify the tenant-scoped vs global classification, and how to resolve any existing cross-tenant duplicate collisions.

### (d) 21 CFR Part 11 e-signatures + sequential approver chain

- **Current state:** building blocks exist but are not wired or compliant. `EcoApproval` has `approver_id`, `approval_order`, `status`, `signed_at`, `digital_signature` (`eco.py:156-187`); `DigitalSignature` captures `signature_data`, `certificate_info`, `ip_address`, `user_agent`, `signed_at`, `is_valid`, with a `document_type` allow-list incl. 'eco' (`digital_signature.py:26-81`); `UserMfa` exists (`digital_signature.py:84`). **But the approve path bypasses all of it:** `perform_eco_action(action="approve")` sets `eco.status="approved"` and stamps `approved_by/approved_at` on the header directly (`eco_service.py:190-193`) â€” it never reads the `EcoApproval` chain / `approval_order`, never enforces order, and the `digital_signature` parameter is **accepted but unused** (`eco_service.py:171`). No re-auth at signing, no immutable/append-only record, no signature-meaning capture.
- **Recommended approach:** enforce the `EcoApproval.approval_order` chain in `perform_eco_action` (reject approve if prior orders unsigned); require re-auth (reuse `UserMfa`) at sign time; write an append-only `DigitalSignature` row with signature meaning + ip/user_agent; add **DB-level** append-only protection (no UPDATE/DELETE), not app-only; forbid post-sign edits.
- **Effort:** Lâ€“XL.
- **Key decision:** which document types beyond ECO require compliant e-sign (NCR/CAPA/FAI/deviation already in the allow-list); is re-auth (password/MFA) at signing and DB-level append-only enforcement required for your regulatory scope?

### (e) RoHS/REACH substance-level compliance

- **Current state:** compliance is a name/date **stub** â€” `Compliance` is just name/description/isActive (`compliance.py:8-21`); parts link binary "certified or not" via `part_compliance` (`part.py:36-50`). Certification detail lives in a `part_certifications` table used **only via raw SQL** (`compliance_api.py:286-346`) â€” that table AND `compliance_packs`/`compliance_pack_items` are **not defined in any model or Alembic migration** (grep of `backend/alembic` returns nothing) â†’ undeclared/ad-hoc schema; a fresh DB from migrations lacks them and the compliance API breaks on clean installs. **No substance-level model** â€” no CAS-number substance master, no per-part homogeneous-material breakdown, no ppm thresholds, no SVHC list, no exemptions, no supplier FMD capture, no BOM substance-mass roll-up. `Part` schema exposes compliance as a comma-separated string e.g. "RoHS,REACH" (`schemas/part.py:47-49`).
- **Recommended approach:** first **formalize** the undeclared `part_certifications`/`compliance_packs`/`compliance_pack_items` tables into models + a baseline migration (needed regardless). Then introduce a substance master (name, CAS#), part-substance rows (mass/ppm per homogeneous material), supplier full-material-declaration capture, SVHC/threshold reference data + exemptions, and a BOM roll-up. Backfill existing comma-separated `part.compliance` strings and `part_compliance` rows.
- **Effort:** Lâ€“XL.
- **Key decision:** full substance-level model (CAS disclosure, ppm thresholds, SVHC list, exemptions, supplier FMD, BOM roll-up) vs an enriched per-part declaration (substance list + thresholds, no mass roll-up) â€” this is the main L-vs-XL driver; and whether external reference data (REACH SVHC list, RoHS exemptions) is imported/maintained in-app.

---

## Decisions needed from the stakeholder

**X1 â€” Canonical BOM model**
1. **Canonical instance model:** `BOM`/`BOMItem` (`bom_items_master`, Option A) vs unify-on-template (B) vs new `bom_lines` (C)?
2. **Editor scoping (product change):** approve making the editor edit a specific instance BOM (requires a `bom_id`/BOM-selection UX), instead of today's global-parts-catalog editing (`utils/bom.js` + `bom-editor.jsx` `parts.update`)?
3. **Part-level edits from the editor:** keep a deliberate "edit part master" affordance, or make the BOM editor strictly line-scoped (qty/refdes/structure only)?
4. **Backfill vs clean cutover:** no instance `BOMItem` data exists today â€” accept a clean cutover (existing "BOMs" start empty / are rebuilt), or synthesize `BOMItem` rows from current parts to seed BOMs?
5. **`/boms` header CRUD:** add create/list/get for instance BOMs (`create_bom` exists at `bom_service.py:91` but has no route; the editor needs one to pick/create a BOM)?
6. **Template library:** keep `BomTemplate`/`BomItem` separate (recommended) or schedule a future fold-in (Option C)?

**RLS**
7. **GUC scope:** transaction-local `set_config(...,true)` (recommended, pgbouncer-safe) vs session-level `SET` â€” this dictates whether prod keeps pgbouncer transaction pooling (`docker-compose.prod.yml:158`).
8. **App DB role:** introduce a dedicated non-owner role (`bom_app`) so RLS applies, or keep single owner `bom_user` + rely solely on FORCE (`init.sql:14-16`)?
9. **Superuser & service bypass:** `BYPASSRLS` service role vs a sentinel GUC the policy honors vs explicit per-tenant iteration â€” and how to re-implement today's superuser "see-all" (`effective_tenant_id=None`, `deps.py:119/197`)?
10. **LOCAL-FIRST single-tenant posture:** RLS enforced with GUC always set to tenant 1 (recommended) vs run app as `BYPASSRLS` on-prem vs a config opt-out flag?
11. **Rollout style:** staged per-table with an enforcement/bypass toggle GUC vs big-bang all ~105 tables in one migration?
12. **Test track:** build the Postgres test schema via `alembic upgrade` (policies present) vs `metadata.create_all` + a separate apply-policies fixture; and whether RLS assertions become a CI gate?
13. **Raw-SQL & cross-tenant jobs:** inventory and re-route (integration outbox, dashboards, backups) before enforcement, or wrap them in the service role?

**Money / qty / UOM (b)**
14. **Money precision policy:** standard scale/precision (e.g. `Numeric(12,4)` vs `(18,4)`) + rounding rules; introduce a shared `MoneyType`?
15. **Fractional quantity:** confirm line-item qty should widen `Integer`â†’`Numeric` (intersects P0 explosion math â€” likely defer/coordinate).
16. **UOM scope:** simple validated code list vs full unit-conversion engine (conversion factors + dimension classes); global vs tenant-customizable?

**Tenant-scoped keys (c)**
17. **Key classification:** ratify which business keys become composite with `tenantId` (pn, barcode, bom_number, poNumber, eco_number, serialNumber, lotBatchNumber) vs stay global (email, tenant_code, jti); resolution plan for any existing cross-tenant duplicates.

**PO unify (a)**
18. **Legacy PO removal:** approve running (the fixed) `consolidate_po.py` + dropping the deprecated `PurchaseOrder` model/table (removing the `models/__init__.py:76` import), or keep legacy indefinitely? Confirm no external integration reads `purchase_orders`.

**Part 11 (d)**
19. **E-sign depth & scope:** which document types beyond ECO require compliant e-signatures (NCR/CAPA/FAI/deviation are in the allow-list); is re-authentication (password/MFA) at signing and DB-level append-only enforcement required for your regulatory scope?

**RoHS/REACH (e)**
20. **Compliance ambition:** full substance-level model (CAS disclosure, ppm thresholds, SVHC list, exemptions, supplier FMD, BOM roll-up) vs enriched per-part declaration (no mass roll-up) â€” the L-vs-XL driver.
21. **Undeclared schema + reference data:** formalize `part_certifications`/`compliance_packs`/`compliance_pack_items` into models+migrations now (needed regardless), and is external regulatory reference data (REACH SVHC list, RoHS exemptions) imported/maintained in-app?

**Cross-cutting**
22. **Overall sequencing:** accept integrity-first (money/keys â†’ X1/PO â†’ RLS â†’ Part 11 â†’ RoHS/REACH), or reprioritize regulated features (d)/(e) earlier due to a customer/audit deadline (accepting rework risk on FLOAT money / Integer qty / global keys)?

---

## Recommended sequencing

```
Wave 1  Data-integrity foundation  (L, L)   â”€â”€ no feature deps; unblocks everything above it
        (b) money Floatâ†’Numeric + fractional qty + UOM table
        (c) tenant-scoped composite unique keys
                â”‚  (b) fractional qty  â”€â”€ coordinate with P0 explosion-math branch
                â–¼
Wave 2  X1 â€” Canonical BOM model     (L)     â”€â”€ ADDITIVE; unblocks R14 + R11
        + PO dedup sub-track (a, Mâ€“L: fix consolidate_po.py â†’ migrate â†’ drop legacy)
                â”‚  unblocks:  R14 editor persistence,  R11 bulk-import BOM-line phase
                â–¼
Wave 3  RLS â€” Row-level security      (XL)   â”€â”€ security backstop; build behind a flag, staged
                â”‚  can start in parallel with Wave 2 (purely additive: policies + role split),
                â”‚  but land AFTER/ALONGSIDE P0 bom_service edits to avoid merge collisions
                â–¼
Wave 4  Regulated features
        (d) 21 CFR Part 11 e-sign chain      (Lâ€“XL)   â”€â”€ extends ECO guardrails; coordinate w/ P0 ECO RBAC
        (e) RoHS/REACH substance model       (Lâ€“XL)   â”€â”€ depends on (b) Numeric + fractional qty for mass roll-up
```

**Dependencies & rationale:**

- **Integrity before features.** (b) FLOATâ†’Numeric and (c) tenant-scoped keys are latent defects that contaminate anything built on top â€” you do not want FLOAT rounding inside a Part-11 signed record (d), substance-mass roll-ups (e) on Integer quantities, or multi-tenant GA with globally-unique `pn`/`poNumber`/`eco_number`. Do them first.
- **X1 is the highest-value unblock and the lowest-risk XL-adjacent work.** It is **additive** (new CRUD + editor rewire + import target), so it does not rewrite the P0 branch's explosion/rollup logic. **X1 unblocks R14 (editor persistence) and R11 (bulk-import BOM-line phase)** â€” nothing else can land those until an instance-line write path exists. PO dedup rides along as an independent low-risk sub-track (fix the drifted script first).
- **RLS is the security backstop** and is purely additive to the schema (policies + a role split), so it can proceed in parallel behind a flag â€” but it must be **landed after/alongside** the P0 branch's tenant-scoping edits to avoid merge conflicts on the tenant table list. Staged enforcement (toggle GUC, few tables first) de-risks the XL rollout; the Postgres-only test track must run migrations (not `metadata.create_all`) or RLS is never actually exercised.
- **Both XL anchors (X1's fuller form and RLS)** are the largest items; X1 in Option A form is scoped to **L** precisely by keeping it additive, deferring the true-XL unified-model (Option C) to a later phase.
- **Regulated features last** because they build on the stable money/qty/key base and extend the same ECO code the P0 RBAC branch is touching â€” coordinate model edits and migration revisions with that branch throughout.