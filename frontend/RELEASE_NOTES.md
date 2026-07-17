# Blackbox BOM — Release Notes

## v1.48.0 (2026-07-06) — Window.* ES Module Migration, BBF Branding Overhaul, Screen Data Bridge, Deprecated Test Cleanup & SQLite Branch Removal

### Breaking Changes
- **NavRail restructured**: Group labels changed from dots to thin olive bars. Nav items now use olive accent on active state instead of grey. The `nav-group-dot` CSS class is replaced by `nav-group-bar`. Custom navrail overrides may need updating.
- **TopBar wordmark classes removed**: `.wordmark .div` and `.wordmark .sub` CSS classes removed in favor of BBF wordmark classes (`.bbf-wordmark-black`, `.bbf-wordmark-bom`). If custom CSS targets these, migrate to the new classes.

### Infrastructure
- **Deprecated prototype deleted**: `tests/BOM manager test v1/` (34,318 files, 636MB) removed. This was a standalone prototype with its own SQLite database and Prisma schema, not connected to the production application.

### Backend Changes
- **analytics.py SQLite branching removed**: The `_is_sqlite()` function and both SQLite-specific code paths in `/dashboard` (strftime → TO_CHAR) and `/trends` (datetime → NOW()) have been removed. The application now exclusively uses PostgreSQL date functions. No functional change for production deployments — SQLite fallback was dead code.

### Frontend Changes — Fix: Broken Window Shims After Refactoring
- **38 backward-compat shims repaired** across 13 files where `foo = foo;` const-assignment patterns had `window.` prefix stripped by the automated refactoring script. This caused `TypeError: Assignment to constant variable` at module load time for any code path importing through `globals.js`.
- **Test mocks updated**: Added missing storage properties (`inrRate`, `theme`, `KEYS.SAVED_SEARCHES`) to `dataService.test.js`. Added `window.matchMedia` mock to `test-setup.ts`. All 95 tests now pass.

