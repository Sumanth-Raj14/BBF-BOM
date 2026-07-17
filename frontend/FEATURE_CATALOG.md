# Blackbox BOM — Feature Catalog

## Core Features

### 1. BOM Editor (`bom-editor.jsx`)
- **Inline editing** — Click any cell to edit part number, name, quantity, cost, vendor
- **Hierarchy/flat view** — Toggle between tree structure and flat list
- **Drag reorder** — Rearrange parts within the same level
- **Bulk edit** — Select multiple rows for batch operations
- **Add Item button** — Quick-add new components to the BOM
- **Save/undo** — Changes persist to localStorage, undo stack available
- **Status badges** — Visual indicators for released/draft/obsolete
- **BOM Comparison** — Side-by-side version diff
- **Where Used** — Part cross-reference across BOMs

### 2. Component Library (`parts-screen.jsx`)
- **Parts catalog** — Browse all components in grid or list view
- **Duplicate detection** — Groups similar parts for consolidation
- **Add to BOM** — One-click add selected parts to active BOM
- **Search/filter** — Filter by vendor, category, status
- **Part detail drawer** — Click any part for full specifications with 6+ tabs
- **3D Preview** — Three.js model viewer with orbit controls

### 3. Dashboard (`dashboard.jsx`)
- **Role-specific views** — Different KPIs for Engineer, Buyer, Manager
- **WORSPACE_BUDGET** — Budget tracking with sparkline charts
- **Recent activity** — Feed of team actions
- **Quick actions** — One-click access to common tasks
- **Dark mode persistence** — Theme saved to localStorage

## Procurement & Vendors

### 4. Vendor Management (`secondary-screens.jsx`)
- **Vendor list** — All suppliers with ratings, lead times, location
- **Vendor detail modal** — Full profile with contact, PO history, scorecard
- **RFQ creation** — Send requests for quotation to vendors
- **Price comparison** — Side-by-side vendor cost analysis
- **Supplier Scorecard** — Performance rating system
- **Should-Cost Analysis** — Material + labor + overhead calculation
- **Make vs Buy** — Decision framework

### 5. Procurement (`secondary-screens.jsx`)
- **PO list** — All purchase orders with status tracking
- **PO detail modal** — Full PO with status timeline, line items, tax/shipping
- **Status advancement** — Move PO through Not Ordered → RFQ → Ordered → Received
- **Print PDF** — Generate printable PO document

### 6. Order Tracking (`integration-screens.jsx`)
- **Amazon-style UI** — Visual stage progression (placed → confirmed → shipped → delivered)
- **Stage icons/colors** — Each stage has unique icon and color
- **Detail view** — Full tracking timeline with ETA
- **Search/filter** — Find by PO number, vendor, tracking number

## Quality & Compliance

### 7. ECR — Engineering Change Requests (`advanced-features.jsx`)
- **Create ECR** — Form with part, description, justification, priority
- **Status tracking** — Draft → Under Review → Approved → Implemented
- **Notifications** — Toast alerts on status changes
- **ECO/ECN workflow** — Full engineering change order lifecycle

### 8. Approvals (`final-polish.jsx`)
- **Approval queue** — Pending requests with approve/reject actions
- **Filter by type** — All, Mine, Pending, Approved, Rejected
- **Overflow handling** — Scrollable list with max-height

### 9. Compliance (`enterprise-screens.jsx`)
- **Regulatory tracking** — RoHS, REACH, Conflict Minerals, ISO
- **Compliance certificates** — Per-part certification management
- **Export controls** — ITAR/EAR classification support

### 10. NCR — Non-Conformance Reports (`power-features.jsx`)
- **Create NCR** — Form with part number, severity, defect description, disposition
- **Severity levels** — Critical, Major, Minor
- **Session persistence** — Created NCRs persist during session
- **CAPA integration** — Corrective and preventive action tracking

## Cost Analysis

### 11. Cost Simulator (`advanced-features.jsx`)
- **What-if scenarios** — Adjust quantities, costs, vendors
- **Real-time recalc** — Instant BOM total updates
- **Vendor comparison** — See cost impact of switching suppliers

### 12. Inflation Analysis (`advanced-features.jsx`)
- **6 categories** — Semiconductors, Passives, Fasteners, Optics, Cables, Mechanical
- **Trend charts** — 8-month sparkline visualization
- **BOM weighted impact** — How inflation affects your specific BOM
- **CSV export** — Download full report as spreadsheet

### 13. Landed Cost (`power-features.jsx`)
- **Total cost calculation** — Material + freight + duty + handling
- **Country-specific rates** — Tariff rates by origin country

### 14. Margin Analysis (`power-features.jsx`)
- **Cost vs price** — Margin calculation per component
- **Target margin tracking** — Visual comparison against goals

## AI & Automation

### 15. Demand Forecasting (`integration-screens.jsx`)
- **Generate from PO history** — Analyze past orders to predict future demand
- **Confidence scores** — Each forecast has accuracy percentage
- **Mock data** — 7 sample forecasts when backend offline

