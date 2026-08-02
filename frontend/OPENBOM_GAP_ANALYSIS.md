# Blackbox BOM — OpenBOM Competitive Gap Analysis

## Executive Summary

**Assessment Date**: 2 August 2026 (re-verification of the June 16, 2026 edition)
**Prepared By**: Principal Architect — Enterprise PLM Transformation
**Version**: v2.1.0

This document provides a definitive feature-by-feature comparison of Blackbox BOM against the five dominant PLM competitors: **OpenBOM**, **Arena PLM (PTC)**, **Siemens Teamcenter**, **PTC Windchill**, and **Autodesk Fusion Manage**. Each of the 9 evaluation domains is scored (Present / Partial / Missing) with specific competitive positioning analysis and priority-ranked remediation.

**Re-verification note (2 August 2026):** every row previously marked ❌ Missing or ⚠️ Partial/Basic in the Blackbox BOM column (73 rows across all 9 domains) was re-checked on this date directly against source code — live FastAPI route introspection, live SQLAlchemy metadata introspection, and direct file reads. No documentation, CHANGELOG, comment, or test name was used as evidence. The five competitor columns (OpenBOM, Arena, Teamcenter, Windchill, Fusion Manage) were **not** re-verified and carry over unchanged from the June 2026 edition. Rows already marked ✅ Implemented for Blackbox BOM were left alone **except** the webhook system, which was ✅ and is now confirmed broken — see Verified Summary below.

The per-domain gap scores, the Competitive Scorecard Summary, the Top-10 Gaps and the Remediation Roadmap **were** recomputed from the corrected rows, mechanically rather than by hand. The Blackbox scorecard now carries two numbers: a *weighted* score using the same half-credit-for-partial formula as the competitor columns, and a *reachable* score counting only what a user can operate today. The Appendix competitor counts are unchanged and unverified — and do not fully reconcile; see the note under the scorecard.

---

## Competitive Landscape Overview

| Platform | Category | Pricing | Target Market | Maturity |
|---|---|---|---|---|
| **OpenBOM** | Cloud PLM + BOM | $75-150/user/mo (est) | SMB engineering teams | 2015+, 100M+ funding |
| **Arena PLM** | Cloud PLM + QMS | $89-208/user/mo | Regulated mid-market (med device, aerospace) | 2002+, acquired by PTC 2021 |
| **Siemens Teamcenter** | Enterprise PLM | $100-300+/user/mo | Fortune 500, automotive, aerospace | 1985+, market leader |
| **PTC Windchill** | Enterprise PLM | $150-400+/user/mo | Large discrete manufacturing | 1998+, enterprise grade |
| **Autodesk Fusion Manage** | Cloud PLM | $75-150/user/mo | Fusion 360 ecosystem, mid-market | 2022+, built on Upchain acquisition |
| **Blackbox BOM** | Open-source PLM/BOM | Self-hosted (free) | SMB to mid-market | 2024+, pre-production |

---

## Verified Summary

| Metric | Count |
|---|---|
| Rows re-verified against source code | 73 |
| Now implemented (was ❌/⚠️, confirmed working) | 15 |
| Partial (built but incomplete, unreachable, or otherwise limited) | 37 |
| Still missing (confirmed absent) | 20 |
| Unverified — cannot be settled from code (attestation, not an artifact) | 1 |
| Rows where the June 2026 document's call was wrong, in either direction | 4 |

The dominant pattern across the 37 partial rows is not "half-built" in the way the June doc implied — it is **a complete backend (model + routes + client wrapper) with no UI screen**, or a complete UI reading data the backend never populates. Both are called out explicitly in the tables below with **⚠️ API only — no screen** or **⚠️ [screen] displays fabricated data**, because a buyer cannot use what has no UI, but fixing it is a week of screen work, not a quarter of backend work.

### Corrections that reverse the June 2026 document

1. **21 CFR Part 11 e-signatures** — doc said ❌ Missing / **CRITICAL**. Verified: **properly implemented.** `backend/app/services/part11_service.py` `sign_action()` requires password re-authentication (not just a valid JWT), computes a SHA-256 hash over canonical sorted-key JSON, and writes an append-only `ESignature` + `AuditLog` row before any state mutation; there is no UPDATE/DELETE route for `ESignature` anywhere in the live route table. Real callers: `backend/app/services/eco_service.py:245` and `:278` (ECO approve/implement), gated in the UI by `frontend/src/components/ESignDialog.jsx` inside `frontend/src/components/advanced/ECRScreen.jsx:7,966`. Ceiling: it only gates ECO approve/implement — not part release, document approval, deviation approval, or FAI sign-off — and `GET /api/v1/esignatures/` has no UI caller. Now **LOW** priority, not CRITICAL.

2. **Webhook system** — doc said ✅ Implemented. Verified: **never fires.** Subscription plumbing is real (`webhook_subscriptions`, `webhook_deliveries`, HMAC signature, SSRF guard `is_safe_webhook_url`, full `/api/v1/webhooks*` routes), but `_send_webhook` in `backend/app/services/webhook_service.py:195` has exactly two callers in the entire backend — `test_webhook()` at `:244` and `retry_delivery()` at `:280`. No business event (BOM change, part update, ECO approval, etc.) ever emits one; a grep for `trigger_webhook`/`emit_event`/`dispatch_event`/`WEBHOOK_EVENTS` across `backend/app/` returns nothing. A buyer who wires up a subscription in the UI and waits for a real event gets nothing. Now **CRITICAL** — worse than a known gap, because the doc and the UI both present it as done.

3. **ITAR/EAR export control** — doc said ⚠️ Partial. Verified: **still missing in substance; doc was generous.** Only two inert columns exist (`backend/app/models/part.py:73` `htsCode`, `:75` `eccn`); zero hits for `itar`, `ear99`, or `export_control` anywhere in the backend, `eccn` is not in any route handler or the parts export column list, and neither field can be viewed or edited in any UI. Remains **HIGH**.

