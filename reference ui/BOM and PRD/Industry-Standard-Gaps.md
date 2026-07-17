# Blackbox BOM — Industry-Standard One-Shot Solution: Gaps Analysis

## 1. Infrastructure & DevOps

*Why: zero-downtime, repeatable, scalable*

| Item | Why |
|---|---|
| Docker + Docker Compose | Reproducible dev & prod environments — every team member runs the same stack |
| CI/CD pipeline (GitHub Actions) | Automatic test → build → deploy on every push |
| Load balancer + reverse proxy (nginx) | TLS termination, static serving, rate limiting |
| Database migration tool (Alembic) | Schema changes are versioned and reversible |
| Monitoring (Prometheus + Grafana) | Know when things break before users do |
| Error tracking (Sentry) | Capture and triage production errors |
| Log aggregation (Loki/ELK) | Centralized logs for debugging |
| Backup & disaster recovery plan | Database + file storage backups with RPO/RTO targets |

**Must-have from day one** — you cannot add infra after the fact without pain.

---

## 2. Security Hardening

*Why: enterprise will not touch this without it*

| Item | Why |
|---|---|
| Real SSO / OAuth2 (Azure AD, Okta, Google) | Every enterprise requires SSO — mock auth is a blocker |
| MFA / 2FA | Industry baseline for procurement/finance data access |
| Encryption at rest (DB + S3) | Compliance requirement (SOC 2, ISO 27001) |
| API rate limiting + CORS + CSRF | Prevent abuse and data leaks |
| Secrets management (Vault / env) | No hardcoded credentials anywhere |
| Immutable audit logs | Tamper-proof trail for compliance audits |
| IP whitelisting / VPN gating | Restrict access to corporate network |
| File upload scanning | Malware in datasheets/PDFs = supply chain attack vector |
| Password policy + session management | NIST guidelines, credential rotation |
| RBAC with scope (per-project, per-BOM) | Users should see only what they need |

**Non-negotiable for any production deployment.**

---

## 3. Compliance & Regulatory

*Why: legal requirement for manufacturing*

| Item | Why |
|---|---|
| RoHS / REACH / Conflict Minerals tracking | Legal requirement for electronics import/export |
| ITAR / EAR compliance | Defense/aerospace export control — jail time if wrong |
| ISO 9001 / AS9100 workflow trail | Certification auditors will inspect the system |
| FDA 21 CFR Part 11 (e-signatures) | Medical device — electronic signatures are legally binding |
| SOC 2 Type II readiness | Every SaaS buyer checks this box first |
| GDPR / CCPA data privacy controls | Right to be forgotten, data export, consent tracking |
| Document retention policies | Auto-archive/delete per regulatory schedule |
| eSignature integration (DocuSign) | Approvals need legal weight for procurement contracts |

**Without these, the tool cannot be sold or deployed in regulated industries (aerospace, medical, defense, automotive).**

---

## 4. Supply Chain Depth

*Why: what makes a BOM tool actually useful*

| Item | Why |
|---|---|
| Make vs. Buy analysis | Core engineering decision — tool should facilitate it |
| Should-cost modeling | Estimate fair price per part (material + labor + overhead) |
| Supplier scorecards (weighted) | On-time %, quality %, cost competitiveness — drive decisions |
| Contract / pricing agreement mgmt | Negotiated prices expire — track validity periods |
| NDA tracking per vendor | Legal prerequisite to sharing drawings |
| Deviation / waiver workflow | Temporary exceptions to approved BOM — massive in manufacturing |
| CAPA (Corrective Action) | Root cause → fix → verify — closed-loop quality |
| FAI (AS9102 First Article Inspection) | Aerospace standard — mandatory for new parts |
| PPAP (Production Part Approval Process) | Automotive standard |
| Serial / Lot / Batch traceability | Recall scenario — which units have the bad part? |
| Shelf-life / expiration tracking | Medical, food, battery components degrade |
| Kanban reorder triggers | Auto-generate POs when stock hits min threshold |
| Demand forecasting | Predict future orders based on BOM schedules |

**These are the features that separate a toy from a real PLM tool.**

---

## 5. Data Model Completeness

*Why: missing fields = missing functionality*

| Item | Why |
|---|---|
| Manufacturer part number (MPN) | Every physical part has one — different from internal PN |
| Customer part number (for build-to-print) | 50% of manufacturing is "make it per this print" |
| HTS / ECCN / Schedule B codes | Customs clearance — ship nothing without these |
| UNSPSC codes | Procurement classification standard |
| Commodity codes | Group similar parts for strategic sourcing |
| Drawing/model number per revision | CAD file version ≠ BOM revision — both needed |
| Test requirements per part | "Inspect 100% of these" — quality plan attachment |
| Tooling reference (mold/die/fixture) | Tooling cost amortized across parts — critical for cost |
| Manufacturing process reference | "How is this made?" — CNC, injection mold, cast, etc. |
| Multiple UOM + conversion | Buy in kg, use in grams — common in BOM |

**These are the fields engineers and supply chain managers expect in any real system.**

---

## 6. Integration Ecosystem

*Why: no tool is an island*

