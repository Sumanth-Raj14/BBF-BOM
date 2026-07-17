# Blackbox BOM — Module Reference

## Frontend Modules

### 1. `src/screens/App.jsx` — Application Shell (293 lines, v1.46.0 refactored)
- **Purpose**: Root component, routing via React Router, navigation, modal system, state provider
- **Responsibilities**: Screen routing via `<Routes><Route>`, modal dispatch, BOM search, notification bell, user profile menu, theme settings
- **Public Interface**: `App` (default export), `AppShell` component with `useLocation()` routing
- **Internal Logic**: 36 routes via `<Route path="..." element={...}/>`, 9 screen wrapper components for prop extraction, `GenericScreen({ Component })` for 22 zero-prop screens, `FourOhFour` 404 catch-all
- **Dependencies**: React Router (`react-router-dom`), `AppCtxProvider`, 23 lazy-loaded screen components, TopBar, NavRail, ModalsHost
- **Configuration**: Route paths matching nav groups, tweaks panel (theme/density/accent)
- **Failure Modes**: `ErrBD` HOC wraps every screen with `ErrorBoundary`; 404 catch-all renders `ErrorScreen`
- **Security**: Auth token management, 401 interceptor, role-based access control

### 2. `overlays.jsx` — UI Primitives (1077 lines)
- **Purpose**: Toast notifications, modals, dropdowns, App context, save-view modal
- **Responsibilities**: `ToastHost` (auto-dismiss 3.4s), `Modal` (Escape key, overlay click), `DropdownButton`, `AppCtx` definition
- **Public Interface**: `window.useAppStore()`, `window.toast(msg, opts)`, `window.toast.dismiss(id)`, `window.DropdownButton`
- **Internal Logic**: Toast queue with unique IDs, modal focus trap, dropdown position calculation
- **Dependencies**: React, Icon library
- **Configuration**: Toast duration (default 3400ms), modal z-index (9999)
- **Failure Modes**: Toast guard for pre-mount calls, null-check on `ctx`

### 3. `bom-editor.jsx` — BOM Table Editor (620 lines)
- **Purpose**: Inline BOM editing with hierarchy/flat modes
- **Responsibilities**: Cell editing, row operations, bulk edit, hierarchy toggle, drag reorder, Add Item button
- **Public Interface**: `BomEditor` component, `BomShell` (wrapped in app.jsx)
- **Internal Logic**: Inline contentEditable cells, undo stack, flat/hierarchy mode toggle
- **Dependencies**: AppCtx (useAppStore), data.js, icons
- **Configuration**: Column widths, status classes, editable fields
- **Failure Modes**: Fallback to read-only if context unavailable

### 4. `parts-screen.jsx` — Component Library (642 lines)
- **Purpose**: Full parts catalog with facets, search, grid/list, duplicate detection
- **Responsibilities**: `buildCatalog()`, `detectDuplicates()`, PartsScreen, PartsGrid, PartsList, PartFilters
- **Public Interface**: `PartsScreen` component with `openModal` and `onOpenDetail` props
- **Internal Logic**: BOM tree flattening, 8 library-only parts, name-similarity duplicate detection
- **Dependencies**: AppCtx, BOM_DATA, data.js, DropdownButton, Sparkline
- **Configuration**: STATUS_CLASS mapping, category colors
- **Failure Modes**: Falls back to BOM_DATA if context unavailable

### 5. `secondary-screens.jsx` — Vendors, Procurement, Documents, OCR, Analytics, Activity, Diff (1580+ lines)
- **Purpose**: Multi-screen module for vendor management, procurement, documents, analytics
- **Responsibilities**: VendorList, POList, DocumentList, OCRScreen, AnalyticsScreen, ActivityScreen, VersionDiff
- **Public Interface**: Each screen is a standalone component
- **Internal Logic**: ActivityScreen auto-refresh every 15s, OCR file upload, Analytics with BOM summary/vendor comparison/parts health
- **Dependencies**: AppCtx, BOM_DATA, api.js, icons
- **Configuration**: Activity polling interval (15s), analytics chart dimensions
- **Failure Modes**: Mock data fallback when backend offline

### 6. `advanced-features.jsx` — ECR, RFQ, Compliance, AI, Calendar, Cost, Alerts (1080+ lines)
- **Purpose**: Engineering change requests, RFQ, compliance tracking, AI features, calendar, cost analysis
- **Responsibilities**: ECRScreen (create/status actions), RFQCompareModal, ComplianceScreen, CalendarScreen, CostSimulatorModal, PriceAlertsModal, InflationAnalysisModal
- **Public Interface**: Each screen/modal is a standalone component
- **Internal Logic**: Calendar uses `new Date()` for today highlight, InflationAnalysis generates CSV export
- **Dependencies**: AppCtx, BOM_DATA, icons
- **Configuration**: Inflation categories, ECR status workflow
- **Failure Modes**: CostSimulator uses `useAppStore` for live data

### 7. `power-features.jsx` — WorkOrders, NCR, LandedCost, Margin, Share, Webhooks, Reports (780+ lines)
- **Purpose**: Work orders, non-conformance, cost analysis, sharing, webhooks, scheduled reports
- **Responsibilities**: WorkOrdersScreen (localStorage persistence), NCRScreen (create form), LandedCostModal, MarginModal, ShareLinkModal, WebhooksModal, ScheduledReportsModal
- **Public Interface**: Each screen/modal is a standalone component
- **Internal Logic**: WorkOrders persist to localStorage, NCR has severity/disposition fields
- **Dependencies**: AppCtx, BOM_DATA, icons
- **Configuration**: NCR severity levels, landed cost rates by country
- **Failure Modes**: Fallback data when backend offline

