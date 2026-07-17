# Master Enterprise Audit Report â€” BOM/PLM Platform

*Prepared as a pre-launch CTO-level audit. Read-only review of the existing platform (FastAPI + async SQLAlchemy + PostgreSQL; React + Vite). WS3 (Cliq/ClickUp integration) treated as additive/in-flight and excluded from scoring. Every claim below survived independent verification (`confirmed` or `partial`); one refuted claim â€” "parts list query omits tenant filter" â€” was dropped because `tenant_events.py:43-69` does enforce an ORM-level `do_orm_execute` tenant predicate.*

---

## Executive summary

This is a **broad, demo-ready prototype at roughly 40% of commercial PLM parity**, not a launch-ready product. On a feature-count basis it is genuinely impressive: ~63 domain models and ~60 wired endpoint modules cover nearly every capability on the PLM/MES checklist â€” multi-level BOM, variants, MBOM/SBOM, ECO/ECR/ECN, NCR/CAPA/FAI, work orders/routing, inventory with lot/serial/bin, AVL, RFQ/PO, supplier portal/scorecard, webhooks, multi-currency, auto-numbering, and real XLSX/PDF export. In surface area it rivals OpenBOM and Fusion Manage.

But **depth is shallow and the core is not trustworthy**. The flagship multi-level BOM explosion ignores the requested `bom_id` and tenant entirely, returning the same global tree for every BOM â€” simultaneously a correctness defect and a cross-tenant data leak (`bom_service.py:106,148`). Cost/quantity rollups are single-level, so any nested assembly reports wrong totals. Change control is cosmetic: any engineer can flip an ECO to `approved`, bypassing the approval chain, and the digital signature is silently discarded â€” there is no real 21 CFR Part 11 e-signature. Bulk import parses CSV but never creates parts. Two of the most workflow-critical screens (Change Requests, Approvals Inbox) are hardcoded localStorage mocks. ERP/MES integration is 100% simulated. And the single most important SaaS control â€” tenant isolation â€” is application-layer only, with unauthenticated self-registration dropping every new user into the first existing tenant (an immediate breach on any shared deployment).

Under a **LOCAL-FIRST** lens (single-host on-prem primary), some scale/HA gaps are defensible for a first commercial release â€” but the core BOM correctness, persistence fragmentation, tenant isolation, and change-control defects are hard launch blockers regardless of deployment model.

**Weighted enterprise-readiness maturity: 42 / 100.**

| # | Dimension | Score | Weight | Contribution |
|---|-----------|:-----:|:------:|:------------:|
| 1 | Competitive parity & missing features | 42 | 18% | 7.6 |
| 2 | Data model & schema | 52 | 15% | 7.8 |
| 3 | Security | 46 | 18% | 8.3 |
| 4 | Workflows & information architecture | 34 | 14% | 4.8 |
| 5 | Missing industry-critical PLM/MES features | 38 | 13% | 4.9 |
| 6 | Performance & scale | 33 | 8% | 2.6 |
| 7 | Enterprise readiness & operations | 44 | 8% | 3.5 |
| 8 | Enterprise UX/UI | 46 | 6% | 2.8 |
| | **Weighted total** | | **100%** | **â‰ˆ 42** |

**Verdict: NOT launch-ready.** The path to launch is dominated by ~8 P0 defects (BOM explosion correctness + tenant scope, tenant isolation/RLS, self-registration breach, BOM persistence source-of-truth, change-control enforcement, mocked change/approval screens, ERP mock honesty, compliance data model). None are individually enormous except the BOM consolidation and RLS work; collectively they are the difference between a convincing demo and a sellable product.

---

## Competitive parity matrix

Legend for this app: **P** = Present/working Â· **~** = Partial/faked/broken Â· **âœ—** = Missing. Competitors rated at their mature-product baseline (P = shipping capability, ~ = limited/add-on).

| Capability | This app | OpenBOM | Arena | Fusion | Teamcenter | Odoo | Propel | Windchill | Priority |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Part / item master | P | P | P | P | P | P | P | P | P0 |
| Multi-level BOM (indented explosion) | ~ (broken; global/cross-tenant) | P | P | P | P | P | P | P | **P0** |
| Multi-level cost rollup | ~ (single-level, wrong) | P | P | P | P | P | P | P | **P0** |
| Quantity rollup / where-used | ~ (single-level) | P | P | P | P | ~ | P | P | P0 |
| Server-side BOM source of truth | ~ (fragmented, localStorage cache) | P | P | P | P | P | P | P | **P0** |
| Revision / lifecycle control | ~ (snapshot only, no gated states) | P | P | P | P | ~ | P | P | P0 |
| Variant / configuration mgmt | ~ (stored rules, no resolver) | ~ | P | P | P | ~ | P | P | P1 |
| EBOM â†’ MBOM transfer | ~ (modeled, no API) | ~ | P | P | P | ~ | P | P | P1 |
| Change mgmt ECR/ECO/ECN | ~ (one table, UI mocked, 500s) | P | P | P | P | ~ | P | P | **P0** |
| Approval routing + e-signature (Part 11) | âœ— (bypassable, no e-sign) | ~ | P | P | P | ~ | P | P | **P0** |
| Work orders / routing (MES) | ~ (unguarded, 500 on hold/scrap) | âœ— | ~ | P | P | P | ~ | P | P1 |
| Inventory (lot/serial/bin) | P (CRUD) | ~ | ~ | P | P | P | ~ | P | P1 |
| Traceability / as-built genealogy | ~ (no genealogy/recall) | âœ— | P | ~ | P | ~ | P | P | P1 |
| Supplier mgmt / AVL / scorecard | P | P | P | ~ | P | P | P | P | P1 |
| RFQ / PO / procurement | P (dual PO models) | ~ | P | ~ | P | P | ~ | P | P1 |
| Quality NCR/CAPA/FAI | ~ (CRUD, UI mocked) | âœ— | P | ~ | P | ~ | P | P | P1 |
| FMEA / PPAP | âœ— | âœ— | P | âœ— | P | âœ— | ~ | P | P2 |
| Compliance RoHS/REACH/conflict minerals | âœ— (name/date stub only) | P | P | ~ | P | ~ | P | P | **P0** |
| CAD integration | ~ (SolidWorks push only) | P | ~ | P | P | âœ— | ~ | P | P1 |
| ERP integration | âœ— (100% simulated) | P | P | P | P | P | P | P | **P0** |
| Bulk import / migration | ~ (CSV parsed, nothing created) | P | P | P | P | P | P | P | **P0** |
| Multi-tenant SaaS + on-prem | ~ (app-layer isolation, no RLS) | P | P | P | P | P | P | P | **P0** |
| Real-time collaboration | ~ (presence only, not co-edit) | P | ~ | P | ~ | âœ— | P | ~ | P2 |
| Dashboards / analytics | ~ (count tiles, placeholders) | ~ | P | P | P | P | P | P | P2 |
| API / webhooks | P | P | P | P | P | P | P | P | P1 |

