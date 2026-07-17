# Blackbox BOM — Phased Execution Plan

## Phase 0 — Foundation (Weeks 1-2)

**Goal:** Skeleton that runs on any machine — backend API, database, auth, CI.

| Step | What | Details |
|---|---|---|
| 0.1 | Docker infra | `docker-compose.yml` — PostgreSQL + Python API (FastAPI) + Redis (caching/queues) + nginx |
| 0.2 | Python backend scaffold | FastAPI project structure: routers, models, schemas, migrations (Alembic), config, middleware |
| 0.3 | Data model (DB schema) | All tables: `users`, `projects`, `boms`, `parts`, `vendors`, `prices`, `revisions`, `documents`, `purchase_orders`, `comments`, `audit_logs`, `compliance_tags`. Include **industry fields** (MPN, HTS, UNSPSC, etc.) now so you never remigrate |
| 0.4 | Auth system | JWT-based login + refresh tokens. Password hashing (bcrypt). Role/permission model built into middleware |
| 0.5 | REST API — CRUD endpoints | Full OpenAPI spec for all core entities — parts, BOMs, vendors, projects, documents, POs |
| 0.6 | CI/CD pipeline | GitHub Actions: lint → test → build → deploy. Docker image push |
| 0.7 | Seed data migration | Convert the existing `data.js` / `projects.js` mock data into a DB seed script — preserves all 4 projects for dev/testing |

**No UI changes. Pure backend + infra.**

---

## Phase 1 — PRD Modules (All 15) (Weeks 3-6)

**Goal:** Every PRD module works end-to-end against the real API — no mock data.

**Note:** All frontend UI for these modules is already complete (BOM templates, duplication, rollback, price alerts, procurement alerts, folder tree, auto-scrape modal, etc.). Phase 1 focuses on wiring the existing UI to real API endpoints.

| Step | Module | Details |
|---|---|---|
| 1.1 | **3.1 Component Mgmt** | Connect parts library to API; inline edit in BOM table saves to DB; detail drawer fetches live data |
| 1.2 | **3.3 BOM Management** | Wire `BOMTemplatesModal` + `BOMDuplicationModal` to API; multi-level hierarchy writes to DB |
| 1.3 | **3.4 Version Control** | Wire `RollbackModal` to API; auto-revision on every save; rollback endpoint restores revision as new current |
| 1.4 | **3.5 Vendor Mgmt** | CRUD vendors; link multiple vendors per part with preferred/alternate flags; risk scoring |
| 1.5 | **3.6 Cost Management** | Wire `PriceAlertsModal` to API; landed cost calc wired to real freight/tax fields; price trend chart from historical table |
| 1.6 | **3.7 Country of Origin** | Wire country history timeline to API; multi-country per part; compliance tag filter on country |
| 1.7 | **3.8 Barcode/QR** | Generate barcode from part UUID; scan lookup endpoint + camera capture (real, not simulated) |
| 1.8 | **3.9 Procurement** | Wire `ProcurementAlertsModal` to API; full 10-stage workflow; PO creation; ETA tracking; file attachments stored in S3 |
| 1.9 | **3.10 Document Mgmt** | Wire `DocumentFolderTree` to S3; real file upload with folder structure; versioned files; access control by role |
| 1.10 | **3.11 OCR Extraction** | Integrate Tesseract/docling pipeline; extract fields → pre-fill form with confidence scores; manual correction saves back |
| 1.11 | **3.12 Collaboration** | Real-time comments via WebSocket; @mention autocomplete from DB; notification creation on mentions/approvals |
| 1.12 | **3.13 Export/Reporting** | Add SheetJS for real XLSX export; add jsPDF for real PDF; server-side report generation for 6 report types |
| 1.13 | **3.14 Analytics Dashboard** | KPI queries aggregating real data; cost trend chart; vendor scorecards with actual metrics; heat maps |
| 1.14 | **3.2 SolidWorks Integration** | Build connector service (Python → pywin32 → SolidWorks API); pull assembly tree; auto-generate thumbnails; diff against current BOM |
| 1.15 | **3.15 Internet Scraping** | Replace `AutoScrapeModal` simulated data with real Playwright/Scrapy pipeline; user approval step before import; confidence validation |

**Frontend rework needed per module:** Replace `window.BOM_DATA` reads with `fetch()` calls; add loading/error/empty states. Keep component structure intact — most UI already exists.

---

## Phase 2 — Enterprise & Security (Weeks 5-7, overlaps with Phase 1)

**Goal:** Tool passes enterprise vendor review.