### 8. `integration-screens.jsx` — Webhooks, BulkImport, ERP, SupplierPortal, AI, Monitoring, OrderTracking (1260+ lines)
- **Purpose**: External integrations, bulk operations, ERP connectors, AI features, monitoring
- **Responsibilities**: WebhooksScreen, BulkImportScreen, ERPConnectorsScreen (ClickUp/Cliq), SupplierPortalScreen, AIFeaturesScreen, MonitoringScreen, OrderTrackingScreen
- **Public Interface**: Each screen is a standalone component
- **Internal Logic**: ERP connectors include ClickUp and Zoho Cliq with mock data, AI has 4 tabs (forecast, interchange, validation, automation), Monitoring has auto-refresh
- **Dependencies**: AppCtx, window.bulkImportAPI, window.monitoringAPI, icons
- **Configuration**: Connector types, AI mock data
- **Failure Modes**: Mock data fallbacks for all AI tabs, connector list

### 9. `enterprise-screens.jsx` — ServiceBOM, Routing, WorkCenters, Labor, Currency, Compliance, CustomAttrs, APIKeys, Dashboards (970+ lines)
- **Purpose**: Enterprise manufacturing and admin features
- **Responsibilities**: ServiceBOMScreen, RoutingScreen, WorkCentersScreen, LaborScreen, CurrencyScreen, ComplianceCertScreen, CustomAttrsScreen, APIKeysScreen, DashboardsScreen
- **Public Interface**: Each screen is a standalone component
- **Internal Logic**: All 8 screens have mock fallback data, loading states, create buttons
- **Dependencies**: AppCtx, icons
- **Configuration**: Currency rates, compliance schemes, auto-numbering rules
- **Failure Modes**: Mock data when backend offline, loading spinner during fetch

### 10. `modals-extra.jsx` — PO Detail, Vendor Detail, CAD, Barcode, Search, Profile, Settings, Help (2130+ lines)
- **Purpose**: Detail modals and utility screens
- **Responsibilities**: PODetailModal, VendorDetailModal, CADImportModal, BarcodeScanModal, GlobalSearchModal, ProfileModal, SettingsModal, HelpModal, ImportRFQsModal, QuoteHistoryModal, AutoScrapeModal, ChangeOwnerModal, AuditLogModal, APIKeysModal, BulkImportModal, CADRevisionsModal, CADWhereUsedModal, CADMarkupModal, CADAttrsModal, CADSyncModal, DrawingReleaseModal, BulkEditModal
- **Public Interface**: Each modal is a standalone component
- **Internal Logic**: CADImportModal has native file picker (.sldasm/.step) + PDM URL input, APIKeysModal has key generation/revocation
- **Dependencies**: AppCtx, BOM_DATA, icons
- **Configuration**: CAD file types, API key expiration
- **Failure Modes**: Fallback data for API keys and templates

### 11. `final-polish.jsx` — Approvals, Roadmap, BulkVendorImport, NotifPrefs (400+ lines)
- **Purpose**: Approval queue, roadmap, bulk vendor import, notification preferences
- **Responsibilities**: ApprovalsScreen (max-height scroll), RoadmapModal, BulkVendorImportModal, NotifPrefsModal
- **Public Interface**: Each component is standalone
- **Internal Logic**: ApprovalsScreen has filtered view (All/Mine/Pending/Approved/Rejected)
- **Dependencies**: AppCtx, icons
- **Configuration**: Approval filter options, notification preferences
- **Failure Modes**: Fallback empty states

### 12. `dashboard.jsx` — Role-Based Dashboard (350+ lines)
- **Purpose**: KPIs, budget tracking, recent activity, quick actions
- **Responsibilities**: DashboardScreen with role-specific views (Engineer, Buyer, Manager)
- **Public Interface**: `DashboardScreen` component
- **Internal Logic**: WORSPACE_BUDGET tracking, sparkline charts, editing budget inline
- **Dependencies**: AppCtx, BOM_DATA, icons
- **Configuration**: Role-based KPI sets, budget categories
- **Failure Modes**: Fallback to default KPIs

### 13. `detail-drawer.jsx` — Component Detail Drawer (700+ lines)
- **Purpose**: Side panel for part details, comments, specifications
- **Responsibilities**: PartDetailDrawer with tabs (Overview, Specs, Where Used, Comments), threaded comments with @mention
- **Public Interface**: `PartDetailDrawer` component, `window.PartDetail*` globals
- **Internal Logic**: Comment posting with decision flagging, file attachment, @mention autocomplete
- **Dependencies**: AppCtx, BOM_DATA, icons
- **Configuration**: Tab order, comment threading
- **Failure Modes**: Read-only mode if context unavailable

### 14. `auth-onboarding.jsx` — Authentication & Onboarding (400+ lines)
- **Purpose**: Login/signup, SSO providers, onboarding wizard
- **Responsibilities**: AuthScreen, OnboardingChecklist, team invite, workspace setup
- **Public Interface**: `AuthScreen` component
- **Internal Logic**: SSO providers (Google, GitHub, Microsoft, GitLab), BOM template selection
- **Dependencies**: icons
- **Configuration**: SSO provider list, onboarding steps
- **Failure Modes**: Fallback to email auth if SSO fails

### 15. `pdm-cad.jsx` — PDM/CAD Vault (300+ lines)
- **Purpose**: Product data management, file versioning, 3D viewer
- **Responsibilities**: PDMVaultScreen, 3D model viewer with zoom/rotate, checkout/checkin
- **Public Interface**: `PDMVaultScreen` component
- **Internal Logic**: File tree navigation, checkout tracking, zoom controls
- **Dependencies**: icons
- **Configuration**: File type filters, viewer controls
- **Failure Modes**: Read-only if checkout fails