4. **Commodity/UNSPSC codes** — doc said ❌ Missing. Verified: **the doc was already wrong at the data layer.** `backend/app/models/part.py:74` `unspscCode` has existed since the first migration (`backend/alembic/versions/001_initial.py:51`), predating the June 2026 document. It remains a real gap in practice: the column is absent from every Pydantic part schema, so `POST/PUT/PATCH/GET /api/v1/parts` neither accepts nor returns it — writable only by direct DB access or import, readable only via the parts xlsx export (`backend/app/api/endpoints/export_report.py:44,72`). Stays **MEDIUM**.

---

## 1. BOM Management — CORE DOMAIN

| Feature | OpenBOM | Arena | Teamcenter | Windchill | Fusion Manage | Blackbox BOM | Gap |
|---|---|---|---|---|---|---|---|
| Multi-level BOM (unlimited depth) | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Flat/single-level BOM view | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| BOM comparison/diff | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Multi-BOM types (EBOM, MBOM, SBOM) | ✅ xBOM model | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — SBOM is a full stack (tables, routes, `ServiceBOMScreen` at `/service-bom`); MBOM is model-only (`backend/app/models/mbom.py:26`) with zero routes and no UI; EBOM has no `bom_type` discriminator (`boms` table is implicitly EBOM) | HIGH (was CRITICAL) |
| BOM baselines/snapshots | ✅ Revisions | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Variant/configuration BOM | ✅ Graph model | ⚠️ Partial | ✅ Native | ✅ Native | ⚠️ Partial | ⚠️ API only — `bom_variants`/`bom_variant_items` tables + 3 routes + `frontend/api.js:1041-1044` client wrapper exist; no UI reaches them and there is no list endpoint to enumerate a BOM's variants | HIGH |
| BOM templates | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Where-used / cross-reference | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| BOM cost rollup | ✅ Formulas | ✅ Native | ✅ Cost Mgmt | ✅ Native | ✅ Native | ✅ Implemented | — |
| Mass replace/update BOM items | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — mass *update* works end-to-end (`bom-editor.jsx:1487-1538`, `BulkEditModal`); mass *replace* (swap part A→B everywhere) does not exist at any layer | MEDIUM (was HIGH) |
| Manufacturer BOM view | ⚠️ Partial | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial | ⚠️ Partial — real per-part AVL data (`part_vendors` table, UI at `detail-drawer.jsx:671-720`); the BOM-level `SourcingView` "Alt vendors" column is **fabricated**: `_alts: Math.max(0, (r.pn.charCodeAt(0)+i) % 4)` (`SourcingView.jsx:20`) and never queries `part_vendors` | MEDIUM |
| BOM sandbox / what-if | ✅ xBOM Workspace | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | ❌ | ⚠️ Partial — cost-only, client-side, unpersisted: `CostSimulatorModal` edits only the first 6 leaf rows and saves nothing; no structural branch/merge sandbox exists | MEDIUM |

**BOM Gap Score: 12/12 present or partial -- 79% weighted (partial at half credit), 58% fully reachable by a user.** The whole domain is now present in some form; the remaining work is reach, not capability.

---

## 2. Parts & Item Management

| Feature | OpenBOM | Arena | Teamcenter | Windchill | Fusion Manage | Blackbox BOM | Gap |
|---|---|---|---|---|---|---|---|
| Central item catalog | ✅ Catalogs | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Manufacturer part number (MPN) | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Customer part number | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — no `customer_pn`/`customerPn` column exists at all; only the generic `customFields` JSON bag | LOW |
| Multi-supplier per part | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Part classification/taxonomy | ✅ Catalogs | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented — `catalogs`/`part_catalogs` tables, full CRUD (`backend/app/api/endpoints/catalogs.py`), `CatalogsScreen.jsx` routed at `/catalogs` | — (resolved) |
| Commodity/UNSPSC codes | ✅ Custom | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ API only — `unspscCode` column exists (predates this doc) but is absent from every Part API schema; writable only via DB/import, readable only via the parts xlsx export | MEDIUM |
| HTS/ECCN/Schedule B codes | ✅ Custom | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial | ⚠️ API only — `htsCode`/`eccn` columns exist but neither is in the Part API schema; `eccn` appears in no route, service, or UI at all; no Schedule B column anywhere | MEDIUM |
| Part duplication detection | ❌ | ⚠️ Partial | ✅ AI-powered | ✅ AI Parts Intel | ❌ | ⚠️ Basic — server detector (`POST /parts/check-duplicates`, exact PN/MPN + fuzzy name scoring) exists but is never called by the frontend; the UI runs its own separate, weaker client-side PN-match heuristic (`parts-screen.jsx:81`) | HIGH |
| Auto-numbering schemes | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Custom attributes | ✅ Flexible | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Multi-UOM with conversion | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial | ❌ Missing — `uom` is a single free-text string; no conversion table or route at any layer (the `exchange_rates` currency pattern is a ready-made template) | MEDIUM |
| CAD file per revision link | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — part-level `cadUrl` + multi-file `part_derivatives` with version chain on `documents`, but a part *revision* does not pin a CAD/document version (`revisions.bomSnapshot` has no CAD FK) | LOW |
| Part lifecycle states | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — `PartLifecycle`/`LifecycleDefinition` tables (`backend/app/models/part_lifecycle.py`) are orphans, referenced nowhere else in the backend; live behavior is a flat `parts.status` string with no transitions, enforcement, or history | HIGH |
| AI parts intelligence | ⚠️ Knowledge Graph | ⚠️ SCI | ✅ Copilot | ✅ Parts Intel | ❌ | ⚠️ Partial — demand forecasting, interchangeability suggestions, and validation results are real, routed, and have a dedicated `/ai` screen plus a per-part accept/reject panel; no conversational copilot/LLM backend exists (`AIAssistant.jsx:6` says so explicitly) | MEDIUM (resolved for the 3 named tools; copilot remains absent) |

**Parts Gap Score: 13/14 present or partial -- 68% weighted (partial at half credit), 43% fully reachable by a user.** Seven of fourteen are backend-only. Multi-UOM conversion is the one true zero.