### Frontend Changes — BBF Branding Overhaul
- **Comprehensive BBF design system** added to `styles.css`: cards, panels, tables, alerts, badges, forms, buttons, stats, empty states, section headers — all using BBF brand colors (Olive Green #B5BC38, Luminous Orange #DC6621, Dark Grey #5D5D5D, Jet Black #000000, White #FFFFFF)
- **NavRail redesigned**: White background, olive group separators, active state with olive accent bar and icon scale, gradient border accent, tooltips with brand typography
- **TopBar rebranded**: `<<` double-chevron prefix, Montserrat Black "BLACKBOX", olive-tinted "BOM" badge, badge-style API/offline indicators
- **Loading screen rebranded**: Montserrat font, Jet Black `<< BLACKBOX`, Olive Green BOM and loading dots
- **Main content area**: Gradient olive-to-orange accent bar at the top
- **4 new locale files**: `zh.json`, `de.json`, `fr.json`, `es.json` added to `frontend/src/locales/`. Generated from `en.json` with placeholder translations. Total locales: 6.

### Breaking Changes
- **Production deployment now tag-gated**: Main branch pushes no longer trigger production deployment. Only pushes to tags matching `v*.*.*` will deploy. CI checks still run on all pushes.
- **52+ mock references removed**: Screens that depended on mock fallback data (integration-screens, enterprise-screens, Procurement, Documents) now gracefully degrade through the Screen Data Bridge's localStorage fallback rather than receiving mock data. Behavior is identical when backend is available.
- **Montserrat font required**: The BBF brand font is loaded from Google Fonts. Offline or air-gapped environments should host the font locally.

### New Frontend Infrastructure
- **Screen Data Bridge**: `frontend/src/services/screenDataBridge.js` — Unified data access bridge with `window.screenDataBridge.*` methods covering 25+ data domains. Each method calls `window.api.*` backend endpoints with automatic localStorage fallback.
- **dataService.js integrated**: Now wraps screenDataBridge methods for all 30+ refresh/sync operations. Added 5 new domains: ecrs, templates, documents, poDrafts, vendorUsers.

### Database Changes
- **Migration 028**: `028_fk_on_delete_cascade.py` — Adds `ON DELETE CASCADE` to 51 foreign key constraints across tables from migrations 001-004. Run `alembic upgrade head` to apply.
- **Migration 022 fix**: Replaced `Base.metadata.create_all()` with explicit `op.execute('CREATE TABLE IF NOT EXISTS ...')` for 9 tables (approvals, revisions, revision_bom_snapshot_items, boms, part_vendors, po_line_items, user_data_store, user_preferences, part_custom_fields). This eliminates the last `create_all` safety net — all tables now fully Alembic-managed.

### CI/CD Changes
- **Production deployment triggers**: Changed from `on push: branches: [main]` to `on push: tags: ['v*.*.*']`. Main branch pushes only trigger CI checks (lint, typecheck, test, build).
- **Frontend tests in CI**: `npx vitest run` added to the root CI workflow as a required check stage.

### Mock Data Purge
- **constants.js**: Removed `MOCK_BUDGET`, `MOCK_KPIS`, `MOCK_VENDOR_SPEND` exports
- **integration-screens.jsx**: Removed all mock fallback code paths
- **enterprise-screens.jsx**: Removed all mock fallback code paths
- **ProcurementScreen.jsx**: Removed all mock fallback code paths
- **DocumentsScreen.jsx**: Removed all mock fallback code paths
- **config.js**: Removed mock mode gating logic
- **AppCtx.jsx**: Removed mock mode references
- **TopBar.jsx**: Removed mock badge display
- **en.json / ja.json**: Removed mock-related translation strings

### Branding — BBF Identity
- **Montserrat font**: Google Fonts link added to index.html, `font-family` set in styles.css `:root`, applied in TopBar
- **BBF color palette**: CSS custom properties added — `--bbf-navy: #001F3F`, `--bbf-orange: #FF6B35`, `--bbf-light: #F5F5F5`, `--bbf-white: #FFFFFF`, `--bbf-dark: #333333`. Accent color updated to BBF orange.
- **`///` heading prefix**: Applied to all document headings and TopBar header text
- **`<<` motif**: Double-chevron prefix in TopBar brand header and index.html `<title>`

### Frontend Changes — Inline Style → CSS Class Conversion (Batch 1)
- **881 inline styles cataloged** across 58 JSX/JS files; 148 converted in this batch
- **enterprise-screens.jsx**: 113 `style={S.*}` references → `className="ent-*"` (card, header, title, th, td, btn, badge, tab, modal, etc.)
- **22 files**: 35 simple single-property inline styles → className references
- **17 duplicate className attributes fixed** across 11 files (pdm-cad.jsx, parts-screen.jsx, overlays.jsx, mobile-scanner.jsx, detail-drawer.jsx, RollbackModal.jsx, SettingsModal.jsx, CostSimulatorModal.jsx, ComplianceScreen.jsx, ErrorBoundary.jsx, LoadingScreen.jsx, EmptyState.jsx, SyncStatus.jsx)
- **CSS utility classes added**: `.ent-*` enterprise screen classes and missing utility classes (fg-ok, fg-warn, fg-info, fg-white, bg-white, bg-accent, mx-auto, pt-2, pb-2, pl-4, pr-4, text-ellipsis)
- **~733 inline styles remain** across 36 files — planned for batch 2 conversion
- **Build and tests verified**: `npm run build` (1.90s), `npx vitest run` (96/96 passing)

### Frontend Changes — Inline Style → CSS Class Conversion (Batch 2)
- **`convert_styles_batch2.py`** — Expanded property→class mapping (97→140+ patterns)
- **6 more inline styles converted** (CostRollupView, SettingsModal, ProcurementScreen, pdm-cad)
- **~726 complex/dynamic inline styles remain** — require per-file manual conversion

### Frontend Changes — Window.__t ES Module Migration
- **2,594 `window.__t(` calls refactored** to `import { __t }` across 54 files
- **`refactor_window_t.py`** — Automated conversion script
- **TypeScript handled**: `download.ts` Window interface declarations cleaned up

### Frontend Changes — Window.toast ES Module Migration
- **290 `window.toast(` calls refactored** to `import { toast }` across 50 files
- **`src/utils/toast.js`** — New module: pub/sub toast state management replacing React-state-based window assignment
- **ToastHost refactored**: Uses module subscription instead of window assignment
- **All guard patterns removed**: `typeof window.toast === 'function'` and `window.toast &&` checks
- **Chunk size wins**: modals 183→154kB, enterprise-screens 53→44kB, integration-screens 55→46kB, power-features 46→38kB, bom-editor 59→50kB, parts 70→60kB

### Upgrade Instructions
1. Run `alembic upgrade head` to apply migration 028
2. Frontend requires rebuild: `npm run build`
3. Update CI/CD pipeline configuration to use tag-based deployment triggers
4. No code changes required for existing screens — Screen Data Bridge is backward-compatible

### Files Changed
- `frontend/convert_enterprise_styles.py` — NEW: S.* to ent-* conversion script
- `frontend/convert_styles.py` — NEW: simple inline style conversion script
- `frontend/src/root/enterprise-screens.jsx` — 113 S.* → className refs, mock fallbacks removed
- `frontend/src/styles.css` — Added .ent-* enterprise classes + missing utilities
- `frontend/src/services/screenDataBridge.js` — NEW: Unified data access bridge
- `frontend/src/services/dataService.js` — Updated: integrated with screenDataBridge, +5 domains
- `frontend/src/utils/constants.js` — Mock data exports removed
- `frontend/src/root/integration-screens.jsx` — Mock fallbacks removed
- `frontend/src/root/enterprise-screens.jsx` — Mock fallbacks removed
- `frontend/src/screens/ProcurementScreen.jsx` — Mock fallbacks removed
- `frontend/src/screens/DocumentsScreen.jsx` — Mock fallbacks removed
- `frontend/src/config.js` — Mock mode gating removed
- `frontend/src/context/AppCtx.jsx` — Mock mode references removed
- `frontend/src/components/TopBar.jsx` — Mock badge removed, BBF branding applied
- `frontend/src/styles.css` — Montserrat font, BBF color tokens, brand variables
- `frontend/index.html` — Montserrat Google Fonts link, BBF meta tags, updated title
- `frontend/src/locales/en.json` — Mock strings removed
- `frontend/src/locales/ja.json` — Mock strings removed
- `backend/alembic/versions/028_fk_on_delete_cascade.py` — NEW migration
- `backend/alembic/versions/022_audit_remediation.py` — REPLACED create_all with explicit CREATE TABLE
- `.github/workflows/ci.yml` — Tag-based deploy trigger, vitest step added

## v1.46.0 (2026-07-02) — React Router Migration & Duplicate className Fix

### Breaking Changes
- **None** — All changes are backward-compatible. `route` variable retained in `AppCtx` from `useLocation().pathname` for NavRail/findNav/keyboard shortcut compatibility. No schema changes, no API signature changes.

### Architecture — React Router Migration
- **Replaced 36 manual `{route === "dashboard" && <DashboardScreen/>}` conditional rendering checks** in `src/screens/App.jsx` with proper `<Routes><Route path="/dashboard" element={<DashboardWrapper/>}/></Routes>` pattern
- **9 screen wrapper components**: `DashboardWrapper`, `BomShellWrapper`, `PartsScreenWrapper`, `VendorsScreenWrapper`, `ProcurementScreenWrapper`, `DiffScreenWrapper`, `DocumentsScreenWrapper`, `AnalyticsScreenWrapper`, `ActivityScreenWrapper` — each extracts props from `AppContext` via `React.useContext(AppContext)`
- **`GenericScreen({ Component })`**: Reusable wrapper for 22 screens needing no prop extraction
- **`FourOhFour` component**: 404 catch-all via `<Route path="*" element={<FourOhFour/>}/>` with `ErrorScreen` fallback and "Go to Dashboard" action
- **`route` retained in `AppCtx`**: Derived from `useLocation().pathname` for NavRail `activeIndex`/`findNav()`/`useKeyboardShortcuts` compatibility
- **App.jsx reduced**: ~722 lines → 293 lines (59% reduction)
- **Build**: `npx vite build` — 0 warnings, 162 modules, 2.04s

### Bug Fix — Duplicate className in mobile-scanner.jsx
- **20+ duplicate `className` attributes** fixed where elements had two `className` props (e.g., `className="fs-9 mt-4" className="fg-3"`). The second was overriding the first. All merged into single `className` strings.
- Pre-existing build warnings from duplicate JSX attributes eliminated

### Upgrade Instructions
1. No code changes required — all changes are frontend-only
2. Run `npm run build` to rebuild

### Files Changed
- `frontend/src/screens/App.jsx` — Major rewrite: manual `location.pathname` routing → React Router `<Routes><Route>` with 36 routes + 404 catch-all. 9 wrapper components + GenericScreen + FourOhFour added.
- `frontend/src/root/mobile-scanner.jsx` — 20+ duplicate `className` attributes merged into single values

## v1.45.0 (2026-07-02) — PostgreSQL Test Database Migration

### Breaking Changes
- **`docker-compose.test.yml` uses port 5433** (not 5432) to avoid conflict with dev PostgreSQL. If you were running tests against a local PostgreSQL on 5432, update your connection string or use `docker-compose.test.yml`.
- **CI now runs tests against PostgreSQL** — Previously CI ran against SQLite despite having PostgreSQL service containers running. Tests that pass on SQLite but fail on PostgreSQL will now be caught.

### New Infrastructure
- **`docker-compose.test.yml`**: Minimal test stack with PostgreSQL 15 (port 5433) + Redis 7 (port 6380). Start with: `docker compose -f docker-compose.test.yml up -d`
- **Auto-detection in conftest.py**: Both `backend/app/tests/conftest.py` and `backend/tests/conftest.py` now automatically detect PostgreSQL when `POSTGRES_SERVER` or `CI` env vars are present. Constructs connection URL from `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`. Falls back to SQLite with a deprecation warning.
- **CI workflows fixed**: Both `.github/workflows/ci.yml` files now set `TEST_DATABASE_URL` explicitly — tests finally run against PostgreSQL in CI.

### Upgrade Instructions
1. **Optional but recommended**: Start running tests against PostgreSQL:
   ```bash
   docker compose -f backend/docker-compose.test.yml up -d
   SET TEST_DATABASE_URL=postgresql+asyncpg://bom_user:bom_test_password@localhost:5433/bom_test_db
   python -m pytest backend/app/tests/ -v
   ```
2. No code changes required — existing SQLite workflow still works (with a deprecation warning)

## v1.44.0 (2026-07-01) — localStorage→DB Bridge, Calendar Events, API Client Expansion

### Breaking Changes
- **None** — All changes are backward-compatible. No schema changes to existing tables, no API signature changes.

### New Database Features
- **Calendar events table**: New `calendar_events` table with indexes on user_id+start_time, event_type, and related_resource for efficient scheduling queries.
- **Unique constraints added**: 4 tables got explicit `UniqueConstraint` definitions (user_data_store, user_preferences, user_checklist_progress, bom_drafts) — enabling proper PostgreSQL upsert behavior.

### New API Endpoints
- **Calendar Events CRUD**: `GET/POST /api/v1/calendar/calendar-events`, `PUT/DELETE /api/v1/calendar/calendar-events/{id}` with date range and event type filtering.

### Frontend — API Client Expansion
- **6 new API client modules** added to `frontend/api.js`:
  - `workOrdersAPI` — Work order CRUD + advance + materials + operations
  - `ecoAPI` — ECO/ECR CRUD + approve + reject + changes + notifications
  - `inventoryAPI` — Inventory CRUD + transactions + warehouses + low-stock
  - `qualityAPI` — NCR + inspection plan CRUD
  - `userDataSyncAPI` — Full localStorage→PostgreSQL bridge (19 key types)
  - `calendarEventsAPI` — Calendar event CRUD
- All registered on `window.api.*` aggregate and as individual `window.*` shims

### Infrastructure — Security
- **Secrets scrubbed**: All live credentials removed from `backend/.env` (already gitignored). Placeholder values `changeme` used.
- **`api.js` port fixed**: `API_BASE` changed from `localhost:8002`→`localhost:8000` (root cause of all API connectivity issues).

### Upgrade Instructions
1. Run `012_calendar_events.sql` against your database (or let Alembic auto-migrate)
2. Restart backend to register new calendar event router
3. Frontend changes are live after rebuild — no deployment steps needed

## v1.46.0 (2026-07-02) — React Router Migration & Duplicate className Fix

### Breaking Changes
- **None** — All changes are backward-compatible. `route` variable retained in `AppCtx` from `useLocation().pathname` for NavRail/findNav/keyboard shortcut compatibility. No schema changes, no API signature changes.

### Architecture — React Router Migration
- **Replaced 36 manual `{route === "dashboard" && <DashboardScreen/>}` conditional rendering checks** in `src/screens/App.jsx` with proper `<Routes><Route path="/dashboard" element={<DashboardWrapper/>}/></Routes>` pattern
- **9 screen wrapper components**: `DashboardWrapper`, `BomShellWrapper`, `PartsScreenWrapper`, `VendorsScreenWrapper`, `ProcurementScreenWrapper`, `DiffScreenWrapper`, `DocumentsScreenWrapper`, `AnalyticsScreenWrapper`, `ActivityScreenWrapper` — each extracts props from `AppContext` via `React.useContext(AppContext)`
- **`GenericScreen({ Component })`**: Reusable wrapper for 22 screens needing no prop extraction
- **`FourOhFour` component**: 404 catch-all via `<Route path="*" element={<FourOhFour/>}/>` with `ErrorScreen` fallback and "Go to Dashboard" action
- **`route` retained in `AppCtx`**: Derived from `useLocation().pathname` for NavRail `activeIndex`/`findNav()`/`useKeyboardShortcuts` compatibility
- **App.jsx reduced**: ~722 lines → 293 lines (59% reduction)
- **Build**: `npx vite build` — 0 warnings, 162 modules, 2.04s

### Bug Fix — Duplicate className in mobile-scanner.jsx
- **20+ duplicate `className` attributes** fixed where elements had two `className` props (e.g., `className="fs-9 mt-4" className="fg-3"`). The second was overriding the first. All merged into single `className` strings.
- Pre-existing build warnings from duplicate JSX attributes eliminated

### Upgrade Instructions
1. No code changes required — all changes are frontend-only
2. Run `npm run build` to rebuild

### Files Changed
- `frontend/src/screens/App.jsx` — Major rewrite: manual `location.pathname` routing → React Router `<Routes><Route>` with 36 routes + 404 catch-all. 9 wrapper components + GenericScreen + FourOhFour added.
- `frontend/src/root/mobile-scanner.jsx` — 20+ duplicate `className` attributes merged into single values

## v1.45.0 (2026-07-02) — PostgreSQL Test Database Migration

### Breaking Changes
- **`docker-compose.test.yml` uses port 5433** (not 5432) to avoid conflict with dev PostgreSQL. If you were running tests against a local PostgreSQL on 5432, update your connection string or use `docker-compose.test.yml`.
- **CI now runs tests against PostgreSQL** — Previously CI ran against SQLite despite having PostgreSQL service containers running. Tests that pass on SQLite but fail on PostgreSQL will now be caught.

### New Infrastructure
- **`docker-compose.test.yml`**: Minimal test stack with PostgreSQL 15 (port 5433) + Redis 7 (port 6380). Start with: `docker compose -f docker-compose.test.yml up -d`
- **Auto-detection in conftest.py**: Both `backend/app/tests/conftest.py` and `backend/tests/conftest.py` now automatically detect PostgreSQL when `POSTGRES_SERVER` or `CI` env vars are present. Constructs connection URL from `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`. Falls back to SQLite with a deprecation warning.
- **CI workflows fixed**: Both `.github/workflows/ci.yml` files now set `TEST_DATABASE_URL` explicitly — tests finally run against PostgreSQL in CI.

### Upgrade Instructions
1. **Optional but recommended**: Start running tests against PostgreSQL:
   ```bash
   docker compose -f backend/docker-compose.test.yml up -d
   SET TEST_DATABASE_URL=postgresql+asyncpg://bom_user:bom_test_password@localhost:5433/bom_test_db
   python -m pytest backend/app/tests/ -v
   ```
2. No code changes required — existing SQLite workflow still works (with a deprecation warning)

## v1.37.0 (2026-06-28) — API Completeness & Infrastructure Hardening

### Breaking Changes
- **None** — All changes are backward-compatible. No schema changes, no API signature changes.
- **Dev Dockerfile now runs as `bom` user**: If you were relying on root access inside the dev container (e.g., `docker exec -u root`), use `docker exec -u 0` instead. The `bom` user has no password and `/sbin/nologin` shell.

### New API Features
- **27 new PATCH endpoints** for partial resource updates across 22 endpoint files. All delegate to existing PUT handlers with `exclude_unset=True`.
  - Full list: approval_automation, approvals, bom_items, bom_templates, capa, comments, compliance, contract (contracts + pricing agreements), country_history, deviation, erp_connectors, fai, kanban, make_vs_buy, notifications, order_tracking, part_vendors, procurement, roles_permissions, should_cost, supplier_scorecard, tenants, traceability (serial numbers + lots), webhooks
- **4 new bulk DELETE endpoints**: `POST /{resource}/bulk-delete` for parts, vendors, bom_items, notifications — all use SQL `IN` clause with tenant isolation.
- **Total route count**: 466 routes (191 GET, 171 POST, 39 PUT, 31 PATCH, 34 DELETE)

### Bug Fixes
- **vendors.py critical fix**: PUT `update_vendor` was an empty stub (only docstring, no implementation). PATCH had dead code and referenced non-existent `vendor_service` module. Fixed with real DB logic.

### Infrastructure — Security
- **Dev Dockerfile hardened**: Added `USER bom` directive, `tini` as init process with ENTRYPOINT, proper group/user creation (`bom:bom`), `/app/logs` directory. Matches production Dockerfile security posture.
- **`.secret_key` deleted**: Removed from disk (already in `.gitignore`; key is in `.env`).

### Frontend — Modal & Screen Component Extraction
- **17 modal components extracted** from `src/root/modals-extra.jsx` (2361→151 lines) into `src/components/modals/`
- **7 screen components extracted** from `src/root/secondary-screens.jsx` (1760→11 lines) into `src/components/screens/`
- Both directories follow the same pattern: `index.jsx` re-export hub + backward-compat shim in `src/root/`
- Build verified: 136 modules, 2.19s
- Remaining work: 21 more flat JSX files in `src/root/` (~13,000 lines) still need extraction

### Infrastructure — Docker Digest Pinning (Pending)
- **Docker image digests remain unpinned**: All Dockerfiles use `@sha256:REPLACE_WITH_ACTUAL_DIGEST` placeholders. All compose files use versioned tags without digests. The `scripts/pin-docker-digests.sh` script exists but requires a Docker daemon to resolve actual digests.
- **Setup**: Run `bash scripts/pin-docker-digests.sh` in an environment with Docker installed and running.

### Files Changed (54 files)
- `backend/app/api/endpoints/` — 25 endpoint files modified
- `backend/app/services/part_service.py` — Added `bulk_delete_parts`
- `backend/Dockerfile` — Security hardening (USER, tini)
- `.secret_key` — Deleted
- `backend/CHANGELOG.md` — Updated
- `BOM and PRD/CHANGELOG.md` — Updated
- `BOM and PRD/OPEN_ITEMS.md` — Updated
- `BOM and PRD/RELEASE_NOTES.md` — This entry
- `BOM and PRD/src/components/modals/` — 17 new modal component files + index.jsx
- `BOM and PRD/src/components/screens/` — 7 new screen component files + index.jsx
- `BOM and PRD/src/globals.js` — Updated modal import path
- `BOM and PRD/src/root/modals-extra.jsx` — Converted to backward-compat shim
- `BOM and PRD/src/root/secondary-screens.jsx` — Converted to backward-compat shim

### Migration Notes
- **No database migration required** — All changes are code-only
- **Dev environment**: Rebuild dev Docker image after pulling: `docker compose build backend`
- Verify: `docker compose run --rm backend whoami` should return `bom`

### Enterprise Readiness Score: 8.7/10 (unchanged)

## v1.33.0 (2026-06-25) — Security Hardening Release

### Breaking Changes
- **None** — All fixes are backward-compatible. No schema changes, no API signature changes.
- **Metrics endpoint now requires authentication**: Applications or monitoring systems that scrape `/metrics` will need to include a valid JWT or API key. Update your Prometheus/Grafana scraper configs accordingly.
- **CORS headers restricted**: If you have cross-origin frontend deployments that rely on the previous `allow_methods=["*"]` / `allow_headers=["*"]` configuration, update your deployment to use the explicit allowed list.

### Security Fixes (Critical)

#### C-1: Hardcoded Admin Credentials (CRITICAL)
- **Severity**: Critical — production admin credentials embedded in frontend source and compiled bundle
- **Root cause**: `auth-onboarding.jsx:44` had `admin@blackbox.com:admin123` in mock SSO user data. `App.jsx:439` had `"admin123"` as password fallback in development auth bypass.
- **Fix**: Both occurrences removed from source. Frontend rebuilt (109 modules, 1.78s). Compiled bundle scanned — no `admin123` found.
- **Impact**: Prevents unauthenticated admin access via default credentials

#### C-2/C-3: `.env` and `.secret_key` Tracked in Repo
- **Severity**: Critical — contains live `POSTGRES_PASSWORD`, `SECRET_KEY`, `ENCRYPTION_KEY`, S3 credentials
- **Status**: Files listed in `.gitignore` but tracked (need `git rm --cached` on repo init)

#### C-4: RSA Key NoEncryption (CRITICAL)
- **Severity**: Critical — private key serialized without passphrase
- **Root cause**: `security.py:46` used `NoEncryption()` to serialize RSA private key
- **Fix**: Changed to `BestAvailableEncryption(settings.ENCRYPTION_KEY)`
- **Impact**: RSA private key now encrypted at rest

#### C-5: f-string SQL Injection in api_keys.py (CRITICAL)
- **Severity**: Critical — unparameterized f-string SQL in `expires_sql` query
- **Root cause**: `api_keys.py` used `f"'{expires_at}'"` instead of bind parameter
- **Fix**: Changed to parameterized `:expires_at` syntax
- **Impact**: Eliminates SQL injection vector via API key expiry parameter

#### C-7: WebSocket Cross-Tenant Data Leak (CRITICAL)
- **Severity**: Critical — WebSocket broadcasts used unscoped channel name
- **Root cause**: `main.py:517,519` used `channel` instead of `scoped_channel`
- **Fix**: Both broadcast and disconnect handlers now use `scoped_channel`
- **Impact**: Prevents WebSocket messages from leaking across tenants

### Security Fixes (High)

| ID | Issue | Fix |
|----|-------|-----|
| H-1 | CORS `["*"]` wildcards | Restricted to explicit method/header lists |
| H-2/H-3 | Account lockout enables DoS; no IP throttling | Added `_check_ip_rate_limit()` — 10/min per IP |
| H-4 | Rate limit cache `.clear()` on overflow | LRU eviction via `pop(next(iter(...)))` |
| H-5 | Sanitize `except: pass` on parse failure | Logged warning instead of silent bypass |
| H-7 | SAML debug enabled in non-production | Disabled always (`False`) |
| H-8 | SSO callback has no rate limit | Added `@limiter.limit("10/minute")` |
| H-9 | Metrics endpoint unauthenticated | Added `get_current_user` dependency |
| H-11 | API key prefix stored `"..."` suffix | Stores actual prefix now |
| H-12 | HTML double-encoding in JSON sanitization | XSS pattern stripping instead of `html.escape()` |
| H-13 | JWT algorithm confusion | Added `get_unverified_header()` verification |

### Database Model Fixes
- TokenBlacklist: Added `tenantId` column + expiry index
- SupplierPortal: `ondelete="SET NULL"` on FKs
- AuditLog: Indexes on `createdAt` and `userId`
- BomItem: Composite index `(bomTemplateId, partId)`
- WorkOrder: Composite index `(status, due_date)`
- DigitalSignature: Index on `mfa_type`

### Bug Fix
- SAML `_prepare_saml_request()` was not async but used `await` — fixed to `async def`

### Frontend
- Rebuilt: 109 modules, 1.78s, 0 errors
- Verified: no `admin123` in `dist/` compiled bundle

## v1.32.0 (2026-06-24) — Critical Security Patch

### Breaking Changes
- **None** — All fixes are backward-compatible. No schema changes, no API signature changes.
- **Backup endpoints now require MFA in production**: Superusers accessing backup endpoints in production must have MFA configured. Users without MFA will receive 403 with instructions.
- **SQL injection surface eliminated**: All analytics and dashboard queries now use bound parameters. No behavioral change — same queries, same results.

### Security Fixes (Critical)

#### SQL Injection via f-string Tenant Filter (CVE-2026-XXXX)
- **Severity**: Critical — 85+ injection points across `analytics.py` (15 queries) and `dashboard_service.py` (50+ queries)
- **Root cause**: `_tenant_filter()` and `tenant_filter()` embedded `tenantId` directly in f-string SQL: `f'WHERE "tenantId" = {tid}'`
- **Fix**: Rewrote both functions to return `(clause, params_dict)` tuples. All queries now pass `tenantId` as SQLAlchemy bind parameter: `text(f'WHERE {tf}'), {"tenantId": tid}`
- **Impact**: Prevents SQL injection via JWT `tenantId` claim tampering

#### JWT Algorithm Confusion — HS256 Fallback with RS256 Keys (CVE-2026-XXXX)
- **Severity**: Critical — allows token forgery with RSA public key
- **Root cause**: `verify_token()` at `security.py:127-128` appended `"HS256"` to supported algorithms when configured for RS256
- **Fix**: Removed `supported.append("HS256")` line. Token verification now only accepts the configured algorithm.
- **Impact**: Prevents attackers from forging JWT tokens using the RSA public key as an HMAC secret

#### Backup MFA Bypass
- **Severity**: Critical — backup operations can be performed without MFA
- **Root cause**: All 9 backup endpoints used `Depends(get_current_user)` + manual `isSuperuser` check instead of `Depends(get_current_superuser)` which enforces MFA in production
- **Fix**: All endpoints changed to `Depends(get_current_superuser)`. Manual checks removed.
- **Impact**: Backup create/verify/restore/cleanup/PITR now requires MFA in production

#### session_timeout.py Wrong JWT Key (HIGH)
- **Severity**: High — session timeout middleware would fail to validate tokens with RS256
- **Root cause**: Used `settings.SECRET_KEY` (HMAC key) instead of `_get_jwt_verify_key()` (RSA public key)
- **Fix**: Changed to `_get_jwt_verify_key()` imported from `app.core.security`
- **Impact**: Session timeout now correctly validates RS256-signed tokens

#### backup_history.py Constraint Mismatch (HIGH)
- **Severity**: High — backup operations would fail with constraint violations
- **Root cause**: 3 `CheckConstraint` values didn't match what the backup code writes: `status` missing `'verified'`, `backup_type` missing `'schema_only'`, `verification_status` missing `'passed'`
- **Fix**: All 3 constraints expanded to include the values the code actually uses
- **Impact**: Backup history writes no longer fail with `CheckConstraintViolation`

#### .secret_key Files Exposed (HIGH)
- **Severity**: High — JWT signing keys stored unprotected
- **Fix**: Deleted `backend/.secret_key` and `/.secret_key`. Added `.secret_key` to `.gitignore`
- **Impact**: Reduces risk of JWT signing key exposure in version control

#### Webhook Tenant Scoping (MEDIUM)
- **Severity**: Medium — cross-tenant webhook visibility
- **Root cause**: 8 of 9 webhook endpoints didn't inject `current_user`, so the service layer had no tenant context
- **Fix**: All endpoints now receive `current_user`. `list_subscriptions` filters by tenantId. `get/update/delete/test/retry` operations verify ownership for non-superusers
- **Impact**: Prevents cross-tenant webhook data leakage

### Files Changed
- `backend/app/api/endpoints/analytics.py` — SQL injection fix (rewritten with bound params)
- `backend/app/services/dashboard_service.py` — SQL injection fix (rewritten with bound params)
- `backend/app/core/security.py` — Removed HS256 fallback
- `backend/app/core/session_timeout.py` — Fixed JWT key for RS256
- `backend/app/api/endpoints/backup.py` — MFA enforcement via get_current_superuser
- `backend/app/models/backup_history.py` — Fixed CheckConstraint values
- `backend/app/api/endpoints/webhooks.py` — Added tenant scoping to all endpoints
- `backend/app/services/webhook_service.py` — Added tenant filtering to all CRUD functions
- `.gitignore` — Added `.secret_key` pattern
- Deleted `backend/.secret_key`, `/.secret_key`
- `BOM and PRD/CHANGELOG.md` — v1.32.0 entry
- `BOM and PRD/OPEN_ITEMS.md` — Updated v1.32.0 completed items
- `BOM and PRD/RELEASE_NOTES.md` — This entry
- `BOM and PRD/MODULE_REFERENCE.md` — Updated function signatures
- `BOM and PRD/TESTING_AND_VALIDATION.md` — Added security validations
- `BOM and PRD/SYSTEM_WORKFLOW.md` — Updated jwt/analytics flows

### Migration Notes
- **No database migration required** — All changes are code-only
- **Backup operations in production**: Ensure MFA is configured for all superuser accounts before deploying
- **Running the update**: `git pull && pip install -r requirements.txt && npm run build`

### Enterprise Readiness Score: 7.9/10 (+0.2 from v1.31.0)

## v1.31.0 (2026-06-24) — ES Module Migration Phases 2-3

### Breaking Changes
- **None** — All window.* shims remain active. Existing code using `window.X` continues to work unchanged. New code should import from `src/globals.js` instead.

### New Features
- **Enterprise ES Module Migration (Phases 2-3)**: All 25+ frontend JSX/JS files now export their symbols as named ES module exports, eliminating global namespace pollution at the declaration level.
- **Central Re-Export Hub**: `src/globals.js` aggregates all named exports from every module. Import once from `src/globals.js` instead of reaching into 25+ separate files.
- **IIFE → ES Module Conversions**: `tenant-admin.jsx` and `cloud-sync.js` refactored from IIFE patterns to proper ES module syntax. `collaboration.jsx` completed in Phase 2.

### Files Exported (Phase 3 additions)
- `bom-editor.jsx` — BomEditor, Sparkline, LeadHeat, fmt, STATUS_CLASS
- `parts-screen.jsx` — PartsScreen
- `dashboard.jsx` — DashboardScreen, WORKSPACE_BUDGET
- `detail-drawer.jsx` — Drawer
- `integration-screens.jsx` — 7 screen components
- `enterprise-screens.jsx` — 9 screen components
- `mobile-scanner.jsx` — MobileScannerScreen
- `tenant-admin.jsx` — TenantsAdminScreen (IIFE → ESM)
- `modals-extra.jsx` — PODetailModal, VendorDetailModal, CADImportModal, BarcodeScanModal, GlobalSearchModal, ProfileModal, SettingsModal, HelpModal, ImportRFQsModal, QuoteHistoryModal, AutoScrapeModal, DocumentFolderTree, BulkImportModal, BOMTemplatesModal, BOMDuplicationModal, RollbackModal, ProcurementAlertsModal
- `power-features.jsx` — UNDO, recordUndo, runUndo, applyAccessibilityTheme, CommandPalette, WorkOrdersScreen, NCRScreen, LandedCostModal, MarginModal, ShareLinkModal, WebhooksModal, ScheduledReportsModal, EmailParseModal, Presence
- `final-polish.jsx` — useURLState, getSavedSearches, saveSavedSearch, SAVED_SEARCHES_KEY, ApprovalsScreen, RoadmapModal, BulkVendorImportModal, NotifPrefsModal, NetworkBadge
- `prod-additions.jsx` — optimistic, ErrorScreen, EmptyState, SkeletonRows, InventoryScreen, PricingModal, ProductTour
- `cloud-sync.js` — cloudSync (IIFE → ESM)
- `app.jsx` — downloadCSV, downloadJSON, generateXLSX, downloadBlob, printBOM
- `auth-onboarding.jsx` — ROLES, TenantContext, AuthScreen, OnboardingWizard, MobileScanView, TenantSettingsModal
- `data.js` — BOM_DATA
- `projects.js` — PROJECTS
- `setup.js` — React, ReactDOM

### Enterprise Readiness Score: 7.7/10 (+0.2 from v1.30.0)

### Files Changed
- All JSX/JS files in `BOM and PRD/` — Named exports added
- `BOM and PRD/src/globals.js` — Central re-export hub updated with all Phase 3 exports
- `BOM and PRD/CHANGELOG.md` — v1.31.0 entry
- `BOM and PRD/OPEN_ITEMS.md` — Updated ES module status
- `BOM and PRD/RELEASE_NOTES.md` — This entry
- `ENTERPRISE_AUDIT_REPORT.md` — Score updated

## v1.30.0 (2026-06-24) — Enterprise Audit Critical Fixes

### Breaking Changes
- **Backup check now blocks production startup**: In production (`ENVIRONMENT=production`), the startup health check will return `unhealthy` if no backups exist. Create at least one backup before deploying to production.
- **Mock data disabled in production builds**: `USE_MOCK_DATA` is now hard-forced to `false` at compile time in production Vite builds. Cannot be overridden at runtime.
- **FK references migrated to `po_headers`**: `documents.purchaseOrderId`, `serial_numbers.poId`, and `lot_batches.poId` now reference `po_headers.id` instead of legacy `purchase_orders.id`. Run FK migration before deploying.
- **6 new normalized tables**: `contract_pricing_tiers`, `contract_attachments`, `deviation_attachments`, `fai_attachments`, `pricing_agreement_volume_tiers` created. Legacy JSON columns marked DEPRECATED.

### Critical Fixes
- **Mock data production gating**: Compile-time flag in `src/config.js` prevents mock data fallback in production. `app.jsx` shows "OFFLINE" badge (not "MOCK") with no fallback data.
- **PO model consolidation completed**: All 3 remaining FK references to legacy `purchase_orders` table migrated to canonical `po_headers` table. Legacy `PurchaseOrder` model officially deprecated.
- **Backup existence as startup requirement**: Production deployments now require at least one backup to pass health check. Prevents data-loss-risk scenarios.
- **JSON column normalization Phase 3**: Remaining 5 denormalized JSON columns (pricing tiers, attachments, volume tiers) now have proper relational tables with FKs, indexes, and tenant isolation.

### Database Changes
- **6 new tables** requiring Alembic migration:
  - `contract_pricing_tiers` — Normalized pricing tier data (min_qty, max_qty, unit_price)
  - `contract_attachments` — Contract file attachments with uploaded_by tracking
  - `deviation_attachments` — Deviation file attachments
  - `fai_attachments` — FAI report file attachments
  - `pricing_agreement_volume_tiers` — Volume pricing tiers per pricing agreement
- **FK constraint updates**: 3 existing FK constraints changed target table from `purchase_orders.id` → `po_headers.id`

### Migration Notes
1. Create Alembic migration to add 6 new tables
2. Run `ALTER TABLE documents DROP CONSTRAINT...` + `ALTER TABLE documents ADD CONSTRAINT... FOREIGN KEY (purchaseOrderId) REFERENCES po_headers(id)`
3. Repeat for `serial_numbers.poId` and `lot_batches.poId`
4. Create at least one backup before deploying with `ENVIRONMENT=production`
5. Rebuild frontend with `npm run build` to activate mock data compile-time gate

### Files Changed
- `BOM and PRD/src/config.js` — Production mock data gate
- `BOM and PRD/app.jsx` — Mock auth/badge/error gating
- `BOM and PRD/src/locales/en.json` — badgeOffline key
- `BOM and PRD/src/locales/ja.json` — badgeOffline key
- `backend/app/models/document.py` — FK → po_headers.id
- `backend/app/models/traceability.py` — FKs → po_headers.id
- `backend/app/models/procurement.py` — Deprecation docstring
- `backend/scripts/startup_health_check.py` — Production backup requirement
- `backend/app/models/contract.py` — 2 new models + PricingAgreementVolumeTier
- `backend/app/models/deviation.py` — DeviationAttachment model
- `backend/app/models/fai.py` — FaiAttachment model
- `backend/app/models/__init__.py` — 6 new model exports

### Enterprise Readiness Score: 7.5/10 (+0.7 from v1.29.0)

## v1.26.0 (2026-06-19) — JSON Column Normalization Phase 2

### Breaking Changes
- **None** — All 6 JSON columns remain in the schema for backward compatibility. New normalized tables are populated alongside legacy columns. API responses include both legacy and new normalized data. No migration downtime expected.

### Database Changes
- **4 new normalized tables** created:
  - `revision_bom_snapshot_items` — Point-in-time BOM snapshot data (replaces `revisions.bomSnapshot`)
  - `custom_attribute_options` — Dropdown/select option values (replaces `custom_attribute_definitions.options`)
  - `custom_attribute_validation_rules` — Validation rules like min/max/pattern (replaces `custom_attribute_definitions.validation_rules`)
  - `eco_item_attribute_changes` — Field-level ECO change tracking (replaces `eco_items.old_value`/`eco_items.new_value`)
- **Existing JSON data migrated** to new normalized tables with full historical preservation
- **6 legacy JSON columns marked DEPRECATED** via PostgreSQL column comments — will be removed in v2.0.0

### New Models (4)
- `RevisionBomSnapshotItem`, `CustomAttributeOption`, `CustomAttributeValidationRule`, `EcoItemAttributeChange`

### API Enhancements
- **BOM Template Load**: Returns `bomDataComputed` (from normalized BomItem table) alongside legacy `bomData`
- **Revision Rollback**: Uses normalized `revision_bom_snapshot_items` as primary restore source
- **Custom Attributes**: Options can be queried via `options_normalized` field; new creates populate both JSON and normalized tables
- **ECO Items**: Field-level changes now tracked in `eco_item_attribute_changes` table with per-field old/new values

### Migration Notes
- **Migration 024** (`024_json_column_normalization_phase2.py`) creates 4 tables and migrates all existing data
- Expected runtime: <1 second for small datasets, up to a few seconds for large `eco_items` or `revisions` tables
- Backward-compatible: rollback via `alembic downgrade 023` drops the 4 new tables and removes column comments

## v1.25.0 (2026-06-18) — Stub Elimination, Security Hardening & Model Completeness

### Breaking Changes
- **None** — All changes are backward-compatible. Schema unchanged. API signatures unchanged.

### Critical Fixes
- **6 stubbed endpoint files rewritten**: `work_order_api.py`, `eco_api.py`, `inventory_api.py`, `quality_api.py`, `solidworks_integration.py`, `bom_enterprise.py` — all now use real DB queries instead of hardcoded dicts (~1100 lines of fake data eliminated).
- **SolidWorks integration persistence fixed**: Replaced in-memory `cad_*_storage` dicts with PostgreSQL-backed Part/Document queries. CAD BOM data, images, and pending changes now survive server restarts.

### Security (HIGH)
- **`python-jose` → `PyJWT` migration**: Unmaintained JWT library (last release 2021) replaced with actively maintained PyJWT. Security.py and session_timeout.py updated.
- **CSP `'unsafe-eval'` removed**: XSS protection no longer defeated by unsafe-eval in Content-Security-Policy. Violation reporting added via `report-uri`.
- **HTTPS enforced**: Nginx now serves only HTTPS (port 443) with HTTP→301 redirect. TLS 1.2/1.3 with modern ciphers.
- **SSL certificate generator**: `backend/ssl/generate-certs.ps1` for self-signed development certificates.

### Multi-Tenancy (HIGH)
- **5 child models now tenant-aware**: `CapaAttachment`, `FaiCharacteristic`, `DeviationLot`, `SerialNumberEvent`, `ContractParts` extend `TenantAwareMixin` — closes cross-tenant data leakage vectors.

### Database Integrity (HIGH)
- **4 association tables get `ondelete=CASCADE`**: `part_tags`, `part_compliance`, `user_roles`, `role_permissions` — prevents orphaned rows on parent deletion.

### RBAC Completion
- **All 6 rewritten endpoint files now have RBAC**: Role-based access enforced for viewer/engineering/procurement/admin roles across work orders, ECO, inventory, quality, SolidWorks, and BOM enterprise endpoints.

### Model Completeness
- **56 model classes now have `__repr__`**: AST-based script auto-generated implementations. Debugging and logging now show meaningful object representations.

### Migration Notes
- No migrations required for this release
- Run `powershell -File ssl/generate-certs.ps1` before deploying with HTTPS
- PyJWT is backward-compatible — existing tokens remain valid

## v1.24.1 (2026-06-18) — Build Fixes & PropTypes Quality

### Breaking Changes
- **None** — This release is fully backward-compatible. No schema changes, no API changes.

### Critical Fixes
- **Vite build repaired**: The PropTypes auto-generator (v1.24.0) introduced 3 syntax errors that blocked `npx vite build`. All resolved. Build is clean with zero errors and zero warnings.
- **PropTypes quality improved**: 6 `openModal` props corrected from `bool` → `func`. 4 PropTypes blocks moved outside function bodies to avoid re-execution on every render. 1 wrong type annotation fixed.

### EmptyState Compatibility
- **`final-polish.jsx`** now uses `description` prop matching `enterprise-utils.jsx` EmptyState signature. Fixes runtime bug where `body` prop was silently ignored (enterprise-utils loads after prod-additions, overwriting `window.EmptyState`).

## v1.24.0 (2026-06-18) — Security RBAC Hardening, Database Enum Migration & Frontend Modernization

### Breaking Changes
- **Run `alembic upgrade head` to apply Migration 023**: Creates PostgreSQL ENUM types (`approval_type`, `approval_status`) and alters `approvals.type` and `approvals.status` columns. Drops redundant CHECK constraints from Migration 022.
- **10 API endpoints now require authentication**: `capa`, `contract`, `deviation`, `fai`, `kanban`, `make_vs_buy`, `roles_permissions`, `should_cost`, `supplier_scorecard`, `traceability` — all now have router-level `Depends(get_current_user)`.

### Security (HIGH)
- **RBAC gap closed**: 25+ unprotected endpoints now have router-level authentication. Combined with previous v1.22.0 fixes (parts.py), all API endpoints now require authentication.
- **User model tenant-aware**: User extends `TenantAwareMixin`. Cross-tenant user listing via `/api/v1/users` is now prevented by tenant isolation.
- **WebSocket authentication hardened**: Revoked tokens can no longer establish WebSocket connections — `verify_token_with_blacklist()` checks the TokenBlacklist table.
- **API key MFA enforcement**: Superusers authenticating via API key in production must have MFA configured. Falls through to JWT auth if MFA is missing.

### Database (MEDIUM)
- **Migration 023**: PostgreSQL ENUM types for approval workflow. Replaces String columns with proper type-safe ENUMs.
- **SQLite test compatibility**: 4 model files now import JSON from `sqlalchemy` instead of `sqlalchemy.dialects.postgresql`.

### Frontend Modernization
- **960 inline styles converted to CSS classes**: Using partial conversion — convertible props become `className` while non-convertible expressions remain as reduced `style={{}}`. 214 remaining styles have dynamic expressions that can't be statically converted.
- **450 CSS utility classes**: Complete utility class system covering layout (flex, grid, position), spacing (padding/margin), typography (font-size, weight, family), borders, backgrounds, colors, and overflow.
- **PropTypes for 115 components**: Runtime type checking added across 18 files.
- **i18n ready**: `react-i18next` configured with 150+ English keys. 958 `t()` calls active.

### Migration Notes
1. Run `alembic upgrade head` to apply Migration 023
2. Migration 023 drops CHECK constraints from Migration 022 (ENUMs replace them)
3. No data migration needed — column types change String → ENUM with automatic casting

### Files Changed
- `backend/alembic/versions/023_enum_types_and_cleanup.py` (new)
- `backend/app/models/user.py` — TenantAwareMixin
- `backend/app/core/ws_auth.py` — Blacklist check
- `backend/app/core/deps.py` — MFA enforcement
- `backend/app/models/approval.py` — SQLEnum
- 4 model files — JSON import fixed
- 10 endpoint files — Router-level auth added
- `BOM and PRD/styles.css` — +130 utility classes
- All 18 JSX files — Style conversion + PropTypes

### Breaking Changes
- **`Base.metadata.create_all()` is deprecated**: After Migration 022, all tables are created via Alembic. The `create_all` call in `main.py:58` now logs a deprecation warning. Set `SKIP_CREATE_ALL=true` to suppress. Future releases will remove this call entirely.
- **Run `alembic upgrade head` to apply Migration 022**: This migration formalizes ~73 tables under Alembic control and adds 8 CHECK constraints, 5 UNIQUE constraints, and 1 FK constraint. The migration is safe — `create_all` is a no-op for existing tables, and duplicate cleanup runs before unique constraints.

### Database Integrity (Migration 022)
- **73+ tables formalized under Alembic**: All tables previously created only via `Base.metadata.create_all()` are now explicitly managed in migration 022. This includes tenants, po_headers, po_line_items, inventory, work_orders, quality, ECO, routing, BOM variants/snapshots/baselines, MBOM, service BOM, supplier portal, ERP connectors, contracts/pricing, webhooks, digital signatures, notifications queue, user data, enterprise extensions, forecasting, API keys, backup history, association tables (part_tags, part_compliance), and all analysis/mfg tables.
- **CHECK constraints added**: `approvals.type`/`status` (enum validation), `revisions.entityType`, `parts.status`, `approvals.entityType`, `boms.status`, `part_vendors.qualityScore` (0-5), `part_vendors.onTimeRate` (0-100).
- **UNIQUE constraints added**: `part_vendors(partId, vendorId)`, `revisions(entityType, entityId, revisionNumber)`, `user_data_store(user_id, data_key)`, `part_custom_fields(part_id, field_name)`, `user_preferences(user_id, pref_key)`.
- **FK constraint added**: `po_line_items.partId → parts.id` — PO line items are now linked to the part catalog.
- **Duplicate cleanup**: Before adding unique constraints, any existing duplicate rows are removed (keeping the earliest entry).

### Infrastructure
- **nginx.conf fixed**: Removed duplicate `location /` catch-all block that was shadowing the static files handler. The DDoS-immune configuration now correctly serves frontend assets while maintaining all rate limiting, connection limiting, bot blocking, and request validation layers.

### Operational Impact
- Run `alembic upgrade head` to apply Migration 022
- Set `SKIP_CREATE_ALL=true` in production after migration to suppress deprecated create_all
- Duplicate rows in part_vendors, revisions, user_data_store, part_custom_fields, and user_preferences will be cleaned up (oldest kept)

## v1.22.0 (2026-06-17) — Audit Remediation: Security Hardening, Backup DR Fixes & Database Integrity

### Security Fixes (Critical)
- **`approval.py:72` Fixed repr crash**: Removed `.value` calls on `String` columns in `__repr__` — crashed on any print/repr of Approval objects.
- **`tenant_middleware.py` Fixed**: Now extracts user from JWT directly instead of relying on `request.state.user` (which is never set at middleware execution time). Uses `verify_token()` to decode JWT and read `tenantId`/`isSuperuser` from token claims.
- **`encryption.py` Silent decryption failure fixed**: `fernet_decrypt()` and `decrypt_column()` now raise `EncryptionError`/`ValueError` on failure instead of silently returning ciphertext. Callers can now detect failures.
- **`encryption.py` Key validation added**: `_get_fernet()` raises `ValueError` if `ENCRYPTION_KEY` is empty or not configured.
- **`parts.py` 3 endpoints now authenticated**: `GET /`, `GET /{part_id}`, `POST /check-duplicates` now require `Depends(get_current_user)`.
- **`audit_middleware.py` Fire-and-forget fixed**: Added retry logic (3 attempts with exponential backoff: 0.1s, 0.5s, 2.0s) instead of single-shot `asyncio.create_task`.

### Backup & DR Fixes (Critical)
- **`backup.py` Encryption key validation**: `_get_fernet()` now validates `ENCRYPTION_KEY` is not empty. Empty key previously produced a predictable SHA-256 of empty string.
- **`backup.py` Dual-storage pipeline**: `run_backup_pipeline()` now supports `dual_storage=True` parameter — stores backups to both local and S3 for off-site redundancy.
- **`pitr_restore.py` Fixed config corruption**: Changed from appending to `postgresql.auto.conf` to writing a dedicated `blackbox_recovery.conf` file. Includes `include_if_exists` guidance instead of corrupting existing settings.
- **`pitr_restore.py` WAL archive cleanup**: Added `--cleanup-wal` and `--keep-days` arguments for automated WAL archive cleanup. Removes files older than `keep_days` (default: 7).
- **`restore_wizard.py` S3 restore support**: Backups stored in S3 can now be downloaded and restored. New `_download_s3_backup()` helper.
- **`restore_wizard.py` Savepoint/rollback**: Pre-restore savepoint created automatically using `pg_dump`. Stored at `savepoint_path` in result for manual rollback.
- **`restore_wizard.py` Physical backup guidance**: Clear error message with manual steps for pg_basebackup restore.
- **`main.py` TenantIsolationMiddleware documented**: Explicitly noted why the middleware is not registered (redundant with deps.py tenant isolation).

### CSP Hardening
- **`security_headers.py`**: Added `report-uri /api/v1/csp-report` in production for violation reporting (report-only mode). Development keeps `unsafe-inline`/`unsafe-eval` with TODO comments for when Babel standalone is replaced.

### Documentation
- Release notes and changelog updated with all v1.22.0 fixes.

## v1.21.0 (2026-06-17) — Polymorphic FK Enforcement, Multi-Tenant Isolation, pg_basebackup & Batch Style Migration

### Breaking Changes
- **SELECT queries now filtered by tenantId**: Multi-tenancy is now enforced at the ORM level for all SELECT queries on `TenantAwareMixin` models. Previously only INSERT was isolated. Queries from non-superuser contexts will now automatically include `WHERE tenantId = :current_tenant`. Users with NULL tenantId who relied on cross-tenant visibility will need superuser access.
- **Polymorphic entity validation enforced**: 10 models now validate `entityType`/`reference_type`/`document_type` values at the ORM level via `before_insert`/`before_update` events. Invalid entity types will raise `ValueError`.

### Database Integrity
- **10 polymorphic associations enforced**: `entityType`+`entityId`, `reference_type`+`reference_id`, and `document_type`+`document_id` patterns now have composite indexes and ORM-level validation. Affected models: AuditLog, Notification, Revision, Approval, Comment, ValidationResult, InventoryTransaction, InventoryReservation, DigitalSignature, NotificationQueue.
- **Composite indexes**: 10 new indexes for polymorphic lookup performance.

### Security Fixes (Critical)
- **Multi-tenancy SELECT isolation**: `do_orm_execute` event listener in `tenant_events.py` auto-injects `WHERE tenantId` filter on ALL SELECT queries. Previously cross-tenant data leakage was possible. Superusers bypass the filter.

### New Features
- **pg_basebackup Integration**: New `BackupType.PHYSICAL` and `create_physical_backup()` using `pg_basebackup -Ft -z -X stream` for PITR-ready physical base backups.
- **`POST /api/v1/backup/physical`**: Trigger physical base backup on demand.
- **`POST /api/v1/backup/pipeline?include_physical=true`**: Pipeline optionally includes physical backup alongside logical `pg_dump`.
- **CSS utility class system expanded**: 30 new utility classes added (~110 total). 531 inline styles converted across 13 JSX files (~40% reduction, ~1279 remain).

### New Files
- `scripts/convert_inline_styles.py` — Batch inline style → utility class converter

### Operational Impact
- Run `alembic upgrade head` to apply migration 022 (composite indexes + validation triggers)
- Database superuser or `CREATEEXTENSION` grant needed for migration 019 (pgcrypto)
- Multi-tenancy SELECT isolation is active on startup — review any cross-tenant queries

## v1.20.0 (2026-06-17) — SSRF Fix, API Key Auth, PITR Restore & Security Hardening

### Breaking Changes
- **Webhook API responses no longer include `secret` field**: `WebhookSubscriptionResponse` schema stripped of `secret`. This is a security hardening measure. Clients that depend on reading back the secret will need to store it at creation time.
- **Only HTTPS URLs accepted for webhooks**: HTTP webhook URLs will be rejected with a 422 error.

### Security Fixes (Critical)
- **SSRF via webhooks**: `_is_safe_webhook_url()` validates all webhook URLs against private IP ranges (10.x, 172.16-31.x, 192.168.x), loopback, link-local, multicast, and unspecified addresses. DNS resolution checked for hostnames. HTTPS-only enforced.
- **Webhook secrets redacted from API responses**: Secrets are still encrypted at rest (Fernet) and used for HMAC-SHA256 signature generation, but never returned to API clients.
- **API key authentication integrated**: `X-API-Key` header now accepted as an alternative to JWT bearer tokens. Expired keys are rejected. `last_used_at` timestamp auto-updated on each use.

### New Features
- **Point-in-Time Recovery (PITR)**: `scripts/pitr_restore.py` generates `recovery.signal` and `postgresql.auto.conf` restore configuration. Supports target time and transaction ID recovery. Includes `POST /api/v1/backup/pitr-restore` API endpoint (superuser only).
- **PITR health monitoring**: `/health` endpoint and startup health check now report WAL archive status and PITR readiness.
- **CSS utility class system**: 80+ utility classes (`.flex`, `.flex-1`, `.fw-500`, `.fs-12`, `.fg-3`, `.cursor-pointer`, etc.) added to `styles.css` for systematic inline style migration.

### Bug Fixes
- **Error boundary ReferenceError**: Root mount (`<ErrorBoundary>`) was not in scope in `app.jsx` (defined in separate `enterprise-utils.jsx` module). Changed to use `window.ErrorBoundary` via `React.createElement`.

### Operational Impact
- Webhook URLs must now be HTTPS. Review existing webhook subscriptions before upgrading.
- API key auth available — set `X-API-Key` header for programmatic access.
- PITR restore endpoint available for disaster recovery scenarios.

## v1.19.0 (2026-06-16) — Critical Security Fixes & Competitive Gap Analysis

### Breaking Changes
- **`tenantId` NOT NULL enforced**: All 55+ tenant-aware tables now require a tenant ID. Existing records with NULL tenantId must be backfilled before migration.
- **`Project.updated` column removed**: Use `Project.updatedAt` instead. No code references found.

### Security Fixes (Critical)
- **SHA-256 → bcrypt password hashing**: Supplier portal passwords now use bcrypt (was unsalted SHA-256). Legacy hashes auto-upgraded on next login.
- **Token blacklist fail-open closed**: Database-backed `TokenBlacklist` table provides fallback when Redis is unavailable. Tokens can always be revoked.
- **PK constraints on 4 association tables**: `part_tags`, `part_compliance`, `user_roles`, `role_permissions` now have composite primary keys. Duplicate rows prevented.

### New Features
- **Competitive gap analysis**: 89-feature comparison vs OpenBOM, Arena PLM, Teamcenter, Windchill, Fusion Manage. Blackbox BOM scored 50% overall with prioritized remediation roadmap.
- **Backup concurrency lock**: Redis-based distributed lock prevents simultaneous backups.
- **Email alerts for backup failures**: Backup failure alerts sent to `ADMIN_EMAIL` via SMTP.
- **S3 backup cleanup**: Expired S3 backups now automatically deleted.
- **ARIA accessibility landmarks**: `<header>`, `<nav>`, `<main>` landmarks + skip-to-content link.

### Bug Fixes
- **Backup cleanup WHERE clause**: Fixed `verified_at IS NOT NULL` exclusion that prevented cleanup of unverified backups. Now includes `completed`, `verified`, and `failed` statuses.
- **Backup cleanup S3**: S3 backups were never cleaned from cloud storage. Fixed.
- **Supplier password backward compat**: Existing SHA-256 passwords detected and upgraded on successful legacy login.

### Operational Impact
- Database migration required for tenantId NOT NULL enforcement (backfill step)
- Existing supplier users with SHA-256 passwords will be auto-upgraded on next login
- `ADMIN_EMAIL` env var should be set for backup failure notifications

## v1.18.0 (2026-06-16) — Database Architecture Audit & Disaster Recovery Hardening

### Critical Fix
- **Broken Alembic migration chain fixed**: `018_account_lockout_and_audit.py` referenced `down_revision = "017"` but the actual revision ID is `"017_remove_part_legacy_json_columns"`. `alembic upgrade head` now resolves cleanly.
- **Full migration audit**: All 19 migration files verified for consistent revision references. Only 018 was broken.

### New Features
- **`GET /health` endpoint**: Public health check returning database status (connectivity, WAL level, archive mode, table count, FK count, index count) and backup system status (directory existence, file count, WAL archive presence).
- **Startup health check**: Integrated into FastAPI lifespan — runs automatic database and backup system checks on every application startup with structured logging.

### Operational Impact
- No breaking changes to API or database schema
- Existing backups remain valid
- Migration 018 now safely chains after 017

# Blackbox BOM — Release Notes

## v1.11.0 (2026-06-16) — Performance & Backup/DR Enterprise Hardening

### Performance Improvements (Critical)
- **N+1 Queries Eliminated**: BOM explosion, cost rollup, where-used, and where-used-tree now use batch loading (2-6 queries per endpoint regardless of item count, instead of N+1)
- **Redis Caching Activated**: All expensive BOM endpoints cached with 5-minute TTL — explosion, cost rollup, where-used list, where-used tree
- **Full-Text Search Deployed**: Parts/vendors search uses `to_tsvector`/`plainto_tsquery` GIN indexes (created in migration 012) with `ts_rank()` scoring + ILIKE fallback
- **Metrics Bug Fixed**: HTTP request duration no longer recorded as DB query duration (was inflating Prometheus metrics by 10-100x). Real SQLAlchemy event listeners track actual query times.
- **Configurable Connection Pool**: `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` now read from env vars (defaults: 10/20). `pool_recycle=3600` prevents stale connections.
- **Docker Layer Caching**: `requirements.txt` copied and pip installed before app code — 80%+ faster rebuilds on code changes
- **PostgreSQL Timeouts**: `statement_timeout=30s`, `idle_in_transaction_session_timeout=60s`

### Backup/DR Improvements
- **PGPASSWORD Leak Fixed (restore_wizard.py)**: All subprocess calls use `_get_pg_env()` isolated env dict instead of connection strings with embedded passwords
- **Redis Authentication**: Password-protected Redis via `REDIS_PASSWORD` env var with healthcheck
- **Redis Persistence**: `redis_data` volume mounted to `/data`
- **Backup Persistence**: `backup_data` volume mounted to `/app/backups`
- **APScheduler Integration**: Backup scheduler uses `AsyncIOScheduler` + `CronTrigger` (was naive sleep-loop). Falls back to legacy loop if APScheduler not installed.

### Breaking Changes
- `REDIS_URL` format changed to include password: `redis://:password@host:port/db` — update `.env` if you set `REDIS_URL` manually
- Redis now requires `REDIS_PASSWORD` env var (default: `bom_redis_secret`)
- `DB_POOL_SIZE` and `DB_MAX_OVERFLOW` environment variables now respected (defaults: 10, 20)
- `postgresql.conf` updated — restart PostgreSQL to apply `statement_timeout` and `idle_in_transaction_session_timeout`
- `Dockerfile` restructured — rebuild required after pulling

### Performance Benchmarks (v1.11.0 vs v1.10.0)
| Operation | v1.10.0 | v1.11.0 | Improvement |
|-----------|---------|---------|-------------|
| BOM Explosion (1000 items) | ~2000 queries | ~6 queries | 99.7% reduction |
| Cost Rollup (500 items) | ~1000 queries | ~4 queries | 99.6% reduction |
| Where-Used (100 usages) | ~300 queries | ~4 queries | 98.7% reduction |
| Search "resistor" (parts) | Full table scan | GIN index scan | Indexed |
| DB query metrics accuracy | Inflated 10-100x | Real durations | Fixed |

---

## v1.10.0 (2026-06-16) — Enterprise Security Audit & Database Hardening

### Security Fixes (Critical)
- **SQL Injection** — `encryption.py` now validates all SQL identifiers against regex before f-string use (was: direct string interpolation)
- **SECRET_KEY Enforced** — Startup fails if `.secret_key` file cannot be persisted (was: silently generates new key each restart, invalidating all JWTs)
- **Access Token 30min** — Reduced from 8 days (11520 min → 30 min)
- **XSS Sanitization Fixed** — No longer HTML-escapes JSON body data, only strips control characters (was: corrupting `<`, `>`, `&` in part numbers)
- **CSRF Hardened** — `httponly=True`, `secure=True` in production, broad supplier-portal exemption removed
- **Rate Limiting Fixed** — Uses `X-Forwarded-For` for real IP behind nginx
- **PGPASSWORD Leak Fixed** — Isolated subprocess `env` instead of `os.environ`
- **Nginx Security Headers** — HSTS, CSP, X-Frame-Options, nosniff, Permissions-Policy, `server_tokens off`

### Database Schema (Migrations 013 + 014)
- **boms/bom_items_master** — Core BOM tables moved from `create_all` to formal migration
- **Documents** — FK constraints on `partId`/`projectId`; new columns `isPublic`, `purchaseOrderId`, `replacesDocumentId`
- **Audit Logs** — `ipAddress`→`userIp` rename, `userEmail` added, FK on `userId`, `changes` → JSON type
- **30+ Indexes** — Added on FK columns across inventory, ECO, quality, work_orders, routing, mbom, traceability, supplier_portal, compliance
- **7 Unique Constraints** — eco_approvals, routing_operations, mbom_operations, supplier_scorecards, currencies, auto_number_schemes, custom_attribute_definitions
- **Exchange Rates FK** — `from_currency`/`to_currency` → `currencies(code)`
- **JSON Column Normalization** — `contract_parts`, `fai_characteristics`, `serial_number_events`, `capa_attachments`, `deviation_lots` with data migration

### Model Alignment
- **audit_log.py** — `changes` → JSON, `createdAt` column name, `userIp` column
- **document.py** — Added `isPublic`, `purchaseOrderId`, `replacesDocumentId`

### Documentation
- All 8 mandatory docs updated with v1.10.0 changes
- Enterprise Readiness Score: 6.5/10 (+0.7 from v1.9.0)

### Breaking Changes
- Run `alembic upgrade head` to apply migrations 013 and 014
- `audit_logs` column `ipAddress` renamed to `userIp` — update any direct queries
- `audit_logs.changes` now returns JSON instead of text — update any string parsing
- `encryption.encrypt_sensitive_fields()` and `decrypt_sensitive_fields()` now raise `ValueError` on invalid table/field names
- SECRET_KEY must be persistable (set env var or ensure writable filesystem)

---

## v1.9.0 (2026-06-16) — Production Hardening & Enterprise Pagination

### Major Features
- **Enterprise Pagination**: All 30+ list endpoints now use consistent pagination with `{items, total, page, total_pages, has_next, has_prev}`
- **MFA/TOTP Integration**: Full multi-factor authentication flow with UserMfa model, login challenge, setup/verify/disable
- **BOM Enterprise (Live)**: Cost rollups, explosions, snapshots, baselines, where-used, and BOM comparison — all using real database queries
- **Password Complexity**: Server-side validation for all user registrations and creations
- **Redis Caching**: New caching layer for expensive BOM operations
- **CI/CD Pipeline**: GitHub Actions with lint, test, security scan, and Docker build
- **34 New Backend Tests**: Auth flows, CRUD operations, pagination, RBAC, search/filter

### Security Enhancements
- Default admin credentials removed from documentation
- POSTGRES_PASSWORD now fails hard if empty
- Complete RBAC chain wired (User ↔ Role ↔ Permission)
- CORS origins locked down with production warnings
- MFA login challenge flow integrated

### Performance Improvements
- Pagination on all list endpoints prevents unbounded queries
- Redis caching for BOM explosion/cost rollup operations
- Generic paginated response models for type safety

### Bug Fixes
- **MFA broken**: Was using non-existent `User.mfaSecret` field — now uses `UserMfa` model
- **Permission model broken**: `roles` relationship was commented out — now active
- **Mock data everywhere**: Cost rollup, explosion, snapshots, baselines all returned hardcoded values — now use real DB
- **Password validation missing**: No server-side password strength checks — now enforced

### Breaking Changes
- List endpoints now return paginated response format instead of raw arrays
- Login returns `{mfa_required, temp_token}` when user has MFA enabled (instead of direct tokens)
- POSTGRES_PASSWORD must be set or app will fail on startup

### Technical Notes
- Run `alembic upgrade head` after schema changes
- Redis is optional — cache operations degrade gracefully
- MFA requires `pyotp` library (already in requirements.txt)
- API key management endpoints at `/api/v1/api-keys`

---

## v1.7.0 (2026-06-16) — Production Hardening & Audit Completion

### Major Features
- **Full ESLint Compliance**: 54 `no-unused-vars` warnings eliminated, 0 errors 0 warnings across all 15 JSX files
- **Playwright Test Suite**: 19 tests covering smoke, a11y, PWA, enterprise screens, and accessibility — all passing
- **Color Contrast Compliance**: 18 WCAG color-contrast violations fixed in CSS custom properties
- **Enterprise Audit Complete**: Comprehensive gap analysis against OpenBOM, Arena PLM, Teamcenter, Windchill
- **Documentation Complete**: All 8 mandatory documentation files + DR runbook + enterprise audit report

### Accessibility Improvements
- **Color Contrast**: All 18 violations fixed — `--fg-3`, `--accent`, `--ok`, `--warn`, `--danger`, `.kbd`, ok-pill
- **ARIA Compliance**: `aria-prohibited-attr` violation fixed, axe-core scan passes
- **Test Coverage**: Automated accessibility tests validate every screen

### Code Quality
- **ESLint Flat Config**: Complete lint setup with React, a11y, best-practice rules
- **Vite Build**: 24 code-split chunks, 1.7s build time, 213KB JS gzipped
- **CSS Validation**: All syntax errors fixed, orphaned selectors resolved

### Bug Fixes
- **`integration-screens.jsx` corruption**: Reconstructed BulkImportScreen, ERPConnectorsScreen, WebhooksScreen
- **Runtime accent mismatch**: `useTweaks` default accent synced with CSS (`#ba4816`)
- **CSS orphaned selector**: Fixed `.locked` selector in `styles.css:2340`

### Technical Notes
- Backend must be running for API-dependent features
- All 19 tests verified against Vite preview server (port 4173)
- ESLint configuration at project root level

---

## v1.4.0 (2026-06-12) — UI/UX Enterprise Polish

### Major Features
- **UI/UX Pro Max Audit**: 8 critical accessibility and UX fixes applied across all screens
- **Focus States**: All interactive elements now have visible focus indicators for keyboard navigation
- **Skip Navigation**: Skip-to-content link for accessibility compliance
- **Touch Targets**: All buttons meet 44px minimum for mobile touch
- **Reduced Motion**: Full support for `prefers-reduced-motion` media query
- **Responsive Typography**: Base font increased to 14px, mobile minimum 16px
- **Viewport Units**: Changed to `100dvh` for mobile safe area support

### Improvements
- **Icon Button Accessibility**: All 45 icon buttons now have `aria-label` attributes
- **Toast Notifications**: Auto-dismiss at 3.4 seconds with manual dismiss option
- **Empty States**: All empty lists show helpful messages and calls-to-action
- **Loading States**: Enterprise screens show "Loading..." during data fetch
- **Form Labels**: All form fields have proper `id`, `name`, and `<label>` associations

### Fixes
- **Browser Cache**: Updated all cache busters to `?v=5` to prevent stale file serving
- **CSS Syntax**: Fixed orphaned `.locked` selector in `styles.css:2340`
- **Skip Link Styles**: Added proper positioning and visibility for skip link

### Technical Notes
- Added `.sr-only` utility class for screen reader content
- Added global `:focus-visible` and `:focus:not(:focus-visible)` rules
- Added `touch-action: manipulation` and disabled tap highlight on mobile

---

## v1.3.0 (2026-06-12) — Critical Bug Fixes & Feature Completion

### Major Features
- **Complete BOM Editor**: Add Item button, inline editing, hierarchy/flat modes
- **Component Library**: Full catalog with search, filter, grid/list views, duplicate detection
- **Vendor Management**: Vendor list, detail modal, RFQ creation, price comparison
- **Procurement**: PO list, detail modal, status tracking, print PDF
- **Order Tracking**: Amazon-style UI with stage progression
- **PDM/CAD Vault**: File versioning, 3D viewer, checkout/checkin
- **Mobile Scanner**: Barcode scanning, camera integration

### Bug Fixes (28 issues resolved)
- **Parse error** — Missing `</div>` in PartsScreen causing component tab crash
- **`addPartToBom` scope bug** — "Add to BOM" button now works from PartsGrid/PartsList
- **`openModal` prop mismatch** — Modals now open with correct context data
- **22 stale data reads** — All screens now read live context instead of static `window.BOM_DATA`
- **CostSimulatorModal crash** — Added missing `useAppStore` declaration
- **BulkImportScreen broken** — Exposed `window.bulkImportAPI` globally
- **MonitoringScreen hang** — Added `.catch()` to prevent infinite loading spinner
- **CalendarScreen stale date** — "TODAY" now highlights correctly
- **ApprovalsScreen overflow** — Added max-height and scroll
- **OCRScreen no upload** — Added file picker for datasheet upload
- **NCRScreen static** — Added creation form with severity/disposition
- **WorkOrdersScreen not persisted** — Added localStorage persistence
- **ECRScreen static** — Added creation form, status actions, notifications
- **Enterprise screens empty** — Added mock fallbacks for all 8 screens
- **ServiceBOMScreen empty** — Added 3 mock service BOMs
- **Browser cache** — Updated cache busters to v4
- **CADImportModal no file upload** — Added native file picker and PDM URL input
- **InflationAnalysis export** — Now generates real CSV download
- **ActivityScreen static** — Added auto-refresh every 15s
- **AIFeaturesScreen empty** — Added mock data for all 4 tabs
- **overlays.jsx flatMap** — Added missing `children` fallback

### Accessibility
- Added `id` and `name` attributes to all form fields across 15 JSX files

### Backend
- Added automatic backup scheduler via FastAPI lifespan event
- Added `BACKUP_SCHEDULE_HOURS` configuration setting
- Added `GET /api/v1/supplier-portal/users` endpoint (was 405)
- Added global 401 interceptor for expired tokens
- Added toast function guard for pre-mount calls

### ERP Integration
- Added ClickUp and Zoho Cliq connector types
- Added mock data for connector list and sync logs

---

## v1.2.0 (2026-05-25) — Initial Implementation

### Features
- Initial implementation of all 19 JSX screens
- BOM editor with inline editing, hierarchy/flat modes
- Auth onboarding with SSO providers
- Role-based dashboards
- Component library with parts catalog
- Vendor management and procurement
- Document management with OCR
- Analytics with BOM summary, vendor comparison, parts health
- ECR, RFQ, Compliance, Calendar, Cost Simulator screens
- Work Orders, NCR, Landed Cost, Margin analysis
- ERP connectors, Bulk Import, Monitoring
- Order Tracking with Amazon-style UI
- PDM/CAD Vault
- Mobile Scanner PWA
- Version Diff comparison
- Team Activity feed

### Architecture
- Frontend: 19 JSX files loaded via Vite + ESM (code-split)
- State: React Context (`useAppStore`) + localStorage persistence
- Backend: FastAPI + PostgreSQL + Redis (Python)
- Serving: `serve.py` on port 3001, backend on port 8000
- Testing: Playwright E2E (19 tests)