### 16. Part Interchangeability (`integration-screens.jsx`)
- **Similarity analysis** — Find parts that can substitute for each other
- **Reason explanations** — Why parts are interchangeable
- **Approval workflow** — Approve/reject suggestions

### 17. Poka-yoke Validation (`integration-screens.jsx`)
- **Rule-based checks** — Voltage, current, material compatibility
- **Severity levels** — Critical, warning, info
- **Pass/fail results** — Clear visual indicators

### 18. Approval Automation (`integration-screens.jsx`)
- **Auto-approve rules** — Configure conditions for automatic approval
- **4 rule types** — Low-cost POs, high-severity ECRs, minor revisions, repeat orders

## Documents & Integration

### 19. Document Management (`secondary-screens.jsx`)
- **Document list** — All uploaded files with types, sizes, dates
- **Upload** — Drag-and-drop or click to upload
- **Preview** — Inline preview for images and PDFs

### 20. OCR — Optical Character Recognition (`secondary-screens.jsx`)
- **Datasheet upload** — Upload PDF/PNG/JPG datasheets
- **Auto-extract** — Parse component data from images
- **Review extracted** — Edit extracted fields before import

### 21. CAD Import (`modals-extra.jsx`)
- **SolidWorks integration** — Live API connection option
- **File upload** — Native file picker for .sldasm/.step/.stp/.igs/.sldprt
- **PDM link** — URL input for assembly links
- **Part review** — Review matched/new parts before import
- **Recent imports** — History of past imports
- **Drawing markup** — Redline annotations on CAD drawings

### 22. Bulk Import (`integration-screens.jsx`)
- **CSV/Excel upload** — Import parts from spreadsheets
- **Column mapping** — Map spreadsheet columns to BOM fields
- **Validation** — Check data before importing
- **Progress tracking** — Real-time import progress

### 23. ERP Connectors (`integration-screens.jsx`)
- **SAP, NetSuite, Oracle** — Enterprise connector support
- **ClickUp, Zoho Cliq** — Project management integrations
- **Custom REST** — Generic API connector
- **Sync logs** — History of data synchronization

## Workforce & Operations

### 24. Work Orders (`power-features.jsx`)
- **Create work order** — Select BOM, quantity, schedule date
- **Build reporting** — Record completed builds
- **Defect reporting** — Log quality issues
- **localStorage persistence** — Data survives page refresh

### 25. Routing (`enterprise-screens.jsx`)
- **Manufacturing routes** — Define production sequences
- **Operation steps** — Step-by-step work instructions
- **Work center assignment** — Assign operations to work centers

### 26. Work Centers (`enterprise-screens.jsx`)
- **Resource management** — Track workstations, capacity, utilization
- **Capacity planning** — Available hours vs. scheduled load

### 27. Labor Tracking (`enterprise-screens.jsx`)
- **Time tracking** — Record labor hours by task
- **Cost allocation** — Labor cost applied to work orders

### 28. Currency Exchange (`enterprise-screens.jsx`)
- **Multi-currency** — 12 exchange rates for global procurement
- **Rate history** — Track exchange rate changes over time

## System & Admin

### 29. Monitoring (`integration-screens.jsx`)
- **System health** — API status, uptime, memory, database
- **Prometheus metrics** — Raw metrics display
- **Refresh** — Manual refresh with error handling

### 30. API Keys (`enterprise-screens.jsx`)
- **Key management** — Create/revoke API keys
- **Permission scoping** — Read-only, read-write, admin
- **Usage tracking** — Key usage statistics

### 31. Custom Attributes (`enterprise-screens.jsx`)
- **Dynamic fields** — Add custom properties to parts
- **5 attribute types** — Text, number, select, date, boolean

### 32. Numbering Schemes (`enterprise-screens.jsx`)
- **Auto-numbering** — Configure part number patterns
- **12 schemes** — Pre-configured for different part types

### 33. Team Activity (`secondary-screens.jsx`)
- **Activity feed** — Real-time team actions log
- **Auto-refresh** — Polls every 15 seconds (toggleable)
- **Filter** — All, Edits, Approvals, Comments, System, Mine only
- **Click routing** — Click objects to navigate to relevant screens

### 34. Version Diff (`secondary-screens.jsx`)
- **Compare revisions** — Side-by-side BOM changes
- **3 diff types** — Added, removed, changed
- **Swap A/B** — Reverse comparison direction
- **Export** — Download diff as PDF

### 35. Search (`modals-extra.jsx`)
- **Global search** — Search across all parts, POs, vendors, documents
- **Keyboard shortcut** — Ctrl+K to open
- **Category tabs** — Filter results by type

### 36. Settings (`modals-extra.jsx`)
- **Theme** — Light/dark mode toggle
- **Density** — Compact/comfortable/spacious
- **Font size** — Adjustable text size

### 37. Profile (`modals-extra.jsx`)
- **User info** — Name, email, role
- **Activity history** — Recent actions