---

## Findings by dimension

> **Status column:** where an independent verify pass ran, it shows the verdict (**Confirmed** / **Partial**); otherwise it shows the reported model status (present/partial/missing). All `refuted` items were dropped.

### 1. Competitive parity & missing features â€” 42/100

Breadth genuinely rivals OpenBOM/Fusion, but the flagship multi-level BOM explosion is broken and cross-tenant leaking, rollups are single-level, change control is bypassable, and bulk import creates nothing. Several enterprise screens render mock data despite working backends. The repo's own docs are contradictory and inflated. Net: demo-ready surface, untrustworthy core.

| Title | Severity | Status | Evidence | Recommendation | Effort |
|---|---|---|---|---|---|
| BOM explosion ignores `bom_id` + tenant â€” same global tree for every BOM | Critical | **Confirmed** | `bom_service.py:106,148` (`_build_explosion_tree(db, None,â€¦)`, no `bom_id`/tenant predicate); exposed `bom_enterprise.py:51` | Scope recursive query to target BOM + tenant; integration test that two BOMs return distinct nested trees | M |
| Fragmented BOM source of truth + dual PO models | Critical | **Partial** | `bom.py:22,54` (`boms`/`bom_items_master`) vs `bom_item.py:12` (`bom_items`); `po_models.py` vs `procurement.py`; localStorage `bomRows` is an API-first fallback, not exclusive store | Pick one canonical BOM model; migrate editor to persist through it; consolidate PO models | XL |
| Cost/quantity rollups single-level, not indented | High | **Confirmed** | `bom_service.py:235` (`extended = unit_cost*qty`), `:173`, hardcoded `"levels":[1]` `:176` | Compute effective qty as product along rootâ†’leaf path; unit-test multi-level assembly | M |
| ECO approval chain + e-signature not enforced | High | **Confirmed** | `eco_service.py:189-192` (unconditional `status='approved'`), `:170` sig discarded; `DigitalSignature(` never constructed | Enforce `EcoApproval` ordering; re-auth on sign; persist signature manifest | L |
| Bulk import parses CSV but creates no parts; no Excel | High | **Confirmed** | `bulk_import.py:34-35` (CSV only), `:92-108` (remaps names, no INSERT) | Upsert Part/BOM rows in a transaction; add XLSX (openpyxl); dedupe on PN/MPN | M |
| Variant BOM stores rules but has no resolver | Medium | Partial | `bom_service.py:725-756,652` (persists `condition_expression`/`configuration_rules`, never evaluated) | Rules engine resolving option set â†’ line set; `/variants/{id}/resolve` | L |
| Dead `explode_bom()` references non-existent columns | Medium | Partial | `bom_service.py:943` (`part.partNumber`), `:950` (`parent_bom_item_id`) â€” neither exists | Delete or fix + test; static attribute/column check | S |
| Enterprise BOM import/export endpoints are stubs | Medium | Partial | `bom_service.py:800-824` (empty BOM, `items_imported:0`), `:762-797` (ignores format); real export only in `export_report.py:342` on template BOMs | Point export at canonical multi-level BOM; implement or remove stub import | M |
| NCR screen hardcoded; work-order writes local-only | Medium | Partial | `power-features.jsx:666` (seeded NCRs), `:323-325` (create/update never POSTs) | Wire to `screenData.quality.ncr` / work-order bridge; remove seed arrays | M |
| Auto-numbering has race + not integrated into creation | Medium | Partial | `enterprise_ext_api.py:235-241` (read-then-UPDATE, no lock); Part.pn user-supplied `part.py:57`; missing tenant filters `:66,194,229` | Atomic sequence/`FOR UPDATE`; auto-invoke on creation; add tenant predicates | M |
| Part master gaps (category enum, int qty, no UOM/customer PN/effectivity) | Medium | Partial | `part.py:128-131` (CHECK category); `bom.py:59` (Integer qty); no effectivity fields | Numeric qty, UOM table, classification table, customer_part_number, effectivity | L |
| ECR/ECN not distinct entities | Low | Partial | `eco_api.py:260-291,294-321` (all `EcoHeader` with prefix) | Model promotion links + separate state machines, or document as typed single entity | M |
| No FMEA/PPAP; QMS is thin CRUD | Medium | missing | No fmea/ppap models/endpoints; `quality_api.py:308` CAPA report is a count | Add FMEA/PPAP; elevate CAPA/NCR/FAI to enforced workflows | XL |
| ERP/CAD integrations are scaffolding | Medium | Partial | `erp_connectors.py`/`erp_connector.py` generic; only SolidWorks plugin present | Ship one real ERP connector + a 2nd CAD connector; treat connector as plugin SDK | XL |

### 2. Data model & schema â€” 52/100

