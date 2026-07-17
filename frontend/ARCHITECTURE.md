# Blackbox BOM — Technical Architecture

## System Overview

Blackbox BOM is a Bill of Materials management platform with a React SPA frontend and FastAPI backend.

### Key Architectural Changes (v1.11.0)
- **N+1 queries eliminated**: BOM explosion, cost rollup, where-used now batch-load parts/ancestors/BOMs in 2 queries per endpoint (was N+1 per item)
- **Redis caching applied**: All expensive BOM endpoints use `cache_get`/`cache_set` with 5min TTL
- **Metrics fixed**: HTTP middleware no longer records request duration as DB query time. SQLAlchemy event listeners (`before_cursor_execute`/`after_cursor_execute`) track actual query durations.
- **FTS search deployed**: Parts/vendors search uses `to_tsvector`/`plainto_tsquery` with `ts_rank` scoring + ILIKE fallback (was ILIKE-only)
- **Configurable pool**: `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` from env vars with `pool_recycle=3600`
- **Docker layer caching**: pip deps cached before app code copy
- **PostgreSQL timeouts**: `statement_timeout=30s`, `idle_in_transaction_session_timeout=60s`
- **Redis auth**: Password-protected Redis with healthcheck
- **Backup volumes**: Persistent `redis_data` and `backup_data` volumes
- **APScheduler**: Backup scheduler uses `AsyncIOScheduler` + `CronTrigger` (legacy fallback)
- **restore_wizard.py PGPASSWORD fix**: All subprocess calls use isolated `_get_pg_env()` env dict instead of connection strings with embedded passwords

### Key Architectural Changes (v1.10.0)
- **SQL injection eliminated**: `encryption.py` validates SQL identifiers via regex `^[a-zA-Z_][a-zA-Z0-9_]*$` before f-string interpolation
- **SECRET_KEY persistence enforced**: Startup raises `RuntimeError` if `.secret_key` unwritable (was silently generating new key on each restart)
- **Token expiry reduced**: 30 minutes (was 8 days), matching industry standard
- **CSRF hardened**: `httponly=True`, `secure=True` in production, broad supplier-portal exemption removed
- **Rate limiting fixed**: Uses `X-Forwarded-For` header for real client IP behind nginx
- **PGPASSWORD leak fixed**: subprocess `env` parameter instead of `os.environ`
- **Nginx security headers**: HSTS, CSP, X-Frame-Options, nosniff, Permissions-Policy
- **Sanitization fixed**: No longer HTML-escapes JSON body data (was corrupting `<`, `>`, `&`); only strips control chars
- **Database schema hardened**: All tables in migrations (boms, bom_items_master), FKs on documents, 30+ indexes, 7 unique constraints, JSON columns normalized
- **Models aligned**: audit_log.py uses `JSON` for changes, `createdAt` column name, `userIp`; document.py has `isPublic`, `purchaseOrderId`, `replacesDocumentId`

### Key Architectural Changes (v1.9.0)

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (SPA)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ 19 JSX files │  │ Babel Standalone │ │ data.js   │ │
│  │ (no bundler) │  │ v7.29.7          │ │ (static)  │ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │
│         └────────────────┼─────────────────┘        │
│                          ▼                           │
│              ┌───────────────────────┐               │
│              │  React Context Store  │               │
│              │  (useAppStore/AppCtx) │               │
│              └───────────┬───────────┘               │
│                          │ writes                    │
│                          ▼                           │
│              ┌───────────────────────┐               │
│              │   localStorage        │               │
│              └───────────────────────┘               │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/REST
                       ▼