### 16. `mobile-scanner.jsx` — Mobile Scanner PWA (350+ lines)
- **Purpose**: Barcode scanning, mobile-optimized BOM lookup
- **Responsibilities**: MobileScannerScreen with camera integration
- **Public Interface**: `MobileScannerScreen` component
- **Internal Logic**: Camera API, barcode detection, PO list for scanning
- **Dependencies**: icons
- **Configuration**: Camera resolution, scan modes
- **Failure Modes**: Manual entry fallback if camera unavailable

### 17. `icons.jsx` — SVG Icon Library (300+ lines)
- **Purpose**: 50+ SVG icon functions
- **Public Interface**: `window.Icon.*` (Plus, Trash, Edit, Check, X, Search, Cart, etc.)
- **Internal Logic**: Each icon is a function returning `<svg>` with `size` and `color` props
- **Dependencies**: None
- **Configuration**: Default size 14, default color "currentColor"

### 18. `data.js` — Static Sample Data (250+ lines)
- **Purpose**: Sample BOM data, vendors, project metadata
- **Public Interface**: `window.BOM_DATA` with `rows`, `vendors`, `project`
- **Internal Logic**: Hierarchical BOM tree with assemblies and children
- **Dependencies**: None
- **Configuration**: 10 sample parts across 4 categories

### 19. `api.js` — API Layer (100+ lines)
- **Purpose**: HTTP client with auth token injection
- **Public Interface**: `window.api`, `window.bulkImportAPI`, `window.monitoringAPI`
- **Internal Logic**: 401 interceptor, token refresh, retry logic
- **Dependencies**: localStorage
- **Configuration**: Base URL (localhost:8000), timeout
- **Failure Modes**: Toast notifications for all errors

### 20. `styles.css` — Global Styles (2790+ lines)
- **Purpose**: CSS custom properties, component styles, responsive layout
- **Public Interface**: CSS variables (--bg, --fg, --accent, --r-1 through --r-5, etc.)
- **Internal Logic**: Focus-visible styles, touch targets (44px mobile), reduced-motion support, skip-link
- **Dependencies**: None
- **Configuration**: Theme variables, breakpoint at 768px
- **Failure Modes**: Fallback colors if CSS variables missing

## Backend Modules

### `core/cache.py` (NEW v1.9.0, ACTIVATED v1.11.0)
- **Redis caching layer** for expensive operations (BOM explosions, cost rollups)
- `get_redis()` — Get or create Redis connection pool (graceful fallback)
- `cache_get(key)` — Retrieve cached JSON value
- `cache_set(key, value, ttl)` — Store JSON value with TTL (default 300s)
- `cache_invalidate(pattern)` — Invalidate all keys matching glob pattern
- `cached(prefix, ttl)` — Decorator for automatic caching of async function results
- **Graceful degradation**: All operations return None/silent failure when Redis unavailable
- **Activated on**: `GET /{bom_id}/explosion`, `GET /{bom_id}/cost-rollup`, `GET /where-used/{part_id}`, `GET /where-used/{part_id}/tree` (all 5min TTL)

### `core/encryption.py` (AUDIT FIX v1.10.0)
- **Security fix**: SQL identifier validation via `_validate_identifier()` using regex `^[a-zA-Z_][a-zA-Z0-9_]*$`
- Prevents SQL injection in `encrypt_sensitive_fields()` and `decrypt_sensitive_fields()`

### `core/csrf.py` (AUDIT FIX v1.10.0)
- `httponly=True` (was `False` — token readable by JavaScript)
- `secure=True` in production (detected via config)
- Broad `/api/v1/supplier-portal/*` exemption removed

### `core/sanitize.py` (AUDIT FIX v1.10.0)
- Removed destructive `html.escape()` from JSON body processing
- Now only strips ASCII control characters (preserves `<`, `>`, `&` in text data)
- HTML escaping applied at output layer (templates/API responses) instead

### `core/rate_limit.py` (AUDIT FIX v1.10.0)
- Uses `X-Forwarded-For` header for real client IP behind nginx reverse proxy

### `core/security.py` (MIGRATED v1.25.0 — python-jose → PyJWT, FIXED v1.32.0 — Algorithm Confusion)
- **Migration**: `from jose import JWTError, jwt` → `import jwt`
- **Exception handling**: `except JWTError` → `except jwt.InvalidTokenError`
- **Why**: `python-jose` is unmaintained (last release 2021). PyJWT is actively maintained with security patches.
- **v1.32.0 fix**: Removed `supported.append("HS256")` in `verify_token()` — previously when configured for RS256, HS256 was added as a fallback, allowing token forgery with the RSA public key. Now only the configured algorithm is accepted.

### `core/session_timeout.py` (MIGRATED v1.25.0 — python-jose → PyJWT, FIXED v1.32.0 — Wrong JWT Key)
- Same migration pattern as security.py — JWT decoding now uses PyJWT
- Session timeout enforcement with 60-min inactivity limit
- **v1.32.0 fix**: Changed from `settings.SECRET_KEY` to `_get_jwt_verify_key()` for RS256-compatible token verification

### `api/endpoints/analytics.py` (FIXED v1.32.0 — SQL Injection)
- `_tenant_filter()` rewritten to `_tenant_filter_params()` returning `(clause, params_dict)` tuple
- All 15+ queries now pass `tenantId` as SQLAlchemy bind parameter instead of f-string interpolation
- Prevents SQL injection via JWT `tenantId` claim tampering

### `services/dashboard_service.py` (FIXED v1.32.0 — SQL Injection)
- `tenant_filter()` rewritten to `tenant_filter_params()` returning `(clause, params_dict)` tuple
- All 50+ queries across 4 dashboard functions use bound parameters
- `_count()` helper updated to accept and forward params dict

### `api/endpoints/backup.py` (FIXED v1.32.0 — MFA Bypass)
- All 9 endpoints changed from `Depends(get_current_user)` + manual `isSuperuser` → `Depends(get_current_superuser)`
- MFA now enforced for all backup operations in production
- 8 redundant manual permission check blocks removed