The strongest dimension: 60+ models, tenant mixin, CHECK constraints, composite indexes, an immutable audit trigger, a clean linear Alembic chain (001â†’031), and disciplined JSONâ†’child-table normalization. But foundational defects remain: three coexisting BOM representations, money stored as FLOAT in primary tables, tenant-scoped natural keys carrying GLOBAL unique constraints, adjacency-list traversal with broken column refs, and `ON DELETE CASCADE` on authorship FKs that destroys compliance records.

| Title | Severity | Status | Evidence | Recommendation | Effort |
|---|---|---|---|---|---|
| Global UNIQUE on tenant-scoped identifiers breaks isolation | Critical | **Confirmed** | `part.py:57,91` (pn/barcode unique), `bom.py:25` (bom_number), `po_models.py:26`/`procurement.py:43` (poNumber); no composite `(tenantId, â€¦)` | Replace with composite unique constraints scoped by tenant | M |
| Three coexisting BOM data models | High | **Confirmed** | `__init__.py:15-19`; `bom_template.py:16-18` (`bomData` "DEPRECATED"); parallel `bom_variant_items`/`mbom_items`/`service_bom_items` | Make `bom_items_master` canonical; migrate/demote templates; physically drop deprecated JSON | L |
| Money stored as FLOAT in parts + legacy BOM | High | **Confirmed** | `part.py:80,103-105` (Float cost/freight/tax/landedCost); `bom_item.py:28-29`; contrast `bom.py:66-67` Numeric | ALTER money columns to Numeric(_,4); standardize on one definition | M |
| Adjacency-list traversal, N+1, broken column refs, weak cycle guard | High | **Confirmed** | `bom.py:63` (parent_item_id, no closure); `bom_service.py:936,941,949-950` (N+1, `partNumber`/`parent_bom_item_id` do not exist); depth-keyed cycle guard | Closure table or `WITH RECURSIVE`; fix column refs; real visited-set guard; tests on 3+ levels | XL |
| `ON DELETE CASCADE` on created_by destroys quality records | High | **Confirmed** | `028_fk_on_delete_cascade.py:160-166,184-190,216-222` (capas/fai_reports/deviations createdBy CASCADE) | Use SET NULL/RESTRICT for authorship FKs; soft-deactivate users | S |
| GIN index on plain `json` column fails at migration | Medium | present | `025_â€¦:103-105` GIN on `parts.customFields`; `001_initial.py:65` defines it as `json` (not jsonb) | Convert to jsonb first, then GIN; test migration on empty DB in CI | S |
| Audit log unpartitioned, no retention, `json` not `jsonb` | Medium | Partial | `audit_log.py:37`; immutability trigger `001_initial.py:214-227`; single heap | Monthly RANGE partition + retention/archival; switch to jsonb | M |
| BOM line quantity is Integer despite fractional fix elsewhere | Medium | present | `bom_item.py:19`, `bom.py:59` Integer; contrast `016_â€¦:199-212` parts.qtyâ†’NUMERIC | ALTER `quantity` to Numeric(12,4) | M |
| Materialized views never refreshed | Low | Partial | `025_â€¦:116-126` function created, no trigger/schedule | Schedule concurrent REFRESH (pg_cron/Celery) or drop MVs | S |

### 3. Security â€” 46/100

Real security engineering at the auth/hardening layer (RS256 pinning, bcrypt, TOTP MFA, lockout + throttling, Redis rate limiting, CSRF, CSP, secrets entropy, ClamAV uploads). But tenant isolation â€” the single most important SaaS control â€” is application-layer only with no PostgreSQL RLS, and unauthenticated self-registration drops every new user into the first tenant. RBAC is applied inconsistently.

| Title | Severity | Status | Evidence | Recommendation | Effort |
|---|---|---|---|---|---|
| Self-registration places new users in the first existing tenant | Critical | **Confirmed** | `auth_service.py:240` (`select(Tenant).limit(1)`), `:256` (`tenantId=default_tenant.id`); public endpoint `auth.py:186-193` | Create a new tenant per signup, or require signed invite token, or disable open registration | S |
| Isolation is ORM-listener only, bypassed by ~80 raw SQL queries | Critical | **Confirmed** | `tenant_events.py:51-56` (non-ORM SELECT just logs + returns); `compliance_api.py:60-65`, `resource_api.py:68` raw SELECT on tenant-aware tables; raw INSERTs omit tenantId | Add DB-level RLS as authoritative boundary; parameterize/route raw SQL through tenant helper | XL |
| No DB-level RLS; isolation fails open when tenant context unset | High | **Confirmed** | No `ROW LEVEL SECURITY`/`CREATE POLICY`/`current_setting` in code or migrations (docs only); context set only at `deps.py:197`; `tenant_events.py:46-48` returns early on None | RLS + `SET LOCAL app.current_tenant`; make missing context a hard error | L |
| RBAC applied inconsistently â€” most routes authN-only | High | **Confirmed** | authN dependency ~338Ã— / RBAC ~189Ã—; `compliance_api.py:68-73,152-157` create/delete gated only by `get_current_user` | Uniform PermissionChecker on all write/delete routes; CI check for authz dependency | L |
| WebSocket locks/cursors keyed on unscoped client channel + global doc_id | Medium | Partial | `main.py:559` passes raw channel; doc_locks keyed by client `document_id` `:277,408-448` | Use scoped_channel consistently; namespace locks by tenant | M |
| plugin-login bcrypt-verifies every active API key | Medium | present | `auth.py:124-138` loops verify_password over all keys; unauth + CSRF-exempt | Require `prefix_secret` format + indexed lookup, single bcrypt compare | S |
| Audit trail is fire-and-forget; identity lacks revocation check | Medium | Partial | `audit_middleware.py:165-167` detached task; `:108` `verify_token` (non-blacklist); GET reads unlogged `:148` | Transactional/durable-queue writes; log regulated reads; use blacklist-checked identity | M |
| CSRF cookie JS-readable; SameSite mismatch; blanket Bearer exemption | Medium | Partial | `csrf.py:70-79` httponly=False; `auth_cookie.py:13,22` lax vs strict; `csrf.py:83-86` | Header-based token or Origin allowlist; align SameSite | M |
| Weak column-encryption key handling (32-char truncation) | Medium | Partial | `encryption.py:57,72` `ENCRYPTION_KEY[:32]`; mixed pgcrypto/Fernet; `security.py:50-51,78` | Single AEAD scheme + KDF + versioned keys; document infra TLS/at-rest | M |
| MFA enforcement gated on IS_PRODUCTION | Low | Partial | `deps.py:112-117,222-231`; `auth_service.py:387-403` disable_mfa skips verify off-prod | Enforce privileged MFA in all envs; always require re-auth to disable | S |

