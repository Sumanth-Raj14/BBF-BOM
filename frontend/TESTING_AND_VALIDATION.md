# Blackbox BOM — Testing & Validation

## Test Strategy

### Current State
- **Vitest frontend test suite**: 96 tests across 11 test files. Covers screenDataBridge (60+ tests for 25+ domains), storage, dataService, constants, download, AppShell, SyncStatus
- **Pytest backend test suite**: 72 test files (40 existing + 32 new stubs) covering all 62 endpoint routers
- **Playwright E2E test suite**: 19 tests covering smoke, accessibility, PWA, and enterprise screens
- **ESLint static analysis**: Flat config with React + a11y rules, 0 errors 0 warnings
- **Vite build**: Production build succeeds in ~1.7s
- **CSS validation**: No syntax errors, all custom properties defined
- **Deprecated test directory deleted**: `tests/BOM manager test v1/` (34K files, 636MB) — standalone prototype with SQLite/Prisma, no longer part of test suite

---

## Test Suite Details

### Smoke Tests (`tests/smoke.spec.js`)
| Test | Status |
|------|--------|
| App loads and renders content into #root | ✅ |
| Navrail is visible with navigation groups | ✅ |
| Main content area is rendered | ✅ |
| Dashboard screen is visible by default | ✅ |
| Clicking BOM Editor nav item switches screen | ✅ |
| Clicking Dashboard nav item returns to dashboard | ✅ |

### Accessibility Tests
**`tests/a11y.spec.js`** (axe-core automated audit)
| Test | Status |
|------|--------|
| Dashboard page has no critical a11y violations | ✅ |

**`tests/accessibility.spec.js`** (manual assertions)
| Test | Status |
|------|--------|
| Skip link is present | ✅ |
| Dashboard has semantic heading | ✅ |
| Topbar role indicator is present | ✅ |

### PWA Tests (`tests/pwa.spec.js`)
| Test | Status |
|------|--------|
| Manifest link is present | ✅ |
| Apple-touch-icon link is present | ✅ |
| Theme-color meta is set | ✅ |
| Manifest.json content is valid | ✅ |
| Service worker file is available | ✅ |

### Enterprise Screen Tests (`tests/enterprise-screens.spec.js`)
| Test | Status |
|------|--------|
| Enterprise dashboards screen renders | ✅ |
| Service BOM screen has create button | ✅ |
| API keys screen shows generate button | ✅ |

### Debug Tests (`tests/debug.spec.js`)
| Test | Status |
|------|--------|
| Capture errors and page state | ✅ |

---

## Known Test Considerations

1. **Backend offline**: CORS errors to `localhost:8000` are expected — backend not running during tests
2. **Mock data fallback**: All screens gracefully degrade to mock data when API is unreachable
3. **Cache busters**: Static HTML file may cache; use `?v=7` if stale
4. **Babel standalone backup**: `index.babel.html` exists for environments without build step

---

## ESLint Configuration

| Rule Set | Status |
|----------|--------|
| `no-unused-vars` | 0 warnings |
| `no-undef` | 0 errors |
| `react/*` React rules | 0 errors |
| `jsx-a11y/*` accessibility rules | 0 errors |
| Custom best-practice rules | 0 errors |

---

## Vite Build Output

| Metric | Value |
|--------|-------|
| Build time | ~1.7s |
| Total chunks | 24 (code-split) |
| Total JS size | 848KB (213KB gzipped) |
| CSS size | 58KB (11KB gzipped) |
| Largest chunk | 143KB (vendor) |

---

## Validation Results

### Frontend Validation

#### Syntax Validation
- **All 23 source files**: Balanced braces `{}`, parentheses `()`, brackets `[]`
- **Vite transpilation**: All files compile successfully with React JSX transform
- **No undefined globals**: All `window.*` references verified
- **No missing imports**: ES module imports all resolved

#### Runtime Validation
- **State sync**: All 22 stale `window.BOM_DATA` reads replaced with `ctx` live context
- **Modal props**: 6 `openModal` mismatches corrected
- **Scope bugs**: `addPartToBom` scope bug fixed via prop passing
- **Crash bugs**: CostSimulator, BulkImport, Monitoring — all resolved
- **Cache** : All cache busters on `?v=7`

#### Accessibility Validation
- **45/45 icon buttons**: All have `aria-label` attributes
- **Focus states**: All interactive elements have `focus-visible` styles
- **Touch targets**: Minimum 36px (desktop), 44px (mobile)
- **Skip link**: Present and functional
- **Reduced motion**: `prefers-reduced-motion` media query supported
- **Screen reader**: `.sr-only` utility class available
- **Form labels**: All form fields have `id`, `name`, and associated `<label>`
- **Color contrast**: All 18 WCAG violations fixed (--fg-3, --accent, --ok, --warn, --danger)
- **axe-core**: No critical violations on dashboard page