### `api/endpoints/webhooks.py` (FIXED v1.32.0 — Tenant Scoping)
- All 8 previously-untrusted endpoints now receive `current_user: User = Depends(get_current_user)`
- Passes `current_user` to service layer for tenant filtering

### `services/webhook_service.py` (FIXED v1.32.0 — Tenant Scoping)
- All CRUD functions updated to accept `current_user: User` parameter
- `list_subscriptions`: Filters by `tenantId` for non-superusers
- `get_subscription`, `update_subscription`, `delete_subscription`: Verify ownership for non-superusers
- `list_deliveries`: Joins with `WebhookSubscription` for tenant-scoped filtering
- `test_webhook`, `retry_delivery`: Verify subscription ownership for non-superusers

### `models/capa.py` (ENHANCED v1.25.0 — TenantAwareMixin on CapaAttachment)
- `CapaAttachment` now inherits from `(Base, TenantAwareMixin)` — prevents cross-tenant data leakage

### `models/fai.py` (ENHANCED v1.25.0 — TenantAwareMixin on FaiCharacteristic)
- `FaiCharacteristic` now inherits from `(Base, TenantAwareMixin)` — prevents cross-tenant data leakage

### `models/deviation.py` (ENHANCED v1.25.0 — TenantAwareMixin on DeviationLot)
- `DeviationLot` now inherits from `(Base, TenantAwareMixin)` — prevents cross-tenant data leakage

### `models/traceability.py` (ENHANCED v1.25.0 — TenantAwareMixin on SerialNumberEvent)
- `SerialNumberEvent` now inherits from `(Base, TenantAwareMixin)` — prevents cross-tenant data leakage

### `models/contract.py` (ENHANCED v1.25.0 — TenantAwareMixin on ContractParts)
- `ContractParts` now inherits from `(Base, TenantAwareMixin)` — prevents cross-tenant data leakage

### `models/part.py` (ENHANCED v1.25.0 — ondelete=CASCADE on association tables)
- `part_tags` table: Both foreign keys now have `ondelete="CASCADE"` — deleting a part or tag cleans up associations
- `part_compliance` table: Both foreign keys now have `ondelete="CASCADE"` — same cleanup behavior

### `models/role.py` (ENHANCED v1.25.0 — ondelete=CASCADE on association tables)
- `user_roles` table: Both foreign keys now have `ondelete="CASCADE"` — deleting a user or role cleans up associations
- `role_permissions` table: Both foreign keys now have `ondelete="CASCADE"` — deleting a role or permission cleans up associations

### `scripts/add_repr_to_models.py` (NEW v1.25.0)
- **AST-based script**: Scans all model files, finds SQLAlchemy classes without `__repr__`, adds generic implementation
- **56 model classes updated**: `return f"<{ClassName} {self.id}>"` for debugging and logging
- **Safe**: Only adds `__repr__` to classes that don't already have one

### `ssl/generate-certs.ps1` (NEW v1.25.0)
- **PowerShell script**: Generates self-signed CA + TLS certificate for development
- **365-day validity**: Suitable for development and staging environments
- **Usage**: Run before `docker-compose up` for HTTPS deployment

### `nginx.conf` (ENHANCED v1.25.0 — HTTPS + CSP hardening)
- **HTTPS server block**: New server block for port 443 with TLS 1.2/1.3, modern ciphers, HSTS
- **HTTP redirect**: Port 80 returns 301 redirect to HTTPS
- **CSP improved**: Removed `'unsafe-eval'` from script-src, added `report-uri /api/v1/csp-report`
- **Dual stack**: Both HTTP→HTTPS redirect and HTTPS server in single config

### `docker-compose.yml` (ENHANCED v1.25.0 — SSL volume + HTTPS port)
- Added `443:443` port mapping to nginx service
- Added `./ssl:/etc/nginx/ssl:ro` volume mount for certificate files

### `core/backup.py` (AUDIT FIX v1.10.0)
- Removed `os.environ["PGPASSWORD"]` leak (readable via `/proc/PID/environ`)
- All subprocess calls use `env` parameter with isolated environment dicts

### `core/pagination.py` (NEW v1.8.0, Expanded v1.9.0)
- **Enterprise pagination utility** for all list endpoints
- `PageParams` — Pydantic model with `page`, `per_page`, `sort_by`, `sort_dir`
- `get_page_params()` — FastAPI dependency for page/per_page/sort query params
- `paginate(db, query, page_params)` — Executes count + paginated query, returns dict with items/total/page/total_pages/has_next/has_prev
- `create_paginated_response(item_model)` — Factory function for typed paginated response models
- Applied to **all 30+ list endpoints** across the API surface

### 1. `backend/app/main.py` — FastAPI Application
- **Purpose**: API server with lifespan management
- **Responsibilities**: Route registration, CORS, backup scheduler
- **Dependencies**: PostgreSQL, Redis
- **Configuration**: `BACKUP_SCHEDULE_HOURS` env var

### 2. `backend/app/core/config.py` — Settings
- **Purpose**: Pydantic settings with env var binding
- **Responsibilities**: Database URL, Redis URL, JWT secret, backup schedule
- **Dependencies**: env vars
- **Configuration**: `BACKUP_SCHEDULE_HOURS`, `DATABASE_URL`, `REDIS_URL`
- **Security**: `SECRET_KEY` auto-gen with persistence validation (fails on unwritable file). `ACCESS_TOKEN_EXPIRE_MINUTES=30` (down from 11520). Vault integration for secrets.

### 3. `backend/app/api/` — API Endpoints
- **Purpose**: REST API handlers for all CRUD operations
- **Responsibilities**: Auth, BOMs, parts, vendors, POs, documents, analytics
- **Dependencies**: PostgreSQL, Redis, JWT
- **Configuration**: Rate limiting, CORS origins