### 4. Workflows & information architecture â€” 34/100

Navigation shell is competent (10 groups, URL-driven routing, lazy loading, 404). But the *substance* â€” core lifecycles â€” is largely mocked or unguarded. The two most workflow-critical screens (Change Requests, Approvals Inbox) are hardcoded localStorage mocks that never call the substantial backends. Where state machines exist, they enforce no transition guards, and several actions emit statuses the DB CHECK rejects (guaranteed 500s). A silent localStorage fallback masks every backend failure as success.

| Title | Severity | Status | Evidence | Recommendation | Effort |
|---|---|---|---|---|---|
| WO `hold`/`scrap` emit statuses CHECK rejects â†’ guaranteed 500 | Critical | **Confirmed** | `work_order_service.py:192-193` (holdâ†’on_hold, scrapâ†’scrapped) vs `work_order.py:64-67` CHECK | Add states to constraint or remove actions; test actionâ†”constraint parity | S |
| ECO/WO state machines enforce no transition guards | Critical | **Confirmed** | `eco_service.py:180-206` (draftâ†’implemented allowed); `work_order_service.py:200` auto-sets completed qty | Explicit allowed-transitions map; reject illegal with 409 | M |
| Change Requests screen is localStorage-only mock | Critical | **Confirmed** | `ECRScreen.jsx:25-192` (seeded, `updateStatus` mutates local only); no ecoAPI call | Rewire to ecoAPI; map UI vocabulary to backend enum; delete seed | L |
| Approvals Inbox hardcoded, no backend binding | Critical | **Confirmed** | `final-polish.jsx:11-100` (literal push entries; `act()` toast-only) | Back with approvals API; aggregate real pending items; POST approve/reject | L |
| Silent localStorage fallback masks all backend failures | High | **Confirmed** | `screenDataBridge.js:7-22` (`.catch(()=>storage.get())`; write catch resolves as success) | Distinguish offline vs API-error; surface server errors; never treat write error as success | M |
| Frontend calls endpoints that do not exist | High | **Confirmed** | `api.js:1051-1053,1066-1070` (workOrders.advance/update/delete, eco.update/delete/reject/changes); `:1068` approve sends body vs required query param â†’ 422 | Align client to real routes or add endpoints; contract test each path | M |
| ECN/ECR creation writes out-of-CHECK statuses â†’ 500 | High | **Confirmed** | `eco_api.py:279` (`issued`), `:310` (`submitted`) vs `eco.py:70-73` CHECK | Add states to constraint or map to allowed; test both endpoints | S |
| Competing ECO transition mechanisms (/action vs /approve vs /implement) | Medium | Partial | `eco_api.py:144-221` (three overlapping paths, different RBAC/validation) | Consolidate on /action; drive sign-off through EcoApproval ordering | M |
| BOM lifecycle impoverished (draft/active/archived only) | Medium | Partial | `bom.py:44-47` CHECK; no status-transition endpoint | Model working/in_review/released/obsolete + promote endpoint + effectivity | M |
| UIâ†”API data-contract drift renders real records blank/mis-statused | Medium | Partial | `power-features.jsx:326-337,556-562` expects `qty`/Title-case vs backend `quantity_ordered`/lowercase | Single normalization/adapter layer + shared status enum; render tests | M |
| Part lifecycle has states but no state machine; defaults to Released | Low | Partial | `part.py:85-127` (6 states, default Released); no transition endpoint | Default Draft; gated transitions; require approval/ECO to Release | M |

### 5. Missing industry-critical PLM/MES features â€” 38/100

Impressive entity breadth (FAI per AS9102, deviation/waiver, serial/lot, EBOM/MBOM/SBOM, routing, four role dashboards) masks absent depth. ERP/MES integration is 100% mocked; compliance is a name/date stub with no substance data; Part 11 e-sign is non-compliant; MBOM has no API and no EBOMâ†’MBOM transfer (digital thread breaks at the manufacturing handoff); rollups are flat; variants are inert JSON; dashboards are shallow tiles. Not launch-ready for regulated aerospace/medical/defense buyers.