### 38. Help & Shortcuts (`modals-extra.jsx`)
- **Keyboard shortcuts** — List of available shortcuts
- **Quick links** — Common actions

### 39. Roadmap (`final-polish.jsx`)
- **Phase planning** — Features organized by quarter
- **Priority levels** — Q1 2026, Q2 2026, Q3 2026, Q4 2026

### 40. Barcode Scanner (`modals-extra.jsx`)
- **Camera scan** — Use device camera to scan barcodes
- **Manual entry** — Type barcode number
- **Part lookup** — Find components by barcode

### 41. PDM/CAD Vault (`pdm-cad.jsx`)
- **File versioning** — Version history for CAD files
- **Checkout/checkin** — Lock files for editing
- **3D viewer** — Three.js-based model preview with orbit controls

## Mobile & PWA

### 42. Mobile Scanner (`mobile-scanner.jsx`)
- **PWA support** — Installable as home screen app
- **Offline capable** — Service worker for offline access
- **Camera barcode** — Scan barcodes with device camera
- **Quick lookup** — Instant part search from mobile

## Enterprise Utilities (`enterprise-final.jsx`)

### 43. Component Composition
- **withErrorBoundary** — Wrap components with error catching
- **withLoading** — Show loading skeleton while data loads
- **withEmpty** — Show empty state when no data
- **withError** — Show error state with retry

### 44. Security
- **CSP headers** — Content-Security-Policy with strict rules
- **OWASP headers** — COOP, COEP, CORP, X-Frame-Options
- **Input sanitization** — HTML escape, SQL injection prevention
- **CSRF tokens** — Token management for forms
- **Rate limiting** — Per-key rate limiter
- **Security audit log** — Auth events logged with metadata

### 45. Performance
- **React.memo wrappers** — `window.memo.wrap/shallowEqual/byProps`
- **Prefetch cache** — TTL-based caching with deduplication
- **Virtual scrolling** — `VirtualList` for 10k+ items
- **Lazy loading** — IntersectionObserver-based component loading
- **Performance monitoring** — `window.perf` timing utilities

### 46. UI/UX
- **Dark mode persistence** — localStorage + system preference
- **Print stylesheet** — A4 landscape optimized
- **Context menus** — Right-click contextual actions
- **Tooltips** — Accessible portal-rendered tooltips
- **Bulk operations** — Select/deselect/toggle patterns
- **Advanced search** — Tokenization, scoring, fuzzy matching
- **Data export** — CSV, JSON, Excel utilities

### 47. Accessibility
- **Focus-visible** — Keyboard-only focus indicators
- **Skip link** — Skip-to-main-content navigation
- **Touch targets** — 36px desktop, 44px mobile
- **Reduced motion** — `prefers-reduced-motion` support
- **ARIA labels** — All interactive elements labeled
- **Color contrast** — WCAG AA compliant custom properties
- **Screen reader** — `.sr-only` utility class

## Auth & Onboarding

### 48. Authentication (`auth-onboarding.jsx`)
- **Email/password** — Standard login
- **SSO** — Google, GitHub, Microsoft
- **Token management** — Auto-refresh, 401 interceptor
- **Onboarding wizard** — First-time setup flow

---

### 49. Stubbed Endpoints Eliminated (v1.25.0)
- **Work Orders** (`work_order_api.py`) — Real DB queries for WO CRUD, operations, materials, status advancement, efficiency/daily reports
- **ECO/ECN/ECR** (`eco_api.py`) — Real DB CRUD for change orders, items, approvals, notifications, impact analysis
- **Inventory** (`inventory_api.py`) — Real warehouse/bin/inventory/reservation CRUD, stock adjustments, transfers, reports
- **Quality** (`quality_api.py`) — Real inspection plans/records, NCR disposition, CAPA lifecycle, quality reports
- **SolidWorks Integration** (`solidworks_integration.py`) — Real DB persistence for CAD BOMs, images, changes (removed in-memory storage)
- **BOM Enterprise** (`bom_enterprise.py`) — Real quantity rollup, variant/template CRUD, import/export (9 stubs fixed)

### 50. Security Hardening (v1.25.0)
- **PyJWT migration** — Replaced unmaintained python-jose (2021) with actively maintained PyJWT
- **CSP hardened** — Removed 'unsafe-eval', added violation reporting via report-uri
- **HTTPS enforced** — TLS 1.2/1.3 only, HSTS, modern ciphers, HTTP→301 redirect
- **SSL certificates** — `ssl/generate-certs.ps1` for self-signed dev certificates

### 51. Multi-Tenancy Completeness (v1.25.0)
- **All child models now tenant-aware** — CapaAttachment, FaiCharacteristic, DeviationLot, SerialNumberEvent, ContractParts extend TenantAwareMixin