### 4. `backend/nginx.conf` (AUDIT FIX v1.10.0)
- **Security headers added**: HSTS (max-age=63072000), Content-Security-Policy, X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN, Referrer-Policy, Permissions-Policy, Cache-Control
- `server_tokens off` — hides nginx version
- Rate limiting zones for API and auth endpoints

### 5. `backend/alembic/versions/013_enterprise_audit_fixes.py` (NEW v1.10.0)
- **Purpose**: Fix model-migration mismatches identified in Phase 4/5 audit
- **Tables created**: `boms`, `bom_items_master` (moved from create_all to migration)
- **Columns added**: `documents.isPublic`, `documents.purchaseOrderId`, `documents.replacesDocumentId`, `audit_logs.userEmail`
- **FKs added**: documents.partId→parts.id, documents.projectId→projects.id, audit_logs.userId→users.id, exchange_rates.from_currency→currencies.code, exchange_rates.to_currency→currencies.code
- **30+ indexes** on FK columns across all domains
- **7 unique constraints**: eco_approvals, routing_operations, mbom_operations, supplier_scorecards, currencies, auto_number_schemes, custom_attribute_definitions

### 6. `backend/alembic/versions/014_json_column_normalization.py` (NEW v1.10.0, UPDATED v1.25.0 — Normalization Gap Identified)
- **Purpose**: Normalize JSON columns into relational tables
- **Tables created**: `contract_parts`, `fai_characteristics`, `serial_number_events`, `capa_attachments`, `deviation_lots`
- **Data migration**: Existing JSON data migrated to new normalized tables

### `api/endpoints/work_order_api.py` (REWRITTEN v1.25.0 — Was 100% stubbed)
- **Complete rewrite**: Replaced all hardcoded dict responses with real DB queries
- **Endpoints**: WO CRUD, operations, materials, status advancement, efficiency/daily reports
- **Features**: Auto-generates WO numbers, tracks actual production data, audit logging on state transitions
- **RBAC**: Router requires `require_viewer` for reads, `require_engineering` for mutations

### `api/endpoints/eco_api.py` (REWRITTEN v1.25.0 — Was 100% stubbed)
- **Complete rewrite**: Replaced all hardcoded dict responses with real DB queries
- **Endpoints**: ECO/ECN/ECR CRUD, items, approvals, notifications, impact analysis
- **Features**: ECO number auto-generation, approval workflow with digital signatures
- **RBAC**: Router requires `require_viewer` for reads, `require_engineering` for mutations, `require_admin` for approvals

### `api/endpoints/inventory_api.py` (REWRITTEN v1.25.0 — Was 100% stubbed)
- **Complete rewrite**: Replaced all hardcoded dict responses with real DB queries
- **Endpoints**: Warehouse/bin/inventory/reservation CRUD, stock adjustments, transfers, reports
- **Features**: Transaction history, reservations for work/sales orders, stock summary/valuation reports
- **RBAC**: Router requires `require_viewer` for reads, `require_procurement` for mutations

### `api/endpoints/quality_api.py` (REWRITTEN v1.25.0 — Was 100% stubbed)
- **Complete rewrite**: Replaced all hardcoded dict responses with real DB queries
- **Endpoints**: Inspection plans/records, NCR with disposition, CAPA lifecycle
- **Features**: CAPA create/complete/verify with effectiveness tracking, defect/CAPA/supplier reports
- **RBAC**: Router requires `require_viewer` for reads, `require_engineering` for mutations, `require_admin` for disposition/verify

### `api/endpoints/solidworks_integration.py` (REWRITTEN v1.25.0 — Was 100% in-memory)
- **Complete rewrite**: Replaced all `cad_*_storage` in-memory dicts with PostgreSQL-backed queries
- **Endpoints**: CAD BOM sync, image upload/retrieval, vault stats/tree, license management
- **Persistence**: BOM data, images, pending changes now survive server restarts
- **RBAC**: Router requires `require_viewer` for reads, `require_engineering` for mutations

### `api/endpoints/bom_enterprise.py` (OPTIMIZED v1.11.0, FIXED v1.25.0)
- **N+1 queries eliminated**: All part/BOM/ancestor lookups now batch-loaded in 1-2 queries instead of N per item
- **In-memory part cache**: `_part_cache` with 10k-entry LRU limit prevents repeated DB lookups
- **Redis caching**: Explosion, cost rollup, where-used, where-used-tree all cached with 5min TTL

### `db/session.py` (OPTIMIZED v1.11.0)
- **Configurable pool**: `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` read from settings (env vars)
- **`pool_recycle=3600`**: Prevents stale connection errors
- **Real DB query metrics**: SQLAlchemy `before_cursor_execute`/`after_cursor_execute` event listeners track actual query durations

### `monitoring/metrics.py` (FIXED v1.11.0)
- **Bug fix**: Removed `metrics.record_db_query(duration)` from HTTP middleware — was recording full request duration as DB query time (10-100x inflation)
- **Real tracking now in `session.py`**: SQLAlchemy events record actual query durations

### `api/endpoints/search.py` (OPTIMIZED v1.11.0)
- **FTS search**: Parts/vendors use `to_tsvector('english') @@ plainto_tsquery('english', :q)` with `ts_rank()` scoring
- **ILIKE fallback**: Preserved for substring matching
- **Exact match boost**: `ORDER BY rank DESC, pn ILIKE :exact DESC`

### `api/endpoints/parts.py`, `po_order.py`
- Search filters use ILIKE pattern (unchanged — FTS not applicable for structured fields)

### `Dockerfile` (OPTIMIZED v1.11.0)
- **Layer caching**: `COPY requirements.txt ./` + `pip install` BEFORE `COPY app/` — 80%+ faster rebuilds

### `postgresql.conf` (HARDENED v1.11.0)
- `statement_timeout = 30000` (30s) — prevents runaway queries
- `idle_in_transaction_session_timeout = 60000` (60s) — aborts idle transactions