| Title | Severity | Status | Evidence | Recommendation | Effort |
|---|---|---|---|---|---|
| ERP/MES integration entirely mocked | Critical | **Confirmed** | `erp_connectors.py:160-172` (recordsCount=0, hardcoded `completed`), `:209-228` ("simulated successfully"); no ERP client in services | Build one real adapter (NetSuite/Odoo) with auth, mapping, idempotent sync; hide feature as beta until real | XL |
| Compliance frameworks have no substance-level data model | Critical | **Confirmed** | `compliance.py:8-21` (name/description/isActive only); no CAS/substance/threshold; `part.py:70-72` string codes only | Substance model (CAS, ppm), exemptions, BOM substance rollup, declaration generation (RoHS/REACH/CMRT) | XL |
| Part 11 e-signatures non-compliant | High | **Confirmed** | `eco_service.py:164-206` (sig param unused); `eco_api.py:177-197` (free-text on approval); `DigitalSignature` unused/dead | Re-auth on sign, persist DigitalSignature bound to record hash + meaning, lock signed revision | L |
| MBOM modeled but no API + no EBOMâ†’MBOM transfer | High | **Confirmed** | `mbom.py:25-117`; no mbom endpoint/router; only `work_order_service.py:51-56` reads it; WO requires non-null mbom_id with no creation path | Add MBOM CRUD + EBOMâ†’MBOM transfer service; register router | L |
| Multi-level qty/cost rollups flat | High | **Confirmed** | `bom_service.py:169-176,234-235` (no ancestor multiplication; explosion not traversed) | Roll up over recursive explosion with parent-qty multiplication + scrap factor | M |
| Variant/config mgmt is inert storage | Medium | Partial | `bom_variant.py:34,67` (rules/expression stored, never evaluated) | Option/feature model + rules evaluator + effectivity; resolve endpoint | L |
| Serial/lot lacks as-built genealogy + recall traversal | Medium | Partial | `traceability.py:44` (free-text installedOn); only CRUD + status history | As-built parentâ†’child graph; forward/backward trace endpoints | M |
| Role dashboards shallow with placeholder metrics | Medium | Partial | `dashboard_service.py:190` (low_stock hardcoded 0), `:223-235` (naive status UNION) | Real queries, separate status namespaces, trends/targets/drill-down | M |
| Weak end-to-end digital thread; CAD is push-only | Medium | Partial | `solidworks_integration.py:33-68` (inbound push, not live connector); relationships are isolated FKs | Traceability graph + walk API; add a pull-based CAD/PDM linkage | L |

### 6. Performance & scale â€” 33/100

Good scaffolding (PgBouncer, Redis, pagination util, gzip, configurable pooling, FK indexes, Prometheus/Grafana), but the hot paths that decide behavior at 100k parts / 1M BOM rows do not scale, and several "resolved" doc claims are false. BOM explosion is recursive-Python N+1 (not a CTE), Redis invalidation is defined but never called, asyncpg on transaction-mode PgBouncer lacks `statement_cache_size=0`, and search uses leading-wildcard ILIKE on the primary flow. No benchmark evidence at target scale.

| Title | Severity | Status | Evidence | Recommendation | Effort |
|---|---|---|---|---|---|
| BOM explosion is recursive-Python N+1, not a CTE | High | **Confirmed** | `bom_service.py:101-139` (one SELECT per node, recurse `:127`); no `WITH RECURSIVE` anywhere; also walks all roots (`:148` None) | Single `WITH RECURSIVE` CTE over `bom_items_master`, depth cap; composite index `(bom_id, parent_item_id)` | M |
| Redis cache invalidation never invoked â€” stale-until-TTL | High | **Confirmed** | `cache.py:83` defined, zero call sites; writes in `part_service.py:64-116` don't evict; reads cache under bom:*/parts:list:* | Call `cache_invalidate` on writes or use versioned keys; tests that writes bust cache | M |
| asyncpg on txn-mode PgBouncer without disabling statement cache | High | **Confirmed** | `session.py:51-59` no connect_args; prod points at pgbouncer:6432 `POOL_MODE=transaction` | `connect_args={'statement_cache_size':0}` (+ name func) or session mode; load test through PgBouncer | S |
| Leading-wildcard ILIKE search, no trigram index on list flow | High/Partial | **Partial** | `part_service.py:30-37,159-160` ILIKE `%â€¦%`; FTS index exists (`012_â€¦:70-83`, `search_service.py:58-73`) but isn't wired into /parts | Wire FTS/pg_trgm into list search; debounce/min-length | M |
| Analytics dashboard ~10 uncached aggregate scans/request | Medium | present | `analytics.py:30-96` (~10 COUNT/SUM/GROUP BY; `TO_CHAR(poDate)` no functional index) | Cache per-tenant payload or MV; functional/covering indexes | M |
| Offset pagination recomputes COUNT(*) every page | Medium | present | `pagination.py:88-102` (count subquery + growing OFFSET) | Keyset/cursor pagination; cache/approximate counts | M |
| Process-global `_part_cache`, cross-request, never invalidated | Medium | Partial | `bom_service.py:20-26,114-122` | Remove module global; request-scoped batching + Redis with invalidation | S |
| Broken dead `explode_bom` (N+1 + bad columns) | Low | Partial | `bom_service.py:921-959` (`partNumber`/`parent_bom_item_id`, no callers) | Delete or consolidate onto CTE explosion; add test | S |
| No read replicas; scale posture unproven | Low | missing | Replica only in docs; `session.py` single engine; locust hits localhost, no thresholds/seed | Read-only engine for analytics; seeded benchmark (100k/1M) with p95 gates in CI | L |

### 7. Enterprise readiness & operations â€” 44/100

Excellent *paper* ops (DR runbook, tiered/encrypted backups, Prometheus/Grafana/Loki/Alertmanager, PgBouncer, MinIO, WAL archiving, mature CI). But load-bearing automation is broken or dead: the dedicated backup-scheduler container crash-loops on an invalid flag; the only working backups are local-only 6-hourly logical dumps (no off-site, no automated PITR base backup); ~7 of 12 alerts reference metrics no exporter produces; the flagship BackupStale alert references a non-existent metric; Alertmanager targets don't exist; there's no HA. Under LOCAL-FIRST, single-host is defensible â€” but the safety net is unreliable.