### 52. JSON Column Normalization Phase 2 (v1.26.0)
- **6 denormalized JSON columns normalized** into 4 proper relational tables with FK constraints and CASCADE deletes.
- **`bom_templates.bomData`**: Already duplicated by `bom_items` table. Marked deprecated; `bomDataComputed` hybrid property derives data from normalized items relationship.
- **`revisions.bomSnapshot`**: Archived into `revision_bom_snapshot_items` table with part_number, quantity, cost, sort_order columns. Full historical BOM snapshot preservation.
- **`custom_attribute_definitions.options`** and **`validation_rules`**: Migrated to `custom_attribute_options` and `custom_attribute_validation_rules` tables. Supports display labels, default values, active/inactive toggles per option.
- **`eco_items.old_value`** and **`eco_items.new_value`**: Migrated to `eco_item_attribute_changes` table with per-field old/new values and type tracking. Enables queryable change history for ECO impact analysis.

### 53. Screen Data Bridge (v1.47.0)
- **Purpose**: Unified data access layer bridging frontend React components to backend API endpoints with localStorage fallback
- **File**: `frontend/src/services/screenDataBridge.js`
- **Coverage**: 60+ backend endpoint routers across 25+ data domains
- **Data domains**: parts, vendors, projects, procurement, documents, users, notifications, comments, approvals, workOrders, templates, ecrs, calendarEvents, inventory, quality, compliance, analytics, makeVsBuy, shouldCost, supplierScorecard, capa, fai, deviations, kanban, contracts, orderTracking, webhooks, erpConnectors, supplierPortal, traceability, savedSearches, userData
- **Fallback**: localStorage key-value read when `window.api.*` endpoint is unavailable

### 54. dataService.js Integration (v1.47.0)
- **Purpose**: Centralized refresh/sync orchestration for all data domains
- **Integration**: Wraps screenDataBridge methods, adds 5 new domains (ecrs, templates, documents, poDrafts, vendorUsers)
- **Refresh methods**: `refreshParts`, `refreshVendors`, `refreshProjects`, `refreshProcurement`, `refreshDocuments`, `refreshUsers`, `refreshNotifications`, `refreshComments`, `refreshApprovals`, `refreshWorkOrders`, `refreshTemplates`, `refreshEcr`, `refreshCalendarEvents`, `refreshInventory`, `refreshQuality`, `refreshCompliance`, `refreshAnalytics`, `refreshMakeVsBuy`, `refreshShouldCost`, `refreshSupplierScorecard`, `refreshCapa`, `refreshFai`, `refreshDeviations`, `refreshKanban`, `refreshContracts`, `refreshOrderTracking`, `refreshWebhooks`, `refreshErpConnectors`, `refreshSupplierPortal`, `refreshTraceability`, `refreshSavedSearches`, `refreshUserData`

### 55. Migration 028 — ON DELETE CASCADE (v1.47.0)
- **File**: `backend/alembic/versions/028_fk_on_delete_cascade.py`
- **Scope**: Adds `ON DELETE CASCADE` to 51 foreign key constraints across tables from migrations 001-004
- **Tables affected**: All core tables (boms, bom_items, parts, vendors, purchase_orders, documents, etc.)

### 56. Migration 022 Fix (v1.47.0)
- **Fix**: Replaced `Base.metadata.create_all()` call with explicit `op.execute('CREATE TABLE IF NOT EXISTS ...')` for 9 tables
- **Tables**: approvals, revisions, revision_bom_snapshot_items, boms, part_vendors, po_line_items, user_data_store, user_preferences, part_custom_fields

### 57. Mock Data Purge (v1.47.0)
- **Scope**: 52+ mock/MOCK references removed from production code paths
- **Files cleaned**: constants.js, integration-screens.jsx, enterprise-screens.jsx, ProcurementScreen.jsx, DocumentsScreen.jsx, config.js, AppCtx.jsx, TopBar.jsx, en.json, ja.json

### 58. BBF Branding (v1.47.0)
- **Font**: Montserrat (Google Fonts) — applied to styles.css, index.html, TopBar
- **Color palette**: Navy `#001F3F`, Orange `#FF6B35`, Light gray `#F5F5F5`, White `#FFFFFF`, Dark text `#333333`
- **Heading prefix**: `///` convention for all document and UI headings
- **Motif**: Double-chevron `<<` in TopBar and index.html

## Technical Notes
- **All screens** use React Context (`useAppStore`) for live data
- **localStorage** used for persistence (work orders, NCRs, settings)
- **Mock data** provided for all screens when backend offline
- **Vite build** — 24 code-split chunks, 1.7s build time
- **ESLint** — Flat config, 0 errors 0 warnings
- **Playwright tests** — 19 E2E tests all passing
- **Pytest backend tests** — 36 tests covering auth, CRUD, RBAC, search
- **CI/CD** — GitHub Actions with lint, test, security scan, Docker build
- **CSS custom properties** — OKLCH color space, WCAG AA contrast

---

