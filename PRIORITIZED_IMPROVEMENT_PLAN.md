# Blackbox BOM — Prioritized Improvement Plan v2.0

**Generated**: 2026-06-28
**Version**: 1.37.0
**Based on**: Enterprise Audit Report v4.0

---

## Scoring Key

| Priority | Definition | Target Timeline |
|----------|------------|-----------------|
| **P0 CRITICAL** | Blocks production deployment / security breach | 0-7 days |
| **P1 HIGH** | Significant enterprise gap / technical debt | 7-30 days |
| **P2 MEDIUM** | Feature parity / quality of life | 30-90 days |
| **P3 LOW** | Nice-to-have / long-term strategic | 90+ days |

---

## P0 CRITICAL — Ship Blockers

### 1. Pin Docker Image Digests
- **Issue**: All 3 Dockerfiles use `@sha256:REPLACE_WITH_ACTUAL_DIGEST`. All compose files use unpinned versioned tags. Supply chain attack vector.
- **Script**: `scripts/pin-docker-digests.sh` exists but requires Docker daemon
- **Effort**: 30 min (run script) | **Impact**: Supply chain security
- **Files**: `backend/Dockerfile`, `backend/Dockerfile.prod`, `BOM and PRD/Dockerfile`, all 4 compose files
- **Action**: Run `bash scripts/pin-docker-digests.sh` on machine with Docker

### 2. Resolve Docker Compose YAML Bugs
- **Issue**: `backend/docker-compose.prod.yml` lines 200-201 still have indentation bugs (extra spaces before `SENTRY_DSN` and `CORS_ORIGINS`)
- **Effort**: 5 min | **Impact**: Production deployment will fail
- **Action**: Fix extra spaces at lines 200-201

### 3. Verify No `.secret_key` Files in Repo
- **Issue**: Previously tracked `.secret_key` files in `backend/` and root. Now gitignored and deleted from disk.
- **Effort**: 5 min | **Impact**: Credential leak
- **Action**: `git ls-files .secret_key` on repo init to verify not tracked

---

### 4. P0 CRITICAL: Eliminate localStorage Data Persistence — Migrate to PostgreSQL
- **Issue**: 19 localStorage keys across 12 frontend files store core business data (BOM rows, work orders, ECRs, PO drafts, documents, scrape history, calendar events, supplier users, barcode scans, saved searches) — all bypassing PostgreSQL. Browser cache clear = permanent data loss.
- **Files affected**: `advanced-features.jsx`, `bom-editor.jsx`, `parts-screen.jsx`, `power-features.jsx`, `enterprise-final.jsx`, `final-polish.jsx`, `integration-screens.jsx`, `mobile-scanner.jsx`, `overlays.jsx`, `enterprise-utils.jsx`
- **Effort**: 3 days | **Impact**: Data integrity, enterprise readiness
- **Action**: Create DB tables for ECRs, work orders, calendar events, saved searches, scrapes. Add API endpoints. Modify frontend to use API calls instead of localStorage. Add migration in Alembic.

### 5. P0 CRITICAL: Eliminate SQLite Test Database
- **Issue**: `backend/test.db` is SQLite 3.x (23065 pages). Test data bypasses PostgreSQL, creating schema drift risk between test and production.
- **Effort**: 1 day | **Impact**: Test reliability, schema consistency
- **Action**: Remove `test.db`, configure test environment to use PostgreSQL test database, update test fixtures to use asyncpg

### 6. HIGH: Add DB Tables for Frontend-Persisted Data
- **Issue**: ECR, work order, calendar event, and checklist data has NO database table, migration, or API endpoint — exists only in browser localStorage
- **Files needed**: New Alembic migration, new SQLAlchemy models, new API endpoints, frontend API calls
- **Effort**: 3 days | **Impact**: Data integrity, disaster recovery capability

---

## P1 HIGH — Enterprise Readiness

### 7. Frontend Component Extraction
- **Issue**: 23 flat JSX files (~17,454 lines) with only 3 components in `src/components/`. No subdirectory organization.
- **Target files**: `modals-extra.jsx` (2361 lines), `secondary-screens.jsx` (1760 lines), `overlays.jsx` (1205 lines), `app.jsx` (1623 lines)
- **Effort**: 3-5 days | **Impact**: Maintainability, team scalability
- **Pattern**: Extract reusable pieces from largest files into `src/components/{modals,screens,utils}/`

### 5. React Router Migration
- **Issue**: `App.jsx` uses manual `location.pathname` matching for 34 routes instead of `<Route>` components. `react-router-dom` v7 already installed.
- **Effort**: 1-2 days | **Impact**: Routing reliability, code clarity, future SSR support
- **Action**: Replace `switch(location.pathname)` blocks with `<Routes><Route path="..." element={...} /></Routes>`

### 6. `window.*` ES Module Migration (Phase 4: Shim Removal)
- **Issue**: 4,102+ `window.*` references across 23 JSX files. Phases 1-3 added named ES exports + backward-compat shims. Phase 4 removes shims and converts all consumers to `import` syntax.
- **Effort**: 3-5 days | **Impact**: Bundle size, namespace safety, tree-shaking
- **Prerequisite**: Component extraction (item 4) should be done first to avoid rework

### 7. Frontend Test Infrastructure
- **Issue**: 2 trivial test files for ~17,000 lines of JSX. Zero component tests.
- **Effort**: 5 days | **Impact**: Regression safety
- **Action**: Add Vitest + RTL tests targeting 30% coverage on critical screens (BOM editor, parts, dashboard)