| Title | Severity | Status | Evidence | Recommendation | Effort |
|---|---|---|---|---|---|
| Backup-scheduler container crash-loops (`--daemon` invalid) | Critical | **Confirmed** | `docker-compose.prod.yml:100-101` runs `backup_cron.py --daemon`; `backup_cron.py:38-44` has no such flag (real one in `backup_scheduler.py:155`) | Point container at `scripts.backup_scheduler --daemon`; CI smoke test of exact prod cmd | S |
| Automated backups local-only, no off-site, no auto PITR base | High | **Confirmed** | `main.py:44-45` defaults; `backup.py:876-878` (physical/dual_storage False); all volumes local on one host | Default include_physical + dual_storage to true off-host store; schedule pg_basebackup; off-site metric/alert | M |
| Most infra alerts reference never-scraped metrics | High | **Confirmed** | `prometheus.yml:13-17` scrapes only api; `alerts.yml` uses pg_up/redis_up/node_*/pgbouncer_*/probe_success | Deploy postgres/redis/node/pgbouncer/blackbox exporters or rewrite alerts | M |
| BackupStale alert dead; metric ignores failure | High | **Confirmed** | `alerts.yml:51` (`backup_last_success_timestamp`); `metrics.py:206-209,240` (`backup_last_timestamp`, set on failure too) | Add success-only gauge; align alert expr | S |
| No HA â€” single Postgres, single host, no failover/orchestration | High | **Confirmed** (missing) | one `postgres` service; `postgresql.conf:4-7` WAL only, no replication; no k8s/helm/tf | Streaming replica + Patroni/repmgr; optional Helm; honest single-node RTO | XL |
| Alert delivery not wired (SMTP/webhook point at nothing) | Medium | Partial | `alertmanager.yml:3-5` localhost:25; `:34` webhook-service:8080 not defined | Real SMTP + valid receiver; synthetic alert smoke test | S |
| Background jobs run in every worker, no leader election | Medium | Partial | `main.py:79,137` unconditional; `Dockerfile.prod:45` 4 workers | Leader election / gate to dedicated containers | M |
| WAL archive grows unbounded in automated path | Medium | Partial | `postgresql.conf:5-6` archive on; `backup.py:998` cleanup never called by pipeline | Invoke cleanup after base backup with retention; alert on WAL dir size | S |
| Deploy runs migrations with no pre-backup / rollback | Medium | Partial | `ci.yml:283-289,313-318` (pull+up+alembic, no snapshot/health gate) | Pre-migration backup, post-deploy health check + auto-rollback | M |
| Standalone monitoring compose inconsistent with prod | Low | Partial | `docker-compose.monitoring.yml` lacks alertmanager + alerts mount + Loki | Consolidate to one canonical monitoring definition | S |

### 8. Enterprise UX/UI â€” 46/100

A real design-token system, consistent shell, i18n, and more a11y scaffolding than most early products â€” but inconsistently applied and riddled with half-finished/dead features. The 48px icon-only nav rail crams 36 destinations with hover-only labels (IA + keyboard failure), dark mode is toggleable but its CSS was removed (broken hybrid), the accessibility mode is completely dead, the core BOM grid is mouse-only, and multiple WCAG contrast ratios fail. No navigation below 900px and pinch-zoom disabled.

| Title | Severity | Status | Evidence | Recommendation | Effort |
|---|---|---|---|---|---|
| 48px icon-only nav rail, 36 destinations, hover-only labels | Critical | **Confirmed** | `NavRail.jsx:5-166`; `styles.css:419-420,510,484-490`; âŒ˜ capped at 9 | Expandable labeled nav with visible group headers; extend shortcuts | L |
| No nav below 900px; pinch-zoom disabled | Critical | **Confirmed** | `styles.css:2748-2750`; no hamburger in src; `index.html:7` user-scalable=no | Responsive drawer nav <900px; remove maximum-scale/user-scalable | L |
| Dark mode toggleable but CSS removed â†’ broken hybrid | High | **Confirmed** | `App.jsx:571-578`, `TopBar.jsx:357-359`, `AppCtx.jsx:211` write theme; `styles.css:112` removed; ~11 orphan rules; two dead togglers | Implement full dark tokens or remove toggles + orphan rules | M |
| Accessibility-mode feature completely dead | High | **Confirmed** | `power-features.jsx:1908-1913` sets data-a11y; zero callers, zero `[data-a11y]` CSS; no Settings control | Implement real high-contrast/colorblind modes + Settings, or remove | M |
| Core BOM grid mouse-only, cells not keyboard-reachable | High | **Confirmed** | `bom-editor.jsx:186-194` (dblclick only, no tabIndex/role/keydown); read-only td `:746-770` | Roving tabindex / role=grid; Enter/F2/Tab/arrows; expand editable columns | L |
| Multiple WCAG contrast failures (muted text, olive accent) | High | **Confirmed** | `styles.css:29` #888 â‰ˆ3.5:1, `:91` #AAA â‰ˆ2.3:1, `:8` olive #B5BC38 â‰ˆ2.08:1 used for focus ring/active nav/badge | Darken muted tokens; stop using raw olive for text/focus/active | M |
| Literal glyph icons mixed with SVG system | Medium | present | `TopBar.jsx:388,391,414,422,455` ($/%/âŒ¥/?/â) | Add proper SVG icons; replace glyphs | M |
| Design system unenforced (754 inline style blocks) | Medium | present | 754 `style={{` across 60 files despite utility layer | Lint budget; migrate high-traffic screens to tokens | XL |
| ~25-item "junk drawer" avatar menu | Medium | present | `TopBar.jsx:334-457` (webhooks, cost sim, role-switch demo, etc.) | Reduce to account/session; relocate tools; gate demo switcher | M |
| Density control largely non-functional | Low | Partial | `styles.css:108,114-117` dense==normal 30px | Make dense genuinely tighter; distinct normal values | S |
| Duplicate `bellRef` on AI + Notifications buttons | Low | present | `TopBar.jsx:216,225` both `ref={bellRef}`; popover anchors bellRef `:267` | Dedicated `aiRef` | S |
| Nav tooltips not shown on keyboard focus; minimal motion | Medium | Partial | `.nav-tip` only on `:hover` (`styles.css:510`); single transition token `:105` | Reveal on `:focus-visible`; add motion token set | M |