| Step | What | Details |
|---|---|---|
| 2.1 | SSO integration | Azure AD / Okta / Google OAuth2 — configurable via env vars |
| 2.2 | MFA / 2FA | TOTP-based (Google Authenticator, Authy) |
| 2.3 | RBAC enforcement | Every API endpoint checks permissions; UI hides/shows elements by role |
| 2.4 | Immutable audit logs | Separate table, append-only, no deletes/updates; UI viewer for admins |
| 2.5 | Encryption at rest | DB-level (PostgreSQL pgcrypto) + S3 server-side encryption |
| 2.6 | File upload scanning | ClamAV integration on upload endpoint |
| 2.7 | Rate limiting + CORS | nginx config + FastAPI middleware |
| 2.8 | Secrets management | .env → Vault migration path |

---

## Phase 3 — Supply Chain Depth (Weeks 6-8)

**Goal:** Real PLM capabilities beyond basic PRD.

| Step | What |
|---|---|
| 3.1 | Make vs. Buy analysis form + report |
| 3.2 | Should-cost model (material + labor + overhead) |
| 3.3 | Supplier scorecard engine (weighted metrics) |
| 3.4 | CAPA workflow (root cause → fix → verify) |
| 3.5 | FAI (AS9102 First Article Inspection) module |
| 3.6 | Deviation / waiver workflow |
| 3.7 | Serial / Lot / Batch traceability |
| 3.8 | Kanban reorder triggers |
| 3.9 | Contract / pricing agreement management |

---

## Phase 4 — Integration (Weeks 7-9)

**Goal:** Tool connects to the outside world.

| Step | What |
|---|---|
| 4.1 | OpenAPI spec published / Swagger UI |
| 4.2 | Webhook system (register endpoints, retry logic, event log) |
| 4.3 | Bulk CSV/XLSX import with field mapping UI |
| 4.4 | ERP connector stubs (REST endpoints matching SAP/NetSuite schemas) |
| 4.5 | Supplier portal (vendors log in, update prices/lead times, upload docs) |

---

## Phase 5 — Quality & Scale (Weeks 8-10)

**Goal:** Production-ready, documented, tested.

| Step | What |
|---|---|
| 5.1 | Unit tests (pytest) — all API endpoints |
| 5.2 | Integration tests — full workflows |
| 5.3 | E2E tests (Playwright) — critical user paths |
| 5.4 | Load tests (Locust) — 100k parts, 3s load |
| 5.5 | Monitoring setup (Prometheus + Grafana) |
| 5.6 | Error tracking (Sentry) |
| 5.7 | User manual + admin guide |
| 5.8 | Data dictionary |
| 5.9 | Deployment runbook |

---

## Phase 6 — Advanced (Weeks 10-12)

**Goal:** Competitive moat / roadmap features.

| Step | What |
|---|---|
| 6.1 | AI procurement suggestions (LLM) |
| 6.2 | Demand forecasting |
| 6.3 | Part interchangeability suggestions |
| 6.4 | Mobile scanning app (React Native or PWA) |
| 6.5 | Poka-yoke part validation rules |
| 6.6 | Approval automation (auto-approve if conditions met) |

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Frontend rewrite needed (vanilla React → Next.js) | High | High | Do UI migration in Phase 1 alongside API integration — component-by-component, not all at once |
| SolidWorks API is Windows-only | High | Medium | Run CAD connector as a separate Windows service; main backend on Linux |
| OCR accuracy insufficient for production | Medium | High | Human-in-the-loop with confidence thresholds; fall back to manual entry |
| Users reject UX change from prototype | Medium | Medium | Keep same visual design; only swap data source underneath |
| Enterprise compliance scope creep | Medium | High | Hard scope-gate Phase 2 at SSO + RBAC + audit log; defer SOC 2/ITAR to separate project |
| Scraping engine blocked by sites | High | Low | Respect robots.txt; user-initiated only; cache results |

---

## Key Architectural Decisions

| Decision | Choice | Why |
|---|---|---|
| API framework | FastAPI (Python) | Async by default, auto OpenAPI, pydantic validation, mature ecosystem |
| Database | PostgreSQL | JSONB for flexible fields, array columns for tags, robust migration tooling |
| ORM | SQLAlchemy 2.0 | Industry standard, async support, Alembic for migrations |
| File storage | S3-compatible (MinIO for dev) | Same API as AWS S3, switch without code changes |
| Search | PostgreSQL full-text search (Phase 0-3) → Elasticsearch (Phase 4+) | Avoid early complexity; pg_trgm + GIN indexes handle 100k parts |
| Task queue | Redis + Celery | Background OCR, scraping, email parsing |
| Frontend | Keep vanilla React for now; prepare Vite migration | Don't block features on tooling migration; do it incrementally |
| Frontend-backend comms | REST (Phase 1) + WebSocket (Phase 2 for real-time) | REST is simpler for CRUD; WebSocket for comments, notifications |

---

**Total estimate:** ~12 weeks for a single senior full-stack developer. 6-8 weeks for a team of 2-3.