### `docker-compose.yml` (HARDENED v1.11.0)
- **Redis auth**: `--requirepass ${REDIS_PASSWORD}` with healthcheck
- **Redis volume**: `redis_data:/data` for persistence
- **Backup volume**: `backup_data:/app/backups` for persistent backups
- **Env vars**: `REDIS_PASSWORD`, `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `BACKUP_DIR`

### `scripts/restore_wizard.py` (FIXED v1.11.0)
- **PGPASSWORD leak fixed**: Uses `_get_pg_env()` with isolated env dict instead of connection strings with embedded passwords
- All `psql`/`pg_restore` subprocess calls use `env` parameter

### `scripts/startup_health_check.py` (NEW v1.18.0)
- **Purpose**: Verifies database connectivity, integrity, and recovery readiness on application startup
- **Functions**: `check_database()` (async) tests connectivity, counts tables/FKs/indexes, verifies WAL level and archive mode; `check_backup_system()` (async) validates backup directory and existing backup files
- **Integration**: Called from `app/main.py` lifespan function. Also exposed as `GET /health` API endpoint
- **Exit code**: 0 if healthy, 1 if degraded/unhealthy
- **Output**: Structured JSON result with per-check status objects

### `scripts/backup_scheduler.py` (IMPROVED v1.11.0)
- **APScheduler integration**: Uses `AsyncIOScheduler` + `CronTrigger` (was naive sleep-loop)
- **Fallback**: Legacy sleep-loop daemon used when APScheduler not installed
- **Misfire grace**: 3600s grace time for delayed backups

### `core/backup.py` (ENHANCED v1.21.0)
- **`BackupType.PHYSICAL`**: New enum value for physical base backups via `pg_basebackup`
- **`create_physical_backup()`**: Full orchestration — lock acquisition, `pg_basebackup -Ft -z -X stream` execution, encryption via `gpg`, S3 upload, backup history recording
- **`_find_pg_basebackup()`**: Version-aware path resolution for `pg_basebackup` tool discovery
- **Pipeline updated**: `POST /api/v1/backup/pipeline` accepts `include_physical=true` to run physical alongside logical backup

### `core/tenant_events.py` (NEW ISOLATION v1.21.0)
- **`do_orm_execute` event listener**: Listens for all ORM SELECT events on `TenantAwareMixin` subclasses
- **Auto-inject WHERE tenantId**: Automatically adds `WHERE tenantId = :current_tenant` to all SELECT queries based on `contextvars` context
- **Superuser bypass**: No filter applied when `tenantId` is None (superuser)
- **Previously missing**: Only INSERT had tenant isolation — SELECT queries could leak data across tenants

### Backend Models — Polymorphic FK Enforcement (NEW v1.21.0)
- **10 models updated**: `audit_log.py`, `notification.py`, `revision.py`, `approval.py`, `comment.py`, `ai_models.py` (ValidationResult), `inventory.py` (InventoryTransaction, InventoryReservation), `digital_signature.py`, `notification_queue.py`
- **`ALLOWED_ENTITY_TYPES`/`ALLOWED_REFERENCE_TYPES`/`ALLOWED_DOCUMENT_TYPES`**: Class-level sets defining valid polymorphic type values
- **`before_insert`/`before_update` validation**: ORM events reject invalid type values with `ValueError`
- **Composite indexes**: 10 new composite indexes on `(entityType, entityId)`, `(reference_type, reference_id)`, and `(document_type, document_id)` for polymorphic query performance

### `models/revision.py` — RevisionBomSnapshotItem (NEW v1.26.0)
- **Purpose**: Normalized point-in-time BOM snapshot storage
- **Fields**: revision_id (FK CASCADE), part_id (FK), part_number, part_name, quantity, reference_designator, unit_cost (Numeric 12,4), extended_cost (Numeric 12,4), sort_order
- **Relationships**: revision → Revision (back_populates="snapshot_items")
- **Computed property**: `Revision.bomSnapshotComputed` derives dict from snapshot_items relationship
- **Indexes**: revision_id, part_id

### `models/enterprise_extensions.py` — CustomAttributeOption (NEW v1.26.0)
- **Purpose**: Normalized option values for dropdown/select custom attributes
- **Fields**: attribute_definition_id (FK CASCADE), option_value, display_label, is_default, sort_order, is_active
- **Relationship**: attribute_definition → CustomAttributeDefinition (back_populates="option_items")
- **Indexes**: attribute_definition_id

### `models/enterprise_extensions.py` — CustomAttributeValidationRule (NEW v1.26.0)
- **Purpose**: Normalized validation rules (min, max, pattern, etc.)
- **Fields**: attribute_definition_id (FK CASCADE), rule_type, rule_value, error_message, is_active
- **Relationship**: attribute_definition → CustomAttributeDefinition (back_populates="validation_rule_items")
- **Unique constraint**: (attribute_definition_id, rule_type)

### `models/eco.py` — EcoItemAttributeChange (NEW v1.26.0)
- **Purpose**: Normalized field-level ECO change tracking
- **Fields**: eco_item_id (FK CASCADE), field_name, old_value (Text), new_value (Text), value_type
- **Relationship**: eco_item → EcoItem (back_populates="attribute_changes")
- **Indexes**: eco_item_id

### `models/bom_template.py` — BomTemplate.bomDataComputed (ENHANCED v1.26.0)
- **Purpose**: Computed hybrid property deriving BOM tree data from normalized BomItem relationship
- **Replaces**: Legacy `bomData` JSON column (deprecated)
- **Structure**: Returns list of dicts with partId, partNumber, partName, quantity, referenceDesignator, notes, sortOrder, unitCost, extendedCost

### `api/endpoints/bom_templates.py` (ENHANCED v1.26.0)
- `POST /{template_id}/load`: Now returns `bomDataComputed` alongside legacy `bomData`

### `api/endpoints/revisions.py` (ENHANCED v1.26.0)
- `POST /{revision_id}/rollback`: Now reads snapshot from `snapshot_items` relationship first, falls back to legacy `bomSnapshot` JSON column

### `api/endpoints/enterprise_ext_api.py` (ENHANCED v1.26.0)
- `POST /custom-attributes`: Dual-writes to legacy JSON column and new `custom_attribute_options` table
- `GET /custom-attributes`: Enriches response with `options_normalized` from normalized options table

### `api/endpoints/eco_api.py` (ENHANCED v1.26.0)
- `POST /{eco_id}/items`: Writes attribute changes to `eco_item_attribute_changes` table alongside legacy JSON columns
- `GET /{eco_id}`: Returns `attribute_changes` array in items response

### `alembic/versions/024_json_column_normalization_phase2.py` (NEW v1.26.0)
- **Purpose**: Creates 4 normalized tables, migrates existing JSON data, marks 6 legacy columns as deprecated
- **4 new tables**: revision_bom_snapshot_items, custom_attribute_options, custom_attribute_validation_rules, eco_item_attribute_changes
- **Data migration**: Uses `json_array_elements`, `json_each_text` PostgreSQL functions
- **Reversible**: Full downgrade drops 4 tables and removes column comments

### `scripts/convert_inline_styles.py` (NEW v1.21.0)
- **Purpose**: Batch converts React `style={{}}` objects to CSS `className=""` references
- **Safety**: Only converts when ALL style properties in an object have utility class equivalents (avoids partial conversion)
- **Existing className handling**: Correctly merges with existing className values
- **Results**: 531 inline styles converted across 13 JSX files (~40% reduction from ~2112 baseline)
- **Dependencies**: Python 3.6+, no external packages required

### 66. PATCH Route Pattern (v1.37.0, 22 endpoint files)
- **Purpose**: Standardized partial-update pattern across all 27 new PATCH endpoints
- **Pattern**: `model_dump(exclude_unset=True)` → delegate to PUT handler
- **Files**: `approval_automation.py`, `approvals.py`, `bom_items.py`, `bom_templates.py`, `capa.py`, `comments.py`, `compliance_api.py`, `contract.py` (2), `country_history.py`, `deviation.py`, `erp_connectors.py`, `fai.py`, `kanban.py`, `make_vs_buy.py`, `notifications.py`, `order_tracking.py`, `part_vendors.py`, `procurement.py`, `roles_permissions.py`, `should_cost.py`, `supplier_scorecard.py`, `tenants.py`, `traceability.py` (2), `webhooks.py`

### 67. Bulk DELETE Pattern (v1.37.0)
- **Purpose**: Efficient mass deletion using SQL `IN` clause with tenant isolation
- **Endpoints**: `POST /parts/bulk-delete`, `POST /vendors/bulk-delete`, `POST /bom-items/bulk-delete`, `POST /notifications/bulk-delete`

### 68. Dev Dockerfile (v1.37.0 hardening)
- **Security**: Now uses `USER bom`, `tini` entrypoint, proper group/user setup. Matches Dockerfile.prod pattern.

### 69. Modal Components Directory (v1.37.0)
- **Purpose**: First refactored component directory — 17 modal components extracted from monolithic `modals-extra.jsx`
- **Path**: `src/components/modals/` — 17 individual `.jsx` files + `index.jsx` re-export hub
- **Index pattern**: `index.jsx` uses `export { default as X } from './X.jsx'` for default exports and `export { X } from './X.jsx'` for named exports
- **Backward compat**: `src/root/modals-extra.jsx` reduced to a shim that imports from the new directory and assigns to `window.*`
- **Remaining**: 2 internal-only modals (AuditLogModal, APIKeysModal) still inline in `modals-extra.jsx`

### 70. Screen Components Directory (v1.37.0)
- **Purpose**: Second refactored component directory — 7 screen components extracted from monolithic `secondary-screens.jsx`
- **Path**: `src/components/screens/` — 7 individual `.jsx` files (VendorsScreen, ProcurementScreen, DocumentsScreen, OCRScreen, AnalyticsScreen, ActivityScreen, DiffScreen) + `index.jsx` re-export hub
- **Pattern**: All components use `export default function` with `PropTypes`. Internal helpers (e.g., SortIcon) kept in the same extraction file.
- **Backward compat**: `src/root/secondary-screens.jsx` reduced to an 11-line shim
- **Note**: Not imported through `globals.js` — only via side-effect `import './root/secondary-screens.jsx'` in `main.jsx`

### 71. CalendarEvent Model (v1.44.0)
- **File**: `backend/app/models/calendar_event.py`
- **Purpose**: Persist user calendar events for scheduling
- **Table**: `calendar_events` with columns: id, user_id, title, description, event_type, start_time, end_time, all_day, color, related_resource_type, related_resource_id, is_completed, created_at, updated_at
- **Indexes**: (user_id, start_time), event_type, (related_resource_type, related_resource_id)
- **Mixin**: `TenantAwareMixin` for multi-tenant isolation

### 72. Calendar Events API (v1.44.0)
- **File**: `backend/app/api/endpoints/calendar_events.py`
- **Endpoints**: `GET/POST /api/v1/calendar/calendar-events`, `PUT/DELETE /calendar-events/{id}`
- **Purpose**: CRUD for user calendar events with date range filtering

### 73. User Data Sync API (v1.44.0)
- **File**: `backend/app/api/endpoints/user_sync.py` (373 lines)
- **Endpoints**: 17 endpoints under `/api/v1/user-sync/` covering data store, preferences, checklist, BOM drafts, scan history, saved searches
- **Purpose**: Bridge localStorage data to PostgreSQL persistence

### 74. Frontend API Client Modules (v1.44.0)
- **File**: `frontend/api.js` (now ~1400 lines)
- **New modules**: `workOrdersAPI`, `ecoAPI`, `inventoryAPI`, `qualityAPI`, `userDataSyncAPI`, `calendarEventsAPI`
- **Purpose**: Provide ES module + window.* interface to all 60+ backend endpoint routers
- **Port fix**: `API_BASE` corrected to `localhost:8000` (was 8002)

### 75. Screen Data Bridge (v1.47.0)
- **File**: `frontend/src/services/screenDataBridge.js`
- **Purpose**: Unified data access layer providing `window.screenDataBridge.*` methods for all data domains
- **Pattern**: Each method calls `window.api.*` endpoint → catches errors → falls back to `localStorage.getItem(key)` → returns parsed data or empty array
- **Data domains covered**: parts, vendors, projects, procurement, documents, users, notifications, comments, approvals, workOrders, templates, ecrs, calendarEvents, inventory, quality, compliance, analytics, makeVsBuy, shouldCost, supplierScorecard, capa, fai, deviations, kanban, contracts, orderTracking, webhooks, erpConnectors, supplierPortal, traceability, savedSearches, userData (25+ domains)
- **Dependencies**: `window.api.*` (backend endpoints), `localStorage` (fallback)

### 76. dataService.js (v1.47.0)
- **File**: `frontend/src/services/dataService.js`
- **Purpose**: Orchestration layer for data refresh/sync operations
- **Integration**: Wraps screenDataBridge methods, provides named refresh functions for all data domains
- **New domains added**: ecrs, templates, documents, poDrafts, vendorUsers
- **Refresh methods**: 30+ functions covering all application data domains

### 77. Migration 028 — ON DELETE CASCADE (v1.47.0)
- **File**: `backend/alembic/versions/028_fk_on_delete_cascade.py`
- **Purpose**: Add `ON DELETE CASCADE` to all foreign key constraints from migrations 001-004
- **Scope**: 51 FK constraints across 20+ core tables
- **Tables affected**: boms, bom_items, parts, vendors, purchase_orders, po_items, documents, comments, audit_log, notifications, projects, etc.

### 78. Migration 022 Fix (v1.47.0)
- **Purpose**: Replace unsafe `Base.metadata.create_all()` with explicit `CREATE TABLE IF NOT EXISTS` statements
- **Tables explicitly created**: approvals, revisions, revision_bom_snapshot_items, boms, part_vendors, po_line_items, user_data_store, user_preferences, part_custom_fields (9 tables)
- **Safety**: Each statement uses `IF NOT EXISTS` to prevent duplicate table errors

### 79. CI/CD Workflow (v1.47.0)
- **Production deployment**: Now triggers ONLY on version tags (`v*.*.*`) — not on main branch pushes
- **Frontend tests**: `npx vitest run` added to root CI workflow
- **CI steps**: ESLint → TypeScript check → Vitest tests → Vite build → Backend ruff → Backend pytest

### 80. Mock Data Cleanup (v1.47.0)
- **Production code purged**: 52+ mock/MOCK references removed from:
  - `constants.js` — `MOCK_BUDGET`, `MOCK_KPIS`, `MOCK_VENDOR_SPEND` exports removed
  - `integration-screens.jsx` — mock fallback code removed
  - `enterprise-screens.jsx` — mock fallback code removed
  - `ProcurementScreen.jsx` — mock fallback code removed
  - `DocumentsScreen.jsx` — mock fallback code removed
  - `config.js` — mock mode gating removed
  - `AppCtx.jsx` — mock mode references removed
  - `TopBar.jsx` — mock badge removed
  - `en.json` / `ja.json` — mock-related translation strings removed

### 81. BBF Branding (v1.47.0)
- **Font**: Montserrat from Google Fonts
- **Color palette**: BBF navy `#001F3F`, orange `#FF6B35`, light `#F5F5F5`, white `#FFFFFF`, dark `#333333`
- **Heading prefix**: `///` convention for document and UI headings
- **Motif**: Double-chevron `<<` in TopBar header and index.html title
- **Files affected**: `styles.css` (brand variables, font import), `index.html` (font link, meta tags, title), `TopBar.jsx` (branded header)