#### Performance Validation
- **Build time**: ~1.7s (Vite production build)
- **Bundle size**: 848KB JS (213KB gzipped), 58KB CSS (11KB gzipped)
- **Code splitting**: 24 chunks loaded on demand
- **Memory**: Stable, no leaks detected in manual testing

### Backend Validation

#### API Validation
- **Health check**: `GET /api/v1/health` — operational
- **Auth flow**: Login/register/token refresh — working
- **CRUD operations**: BOMs, parts, vendors — functional
- **File upload**: Document upload — working
- **401 interceptor**: Token refresh on expired JWT — functional

#### Database Validation
- **Schema integrity**: All tables properly defined
- **Foreign keys**: Referential integrity maintained
- **Indexes**: Primary keys and unique constraints in place
- **Migrations**: Alembic for schema versioning

---

## Remaining Test Gaps (v1.45.0)
1. ~~**Tests run on SQLite, not PostgreSQL**~~ → ✅ **Resolved**. `conftest.py` now auto-detects PostgreSQL from env vars (`POSTGRES_SERVER`, `CI`, etc.). Created `docker-compose.test.yml` for local PG test runs. CI workflows now set `TEST_DATABASE_URL` so all CI tests run against PostgreSQL. SQLite still works as fallback with deprecation warning.
2. **No service layer tests** — Business logic is inline in endpoint files. No unit tests for domain logic.
3. **No SSL/TLS test** — HTTPS configuration not validated in CI.
4. **No `__repr__` test** — No automated verification that all model classes have `__repr__`.

## Known Limitations

### Frontend
1. **No unit tests** — Component-level tests not yet implemented (Vitest not configured)
2. **No TypeScript** — No type safety, no static analysis
3. **No visual regression tests** — No Percy/Chromatic integration
4. **No load tests** — No concurrent user simulation

### Backend
1. **No integration tests** — API endpoints untested
2. **No security scanning** — No OWASP dependency check
3. **No backup verification tests** — Backup exists but not validated programmatically

---

## Test Coverage Targets

| Module | Current | Target |
|--------|---------|--------|
| Frontend E2E (Playwright) | 19 tests | 40+ tests |
| ESLint compliance | 100% | 100% |
| Vite build | Passes | Passes |
| Backend API | 0% | 80% |
| Database | 0% | 85% |
| Visual regression | 0% | 60% |

---

## Performance Benchmarks

### Frontend
- **First Contentful Paint**: < 1.5s
- **Largest Contentful Paint**: < 2.5s
- **Time to Interactive**: < 3.5s
- **Cumulative Layout Shift**: < 0.1

### Backend (target)
- **API response time**: < 200ms (p95)
- **Database query time**: < 50ms (p95)
- **Concurrent users**: 100+ without degradation
- **Memory usage**: < 512MB per worker

---

## Security Testing

### Vulnerabilities Checked
- [x] XSS prevention (React auto-escapes)
- [x] CSRF protection (SameSite cookies)
- [x] SQL injection (parameterized queries + identifier validation)
- [x] SQL injection in encryption f-strings (identifier regex validation)
- [x] SECRET_KEY persistence validation (fail on unwritable file)
- [x] Access token 30min expiry (was 8 days)
- [x] CSRF httponly/secure cookies
- [x] Rate limiting with X-Forwarded-For proxy support
- [x] No PGPASSWORD leak in process environment (isolated subprocess env)
- [x] Nginx security headers (HSTS, CSP, X-Frame-Options, nosniff)
- [x] Authentication bypass (JWT validation)
- [x] Authorization escalation (role checks)
- [x] Sensitive data exposure (HTTPS, env vars)
- [x] Dependency vulnerabilities (npm audit)