### 35. React Router Migration (v1.46.0)
- **Purpose**: Replace manual `location.pathname` conditional rendering with proper `<Routes><Route>` components
- **Migration**: All 36 screen routes in `src/screens/App.jsx` converted from `{route === "dashboard" && <DashboardScreen/>}` to `<Route path="/dashboard" element={<DashboardWrapper/>}/>`
- **Wrapper pattern**: 9 wrappers (`DashboardWrapper`, `BomShellWrapper`, etc.) extract props from `AppContext`; `GenericScreen({ Component })` handles 22 zero-prop screens
- **404 handling**: `<Route path="*" element={<FourOhFour/>}/>` with `ErrorScreen` fallback
- **Backward compat**: `route` variable derived from `useLocation().pathname` retained in `AppCtx` for NavRail/findNav/keyboard shortcuts
- **App.jsx**: Reduced from ~722→293 lines (59% reduction)
- **Build**: 0 warnings, 162 modules, 2.04s

### 36. Duplicate className Fix (v1.46.0)
- **20+ instances** in `mobile-scanner.jsx` where duplicate `className` attributes caused second value to override first
- All merged into single `className` strings — styling now renders correctly

## Enterprise Audit (v1.10.0)

### Architecture Score: 7.5/10
- Error boundaries, circuit breaker, retry logic, HOC composition patterns
- PropTypes validation, prefetching, lazy loading, virtual scrolling
- Redis caching layer, enterprise pagination utility
- BOM enterprise logic (cost rollup, explosion, snapshots, baselines)
- Global namespace pattern (intentional, no refactor planned)

### UI/UX Score: 8/10
- Focus-visible, touch targets, skip link, reduced motion
- Loading skeletons, keyboard shortcuts, empty states, high contrast
- Dark mode persistence, print stylesheet, context menus, tooltips
- Bulk operations, advanced search, data export (CSV/JSON/Excel)
- 18 color-contrast violations fixed, axe-core passes

### Security Score: 8.5/10
- CSP enterprise (frame-ancestors, form-action, base-uri, object-src)
- OWASP headers (COOP, COEP, CORP), X-Frame-Options, nosniff
- MFA/TOTP with UserMfa model, login challenge flow
- Password complexity validation (server-side)
- Complete RBAC chain wired (User ↔ Role ↔ Permission)
- Input sanitization, CSRF tokens (`httponly=True`, `secure=True` in production)
- Rate limiting with proper `X-Forwarded-For` support behind nginx
- Security audit logging, 401 interceptor
- **SQL injection prevented** — f-string SQL replaced with identifier validation regex
- **SECRET_KEY persists** — Startup raises error if key file unwritable
- **Access token 30min** — Down from 8 days
- **No PGPASSWORD leak** — subprocess `env` parameter instead of `os.environ`
- **Nginx security headers** — HSTS, CSP, nosniff, X-Frame-Options, Permissions-Policy
- **Missing**: SSO/SAML, encryption at rest, penetration testing

### Database Score: 8/10
- All tables in Alembic migrations (boms, bom_items_master no longer rely on create_all)
- FK constraints on documents (partId, projectId, purchaseOrderId, replacesDocumentId)
- FK constraint on audit_logs.userId, exchange_rates.from/to_currency
- 30+ indexes on FK columns across all domains
- 7 unique constraints added to prevent data duplication
- JSON columns normalized into proper relational tables (contract_parts, fai_characteristics, serial_number_events, capa_attachments, deviation_lots)
- **Missing**: CHECK constraints, partial indexes, table partitioning

### Performance Score: 7.5/10 (v1.11.0)
- **N+1 queries eliminated**: BOM explosion, cost rollup, where-used — all use batch loading
- **Redis caching applied**: BOM explosion, cost rollup, where-used endpoints cached (5min TTL)
- **FTS search**: PostgreSQL full-text search with `to_tsvector`/`plainto_tsquery` (was ILIKE-only)
- **Metrics bug fixed**: HTTP request duration no longer recorded as DB query duration (was inflating by 10-100x). Real SQLAlchemy event listeners track actual query times.
- **Configurable connection pool**: `DB_POOL_SIZE`, `DB_MAX_OVERFLOW` via env vars
- **Docker layer caching**: pip dependencies cached separately from app code (80%+ faster rebuilds)
- **PostgreSQL timeouts**: `statement_timeout=30s`, `idle_in_transaction_session_timeout=60s`
- **Missing**: Read replicas, query optimization for very large BOMs (100k+ items)

### Scalability Score: 5.5/10 (v1.11.0)
- PostgreSQL, Redis, stateless API (backend)
- Pagination prevents unbounded queries on all endpoints
- Circuit breaker, rate limiting, data normalization
- WAL archiving for PITR, backup/restore pipeline
- **Missing**: Multi-tenancy, horizontal scaling, read replicas

### Maintainability Score: 6/10
- HOC composition patterns, PropTypes validation
- Consistent error handling, enterprise utilities
- 8 comprehensive documentation files
- ESLint flat config, 0 warnings
- CI/CD pipeline (GitHub Actions)