---

## Doc-vs-reality gaps

The repo's own audit/feature docs materially overstate completeness. Verified gaps:

1. **"Enterprise Readiness 8.7/10"** (`ENTERPRISE_AUDIT_REPORT.md:15/28`) is internally contradictory â€” the same summary (`:13`) says the system is only 62-67% ready and scores UI/UX 5.5, Testing 4.0. Verified operational automation gaps (broken backup daemon, dead alerts) place true readiness far lower.
2. **Bulk import "delivered"** (`FEATURE_CATALOG.md:40`) â€” code only decodes CSV and remaps column names; **no Part is ever inserted** (`bulk_import.py:92-108`). "Excel" support does not exist.
3. **"ECO approval workflow"** (`FEATURE_CATALOG.md:33`, `OPENBOM_GAP_ANALYSIS.md:77`) â€” approval is bypassable, the chain is unenforced, and the digital signature is discarded (`eco_service.py:170,189`). `DigitalSignature` is never constructed.
4. **"N+1 eliminated / 1000-item BOM = 2 queries"** (`MASTER_â€¦FINAL.md:142`, `CHANGELOG.md:1450`, `FEATURE_CATALOG.md:423-424`) â€” false for multi-level explosion, which is one query per node (`bom_service.py:106,127`).
5. **"Redis caching (5min TTL) RESOLVED"** with `cache_invalidate` shipped (`MASTER_â€¦FINAL.md:143`, `CHANGELOG.md:1573`) â€” invalidation has **zero call sites**; caches are stale-until-TTL.
6. **PostgreSQL RLS multi-tenancy design** (`ENTERPRISE_AUDIT_REPORT.md:593-597,739`) â€” **no RLS/policy/`current_setting` exists anywhere**; isolation is ORM-event-listener-only and bypassed by raw SQL. "SQL injection eliminated / WebSocket tenant isolation" (`:768`) is not borne out.
7. **"S3 dual-storage / automated scheduler / pg_basebackup PITR"** (`ENTERPRISE_AUDIT_REPORT.md:40`, `DISASTER_RECOVERY_RUNBOOK.md:17-26,433`) â€” dual_storage defaults False and is never passed; the dedicated scheduler container crash-loops; PITR base backups are never taken automatically. RPO<6h / RTO<4h are unvalidated.
8. **"Loki log aggregation" / "12 production alert rules" / "Alertmanager routing"** (`ENTERPRISE_AUDIT_REPORT.md:43,186`) â€” no log shipper feeds Loki; ~7 alerts reference unscraped metrics; BackupStale references a non-existent metric; Alertmanager targets don't exist.
9. **`OPENBOM_GAP_ANALYSIS.md` is stale in both directions** â€” marks bulk import, MBOM, effectivity, serial tracking as *Missing* though models/endpoints exist, while marking dark mode "Implemented" (`:171`) though its CSS was deleted (`styles.css:112`) and ECR/ECO "no gap" (`:76-77`) though those screens are mocks.
10. **Compliance router tagged "ISO 9001, AS9100, RoHS, REACH"** (`api_v1.py:274-278`, `compliance_api.py:1`) â€” implementation is generic name/date CRUD with no substance/clause enforcement.
11. **Data-dictionary is stale** â€” documents `parts.tags/compliance/countryHistory/vendorPrices` as live columns dropped by migrations 015/017; documents only `bom_templates` while hiding `boms/bom_items_master`; lists `audit_logs.changes` as TEXT/`timestamp` though the model uses JSON/`createdAt`.
12. **"WebSocket real-time collaboration with cursors/typing/locking"** (`ENTERPRISE_AUDIT_REPORT.md:11,42`) contradicts `OPENBOM_GAP_ANALYSIS.md:161` (simultaneous editing Missing). No operational-transform co-editing found â€” presence only.

---

## OpenBOM parity checklist

To reach and then exceed OpenBOM (the closest surface-area competitor), in dependency order:

**Reach parity (must-have):**
- [ ] Correct multi-level BOM explosion scoped to `bom_id` + tenant (fix `bom_service.py:106,148`); single `WITH RECURSIVE` CTE.
- [ ] True indented cost + quantity rollups (multiply parent qty down each path).
- [ ] One canonical server-side BOM model; migrate the editor off localStorage-primary to API-persist; consolidate dual PO models.
- [ ] Real bulk import that **creates** Parts and BOM lines from CSV **and** XLSX, with column mapping, dedupe on PN/MPN, per-row error report.
- [ ] Working multi-level BOM export (XLSX + PDF) rendering the canonical BOM, not the flat template.
- [ ] Enforced change control: sequential ECO approval chain, re-auth e-signature persisted to `DigitalSignature`, locked signed revision.
- [ ] Server-side revision history with released/obsolete/superseded states and effectivity.
- [ ] Fractional BOM quantities (Numeric) + UOM table with conversions.
- [ ] Tenant-scoped uniqueness (composite `(tenantId, pn/barcode/bom_number/poNumber)`).
- [ ] Fix self-registration tenant assignment; add DB-level RLS.
- [ ] At least one real CAD connector beyond SolidWorks push (Fusion 360 / Onshape) and one real ERP sync (QuickBooks / NetSuite / Odoo).
- [ ] Indexed catalog search wired into the parts list (reuse existing FTS index).

**Exceed OpenBOM (differentiators OpenBOM is weak on):**
- [ ] Configure-to-order variant resolver (rules engine â†’ buildable BOM).
- [ ] EBOMâ†’MBOM transfer + MBOM API + routing/work-order linkage.
- [ ] Substance-level compliance (RoHS/REACH/CMRT) with BOM rollup + declaration generation.
- [ ] As-built serial/lot genealogy + recall traversal.
- [ ] Genuine LOCAL-FIRST on-prem story: reliable scheduled + off-host backups, HA replica, and a working observability stack.

---

## Prioritized roadmap