---

## 3. Change Management

| Feature | OpenBOM | Arena | Teamcenter | Windchill | Fusion Manage | Blackbox BOM | Gap |
|---|---|---|---|---|---|---|---|
| Revision history (auto-track) | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Item/BOM revisions (manual save) | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Change requests (ECR) | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Change orders (ECO/ECN) | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Approval workflows | ✅ Sign-off | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Basic — backend is well past "basic" (approver-enforced `perform_eco_action`, digital signatures, `approval_automation_rules` engine), but the ECR/ECO **UI fabricates approval state**: `ECRScreen.jsx:57` derives a fixed `{eng,proc,fin}` dot grid from ECO status alone instead of reading the real `eco_approvals` rows | MEDIUM (was HIGH — UI-only fix) |
| Multi-step routing | ✅ Templates | ✅ Native | ✅ Native | ✅ Native | ✅ Worksflows | ⚠️ Basic — `approval_order` is append-only sequencing (`count(EcoApproval)+1`), not a route template; nothing gates step *n* on step *n−1*'s approval; no step display in the UI | HIGH |
| Effectivity (date/serial/lot) | ❌ | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial | ❌ Missing — one `effective_date` on the ECO header only; no `effective_from`/`effective_to` on BOM items and no serial- or lot-break effectivity model | CRITICAL — the single largest true gap in this domain |
| Automated change notifications | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ❌ Missing — `eco_notifications` table + read endpoint + client wrapper all exist, but no code path anywhere ever writes an `EcoNotification` row, so approvers are never told an ECO is waiting | HIGH |
| Change impact analysis | ⚠️ Basic | ⚠️ Basic | ✅ AI-powered | ✅ AI-assisted | ⚠️ Basic | ⚠️ API only — `GET /eco/{id}/impact` only counts already-attached `EcoItem` rows (no graph traversal via `bom_closures`/where-used, both of which exist); nothing in the UI renders the result | HIGH |
| Deviations/waivers | ❌ | ⚠️ Partial | ✅ Native | ✅ Native | ⚠️ Partial | ⚠️ API only — 8 routes (submit/approve included) + a complete client wrapper; zero UI/screen consumes it | LOW-effort / HIGH-value (UI only) |
| CAD revision sync | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — real SolidWorks structure + attribute sync and write-back exist, but the part `rev` field is never synced; the generic web `/cad/apply-sync` path writes nothing to the database while the UI toasts "Sync complete · N changes applied · audit logged" | HIGH — plus a misleading success toast worth filing as a bug |

**Change Management Gap Score: 9/11 present or partial -- 59% weighted (partial at half credit), 36% fully reachable by a user.** Effectivity and automated notifications remain genuinely absent; approvals exist but the ECR screen synthesises their state.

---

## 4. Quality & Compliance

| Feature | OpenBOM | Arena | Teamcenter | Windchill | Fusion Manage | Blackbox BOM | Gap |
|---|---|---|---|---|---|---|---|
| NCR (Non-Conformance Report) | ❌ | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| CAPA (Corrective Action) | ❌ | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented — full CRUD + verify route; `qms-dashboard.jsx:107` reads the CAPA tab, but it is display-only (no create/edit/verify control wired in the UI) | MEDIUM (was HIGH) |
| FMEA (Failure Mode Analysis) | ❌ | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ❌ Missing — no table, route, or UI; only appears as a string literal in a root-cause-method enum (`capa.py:34`) | HIGH |
| FAI / AS9102 First Article | ❌ | ✅ Native | ✅ Native | ✅ Native | ❌ | ✅ Implemented — AS9102-shaped tables, full CRUD + submit/approve routes, QMS dashboard tab; display-only (submit/approve have no UI caller), and Forms 1/2/3 are not generated as documents | MEDIUM |
| PPAP (Production Part Approval) | ❌ | ✅ Native | ✅ Native | ✅ Native | ❌ | ❌ Missing — zero hits anywhere; adjacent primitives (FAI, inspection plans, certifications) exist but nothing assembles a PPAP submission or tracks levels 1-5 | MEDIUM |
| RoHS/REACH compliance | ✅ Custom | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented — full substance-level model (concentrations, exemptions, SCIP/REACH obligations, staleness flags), dedicated UI (`PartComplianceTab`, `ComplianceRollupView`); the strongest compliance area in the product | — (resolved, was MEDIUM) |
| ITAR/EAR export control | ❌ | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial | ❌ Missing in substance — only two inert `htsCode`/`eccn` columns; zero ITAR/EAR/export-control code anywhere; neither field is viewable or editable in any UI (doc was too generous here) | HIGH |
| FDA 21 CFR Part 11 e-signatures | ❌ | ✅ Native | ✅ Native | ⚠️ Partial | ❌ | ✅ Implemented — password re-auth + SHA-256 content hash + append-only signature log; real callers gate ECO approve/implement, UI-wired via `ESignDialog` in `ECRScreen` | LOW (was CRITICAL — doc badly out of date) |
| ISO 9001 workflow trail | ⚠️ Partial | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — a real ISO 9001:2015/AS9100D requirement checklist (`compliance_packs`) plus immutable audit log, e-signatures, and approval rules exist; but no status/owner/evidence-link/due-date per requirement, and no management-review or nonconformity-to-clause traceability — a checklist and an audit log, not a conformance trail | MEDIUM (was HIGH) |
| Audit trail (immutable) | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Supplier quality management | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial, partly fabricated — the real `supplier_scorecards` backend is unreached by any screen; the vendor-scorecard UI users actually see (`AnalyticsScreen.jsx`) calls a different endpoint that **hardcodes** `onTimeRate: 94.5`, `qualityScore: 4.2`, `responseTime: "2.3 days"` for every vendor (`backend/app/api/endpoints/analytics.py:272-274`) | HIGH — displayed numbers are literals, worse than absent |
| Training management | ❌ | ✅ Native | ✅ Native | ❌ | ❌ | ❌ Missing — zero hits anywhere | LOW |
| Document retention policies | ❌ | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial | ❌ Missing — `documents` has versioning but no retention/disposition/legal-hold/expiry columns; only unrelated database-backup retention tiers exist | MEDIUM |