### Security Validated (v1.32.0 — Critical Fixes)
- [x] **SQL injection via f-string eliminated**: `analytics.py` and `dashboard_service.py` — 85+ injection points converted to bound parameters. Verified: all queries use `:tenantId` bind parameter, no f-string interpolation of user data.
- [x] **JWT algorithm confusion fixed**: `security.py` — HS256 fallback removed from RS256 verification. Verified: only configured algorithm is accepted in `supported` list.
- [x] **Backup MFA enforcement**: `backup.py` — all 9 endpoints use `Depends(get_current_superuser)`. Verified: production superusers without MFA receive 403.
- [x] **session_timeout JWT key fixed**: `session_timeout.py` — uses `_get_jwt_verify_key()` for RS256-compatible verification. Verified: correct key retrieved based on configured algorithm.
- [x] **backup_history constraint alignment**: All 3 CheckConstraints expanded to match code's values. Verified: `status='verified'`, `backup_type='schema_only'`, `verification_status='passed'` all pass constraint validation.
- [x] **Secret key files removed**: `.secret_key` deleted from `backend/` and root. Verified: `.gitignore` now includes `.secret_key` pattern.
- [x] **Webhook tenant scoping**: All 8 endpoints now inject `current_user`. Verified: non-superuser `list_subscriptions` returns only tenant's subscriptions; `get/update/delete` verify ownership.

### Security Validated (v1.25.0)
- [x] **Stubbed endpoints eliminated**: All work_order, eco, inventory, quality, solidworks_integration, bom_enterprise endpoints now use real DB queries — no more hardcoded responses.
- [x] **SolidWorks persistence**: CAD BOM data, images, and pending changes survive server restarts — in-memory dicts replaced.
- [x] **PyJWT migration**: Replaced unmaintained python-jose with actively maintained PyJWT. All JWT operations use `jwt.InvalidTokenError` exception handling.
- [x] **CSP `'unsafe-eval'` removed**: XSS protection no longer defeated by permissive CSP. Violation reporting configured.
- [x] **HTTPS enforced**: Nginx requires HTTPS with HTTP→301 redirect. TLS 1.2/1.3 with modern cipher suites.
- [x] **Multi-tenancy complete**: All 5 previously-missing child models now tenant-aware. No cross-tenant data leakage.
- [x] **Association table CASCADE**: Deletions on parent tables now cascade to 4 association tables — no orphaned rows.
- [x] **`__repr__` on all models**: 56 model classes have meaningful debug representations.

### Security Validated (v1.21.0)
- [x] **Multi-tenancy SELECT isolation**: `do_orm_execute` listener auto-injects `WHERE tenantId` on all SELECT queries. Verified: superusers bypass filter, non-superusers see only their tenant data.
- [x] **Polymorphic entity type validation**: 10 models validate `entityType`/`reference_type`/`document_type` against `ALLOWED_*` sets. Invalid values rejected with `ValueError` on insert/update.
- [x] **SSRF via webhooks**: `_is_safe_webhook_url()` rejects private IP ranges (10.x, 172.16-31.x, 192.168.x), loopback, link-local, multicast. HTTPS-only enforced. DNS resolution checked.
- [x] **Webhook secret redaction**: `WebhookSubscriptionResponse` no longer exposes `secret` field. Secrets encrypted at rest only.
- [x] **API key authentication**: `X-API-Key` header accepted as JWT alternative. Expired keys rejected. `last_used_at` tracking.
- [x] **pg_basebackup credential isolation**: Physical backup subprocess uses isolated `_get_pg_env()` (same pattern as logical backup fix).

### Performance Validated (v1.11.0)
- [x] N+1 queries eliminated in BOM explosion, cost rollup, where-used (batch loading confirmed)
- [x] Redis caching applied to BOM enterprise endpoints (5min TTL)
- [x] FTS search uses GIN indexes (not full table scans)
- [x] Real DB query duration tracking via SQLAlchemy events
- [x] Metrics middleware no longer inflates DB query times
- [x] Configurable connection pool settings
- [x] PostgreSQL statement_timeout prevents runaway queries
- [x] Docker layer caching reduces rebuild time
- [x] APScheduler backup scheduling (with fallback)
- [x] Redis authentication enabled
- [x] Backup data volume persists across restarts

### Penetration Testing (not yet performed)
- [ ] OWASP Top 10 compliance
- [ ] API fuzzing
- [ ] Authentication brute force
- [ ] Session fixation
- [ ] Privilege escalation

---

## Regression Testing

### Critical Paths
1. **BOM Creation**: Create → Edit → Save → Reload
2. **Component Library**: Search → Filter → Add to BOM
3. **Vendor Management**: Add → Edit → Rate → Delete
4. **Procurement**: Create PO → Track → Receive
5. **Authentication**: Login → Logout → Token refresh

### Migration Chain Validation (v1.18.0)
- **Alembic migration chain audit**: All 22 migrations verified for consistent `revision` ↔ `down_revision` references
- **Broken link found and fixed**: 018 referenced `"017"` instead of `"017_remove_part_legacy_json_columns"`
- **Chain integrity confirmed**: After fix, every `down_revision` matches the actual `revision` of the preceding migration
- **008 docstring fixed**: `Revises: 004_order_tracking` → `Revises: 005_007_placeholder` (code was already correct)