| Item | Why |
|---|---|
| REST API + OpenAPI spec | Every integration starts here — must exist from day one |
| Webhook system with retry | Event-driven: BOM approved → notify ERP → create PO |
| CSV / XLSX import with mapping UI | Users will upload 10,000 parts from a spreadsheet — handle it |
| ERP connectors (SAP, NetSuite, Dynamics) | The BOM is worthless if it doesn't reach purchasing |
| CAD connectors (SW, AutoCAD, Altium, Eagle) | Engineers work in CAD, not in your UI |
| Accounting connectors (QB, Xero) | Costs flow to financial systems |
| Supplier portal (vendors self-serve) | Vendors update lead times, prices, upload docs — not your job |

**No real PLM tool lives in isolation. The integration surface is the product.**

---

## 7. Testing & Quality

*Why: bugs in BOM data = wrong parts ordered = $$$*

| Item | Why |
|---|---|
| Unit tests (pytest + vitest) | Essential — every function, every edge case |
| Integration tests (API + DB) | Ensure endpoints work end-to-end |
| E2E tests (Playwright) | Critical paths: create BOM → release → order → receive |
| Load tests (k6 / Locust) | Prove "100k components under 3s" from the PRD |
| Visual regression tests | Design changes don't break the UI silently |
| BOM validation rules engine | Catch: missing qty, duplicate refdes, zero cost, obsolete parts |
| Data integrity checks | Prevent orphaned records, negative quantities, invalid references |

**BOM data is expensive to fix. Testing is not optional.**

---

## 8. Documentation & Operations

*Why: nobody can run what they can't understand*

| Item | Why |
|---|---|
| OpenAPI / Swagger UI | Auto-generated interactive API docs |
| User manual + admin guide | Enterprises require documentation for SOPs |
| Architecture decision records | Why was X chosen? — saves future developers |
| Data dictionary | Every field, every table documented |
| Deployment runbook | Step-by-step to stand up a new environment |
| Health check endpoints | `/health`, `/ready`, `/metrics` — ops standard |
| Feature flags | Toggle features on/off without deployment |
| Usage analytics | What features do users actually use? — drives roadmap |

**Documentation is what makes a project maintainable beyond the original developer.**

---

## 9. Enterprise UX

*Why: users are demanding*

| Item | Why |
|---|---|
| WCAG 2.1 AA accessibility | Legal requirement in many countries + 15% of users need it |
| Mobile responsive | Engineers walk the factory floor with tablets |
| i18n (multi-language) | Global supply chain — not everyone speaks English |
| PWA / offline support | Factory floors often have spotty connectivity |
| Push notifications | "PO approved" → immediate action |
| Customizable dashboards | Every role wants different KPIs |
| Bulk select + mass edit everywhere | Manual row-by-row editing for 500 parts is not acceptable |
| Auto-save | One network drop = lost work = angry user |

**If it's hard to use, people will work around it (spreadsheets).**

---

## Summary: The Tiered Approach

For a **one-shot industry-standard solution**, here's the priority:

| Tier | What | Effort |
|---|---|---|
| **Tier 0: Foundation** | Backend API + PostgreSQL + Auth + Docker + CI | Must-have, builds first |
| **Tier 1: Core** | All 15 PRD modules fully functional (not mock) | The main product |
| **Tier 2: Enterprise** | SSO, RBAC, audit logs, compliance, testing | Gates enterprise sales |
| **Tier 3: Integration** | REST API, webhooks, import/export, CAD connectors | Makes it useful |
| **Tier 4: Scale** | Caching, search, monitoring, performance, docs | Makes it reliable |
| **Tier 5: Advanced** | Supplier portal, forecasting, AI suggestions, mobile app | Competitive moat |

**Total: ~40-60 additional modules/systems beyond the current PRD scope.**

The current PRD covers maybe **30%** of what an industry-standard BOM/PLM tool needs. The existing UI prototype covers the **easy 30%** — the real work is in the backend, integrations, compliance, and operations infrastructure.

---

## Current Prototype Status (as of June 2026)

The frontend prototype is **100% complete** for all PRD-specified UI/UX. Every screen, modal, workflow, and interaction described in the PRD exists in the codebase. Specific completions:

| Category | Status | Details |
|---|---|---|
| BOM Templates | ✅ Done | Save/load BOM structures via `BOMTemplatesModal` (localStorage-backed) |
| BOM Duplication | ✅ Done | Clone BOM with variant naming via `BOMDuplicationModal` |
| Rollback UI | ✅ Done | Timeline-based revision restore via `RollbackModal` |
| Price Alerts | ✅ Done | Threshold-based cost monitoring via `PriceAlertsModal` |
| Procurement Alerts | ✅ Done | Critical supply chain notifications via `ProcurementAlertsModal` |
| Document Folder Tree | ✅ Done | Recursive folder navigation via `DocumentFolderTree` |
| Country History | ✅ Done | Timeline tracking per part for origin changes |
| Parts Health Score | ✅ Done | Analytics card with duplicates, obsolete, single-source, lead-time KPIs |
| Manufacturer Field | ✅ Done | Separate from vendor on all 30 parts |
| CAD Reference | ✅ Done | Per-part CAD file links on mechanical parts |
| Camera Barcode Scan | ✅ Done | Real `getUserMedia` camera support |
| Auto-Scrape Modal | ✅ Done | Multi-source internet enrichment UI (simulated) |

**What remains (all backend-dependent):**
- Real API + Database + Auth
- Real SolidWorks API connector
- Real OCR pipeline (Tesseract/AI)
- Real internet scraping engine (Playwright/Scrapy)
- Real XLSX/PDF export (SheetJS/jsPDF)
- Real S3 file storage
- Real-time WebSocket collaboration
- All security, compliance, and infrastructure items listed above