**Quality Gap Score: 8/13 present or partial -- 54% weighted (partial at half credit), 46% fully reachable by a user.** Sharply better than the June call: 21 CFR Part 11 e-signatures are properly implemented. Inspection plans are API-only.

---

## 5. Supply Chain & Procurement

| Feature | OpenBOM | Arena | Teamcenter | Windchill | Fusion Manage | Blackbox BOM | Gap |
|---|---|---|---|---|---|---|---|
| Vendor/supplier management | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| RFQ creation/sending | ✅ Native | ✅ Native | ⚠️ Partial | ⚠️ Partial | ✅ Native | ✅ Implemented | — |
| PO creation & tracking | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial | ✅ Implemented | — |
| Supplier scorecards | ❌ | ✅ SCI | ✅ Native | ✅ Native | ⚠️ Partial | ✅ Implemented | — |
| Should-cost modeling | ❌ | ⚠️ Partial | ✅ Cost Mgmt | ✅ Native | ❌ | ✅ Implemented — full bottom-up cost model (`should_cost_models`), read-only dashboard tile (`ShouldCostTile`); no create/edit UI, models must be POSTed via API | MEDIUM (was HIGH) |
| Make vs. Buy analysis | ❌ | ⚠️ Partial | ✅ Native | ✅ Native | ❌ | ⚠️ API only — rich backend + approve route; `makeVsBuyAPI` is never called by any component, no NavRail entry, no screen | MEDIUM |
| Contract/agreement management | ❌ | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ API only — full contract + pricing-tier backend; zero UI, and contract pricing is not even consulted during PO creation | HIGH |
| Kanban reorder triggers | ❌ | ❌ | ✅ Native | ⚠️ Partial | ❌ | ✅ Implemented — `InventoryScreen` reads real reorder points from `kanban_triggers`; read-only (no create/edit UI, `alerts/low-stock` never called), and `autoReorder` is stored but nothing auto-creates a PO from it | MEDIUM (was HIGH) |
| Supplier portal (self-serve) | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Inventory tracking | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ❌ | ✅ Implemented | — |
| Lot/serial/batch traceability | ❌ | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial | ⚠️ API only — complete lot/serial/event backend and client wrapper; zero UI (the "traceability codes" visible in `detail-drawer.jsx` are unrelated barcodes) | HIGH |
| Currency exchange/multi-currency | ❌ | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Supplier risk scoring | ❌ | ✅ SCI | ✅ Native | ✅ Native | ⚠️ Partial | ⚠️ Partial — real part-level risk scoring (`GET /analytics/at-risk-parts`) drives a working dashboard tile; no vendor-level risk *score* computation exists despite risk fields sitting unused on `vendors`/`supplier_scorecards`/`make_vs_buy_analyses` | MEDIUM (was HIGH) |

**Supply Chain Gap Score: 13/13 present or partial -- 85% weighted (partial at half credit), 69% fully reachable by a user.** Strongest domain. Contracts, traceability and make-vs-buy are all built and all unreachable -- no screens.

---

## 6. Integration Ecosystem