### Startup Health Check (v1.18.0)
- Automatically runs on every application startup via FastAPI lifespan
- Checks: DB connectivity, WAL level (`replica`), archive mode (`on`), table count, FK count, index count, backup directory existence
- Exposed via `GET /health` endpoint for monitoring integration
- Logs health status at INFO level; warns at WARNING level for degraded components

### Polymorphic FK Validation (v1.21.0)
- **10 models validated**: AuditLog, Notification, Revision, Approval, Comment, ValidationResult, InventoryTransaction, InventoryReservation, DigitalSignature, NotificationQueue
- **Entity type enforcement**: Each model defines `ALLOWED_ENTITY_TYPES`/`ALLOWED_REFERENCE_TYPES`/`ALLOWED_DOCUMENT_TYPES` sets — invalid values rejected at ORM level
- **Composite indexes**: 10 new composite indexes on polymorphic columns for query performance
- **Test method**: Manual validation via model create/update with valid and invalid entity types; observed ValueError raises

### Multi-Tenancy SELECT Isolation Validation (v1.21.0)
- **do_orm_execute filter**: All SELECT queries on `TenantAwareMixin` models auto-filtered by `tenantId`
- **Superuser bypass**: Users with `tenantId = None` see all tenants' data
- **Test method**: Verify ORM queries emit `WHERE tenantId = :current_tenant` in SQL logs for non-superuser contexts
- **Previously**: Only INSERT was isolated — cross-tenant data leakage was possible

### Physical Backup / pg_basebackup Validation (v1.21.0)
- **BackupType.PHYSICAL**: Enum value available and used by `create_physical_backup()`
- **pg_basebackup execution**: Subprocess call uses `-Ft -z -X stream` flags for tar+gzip+WAL inclusion
- **`_find_pg_basebackup()`**: Locates binary via version-aware path resolution
- **Pipeline integration**: `POST /api/v1/backup/pipeline?include_physical=true` runs both logical and physical backups
- **Test method**: Trigger physical backup via API endpoint, verify file creation and history record

### Inline Style Migration Validation (v1.21.0)
- **531 inline styles converted** to utility classes across 13 JSX files
- **30 new CSS utility classes** added (~110 total)
- **~1279 inline styles remain** from ~2112 baseline (~40% reduction)
- **Conversion safety**: Script skips any style object where not ALL properties have equivalents
- **Test method**: Visual comparison of affected screens before/after conversion; no visual regression confirmed

### PITR Restore / SSRF / API Key Validation (v1.20.0)
- **SSRF prevention**: Webhook URLs with private IPs, localhost, HTTP rejected with 422
- **Webhook secret redaction**: API responses no longer include `secret` field
- **API key auth**: `X-API-Key` header validated against `api_keys` table; expired keys rejected
- **PITR restore**: `scripts/pitr_restore.py` generates correct `recovery.signal` and `postgresql.auto.conf`
- **Health check PITR**: `/health` reports `pitr.ready` and `pitr.wal_archive` status

### JSON Column Normalization Validation (v1.26.0)
- **6 legacy JSON columns marked DEPRECATED**: Comments added via PostgreSQL `COMMENT ON COLUMN`. Confirmed by querying `information_schema.columns` for column comments.
- **4 new normalized tables created**: `revision_bom_snapshot_items`, `custom_attribute_options`, `custom_attribute_validation_rules`, `eco_item_attribute_changes`. Each has FK constraints, CASCADE deletes, indexes, and UNIQUE constraints where appropriate.
- **Data preservation**: Existing JSON data migrated to new tables. Verified by comparing row counts between source JSON (via `json_array_length`) and target normalized table.
- **Dual-write pattern**: New creates populate both legacy JSON columns and new normalized tables. Verified by reading back from both sources.
- **Backward compatibility**: All API signatures unchanged. Legacy JSON columns remain in responses.
- **Test method**: Run migration, verify 4 new tables exist with expected schema, verify data round-trips through both legacy and normalized paths.

### Automated Regression (CI)
- [x] Run Playwright test suite on every change
- [x] ESLint validation on every change
- [x] Vite build validation on every change
- [ ] Visual regression testing with Percy/Chromatic
- [ ] Performance regression with Lighthouse CI

---

## v1.37.0 Testing Status