┌─────────────────────────────────────────────────────┐
│                Backend (FastAPI)                      │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ PostgreSQL  │  │    Redis     │  │  Python 3.11 │ │
│  └────────────┘  └──────────────┘  └──────────────┘ │
│  Port: 8000                                          │
└─────────────────────────────────────────────────────┘
```

## Design Patterns

### 1. Global Namespace Pollution (No Module System)
All 19 JSX files use `<script type="text/babel">` and attach to `window.*`:
- `window.BOM_DATA` — Static sample data
- `window.useAppStore()` — React Context hook
- `window.toast()` — Toast notifications
- `window.openModal()` — Modal dispatcher
- `window.PartDetail*` — Part detail drawer
- `window.ICON_*` — SVG icon functions
- `window.bulkImportAPI`, `window.monitoringAPI` — API stubs
- `window.ErrorBoundary` — React error boundary
- `window.Skeleton`, `window.SkeletonTable`, `window.SkeletonCards` — Loading skeletons
- `window.EmptyState`, `window.LoadingState`, `window.ErrorState` — State components
- `window.keyboardShortcuts` — Keyboard shortcut manager
- `window.sanitize` — Input sanitization
- `window.csrf` — CSRF token management
- `window.rateLimiter` — Frontend rate limiting
- `window.perf` — Performance monitoring
- `window.a11y` — Accessibility utilities
- `window.normalize` — Data normalization
- `window.fetchWithRetry` — Retry-capable fetch

**Trade-off**: Simple deployment (no build step), but no tree-shaking, no type safety, no code splitting.

### 2. Single-Source State
- **Primary store**: React Context (`AppCtx`) in `overlays.jsx:6-8`, provided in `app.jsx:699`
- **Persistence**: `localStorage` written as side-effect in `app.jsx:530`
- **Static fallback**: `window.BOM_DATA` from `data.js` (never updated)
- **Rule**: All screens must read from `ctx` (via `window.useAppStore()`), NOT from `window.BOM_DATA`

### 3. Modal/Screen Registry
- `app.jsx:1-110` defines stub fallbacks for 76 modals and 17 screens
- Each JSX file overwrites its stubs on load
- `openModal(name, props)` in `app.jsx:115-130` dispatches to the correct modal
- `setScreen(name)` in `app.jsx:370-380` routes to screen components

### 4. Icon System
- `icons.jsx` defines 50+ SVG icon functions on `window.Icon.*`
- Each returns an `<svg>` element with `size` and `color` props
- Used throughout all files as `<Icon.Name size={14}/>`

### 5. Error Boundary Pattern
- `ErrorBoundary` class component catches React rendering errors
- Wraps entire app in `app.jsx:1623`
- Shows fallback UI with retry button
- Logs errors to console and shows toast notification

### 6. Circuit Breaker Pattern
- API layer tracks failures per endpoint group
- 5 failures within 30 seconds opens the circuit
- Circuit blocks requests for 30 seconds cooldown
- Successful request resets failure count

### 7. Retry with Backoff
- API requests retry up to 2 times on failure
- Exponential backoff: 500ms, 1000ms, 1500ms
- 429 responses respect Retry-After header
- Unauthorized (401) responses don't retry

### 8. Security Headers Pattern
- CSP restricts script/style/connect sources
- X-Frame-Options prevents clickjacking
- X-Content-Type-Options prevents MIME sniffing
- Referrer-Policy controls referer leakage
- Permissions-Policy disables unused APIs
- COOP/COEP/CORP for cross-origin isolation

### 9. Component Composition Pattern
- `withErrorBoundary` — Wraps component with error boundary
- `withLoading` — Shows loading state while data loads
- `withEmpty` — Shows empty state when no data
- `withError` — Shows error state when error occurs
- HOCs compose for consistent UI patterns

### 10. Virtual Scrolling Pattern
- `VirtualList` renders only visible items
- IntersectionObserver for lazy loading
- ResizeObserver for container height tracking
- Overscan buffer for smooth scrolling

### 11. Security Audit Pattern
- All auth events logged with timestamp/URL/user-agent
- Exportable audit log as JSON
- Console logging in non-production environments

### 12. Data Export Pattern
- CSV export with proper escaping
- JSON export with formatting
- Excel export via HTML table

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React (UMD) | 18.x via CDN |
| Transpilation | Babel Standalone | 7.29.7 |
| Styling | Vanilla CSS | Custom properties |
| Backend | FastAPI | 0.104+ |
| Database | PostgreSQL | 15+ |
| Cache | Redis | 7+ |
| Python | Python | 3.11+ |
| HTTP Server | Python http.server | 3001 |
| Build (optional) | Vite | 6.4.3 |

## Database Architecture

### PostgreSQL Tables (Backend)
- `users` — User accounts with roles (engineer, buyer, manager, admin)
- `boms` — Bill of Materials headers
- `bom_items` — BOM line items (part, quantity, cost)
- `parts` — Component catalog
- `vendors` — Supplier information
- `purchase_orders` — PO headers
- `po_items` — PO line items
- `documents` — File attachments
- `comments` — Threaded comments on parts
- `audit_log` — Change history
- `api_keys` — API authentication tokens
- `notifications` — User notification queue

### Redis Keys
- `session:{token}` — Active sessions
- `cache:bom:{id}` — Cached BOM data
- `rate_limit:{ip}` — API rate limiting

## API Architecture

### Endpoints (Backend on :8000)
```
POST   /api/v1/auth/login
POST   /api/v1/auth/register
GET    /api/v1/boms
POST   /api/v1/boms
GET    /api/v1/boms/{id}
PUT    /api/v1/boms/{id}
DELETE /api/v1/boms/{id}
GET    /api/v1/parts
POST   /api/v1/parts
GET    /api/v1/vendors
POST   /api/v1/vendors
GET    /api/v1/purchase-orders
POST   /api/v1/purchase-orders
GET    /api/v1/documents
POST   /api/v1/documents/upload
GET    /api/v1/analytics/summary
GET    /api/v1/health
```

### Frontend API Layer (`api.js`)
- `window.api` — Main API wrapper with auth token injection
- `window.bulkImportAPI` — Bulk import operations
- `window.monitoringAPI` — System monitoring
- All methods return Promises; 401 interceptor auto-refreshes tokens

## Security Architecture

### Frontend
- Auth tokens stored in `localStorage`
- `api.js` injects `Authorization: Bearer` header on all requests
- 401 interceptor clears token and redirects to login
- No secrets in frontend code

### Backend
- JWT tokens with 30min expiry
- bcrypt password hashing
- CORS restricted to frontend origin
- Rate limiting via Redis (X-Forwarded-For aware)
- Input validation via Pydantic models
- CSRF protection with httponly, signed cookies
- SQL injection prevention via identifier validation
- Subprocess PGPASSWORD via isolated env (no os.environ leak)

## Deployment Architecture

### Development
```
Frontend: python serve.py (port 3001, serves index.babel.html)
Backend:  uvicorn main:app (port 8000, hot reload)
```

### Production
```
Frontend: Nginx serves static files from dist/
Backend:  Gunicorn + Uvicorn workers
Database: Managed PostgreSQL (AWS RDS / GCP Cloud SQL)
Cache:    Managed Redis (AWS ElastiCache / GCP Memorystore)
```

## Scalability Considerations

1. **Frontend**: No code splitting — all 19 files load on startup (~848KB JS). Could add lazy loading with Vite.
2. **Backend**: Stateless API servers behind load balancer. Session state in Redis.
3. **Database**: Read replicas for analytics queries. Connection pooling via PgBouncer.
4. **Cache**: Redis cluster for high availability.

## Reliability

- **Backend backup scheduler**: Automatic backups every N hours (configurable via `BACKUP_SCHEDULE_HOURS`)
- **Frontend fallbacks**: All screens/modals have stub fallbacks that render "Module not loaded" instead of crashing
- **Toast guard**: `window.toast` has null-check for pre-mount calls
- **API error handling**: All fetch calls wrapped in try/catch with toast notifications

### Key Architectural Changes (v1.26.0)
- **6 JSON columns normalized into 4 relational tables**: `revisions.bomSnapshot` → `revision_bom_snapshot_items`, `custom_attribute_definitions.options` → `custom_attribute_options`, `custom_attribute_definitions.validation_rules` → `custom_attribute_validation_rules`, `eco_items.old_value`/`eco_items.new_value` → `eco_item_attribute_changes`. All new tables have proper FK constraints with CASCADE deletes, indexes, and tenant isolation via `TenantAwareMixin`.
- **`bom_templates.bomData` marked deprecated**: The `bom_items` table (created in v1.10.0) already normalizes this data. `BomTemplate.bomDataComputed` hybrid property provides backward-compatible read access through the normalized relationship.
- **Hybrid properties for backward compatibility**: `BomTemplate.bomDataComputed`, `Revision.bomSnapshotComputed`, `CustomAttributeDefinition.options_list`, and `CustomAttributeDefinition.validation_rules_list` expose normalized data in the same shape as the legacy JSON columns.
- **Dual-write pattern**: Endpoints that modify data (custom attributes, ECO items) now write to both legacy JSON columns and new normalized tables during the deprecation phase. This ensures zero breaking changes.

### Key Architectural Changes (v1.32.0 — Security Hardening)
- **SQL injection eliminated**: `analytics.py` and `dashboard_service.py` — all f-string SQL queries with `tenantId` replaced with SQLAlchemy bound parameters. 85+ injection points eliminated.
- **JWT algorithm confusion fixed**: `security.py:127-128` — removed HS256 fallback when using RS256 keys. Token verification now only accepts the configured algorithm.
- **Backup MFA enforcement**: `backup.py` — all 9 backup endpoints migrated from `get_current_user` + manual `isSuperuser` to `Depends(get_current_superuser)`, which requires MFA in production.
- **Session timeout JWT key fixed**: `session_timeout.py` now uses `_get_jwt_verify_key()` for RS256-compatible token verification instead of `settings.SECRET_KEY`.
- **Constraint alignment**: `backup_history.py` — 3 CheckConstraints expanded to match actual code values (`verified`, `schema_only`, `passed`).
- **Secret key protection**: `.secret_key` files deleted and added to `.gitignore`.
- **Webhook tenant isolation**: All webhook endpoints now inject `current_user` and the service layer filters by `tenantId` for non-superusers.

### Key Architectural Changes (v1.25.0)
- **All stubbed endpoints eliminated**: 6 endpoint files rewritten with real DB queries. SolidWorks integration migrated from in-memory dicts to PostgreSQL persistence. ~1100 lines of hardcoded data removed.
- **Multi-tenancy gap closed**: 5 child models (CapaAttachment, FaiCharacteristic, DeviationLot, SerialNumberEvent, ContractParts) now extend `TenantAwareMixin`. Cross-tenant data leakage vectors eliminated.
- **Database referential integrity**: 4 association tables (part_tags, part_compliance, user_roles, role_permissions) now have `ondelete="CASCADE"` on all foreign keys. Orphaned rows prevention.
- **JWT library migration**: `python-jose` replaced with `PyJWT` across security.py and session_timeout.py. Unmaintained dependency (last release 2021) replaced with actively maintained alternative.
- **HTTPS enforcement**: Nginx rewritten for HTTPS-only operation with HTTP→301 redirect. TLS 1.2/1.3, modern ciphers, HSTS. Self-signed SSL certificate generator created.
- **CSP hardening**: `'unsafe-eval'` removed from Content-Security-Policy. Violation reporting via `report-uri /api/v1/csp-report`.
- **Model completeness**: 56 model classes across ~30 files now have `__repr__` implementations. AST-based script created for future maintenance.

### Key Architectural Changes (v1.21.0)
- **Polymorphic FK enforcement**: 10 models (AuditLog, Notification, Revision, Approval, Comment, ValidationResult, InventoryTransaction, InventoryReservation, DigitalSignature, NotificationQueue) now enforce `entityType`/`reference_type`/`document_type` values via `before_insert`/`before_update` ORM events with `ALLOWED_ENTITY_TYPES`/`ALLOWED_REFERENCE_TYPES`/`ALLOWED_DOCUMENT_TYPES` sets. Composite indexes added for polymorphic lookup performance.
- **Multi-tenancy SELECT isolation**: `do_orm_execute` event listener in `core/tenant_events.py` automatically injects `WHERE tenantId = :current_tenant` on ALL SELECT queries for `TenantAwareMixin` models. Previously only INSERT had tenant isolation — cross-tenant data leakage was possible. Superusers bypass filter (tenantId = None).
- **pg_basebackup for PITR**: `BackupType.PHYSICAL` added to backup system using `pg_basebackup -Ft -z -X stream`. Physical backups capture full cluster state including transaction IDs, enabling WAL replay. New endpoint `POST /api/v1/backup/physical` for on-demand triggers. Pipeline endpoint `POST /api/v1/backup/pipeline` accepts `include_physical=true`.
- **Frontend style migration**: 531 inline styles converted to utility classes (~40% of ~2112 baseline) across 13 JSX files. 30 new CSS utility classes added (~110 total). `scripts/convert_inline_styles.py` created for automated batch conversion.

### Key Architectural Changes (v1.18.0)
- **Broken migration chain fixed**: `018_account_lockout_and_audit.py` `down_revision` corrected from `"017"` to `"017_remove_part_legacy_json_columns"`. All 19 migrations now form a consistent chain.
- **Startup health check**: Automatic database and backup system verification on every application start. WAL archiving and archive mode verified.
- **`GET /health` endpoint**: Public health endpoint for load balancer integration. Returns database and backup system health status.
- **WAL archiving confirmed**: `postgresql.conf` already configured with `wal_level=replica`, `archive_mode=on`, `archive_command` set. Point-in-time recovery infrastructure is in place.

## Future Architecture Roadmap

1. **Vite migration**: Build to bundle JSX files, enable tree-shaking and code splitting
2. **TypeScript**: Add type safety across 19 JSX files
3. **State management**: Replace React Context with Zustand or Redux Toolkit
4. **WebSocket**: Real-time collaboration via WebSocket connections
5. **Micro-frontends**: Split into独立 deployable modules

### Key Architectural Changes (v1.37.0)

**API Completeness**
- All 39 PUT routes now have corresponding PATCH endpoints (27 new, 12 pre-existing)
- 4 bulk DELETE operations added using SQL `IN` clause with tenant scoping
- Total route count: 466 (191 GET, 171 POST, 39 PUT, 31 PATCH, 34 DELETE) across 61 endpoint files
- vendrors.py bug: PUT handler was an empty stub (line 20-23 only docstring) — fixed with full DB logic

**Dev Dockerfile Security Hardening**
- Added `USER bom` directive with `groupadd -r bom && useradd -r -g bom`
- Added `tini` as init process via `ENTRYPOINT ["/usr/bin/tini", "--"]`
- Added `/app/logs` directory with `chown -R bom:bom /app`
- Matches production Dockerfile.prod security posture

**Frontend — Modal & Screen Component Extraction**
- 17 modal components extracted from `src/root/modals-extra.jsx` (2361→151 lines) into `src/components/modals/`
- `src/components/modals/index.jsx` created as re-export hub (handles mixed default/named exports)
- `globals.js` import path changed: `./root/modals-extra.jsx` → `./components/modals/index.jsx`
- `modals-extra.jsx` converted to backward-compat shim: imports from components/ → assigns to `window.*` → re-exports
- 2 internal-only modals (AuditLogModal, APIKeysModal) remain in `modals-extra.jsx` as inline definitions
- 7 screen components extracted from `src/root/secondary-screens.jsx` (1760→11 lines) into `src/components/screens/`
- `src/components/screens/index.jsx` created as re-export hub
- `secondary-screens.jsx` converted to backward-compat shim
- 2 of 23 flat JSX files refactored; 21 files (~13,000 lines) remain in `src/root/`

**Route Distribution**

| Method | Count | % of Total |
|--------|-------|-----------|
| GET | 191 | 41.0% |
| POST | 171 | 36.7% |
| PUT | 39 | 8.4% |
| PATCH | 31 | 6.6% |
| DELETE | 34 | 7.3% |
| **Total** | **466** | **100%** |

### Key Architectural Changes (v1.44.0)
- **CalendarEvents model + API**: New model with tenant-aware mixin, CRUD endpoints with date filtering, composite indexes
- **UserDataStore unique constraints**: Added `UniqueConstraint` across 4 user_data tables enabling PostgreSQL `ON CONFLICT` upsert — previously relied on application-level dedup
- **API client expansion**: Added 6 new API client modules to the centralized `api.js` — workOrders, eco, inventory, quality, userDataSync, calendarEvents
- **Port alignment**: `frontend/api.js` `API_BASE` aligned to port 8000 (was 8002, mismatching backend docker-compose)

### Key Architectural Changes (v1.46.0 — React Router Migration)

- **Manual routing → React Router**: Replaced 36 `{route === "x" && <Screen/>}` conditional rendering checks with proper `<Routes><Route path="/x" element={<Wrapper/>}/></Routes>` pattern. This eliminates React reconciliation warnings caused by conditional rendering of sibling screens.
- **Screen wrapper pattern**: 9 wrapper components (`DashboardWrapper`, `BomShellWrapper`, etc.) extract props from `AppContext` via `React.useContext(AppContext)` instead of inline prop drilling. `GenericScreen({ Component })` handles 22 screens without prop requirements.
- **404 handling**: `<Route path="*" element={<FourOhFour/>}/>` renders `ErrorScreen` for unregistered routes.
- **Backward compatibility**: `route` variable derived from `useLocation().pathname` retained in `AppCtx` for `NavRail` active-state highlighting, `findNav()` label resolution, and `useKeyboardShortcuts` routing.
- **App.jsx reduced**: ~722 lines → 293 lines (59% reduction).
- **Build**: 0 warnings, 162 modules, 2.04s.

### Key Architectural Changes (v1.47.0)

**Screen Data Bridge Layer**
- Created `frontend/src/services/screenDataBridge.js` — centralized data access bridge that unifies all `window.api.*` calls behind a single interface with localStorage fallback
- Covers 25+ data domains with 60+ backend endpoint routers — every frontend screen now routes data through the bridge
- `dataService.js` integrated with the bridge, adding 5 new domains (ecrs, templates, documents, poDrafts, vendorUsers) to its refresh/sync methods
- Eliminates ad-hoc `window.api.*` calls scattered across screens — all data access flows through a consistent get/save/delete pattern

**Database — Migration 028**
- 51 foreign key constraints updated with `ON DELETE CASCADE` across tables from migrations 001-004
- Migration 022 fixed: replaced `Base.metadata.create_all()` with explicit `op.execute()` for 9 tables — eliminates the deprecated create_all safety net

**CI/CD Pipeline Redesign**
- Production deployment decoupled from main branch — deploys only on version tags (`v*.*.*`)
- Frontend tests (`npx vitest run`) added to root CI workflow as a required check

**Mock Data Purge**
- All 52+ mock/MOCK references removed from production code paths
- Files cleaned: constants.js, integration-screens.jsx, enterprise-screens.jsx, ProcurementScreen.jsx, DocumentsScreen.jsx, config.js, AppCtx.jsx, TopBar.jsx, en.json, ja.json

**BBF Branding**
- Montserrat font integrated via Google Fonts in index.html and styles.css
- BBF color palette applied: navy `#001F3F` (backgrounds), orange `#FF6B35` (accents), light `#F5F5F5`, white `#FFFFFF`, dark `#333333`
- `///` heading prefix convention adopted for all document and UI headings
- `<<` double-chevron motif applied to brand header and page title