### 83. Multi-Language Locale Files (v1.48.0)
- **Files**: `frontend/src/locales/{en,ja,zh,de,fr,es}.json`
- **Purpose**: i18next translation resources for global enterprise deployment
- **Coverage**: en.json ~2,100 keys (100%), ja.json ~430 keys (20%), zh/de/fr/es ~2,100 keys (placeholder)
- **Generation**: zh/de/fr/es generated from en.json via Python script with `[LANG]` prefixes

### 84. analytics.py PostgreSQL-Only (v1.48.0)
- **File**: `backend/app/api/endpoints/analytics.py`
- **Change**: Removed `_is_sqlite()` function and 2 SQLite-specific code paths
- **Rationale**: Application has used PostgreSQL exclusively since v1.0. SQLite branching was dead code increasing maintenance burden and test matrix complexity.
- **Dialects removed**: SQLite `strftime()` in `/dashboard`, SQLite `datetime('now')` in `/trends`

### 82. Test Database Infrastructure (v1.45.0)
- **Files**: `backend/docker-compose.test.yml`, `backend/app/tests/conftest.py`, `backend/tests/conftest.py`
- **Purpose**: Run tests against PostgreSQL instead of SQLite for production fidelity
- **docker-compose.test.yml**: PostgreSQL 15 (port 5433) + Redis 7 (port 6380) — minimal test stack
- **Auto-detection logic**: Both conftest.py files detect PostgreSQL from `POSTGRES_SERVER` or `CI` env vars. URL constructed from `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`. Falls back to SQLite with `warnings.warn()`.
- **CI integration**: Both `.github/workflows/ci.yml` files set `TEST_DATABASE_URL` — CI runs against PostgreSQL