### Documentation Score: 7.5/10
- ENTERPRISE_AUDIT_REPORT.md — 814-line comprehensive audit
- DISASTER_RECOVERY_RUNBOOK.md — Updated DR runbook
- ISSUES.md — Tracked issues with resolution history
- CHANGELOG.md, FEATURE_CATALOG.md, SYSTEM_WORKFLOW.md
- MODULE_REFERENCE.md, ARCHITECTURE.md, TESTING_AND_VALIDATION.md
- OPEN_ITEMS.md, RELEASE_NOTES.md

### v1.32.0 Security Fixes
- **SQL injection eliminated**: 85+ injection points in analytics.py and dashboard_service.py converted to bound parameters
- **JWT algorithm confusion fixed**: Removed HS256 fallback when using RS256 keys
- **Backup MFA enforcement**: All backup endpoints now require `get_current_superuser` dependency (enforces MFA in production)
- **Session timeout JWT key fixed**: Now uses `_get_jwt_verify_key()` for RS256-compatible verification
- **Constraint alignment**: backup_history.py CheckConstraints now match code values
- **Secret key protection**: `.secret_key` files deleted, added to `.gitignore`
- **Webhook tenant scoping**: All webhook endpoints filter by tenantId for non-superusers

### Enterprise Readiness: 7.9/10 (v1.32.0)
- Automated backup scheduler with verification and alerting
- Health check endpoints with database integrity
- MFA/TOTP authentication, password complexity
- Enterprise pagination on all endpoints
- CI/CD pipeline with security scanning
- BOM cost rollups, snapshots, baselines, where-used
- Redis caching layer (with auth)
- SQL injection prevention, CSRF hardening, rate limiting with proxy support
- Comprehensive database schema with all FKs, indexes, unique constraints
- JSON column normalization for referential integrity
- N+1 query elimination across all BOM enterprise endpoints
- Full-text search with PostgreSQL FTS indexes
- Real database query duration tracking via SQLAlchemy events
- Configurable connection pooling with env vars
- Docker layer caching for fast rebuilds
- PostgreSQL statement timeouts prevent runaway queries
- APScheduler-based backup scheduling with CronTrigger
- Redis authentication enabled
- Backup data volume for persistent backup storage
- **Multi-tenancy enforced**: SELECT queries now filtered by tenantId via `do_orm_execute` event listener (was missing, now complete)
- **Polymorphic FK enforcement**: 10 models validate entity/reference/document types at ORM level with composite indexes
- **pg_basebackup integration**: Physical backup type for PITR-ready base backups
- **SSRF prevention**: Webhook URL validation rejects private IPs, enforces HTTPS
- **API key authentication**: X-API-Key header accepted alongside JWT bearer tokens
- **PITR restore capability**: `scripts/pitr_restore.py` + API endpoint for point-in-time recovery
- **Inline style migration**: 531 styles converted to utility classes (~40% reduction)
- **Missing**: SSO/SAML, SLA monitoring, subscription management, real-time collaboration

### 22. Health Check & Monitoring (`main.py`, `startup_health_check.py`)
- **Startup health verification** — Automatic database and backup system checks on app startup
- **`GET /health` endpoint** — Public endpoint for load balancer/monitoring integration
- **Database checks**: Connectivity, table count, WAL level, archive mode, FK constraints, indexes, tables without PK
- **Backup checks**: Directory existence, file count, WAL archive presence, PITR readiness
- **Logging**: Structured logging with degraded component warnings

### 23. Alembic Migration Chain
- **22 migration files** managing database schema evolution
- **Full revision audit** ensures chain consistency from `001_initial` through `022_polymorphic_fk_enforcement`
- **Schema drift detection**: Health check reports table count and index count as early warning

### 24. Polymorphic FK Enforcement (v1.21.0, `models/*.py`)
- **10 models with entity type validation**: AuditLog, Notification, Revision, Approval, Comment, ValidationResult, InventoryTransaction, InventoryReservation, DigitalSignature, NotificationQueue
- **`ALLOWED_ENTITY_TYPES`/`ALLOWED_REFERENCE_TYPES`/`ALLOWED_DOCUMENT_TYPES`**: Each model defines allowed values, rejected at ORM level via `before_insert`/`before_update` events
- **Composite indexes**: 10 new composite indexes on `(entityType, entityId)` and `(reference_type, reference_id)` patterns for polymorphic query performance

### 25. Multi-Tenancy SELECT Isolation (v1.21.0, `core/tenant_events.py`)
- **`do_orm_execute` event listener**: Automatically injects `WHERE tenantId = :current_tenant` on ALL SELECT queries for `TenantAwareMixin` subclasses
- **Superuser bypass**: Users with `tenantId = None` (superusers) bypass the filter
- **Contextvars-driven**: Tenant context set by authentication middleware, read by event listener