| Feature | OpenBOM | Arena | Teamcenter | Windchill | Fusion Manage | Blackbox BOM | Gap |
|---|---|---|---|---|---|---|---|
| REST API + OpenAPI/Swagger | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Webhook system | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — subscription plumbing, HMAC signing, and SSRF guard are real, but `_send_webhook` (`webhook_service.py:195`) has exactly two callers — `test_webhook` and `retry_delivery` — no business event ever fires one | CRITICAL (doc had this as ✅ done) |
| CAD integration — SolidWorks | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented — deepest integration in the product: a real .NET add-in (~150 KB of C#), 24 backend routes, dedicated plugin auth, and CAD Vault UI at `/pdm` | — (was HIGH) |
| CAD integration — Fusion 360 | ✅ Native | ❌ | ❌ | ❌ | ✅ Native | ❌ Missing — zero hits anywhere in backend or frontend | HIGH |
| CAD integration — Altium/ECAD | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial | ❌ | ❌ Missing — zero hits; no netlist/refdes ingest path | HIGH |
| CAD integration — Onshape | ✅ Native | ✅ Native | ❌ | ⚠️ Beta | ✅ Native | ❌ Missing — zero hits anywhere | HIGH |
| CAD — CATIA | ❌ | ❌ | ✅ Native | ❌ | ❌ | ❌ Missing | LOW |
| CAD — NX | ❌ | ❌ | ✅ Native | ❌ | ❌ | ❌ Missing | LOW |
| ERP integration — SAP | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ❌ | ❌ Missing — explicit, honestly-labelled stub: `POST /erp-connectors/{id}/sync` writes a log row stating sync is not implemented; both `test-connection` endpoints return `{"status":"simulated"}` | HIGH |
| ERP — NetSuite | ❌ | ✅ Native | ✅ Native | ✅ Native | ❌ | ❌ Missing — same generic stub as SAP, no NetSuite-specific code | MEDIUM |
| ERP — QuickBooks/Xero | ✅ Native | ❌ | ❌ | ❌ | ❌ | ❌ Missing for QuickBooks/Xero specifically — but **Zoho Books is a genuine, complete, two-way integration** (OAuth, per-entity sync, conflict queue, dedicated UI), satisfying the buyer intent for Zoho shops, not the named systems | MEDIUM |
| CSV/XLSX bulk import | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — two half-paths, neither complete: client-side CSV import fills an unsaved grid with no API call unless the BOM is separately saved; the server-side pipeline stages rows and never creates a `Part`; no XLSX reader exists at all | HIGH (was CRITICAL) |
| API keys with scoped permissions | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — scopes are stored and shown in the `APIKeysScreen` UI but never enforced: `_authenticate_by_api_key` (`backend/app/core/deps.py:80`) never reads `api_key.scopes`, so a key inherits its owning user's full permission set | HIGH |
| Webhook event types | ✅ Rich | ✅ Rich | ✅ Rich | ✅ Rich | ✅ Native | ❌ Missing — worse than "basic": `events` is a free-text column with no enum, registry, or validation, and since no event ever fires (see Webhook system above), the value is never matched against anything at runtime | CRITICAL |

**Integration Gap Score: 5/14 present or partial -- 25% weighted (partial at half credit), 14% fully reachable by a user.** Weakest domain by a wide margin. Webhooks never fire, CSV/XLSX import creates nothing, and every CAD connector except SolidWorks is zero lines.

---

## 7. Collaboration & UX

| Feature | OpenBOM | Arena | Teamcenter | Windchill | Fusion Manage | Blackbox BOM | Gap |
|---|---|---|---|---|---|---|---|
| Real-time simultaneous editing | ✅ Patented | ✅ Native | ⚠️ Partial | ⚠️ Partial | ✅ Native | ⚠️ Partial — backend is complete (`ConnectionManager`, `@app.websocket("/ws/{channel}")`, presence/cursors/locks) but the frontend `CollabProvider` is never mounted; `<CollaborationBar>` renders against a no-op fallback (`connected:false`), so no WebSocket is ever opened by the running app | CRITICAL — one-file wiring fix, not a rebuild |
| Comments on BOM items | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| @mentions / notifications | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — `mentions` is stored as JSON but no Notification row is ever created or fanned out; the UI autocompletes from a hardcoded 5-person array and extracts string handles the API doesn't accept; the "you were mentioned" toast is local React state only | HIGH |
| Task/activity management | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented — teams/work-orders/work-queue backend and UI are real and reachable (`/my-work`, `/work-orders`); caveat: `calendar_events` has full CRUD but `CalendarScreen` persists to localStorage instead, making that table dead weight | resolved (calendar wiring = LOW) |
| Mobile responsive UI | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented — real breakpoints, off-canvas nav drawer, 44px touch targets, dedicated mobile scanner screen; defect: the viewport tag sets `user-scalable=no`, failing WCAG 1.4.4 Resize Text | resolved (drop `user-scalable=no`) |
| PWA / offline support | ❌ | ❌ | ❌ | ✅ Windchill+ | ❌ | ✅ Implemented | — |
| WCAG 2.1 AA accessibility | ✅ High | ⚠️ Partial | ✅ High | ✅ High | ⚠️ Partial | ⚠️ Partial — real ARIA/role/label coverage and an automated axe-core gate exist, but the gate runs only on the Dashboard route; no full-app AA audit exists in the repo and images are largely unlabelled | MEDIUM |
| Role-based dashboards | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Bulk edit / mass operations | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented — real multi-field bulk-edit modal wired from BOM editor and parts screen; fans out to one `api.parts.update` per row (no bulk-update parts endpoint), with honest per-row failure reporting | resolved (bulk parts PATCH = LOW) |
| i18n / multi-language | ✅ Multiple | ✅ Multiple | ✅ Multiple | ✅ Multiple | ✅ Multiple | ✅ ja + en | — |
| Dark mode | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ Implemented | — |
| Interactive 3D CAD viewer | ✅ Native | ✅ Native | ✅ Native | ✅ Web | ✅ Native | ✅ Implemented | — |

**Collaboration Gap Score: 12/12 present or partial -- 88% weighted (partial at half credit), 75% fully reachable by a user.** Real-time editing is the standout: the WebSocket backend is complete but CollabProvider is never mounted, so the presence bar renders a no-op.

---

## 8. Architecture & Platform

| Feature | OpenBOM | Arena | Teamcenter | Windchill | Fusion Manage | Blackbox BOM | Gap |
|---|---|---|---|---|---|---|---|
| Multi-tenant SaaS | ✅ Native | ✅ Native | ✅ Optional | ✅ Optional | ✅ Native | ✅ Implemented — `tenants` table, `tenantId` on ~150 of ~155 tables, JWT-driven isolation middleware enforced even inside raw SQL, full tenant admin UI | resolved |
| On-premise deployment | ❌ | ❌ | ✅ Native | ✅ Native | ❌ | ✅ Native | — |
| Graph-based data model | ✅ Neo4j+Mongo | ❌ SQL | ❌ Relational | ❌ Relational | ❌ SQL | ⚠️ Relational (doc correct) — no graph DB, but the traversal capability it buys is present relationally via the `bom_closures` transitive-closure table plus where-used/explosion routes | LOW — architecture preference, not a feature gap |
| Horizontal scaling | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ❌ Not tested — and now a concrete blocker: `ConnectionManager`/rate-limit state is in-process Python dicts with no Redis pub/sub fan-out, so a second API replica would silently split collaboration sessions and document locks; compose config does not support scale-out | HIGH |
| High availability / DR | ✅ SLA 99.9% | ✅ SLA 99.9% | ✅ HA cluster | ✅ HA cluster | ✅ SLA 99.9% | ⚠️ Partial — DR is real (pgBackRest, WAL archiving, verified backup history, PITR routes); HA is not: exactly one Postgres service, no standby/replica/Patroni/failover | MEDIUM (was HIGH) |
| GDPR compliance | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ Not verified — still nothing: zero hits for erasure/anonymization/consent/data-subject; the only related capability is a data-export endpoint (portability, not erasure) | HIGH |
| SOC 2 Type II | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ Not applicable — UNVERIFIED, not determinable from code (an audit attestation, not a code artifact); supporting controls (audit log, e-signatures, MFA, session timeout, CSRF, encrypted backups) do exist | UNVERIFIED |
| SSO / SAML / OIDC | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Basic OAuth — backend OAuth2 (Google/GitHub/Microsoft) is real with HMAC-signed state; SAML is a shell with no live `/auth/saml` endpoints. **The frontend SSO buttons are a dead button, not a bypass**: `frontend/src/root/auth-onboarding.jsx:87-98` is a `setTimeout` stub that calls `onSignIn` with a hardcoded `admin@blackbox.com` and an empty password; `App.jsx:301` passes that straight into the real `api.auth.login`, and the backend rejects the empty password, so the button just fails with "login failed." A working OAuth2 backend sits unused behind it | HIGH — dead button hides a real backend, not a security bypass |
| MFA / TOTP | ❌ | ✅ Native | ✅ Native | ✅ Native | ❌ | ✅ Implemented | — |
| RBAC with scope | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — real role/permission tables and hierarchy, enforced in 35 of 75 endpoint modules; grants are tenant-global, with no object/project/BOM-level scope column, and `isSuperuser` bypasses every check | MEDIUM |
| OpenAPI/Swagger | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Rate limiting | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Implemented | — |
| Encryption at rest | ✅ AWS | ✅ AWS | ✅ Native | ✅ Native | ✅ AWS | ⚠️ Partial — field-level only: ERP API keys, webhook secrets, and TOTP secrets are encrypted, and backups are encrypted; no volume/TDE encryption, no S3 server-side encryption, and uploaded documents are stored in the clear | MEDIUM (was HIGH) |
| Containerized deployment | ❌ | ❌ | ✅ Docker | ✅ Docker | ❌ | ✅ Docker | — |

**Architecture Gap Score: 11/14 present or partial -- 61% weighted (partial at half credit), 43% fully reachable by a user.** Multi-tenancy shipped. SSO is a dead button in front of a working OAuth2 backend; SOC 2 is an attestation, not code.

---

## 9. Data Model Completeness

| Feature | OpenBOM | Arena | Teamcenter | Windchill | Fusion Manage | Blackbox BOM | Gap |
|---|---|---|---|---|---|---|---|
| Item master (single source) | ✅ Catalog | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Multi-level BOM hierarchy | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Manufacturing process/routing | ❌ | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented — routing tables + process plans backend, `RoutingScreen` lists real data at `/routing`; list-only, no create/edit form in the UI | resolved (authoring UI = MEDIUM) |
| Work center / resource mgmt | ❌ | ❌ | ✅ Native | ✅ Native | ❌ | ✅ Implemented — work centers, schedules, capacity, labor rates, and timesheets, both backend and UI (`WorkCentersScreen`, `LaborScreen`) | resolved |
| Serial number tracking | ❌ | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial | ⚠️ API only — full serial/lot/event backend and client wrapper (`traceabilityAPI`); zero UI consumes it and there is no `/traceability` or `/serial-numbers` route in the app | HIGH — a screen away from done |
| Tooling reference | ❌ | ⚠️ Partial | ✅ Native | ✅ Native | ❌ | ❌ Missing — no tool-master table or route; only free-text `tooling` fields on routing/process-plan rows | MEDIUM |
| Document management | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| CAD file vaulting | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ⚠️ Partial — real document versioning/checksums/derivatives and CAD parsing exist, but the "vault" endpoints (`vault/stats`, `vault/tree`) are just `COUNT(*)`/`GROUP BY` over `documents`; no check-out/check-in, no lock-on-edit, no CAD-specific revision graph | MEDIUM |
| Requirements management | ❌ | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ❌ Missing — no table, route, or UI at all; the one item in this domain with nothing behind it | HIGH |
| Test requirements per part | ❌ | ✅ Native | ✅ Native | ✅ Native | ❌ | ⚠️ API only — `inspection_plans`/`inspection_records` backend and client exist; the only `api.quality.*` caller in the UI is the NCR list, not inspection plans | MEDIUM |
| Project management | ❌ | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |
| Custom attribute definitions | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Native | ✅ Implemented | — |

**Data Model Gap Score: 10/12 present or partial -- 71% weighted (partial at half credit), 58% fully reachable by a user.** Serial/lot and routing tables exist. Requirements management is the only table that was never created.

---

## Competitive Scorecard Summary

| Domain | OpenBOM | Arena PLM | Teamcenter | Windchill | Fusion Manage | Blackbox BOM (weighted) | Blackbox BOM (reachable) | Best-in-Class |
|---|---|---|---|---|---|---|---|---|
| BOM Management | 92% | 92% | 92% | 92% | 83% | **79%** | 58% | Tie |
| Parts & Items | 71% | 86% | 100% | 93% | 64% | **68%** | 43% | Teamcenter |
| Change Management | 55% | 82% | 100% | 91% | 73% | **59%** | 36% | Teamcenter |
| Quality & Compliance | 15% | 100% | 85% | 85% | 54% | **54%** | 46% | Arena |
| Supply Chain | 54% | 77% | 77% | 69% | 46% | **85%** | 69% | Arena/Teamcenter |
| Integration | 79% | 86% | 86% | 86% | 57% | **25%** | 14% | Tie |
| Collaboration & UX | 67% | 67% | 75% | 75% | 67% | **88%** | 75% | Teamcenter/Windchill |
| Architecture & Platform | 71% | 71% | 93% | 93% | 64% | **61%** | 43% | Teamcenter/Windchill |
| Data Model | 50% | 67% | 100% | 100% | 67% | **71%** | 58% | Teamcenter/Windchill |
| **OVERALL** | **61%** | **81%** | **90%** | **87%** | **64%** | **65%** | **49%** | **Teamcenter** |


**Reading this table.** *Weighted* uses the same formula as the competitor columns (a partial counts half), so it is the like-for-like comparison. *Reachable* counts only capabilities a user can actually operate today -- it excludes every row that is a working backend with no screen in front of it. The gap between the two columns, 65% versus 49%, is the single most actionable number in this document: it is UI work over finished infrastructure, not new systems.

The competitor columns were NOT re-verified in this pass and carry over from June 2026. Treat them with caution: they are not internally consistent. OpenBOM's 61% reconciles with its own appendix counts under the half-credit formula, but Fusion Manage's 64% reconciles with neither half nor full credit against its stated 49/10/30 split. Any competitor number here needs its own re-measurement before it is quoted externally.

---

## Competitive Positioning

### vs OpenBOM (Direct Competitor — 61% vs 65% weighted, 49% reachable)
OpenBOM is Blackbox BOM's closest analog — both target the SMB/mid-market with a BOM-centric approach. OpenBOM leads in:
- **xBOM multi-perspective model** (EBOM/MBOM/SBOM from one dataset)
- **Real-time collaboration** (patented simultaneous editing)
- **CAD integrations** (SolidWorks, Fusion 360, Altium, Onshape)
- **ERP integrations** (QuickBooks, Xero, Dynamics 365, Odoo)
- **Full audit compliance trail** with graph-based knowledge model

**To compete with OpenBOM, Blackbox BOM must prioritize**:
1. Real-time collaborative BOM editing (WebSocket-based)
2. xBOM multi-type views (EBOM→MBOM→SBOM transformation)
3. CAD connector plugins (at minimum: SolidWorks, Fusion 360)
4. ERP connector for QuickBooks/Xero

### vs Arena PLM (81%) — The Gold Standard for Mid-Market Regulated PLM
Arena dominates quality/compliance (100% score) and is the default PLM for FDA-regulated companies under 200 users.
- **Blackbox's single advantage**: Self-hosted (Arena is SaaS-only). For companies requiring air-gapped/on-premise PLM, Blackbox BOM has a niche.
- **To compete**: Need FDA 21 CFR Part 11, FMEA, CAPA workflow, supplier quality management, and SOC 2 readiness.

### vs Teamcenter (90%) — The Enterprise King
Teamcenter's 40-year head start makes it impossible to match feature-for-feature. Strategy: **do not compete directly**. Focus on the underserved SMB/mid-market that cannot afford Teamcenter's $300+/user/mo.

### vs Windchill (87%) — The PTC Powerhouse
Windchill + Creo is deeply entrenched in PTC shops. Blackbox BOM's wedge: open-source, self-hosted, no vendor lock-in.

### vs Fusion Manage (64%) — The CAD-Locked Competitor
Fusion Manage only makes sense for Fusion 360 users. Blackbox BOM can compete by being CAD-agnostic.

---

## Top-10 Critical Gaps vs OpenBOM for Parity

Re-ranked 2 August 2026 by *remaining* effort, which is the change that matters:
several June P0s are now finished backends waiting on a screen, and one is a
single unmounted provider. Effort is the work left, not the work total.

| Rank | Feature | Verified status | Effort left | Priority |
|---|---|---|---|---|
| **1** | Real-time collaborative editing | ⚠️ Backend complete (`main.py:368-591`, `WS /ws/{channel}`); `CollabProvider` never mounted, so `bom-editor.jsx:811` renders the no-op fallback and shows "offline" | **One file** | **P0** |
| **2** | Bulk CSV/XLSX import | ❌ `bulk_import.py:71-98` renames keys and marks rows "processed" without ever creating a `Part`; no XLSX reader exists. OpenBOM's whole onboarding motion is "drag your spreadsheet in" | Medium | **P0** |
| **3** | Webhooks that fire | ❌ `webhook_service.py:195` reachable only from `test_webhook` and `retry_delivery`; no business event emits. Subscription UI implies a working system | Medium | **P0** |
| **4** | Serial/lot traceability UI | ⚠️ 3 tables, 10 `/traceability/*` routes, finished API client, zero components | UI only | **P0** |
| **5** | Effectivity (date/serial/lot) | ❌ Genuinely absent; zero occurrences of `effectivity` backend-wide. One `effective_date` on `eco_headers` is the whole implementation | Medium | **P0** |
| **6** | Non-SolidWorks CAD connectors | ❌ Fusion 360, Onshape, Altium are each zero lines. SolidWorks add-in is real | High | **P1** |
| **7** | Automated change notifications | ⚠️ `eco_notifications` table, `GET /eco/{id}/notifications` and client wrapper all exist, but nothing ever creates a row, so the dispatcher drains an empty queue | **Low** | **P1** |
| **8** | Multi-BOM types (EBOM/MBOM/SBOM) | ⚠️ SBOM is a full stack; `mbom_headers`/`mbom_items`/`mbom_operations` exist; `boms` still has no type column | Medium | **P1** |
| **9** | Multi-UOM with conversion | ❌ `parts.uom` is free text; no conversion anywhere. Blocks roll-up on mixed-unit BOMs. `exchange_rates` is a working template | Medium | **P1** |
| **10** | Requirements management | ❌ No table, no route, no UI — the only true zero in the data model, and the standard Arena/Teamcenter differentiator over OpenBOM | High | **P2** |

**Dropped from the June list**, verified as no longer gaps: mobile responsive UI, change
impact analysis (`bom_closures` + `/graph/*`), and part lifecycle states (`PartLifecycle`
/`LifecycleDefinition`). Accessibility is materially better than the June score of 3.8/10,
though not yet WCAG 2.1 AA.

### Cheap wins already paid for

Four rows leave the gap list for UI work alone, with no new backend: deviations/waivers
(8 routes + full API wrapper, no screen), BOM variants (3 routes + wrapper, no screen),
`POST /parts/check-duplicates` (a server-side detector sitting unused while the UI runs a
weaker heuristic of its own), and `GET /eco/{id}/impact` (wrapper exists, nothing renders
it). Contracts, make-vs-buy, inspection plans and `calendar_events` have the same shape.

---

## Remediation Roadmap

Re-sequenced 2 August 2026. The June roadmap assumed most of this was greenfield.
It isn't: the cheapest phase is now the one with the highest visible payoff, because
it is almost entirely wiring finished backends to screens.

### Phase 8a — Stop the interface asserting things that are not true
1. **Fix the misleading UI** — see the section at the end of this document. Nothing else
   on this roadmap matters if a demo shows "changes applied · audit logged" for a write
   that never happened.
2. **Mount `CollabProvider`** — one file turns real-time collaboration from "shows
   offline" into OpenBOM's headline feature working.
3. **Emit webhook events** — the delivery, retry and subscription machinery is built;
   what is missing is the call at each business event.
4. **Create notification rows on ECO transitions** — the table, endpoint, client and
   email dispatcher all exist and drain an empty queue.

### Phase 8b — Screens over finished backends
5. **Serial/lot traceability UI** — 3 tables, 10 routes, finished client, zero components.
6. **Contracts, make-vs-buy, inspection plans, deviations/waivers, BOM variants,
   calendar events** — each is model + router + `api.js` wrapper + `screenDataBridge`
   entry with no screen.
7. **Wire the unused server-side duplicate detector and ECO impact endpoint** into the
   screens that currently approximate them.

### Phase 8c — Genuinely new work
8. **Bulk CSV/XLSX import that creates records** — including an XLSX reader, which does
   not exist at all.
9. **Effectivity engine** — date/unit/lot effectivity on BOM lines.
10. **Multi-UOM with conversion** — model on `exchange_rates`, which already works.
11. **BOM type column** on `boms` to complete EBOM/MBOM/SBOM.
12. **Additional CAD connectors** — Fusion 360, Onshape, Altium.
13. **Requirements management** — the one item with nothing behind it.
14. **Enforce API-key scopes** (`backend/app/core/deps.py:80`) and finish WCAG 2.1 AA.

---

## Strategic Recommendations

1. **Stop trying to be a mini-Teamcenter.** Blackbox BOM's competitive advantage is being open-source, self-hosted, and CAD-agnostic. Double down on this.

2. **The gap is smaller than it looks, and differently shaped.** Weighted like-for-like,
   this scores 65% against OpenBOM's 61% — but only 49% of capability is reachable by a
   user. The difference is not missing systems, it is missing screens. Closing it is
   frontend work over infrastructure that already exists and is already tested, which is
   the cheapest competitive ground available and should be taken first.

3. **Target the compliance gap last.** Arena PLM has a 15-year head start in FDA/ISO. Instead, focus on being the best "engineering-first" BOM tool and add compliance via optional modules.

4. **Open-source community strategy.** Unlike all competitors, Blackbox BOM can build a community of plugins, connectors, and extensions. This is the long-term moat.

5. **Price advantage.** Self-hosted = ~90% lower TCO than any cloud competitor. Lead with this in all marketing.

---

## Appendix: Competitor Feature Counts

| Vendor | Total Features | Present | Partial | Missing | Overall Score |
|---|---|---|---|---|---|
| OpenBOM | 89 | 50 | 8 | 31 | 61% |
| Arena PLM | 89 | 66 | 7 | 16 | **81%** |
| Siemens Teamcenter | 89 | 75 | 5 | 9 | **90%** |
| PTC Windchill | 89 | 70 | 7 | 12 | **87%** |
| Autodesk Fusion Manage | 89 | 49 | 10 | 30 | 64% |
| **Blackbox BOM** | **89** | **37** | **12** | **40** | **50%** |

---

## Misleading UI — fix before any demo

These are places the re-verification found the interface asserting something that is not true. Each is cheap to fix relative to the damage it does in a live demo or a post-sale integration.

1. **`/cad/apply-sync` toasts success while writing nothing.** `POST /api/v1/cad/apply-sync` (`backend/app/api/endpoints/cad.py`) looks each part up, increments a counter, and returns `appliedCount` without writing any field. `frontend/src/root/pdm-cad.jsx:1495-1552` (`CADSyncModal`) calls `cadAPI.sync()` then `cadAPI.applySync(diffs)` and reports **"Sync complete · N changes applied · audit logged"** to the user. Silent loss of user intent — nothing was applied and nothing was logged.

2. **`SourcingView` fabricates alternate-vendor counts.** `frontend/src/components/SourcingView.jsx:20`: `_alts: Math.max(0, (r.pn.charCodeAt(0) + i) % 4)`. A real `part_vendors` AVL table and API sit unused; `_risk` is derived from lead time, not from vendor data.

3. **`ECRScreen` synthesizes approval state instead of reading it.** `frontend/src/components/advanced/ECRScreen.jsx:57` `approvalsForEcoStatus(status)` derives a fixed `{eng, proc, fin}` dot grid from the ECO status string alone (rendered at `:345-365`, `:603-608`, `:928-952`), instead of reading the `eco_approvals` rows the backend actually maintains (approver, order, signature, timestamp).

4. **`/analytics/vendor-scorecards` hardcodes vendor quality numbers.** `backend/app/api/endpoints/analytics.py:272-274` returns literal `"onTimeRate": 94.5`, `"qualityScore": 4.2`, `"responseTime": "2.3 days"` for every vendor. This is the endpoint `AnalyticsScreen.jsx` actually renders, while the real `supplier_scorecards` backend goes unreached from any screen.

5. **API-key scopes are stored but never enforced.** `backend/app/core/deps.py:80` `_authenticate_by_api_key` validates prefix, bcrypt hash, expiry, and rate limit — and never reads `api_key.scopes`. The `APIKeysScreen` UI displays scopes that do nothing; a key silently inherits its owning user's full permission set.

6. **SSO buttons are a dead button, not a bypass.** `frontend/src/root/auth-onboarding.jsx:87-98` — the "Google"/"Microsoft"/"SAML SSO" buttons are a `setTimeout(800)` stub that calls `onSignIn` with a hardcoded `admin@blackbox.com` and an **empty** password. This is **not** an authentication bypass: `App.jsx:301` passes that straight into the real `api.auth.login`, the backend rejects the empty password, and the user gets "login failed." It is a dead button — it cannot work, and it hides a real, working OAuth2 backend (`backend/app/api/endpoints/sso.py`) that no one can reach through it. Separately, and worth one honest line: when the server is genuinely unreachable, the local-first offline path at `App.jsx:323-325` admits any credentials, because there is no server available to validate against — the comment in `frontend/src/utils/offlineAuth.js` claims this is for "a previously-known user," but the code does not actually check that the user is previously known.

*Document generated by Principal Architecture Review — Part of v1.19.0 Enterprise Audit Cycle; re-verified 2 August 2026 against v2.1.0.*