Workstream mapping note: only **WS3 (Cliq/ClickUp integration)** is defined in the provided context (additive, out of scope). Mappings to **WS1/WS2/WS5/WS6** are *inferred by theme* and should be confirmed against the program's actual workstream charter before planning.

### P0 â€” Launch blockers (correctness, isolation, data integrity)

| Item | Dimension | Effort | Suggested WS |
|---|---|:---:|:---:|
| Fix BOM explosion `bom_id` + tenant scope (correctness + cross-tenant leak) | Parity / Data model | M | WS1 (core BOM) |
| Consolidate to one canonical BOM model; persist editor server-side; merge PO models | Parity / Data model | XL | WS1 |
| True multi-level cost/quantity rollups | Parity / PLM features | M | WS1 |
| Fix self-registration tenant assignment | Security | S | WS2 (security) |
| Add DB-level RLS + parameterize ~80 raw SQL queries | Security | XL | WS2 |
| Composite tenant-scoped unique constraints | Data model | M | WS2 |
| Enforce ECO approval chain + persisted e-signature (Part 11) | Parity / Workflows | L | WS1 |
| Wire Change Requests + Approvals Inbox to real backends | Workflows | L | WS1 |
| Bulk import that actually creates Parts/BOM lines (CSV+XLSX) | Parity | M | WS1 |
| Fix silent localStorage-as-success fallback (surface API errors) | Workflows | M | WS1 |
| Fix WO hold/scrap + ECN/ECR statusâ†”CHECK mismatches (500s) | Workflows | S | WS1 |
| Make ERP integration honest (flag as beta) or ship one real connector | PLM features / Integration | XL | WS3 |
| Substance-level compliance data model (RoHS/REACH) | PLM features | XL | WS5 (compliance) |
| Fix backup-scheduler crash-loop; enable off-host backups | Ops | Sâ€“M | WS6 (ops) |

### P1 â€” Enterprise credibility (depth, guards, indexing)

| Item | Dimension | Effort | Suggested WS |
|---|---|:---:|:---:|
| Explicit state machines with transition guards (ECO/WO/Part/BOM) | Workflows | M | WS1 |
| Money columns FLOATâ†’Numeric; fractional BOM qty; UOM table | Data model | M | WS1 |
| Closure table / recursive CTE for explosion + where-used | Data model / Perf | XL | WS1 |
| MBOM API + EBOMâ†’MBOM transfer | PLM features | L | WS1 |
| Variant configurator/rules resolver | Parity / PLM features | L | WS1 |
| `ON DELETE SET NULL/RESTRICT` for authorship FKs | Data model | S | WS2 |
| Redis cache invalidation on writes | Perf | M | WS1 |
| asyncpg `statement_cache_size=0` on PgBouncer | Perf | S | WS6 |
| Wire FTS/pg_trgm into parts list search | Perf | M | WS1 |
| Uniform RBAC on all write/delete routes + CI check | Security | L | WS2 |
| Deploy exporters; fix dead alerts + delivery | Ops | M | WS6 |
| Nav IA overhaul (labeled expandable rail); responsive <900px; restore zoom | UX | L | WS? (UX) |
| Keyboard-navigable BOM grid; fix WCAG contrast | UX | Lâ€“M | WS? (UX) |

### P2 â€” Differentiation & polish

| Item | Dimension | Effort | Suggested WS |
|---|---|:---:|:---:|
| FMEA / PPAP modules; closed-loop CAPA/FAI workflows | Parity / PLM features | XL | WS5 |
| As-built serial/lot genealogy + recall trace | PLM features | M | WS1 |
| Dashboard real metrics/trends/drill-down | PLM features | M | WS1 |
| HA (streaming replica + failover); optional Helm | Ops | XL | WS6 |
| Read replica for analytics; seeded 100k/1M benchmark in CI | Perf | L | WS6 |
| Audit-log partitioning + retention; jsonb conversion | Data model | M | WS6 |
| Remove dead UX code (dark toggles, a11y mode); enforce design tokens | UX | Mâ€“XL | WS? (UX) |
| 2nd CAD connector; connector plugin SDK | Integration | XL | WS3 |

---

## Deliverables index

Mapping of this report to the master-prompt deliverables:

| Master-prompt deliverable | Satisfied by | Coverage |
|---|---|---|
| **Gap matrix** (feature gaps vs completeness) | Â§Findings by dimension (all 8), Â§Doc-vs-reality gaps | Full â€” per-dimension confirmed findings with evidence |
| **Competitor matrix** | Â§Competitive parity matrix | Full â€” 24 capabilities Ã— 7 competitors + priority |
| **UX report** | Â§Findings 8 (Enterprise UX/UI, 46/100) | Full |
| **DB/schema report** | Â§Findings 2 (Data model & schema, 52/100) | Full |
| **Security report** | Â§Findings 3 (Security, 46/100) | Full |
| **Performance report** | Â§Findings 6 (Performance & scale, 33/100) | Full |
| **Enterprise readiness report** | Â§Findings 7 (Readiness & ops, 44/100) + Â§Executive summary | Full |
| **OpenBOM parity checklist** | Â§OpenBOM parity checklist | Full â€” reach + exceed |
| **Prioritized roadmap** | Â§Prioritized roadmap (P0/P1/P2) | Full, with dimension + effort + inferred WS mapping |
| **Overall maturity score** | Â§Executive summary (42/100 weighted, 8-dimension table) | Full |

**Not covered / caveats:** WS1/WS2/WS5/WS6 workstream mappings are inferred (only WS3 was defined in scope) and must be confirmed against the program charter. This report synthesizes the provided per-dimension analyses and their verification passes; the one `refuted` claim (parts-list tenant filter) was excluded. Test-coverage quantification, a formal VPAT/accessibility conformance statement, and a threat model were not in the provided per-dimension data and would be worthwhile additional deliverables before launch.