### 26. Physical Backup / pg_basebackup (v1.21.0, `core/backup.py`)
- **`BackupType.PHYSICAL`**: New backup type using `pg_basebackup -Ft -z -X stream` for PITR-ready physical base backups
- **`create_physical_backup()`**: Full orchestration with lock acquisition, execution, encryption, S3 upload, history recording
- **`POST /api/v1/backup/physical`**: On-demand physical backup trigger
- **`POST /api/v1/backup/pipeline?include_physical=true`**: Pipeline includes physical + logical backup

### 27. Security Hardening Features (v1.33.0)

#### JWT Algorithm Verification (`core/security.py`)
- **`get_unverified_header()` check**: Before decoding a JWT, the algorithm claim is extracted and verified against the configured algorithm. Prevents algorithm confusion attacks where an attacker changes `alg` from `RS256` to `HS256` and uses the RSA public key as an HMAC secret.

#### IP-Based Rate Limiting (`services/auth_service.py`)
- **`_check_ip_rate_limit()`**: Per-IP throttling (10 attempts/minute per IP per action) enforced BEFORE account-level lockout checks. Prevents DoS by IP rotation. Separate rate limiters per action (`login`, `forgot-password`, `reset-password`).

#### RSA Key Encryption (`core/security.py`)
- **`BestAvailableEncryption()`**: RSA private key serialized with encryption using `settings.ENCRYPTION_KEY` instead of `NoEncryption()`. Private key is encrypted at rest with AES.

#### CORS Hardening (`main.py`)
- **Explicit method/header whitelist**: `allow_methods` restricted to `["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]`. `allow_headers` restricted to `["Content-Type", "Authorization", "X-API-Key", "X-CSRF-Token", "X-Requested-With", "Accept", "Origin", "Referer"]`. No wildcards.

#### WebSocket Tenant Scoping (`main.py`)
- **`scoped_channel`**: WebSocket broadcasts and disconnect handlers use tenant-scoped channels (`f"user:{user.id}:tenant:{tenantId}"`) instead of unscoped channel names. Prevents cross-tenant message leakage.

#### Sanitization Pipeline Improvements (`core/sanitize.py`)
- **XSS pattern stripping**: JSON string values are cleaned with regex-based XSS pattern removal instead of `html.escape()` (which caused double-encoding on frontend). Patterns removed: `<script`, `javascript:`, `onerror=`, `onclick=`, `onload=`, etc.
- **Parse failure logging**: `except: pass` replaced with `except Exception: logger.warning(...)`. Unparseable request bodies are logged instead of silently bypassing sanitization.

#### SSO Callback Rate Limiting (`endpoints/sso.py`)
- **`@limiter.limit("10/minute")`**: Prevents brute-force attacks on SAML/OAuth callback endpoint.

#### SAML Debug Hardening (`core/saml_sso.py`)
- **Debug mode disabled**: `settings.IS_PRODUCTION is False` → `False`. SAML debug output no longer possible in any environment.

#### Metrics Authentication (`api_v1.py`)
- **JWT required**: `/metrics` endpoint now requires `get_current_user` dependency. Prometheus scrapers must include valid JWT or API key.

#### API Key Prefix Fix (`endpoints/api_keys.py`)
- **Actual prefix stored**: Key prefix now stores the first 4 characters before `_` separator (e.g., `"abc123..."` → `"abc1"`). Previously stored `"..."` suffix which was non-functional for indexed lookup.

#### Database Model Fixes
- **TokenBlacklist.tenantId**: Added `tenantId` column + `idx_token_blacklist_expires` index for tenant-scoped token blacklisting
- **SupplierPortal FK cascades**: `ondelete="SET NULL"` on `awarded_to_vendor_id` and `created_by` foreign keys
- **AuditLog indexes**: `idx_audit_log_created` (createdAt) and `idx_audit_log_user` (userId) for query performance
- **BomItem composite index**: `idx_bom_items_template_part` on `(bomTemplateId, partId)` for BOM load performance
- **WorkOrder composite index**: `idx_work_orders_status_due` on `(status, due_date)` for workflow queries
- **DigitalSignature index**: `idx_user_mfa_type` on `mfa_type` for MFA queries

### 28. Inline Style → Utility Class Migration (v1.21.0, `scripts/convert_inline_styles.py`)
- **531 inline styles converted** across 13 JSX files (modals-extra: 148, advanced-features: 85, integration-screens: 70, pdm-cad: 43, detail-drawer: 43, power-features: 36, dashboard: 28, app.jsx: 21, prod-additions: 19, final-polish: 13, parts-screen: 9, enterprise-screens: 8, bom-editor: 8)
- **30 new CSS utility classes**: `.d-none`, `.op-03/05/06/08`, `.flex-shrink-0/1`, `.flex-grow-0/1`, `.min-w-0/100/200`, `.max-w-100/200/300/400/500/600`, `.overflow-x-a/y-a/vis`, `.lh-1/1.2/1.4`, `.text-decoration-none`, `.underline`, `.line-through`, `.letter-sp-1/2/4/6/8`, `.capitalize`, `.lowercase`, `.table-auto/fixed`, `.bg-elev/sunk/canvas/accent/danger/ok/warn`, `.absolute/fixed`, `.d-block`, additional padding/margin variants, `.mx-auto`
- **~40% reduction**: ~1279 inline styles remain from ~2112 baseline
- **Safe conversion**: Script only converts when ALL properties have equivalents, avoiding partial conversion