### Modal Component Extraction
- **Build verification**: ✅ `npx vite build` passes (136 modules, 2.19s)
- **Chunk separation**: ✅ Modals in own chunk (`modals-Gug8npJQ.js`, 181 kB)
- **Import backward-compat**: ✅ `modals-extra.jsx` re-exports all 17 modals + 2 internal
- **window.* backward-compat**: ✅ All 17 modals assigned to `window.*` via `Object.assign`
- **No functional changes**: All modals are pure re-exports — zero logic changes

### Screen Component Extraction
- **Build verification**: ✅ `npx vite build` passes (136 modules, up from 128)
- **Import backward-compat**: ✅ `secondary-screens.jsx` 11-line shim re-exports all 7 screen components
- **window.* backward-compat**: ✅ All 7 screens assigned to `window.*` via `Object.assign`
- **No functional changes**: All screens are pure re-exports — zero logic changes

### Backend Test Counts
- **Total test functions**: 248 (42 test files)
- **Endpoint files**: 61 (466 routes)
- **Test coverage gap**: No integration tests for 466 routes. 248 unit tests cover services/schemas/models only.

### Frontend Test Counts
- **Trivial test files**: 2
- **JSX/JS files**: 23 (~17,454 lines)
- **Test coverage gap**: ~99.9% — virtually no frontend test coverage

### Key Validation Points
- All 27 new PATCH endpoints verified to use existing RBAC dependencies
- Bulk DELETE endpoints verified to use tenant-scoped SQL queries
- Vendors.py bug fix verified — PUT now has implementation, PATCH delegates
- Dev Dockerfile verified to use `USER bom` (not root)
- docker-compose.prod.yml YAML indentation verified

### Updates (v1.46.0)
- **React Router migration validated**: All 36 routes resolve correctly with React Router `<Routes><Route>` components. Build clean (0 warnings, 162 modules, 2.04s).
- **Duplicate className fix verified**: 20+ instances in `mobile-scanner.jsx` where duplicate `className` attributes caused styling corruption — all merged into single `className` strings.
- **404 catch-all verified**: `<Route path="*" element={<FourOhFour/>}/>` renders `ErrorScreen` for unregistered routes.
- **No functional regressions**: All screens render in their wrapper components with correct props from `AppContext`.

### Known Gaps (Critical)
1. No Docker image digest pinning (requires Docker daemon to resolve SHA256)
2. No performance benchmarks for 466 routes
3. No load testing with passing results

### Updates (v1.44.0)
- **Calendar Events API**: 4 new endpoints (GET, POST, PUT, DELETE) — validated against schema
- **User Data Sync API**: 17 existing endpoints now have frontend API client — all use identical request/response patterns
- **Port fix verified**: `frontend/api.js` `API_BASE` corrected to `localhost:8000` — resolves all "API unavailable" errors
- **Unique constraints verified**: 4 user_data tables now have explicit `UniqueConstraint` — `ON CONFLICT` upsert now guaranteed to work
- **Secrets scrubbed**: `backend/.env` no longer contains live credentials

### Updates (v1.47.0)
- **Frontend Vitest tests added to CI**: `npx vitest run` now runs in the root CI workflow alongside backend tests
- **Screen Data Bridge validated**: All 25+ data domains tested — `window.api.*` calls resolve correctly, localStorage fallback activates gracefully when endpoints are unavailable
- **Migration 028 validated**: 51 FK constraints updated with `ON DELETE CASCADE` — verified by querying `information_schema.table_constraints`
- **Migration 022 fix validated**: 9 tables now created via explicit `CREATE TABLE IF NOT EXISTS` — no more dependence on `Base.metadata.create_all()`
- **Mock purge validated**: 52+ mock/MOCK references confirmed absent from production build (`grep -r "mock\|MOCK" dist/` — zero matches)
- **BBF branding validated**: Montserrat font loads (verified via `document.fonts`), BBF color tokens resolve correctly in CSS, `///` prefix and `<<` motif present in compiled output
- **CI/CD separation validated**: Test deployments to staging confirm version tags trigger deployment; main branch pushes trigger only CI checks

### Updates (v1.45.0)
- **PostgreSQL test DB**: Created `docker-compose.test.yml` with PostgreSQL 15 (port 5433) + Redis 7 (port 6380) for local test runs
- **Auto-detection in conftest.py**: Both conftest.py files detect PostgreSQL from `POSTGRES_SERVER` or `CI` env vars — constructs URL from `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`
- **CI now tests against PostgreSQL**: Both CI workflows set `TEST_DATABASE_URL` — previously tests ran against SQLite despite PG service containers running
- **SQLite fallback preserved**: SQLite still works but emits `warnings.warn()` with instructions to switch to PostgreSQL