### 8. API Integration Tests
- **Issue**: No integration tests for 466 API routes. 248 unit tests exist but don't validate actual route responses.
- **Effort**: 5 days | **Impact**: API reliability
- **Action**: Add `httpx.AsyncClient` tests for all 61 endpoint files, focusing on CRUD + RBAC + pagination

### 9. Japanese Locale Completion
- **Issue**: ja.json has 430 lines vs en.json's 2,115 lines (~20% complete)
- **Effort**: 2 days | **Impact**: Japanese market entry
- **Action**: Translate remaining ~1,685 keys, or generate from ja.json + en.json diff

### 10. Load Testing Results
- **Issue**: `tests/load/locustfile.py` exists but no evidence of passing benchmarks
- **Effort**: 1 day | **Impact**: Performance baseline
- **Action**: Run locust against staging, document results, establish baselines

---

## P2 MEDIUM — Feature & Quality Parity

### 11. Frontend Error Boundaries
- **Issue**: Global error handler only — no per-component error boundaries
- **Effort**: 1 day | **Impact**: UX resilience

### 12. Dark/Light Theme Toggle
- **Issue**: Dark mode only. No light theme option.
- **Effort**: 1 day | **Impact**: Accessibility, user preference

### 13. Bulk Edit for BOM Items
- **Issue**: No batch quantity/part number/reference update on BOM lines
- **Effort**: 2 days | **Impact**: OpenBOM parity

### 14. Column Customization in Data Grids
- **Issue**: Users stuck with default columns in BOM, parts, vendor tables
- **Effort**: 2 days | **Impact**: UX quality

### 15. Export-to-Excel from Grid Views
- **Issue**: No CSV/XLSX export on filtered list views
- **Effort**: 1 day | **Impact**: Reporting needs

### 16. xBOM Multi-Type Views (EBOM/MBOM/SBOM)
- **Issue**: Missing core PLM feature. Critical vs OpenBOM.
- **Effort**: 5 days | **Impact**: PLM parity — P0 gap vs OpenBOM
- **Note**: Requires new BOM type field + transformation logic

### 17. Part Classification/Taxonomy
- **Issue**: `Part.category`/`subCategory` as strings, no formal taxonomy
- **Effort**: 3 days | **Impact**: PLM parity

### 18. Effectivity (Date/Serial/Lot)
- **Issue**: No effectivity on BOM lines or revisions
- **Effort**: 5 days | **Impact**: PLM parity — P0 gap vs Teamcenter

### 19. Change Impact Analysis
- **Issue**: No what-affects-what visibility for ECOs
- **Effort**: 5 days | **Impact**: PLM parity

---

## P3 LOW — Strategic / Long-Term

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 20 | FMEA module | 5d | Quality parity |
| 21 | PPAP module | 5d | Quality parity |
| 22 | Kubernetes manifests + Helm charts | 3d | Cloud deployment |
| 23 | Multi-UOM with conversion (EA→BOX→PALLET) | 2d | Parts parity |
| 24 | Automated DR testing in CI/CD | 2d | DR reliability |
| 25 | Digital Twin / Digital Thread foundation | 3mo | Industry leadership |
| 26 | AI/ML predictive analytics | 3mo | AI parity |
| 27 | Customer/supplier portal | 2mo | Enterprise requirement |
| 28 | BI integration (Power BI, Tableau) | 1mo | Enterprise requirement |
| 29 | MES/ERP integration adapters (SAP, Oracle) | 3mo | Enterprise requirement |
| 30 | Multi-region active-active deployment | 2mo | HA/DR |

---

## Effort vs Impact Matrix

```
                    HIGH IMPACT
                        |
    P0: Docker Pinning  |  P1: Component Extraction
    P0: YAML Fixes      |  P1: React Router
    P0: .secret_key     |  P1: window.* Migration
                        |  P1: Test Infrastructure
                        |  P1: API Integration Tests
                        |  P1: Japanese Locale
                        |  P2: xBOM Multi-Type
                        |  P2: Effectivity
                        |
   LOW EFFORT ──────────┼─────────────────────── HIGH EFFORT
                        |
    P2: Error Boundaries|  P2: Bulk Edit
    P2: Column Custom   |  P2: Classification
    P2: Excel Export    |  P3: FMEA, PPAP, K8s
    P0: YAML Fixes      |
    P2: Theme Toggle    |
                        |
                    LOW IMPACT
```

---

## Recommended Sprint Plan

### Sprint 1 (Week 1): Critical Foundation
1. Fix docker-compose.prod.yml YAML indentation (30 min)
2. Run Docker digest pinning script (30 min)
3. Add per-component error boundaries to top 5 screens (1 day)
4. Begin frontend test infrastructure (Vitest + RTL setup, 2 days)
5. Begin API integration test framework (httpx.AsyncClient pattern, 2 days)

### Sprint 2 (Week 2): Frontend Architecture
6. Extract `modals-extra.jsx` (2361 lines) into `src/components/modals/` — 2 days
7. Extract `secondary-screens.jsx` (1760 lines) into `src/components/screens/` — 1 day
8. Begin React Router migration — 2 days

### Sprint 3 (Week 3): PLM Feature Parity
9. Begin window.* Phase 4 (shim removal) — 3 days
10. Add xBOM type field + EBOM/MBOM view toggle — 2 days

### Sprint 4 (Week 4): Enterprise Hardening
11. Add effectivity date columns to BomItem — 2 days
12. Add bulk edit for BOM items — 1 day
13. Complete Japanese locale — 2 days

---

## Confidence Score: 85/100

High confidence in Priority 0-1 items (verified by reading source). Medium confidence in Priority 2-3 items (based on competitive analysis, not customer research).