### 29. API Completeness: PATCH + Bulk DELETE (v1.37.0)
- **27 new PATCH endpoints** across 22 files for partial resource updates
- **4 bulk DELETE endpoints**: `POST /{resource}/bulk-delete` for parts, vendors, bom_items, notifications
- **Total route count**: 466 (191 GET, 171 POST, 39 PUT, 31 PATCH, 34 DELETE)
- **vendors.py bug fixed**: PUT handler was empty stub, PATCH had dead code

### 30. Frontend Modal & Screen Component Extraction (v1.37.0)
- **17 modal components extracted** from monolithic `modals-extra.jsx` (2361→151 lines) into `src/components/modals/`
- **7 screen components extracted** from monolithic `secondary-screens.jsx` (1760→11 lines) into `src/components/screens/`
- **Pattern**: Component directory with `index.jsx` re-export hub, backward-compat shim
- **Chunking**: Modals in separate build chunk (181 kB); screens bundle unaffected (still imported via side-effect shim)
- **Status**: 2 of 23 flat JSX files refactored; 21 files (~13,000 lines) remain in `src/root/`

### 31. Calendar Events (v1.44.0)
- **Purpose**: Project scheduling and timeline management
- **Business value**: Track engineering milestones, procurement deadlines, manufacturing schedules
- **Backend**: `CalendarEvent` model in `backend/app/models/calendar_event.py`, CRUD API in `backend/app/api/endpoints/calendar_events.py`
- **API endpoints**: `GET/POST /api/v1/calendar/calendar-events`, `PUT/DELETE /api/v1/calendar/calendar-events/{id}`
- **Filtering**: By date range (start_date, end_date), event_type
- **Database**: `calendar_events` table with indexes on (user_id, start_time), event_type, related_resource
- **Frontend client**: `calendarEventsAPI` in `frontend/api.js` with full CRUD methods
- **Previous state**: Data existed only in browser localStorage (`__bbox_calendar_events`) — permanent data loss risk

### 32. User Data Sync (v1.44.0)
- **Purpose**: Bridge between frontend localStorage and PostgreSQL for all user-persisted data
- **Business value**: Eliminates data loss risk from browser cache clears — data persists in database
- **Backend**: `user_sync.py` endpoint file with 17 endpoints under `/api/v1/user-sync/`
- **Supported data types**: Generic key-value store, user preferences, onboarding checklist, BOM drafts, barcode scan history, saved searches
- **Database tables**: `user_data_store`, `user_preferences`, `user_checklist_progress`, `bom_drafts`, `scan_history`, `saved_searches`
- **Frontend client**: `userDataSyncAPI` with methods for all 19 localStorage key types
- **Unique constraints**: Added to all user_data tables enabling proper upsert behavior

### 33. Frontend API Client Expansion (v1.44.0)
- **New clients**: `workOrdersAPI`, `ecoAPI`, `inventoryAPI`, `qualityAPI`, `userDataSyncAPI`, `calendarEventsAPI`
- **Total API clients**: 30+ modules covering all 60+ backend endpoint routers
- **Port fix**: `API_BASE` corrected from `localhost:8002`→`localhost:8000`

### 35. Multi-Language i18n (v1.48.0)
- **Purpose**: Internationalization support for enterprise global deployment
- **Supported locales**: en (English), ja (Japanese), zh (Chinese), de (German), fr (French), es (Spanish)
- **Files**: `frontend/src/locales/{en,ja,zh,de,fr,es}.json`
- **Infrastructure**: i18next with JSON resource files
- **Coverage**: ~2,100 translation keys per locale
- **Status**: en.json 100%, ja.json ~20%, zh/de/fr/es placeholders (need native translation)

### 34. PostgreSQL Test Database (v1.45.0)
- **Purpose**: Run test suite against PostgreSQL instead of SQLite for production database fidelity
- **Infrastructure**: `docker-compose.test.yml` with PostgreSQL 15 (port 5433) + Redis 7 (port 6380)
- **Auto-detection**: Both `conftest.py` files detect PostgreSQL from `POSTGRES_SERVER` or `CI` env vars
- **CI enforcement**: CI workflows now set `TEST_DATABASE_URL` — all CI tests run against PostgreSQL
- **SQLite fallback**: Still available with deprecation warning for environments without Docker
- **Usage**:
  ```bash
  docker compose -f backend/docker-compose.test.yml up -d
  SET TEST_DATABASE_URL=postgresql+asyncpg://bom_user:bom_test_password@localhost:5433/bom_test_db
  python -m pytest backend/app/tests/ -v
  ```