### Key Architectural Changes (v1.48.0)
- **SQLite code paths removed**: `analytics.py` no longer has `_is_sqlite()` branching. Both `/dashboard` and `/trends` endpoints now use only PostgreSQL date functions (`TO_CHAR`, `NOW()`). Simplifies testing and eliminates dead code.
- **Locale files expanded**: 4 new locale files (`zh.json`, `de.json`, `fr.json`, `es.json`) added to support enterprise global deployment. Total locales: 6.
- **Deprecated test prototype deleted**: `tests/BOM manager test v1/` (34K files, 636MB) removed — eliminates SQLite/Prisma schema drift risk and credential leakage surface.

### Key Architectural Changes (v1.45.0)
- **PostgreSQL test database**: Created `docker-compose.test.yml` with isolated PostgreSQL (port 5433, avoiding dev 5432) + Redis (port 6380) for running tests against production-like database
- **Auto-detection in conftest.py**: Both `backend/app/tests/conftest.py` and `backend/tests/conftest.py` now auto-detect PostgreSQL from `POSTGRES_SERVER` or `CI` env vars. Connection URL is constructed from `POSTGRES_USER/PASSWORD/DB/PORT` env vars. Falls back to SQLite with `warnings.warn()` deprecation notice.
- **CI now tests against PostgreSQL**: Both CI workflows set `TEST_DATABASE_URL` explicitly — previously tests ran against SQLite despite PostgreSQL service containers being available
