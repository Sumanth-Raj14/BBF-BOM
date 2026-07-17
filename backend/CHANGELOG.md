# Changelog

## [Unreleased]

## [1.37.0] - 2026-06-28

### Fixed
- **Vendors.py critical bug**: PUT `update_vendor` handler had empty body (only docstring, no implementation). PATCH `patch_vendor` handler had dead code after `return` statement and referenced non-existent `vendor_service` module. Fixed by moving DB logic into PUT handler and making PATCH delegate to it

### API
- **27 new PATCH routes**: Added PATCH endpoints with full partial-update support across 22 files — `approval_automation`, `approvals`, `bom_items`, `bom_templates`, `capa`, `comments`, `compliance`, `contract` (2 routes: contracts + pricing agreements), `country_history`, `deviation`, `erp_connectors`, `fai`, `kanban`, `make_vs_buy`, `notifications`, `order_tracking`, `part_vendors`, `procurement`, `roles_permissions`, `should_cost`, `supplier_scorecard`, `tenants`, `traceability` (2 routes: serial numbers + lots), `webhooks`
- **Bulk DELETE operations**: Added `POST /{resource}/bulk-delete` endpoints for `parts`, `vendors`, `bom_items`, `notifications` — all use SQL IN clause for efficient batch deletion

## [1.36.0] - 2026-06-26

### Infrastructure
- **Prometheus alert rules**: Created `backend/monitoring/alerts.yml` with 12 production alert rules (HighApiErrorRate, DatabaseDown, RedisDown, BackupStale, BackupFailed, DiskSpaceLow, HighMemoryUsage, HighLatencyP99/P95, RateLimitThrottling, ConnectionPoolExhaustion, WebsiteDown)
- **Alertmanager**: Created `backend/monitoring/alertmanager.yml` with email + webhook receivers, severity-based routing, inhibition rules
- **Alertmanager service**: Added `alertmanager` container to `docker-compose.prod.yml` with resource limits, healthcheck, persistent volume
- **Fixed YAML indentation bugs**: `docker-compose.prod.yml` lines 198-199 (extra spaces before ENCRYPTION_KEY and IS_PRODUCTION), `.github/workflows/ci.yml` lines 225-226 (extra spaces in echo commands)
- **Prometheus configs**: Both `docker/monitoring/prometheus.yml` and `backend/monitoring/prometheus.yml` updated with alerting config and rule_file references

### API
- **PATCH routes added**: 5 new PATCH endpoints added for partial resource updates — `/parts/{part_id}`, `/vendors/{vendor_id}`, `/projects/{project_id}`, `/users/{user_id}`, `/documents/{document_id}`. All delegate to existing PUT handlers with `exclude_unset=True` semantics

### Frontend
- **Japanese locale (ja.json) wired up**: Imported and registered in `src/i18n.js` — language detection now supports Japanese via browser/locale preference
- **AGENTS.md created**: Project-level agent instructions with lint/typecheck commands, project structure, code conventions, and important notes

### Documentation
- **Consolidated dual audit reports**: `backend/docs/ENTERPRISE_AUDIT_REPORT.md` marked as ARCHIVED with pointer to canonical root-level report

## [1.35.0] - 2026-06-26

### Security — Medium Severity
- **WebSocket rate limiting**: Upgraded from in-memory-only to Redis-backed distributed rate limiting (`_check_ws_redis_rate_limit` in `main.py:462-480`) with automatic in-memory fallback — prevents WebSocket abuse from shared IPs in multi-instance deployments
- **MEDIUM**: `Retry-After` header added to all 429 responses — rate limit handler (`main.py:177-185`), API key rate limit (`deps.py:101`), user rate limit (`deps.py:188`), failed login IP rate limit (`auth_service.py:135`)
- **Critical Risk #10 RESOLVED**: WebSocket rate limiting per-user via Redis-backed distributed store — previously only per-IP in-memory

### Performance
- **Backup cleanup**: `cleanup_old_backups()` (`backup.py:799-843`) refactored from per-file loop to bulk operations — S3 deletions use `asyncio.gather` for concurrent execution, DB updates use single `UPDATE ... IN (...)` statement instead of N individual queries

### Frontend
- **Build-time mock code stripping**: Added Vite `define` config (`vite.config.ts:18-22`) — production builds now replace `window.__USE_MOCK_DATA` with `false` at compile time, enabling Rollup tree-shaking to eliminate 88+ dead mock code paths from the production bundle (previously shipped as unreachable but present dead code)

### Documentation
- Updated `ENTERPRISE_AUDIT_REPORT.md` — Critical Risk #10 resolved (WebSocket per-user rate limiting), Retry-After headers added
- Updated `DISASTER_RECOVERY_RUNBOOK.md` — Added Encryption & Decryption section with streaming encrypt/decrypt details, added encryption settings to backup config table, updated health endpoint JSON to match current secure format

## [1.34.0] - 2026-06-25

### Security — Critical Fixes
- **CRITICAL**: Grafana admin password no longer hardcoded (`docker-compose.monitoring.yml` now requires `GRAFANA_ADMIN_PASSWORD` env var)
- **HIGH**: Production CSP hardened — removed `unsafe-inline` from `style-src`, added `require-trusted-types-for 'script'` — `security_headers.py:31`
- **HIGH**: Docker image tags pinned from `:latest` to specific versions across all compose files (pgbackrest:2.53, pgbouncer:1.23, minio:RELEASE.2024-06-11, etc.)
- **MEDIUM**: Production docker-compose YAML indentation fixed (lines 183-188 had extra spaces breaking YAML parsing)

### Database Schema
- **HIGH**: Added `UniqueConstraint("part_id", "warehouse_id", "bin_location_id", "lot_number")` on Inventory table — prevents duplicate inventory records (`inventory.py:103`)
- **HIGH**: Added `UniqueConstraint("partId", "vendorId")` on PartVendor table — prevents duplicate part-vendor mappings (`part_vendor.py:12`)

### Infrastructure
- Created `scripts/pin-docker-digests.sh` — automated SHA256 digest resolution and pinning for all Docker images
- Added TODO comments with `docker inspect` commands for SHA256 pinning in all docker-compose files

### Documentation
- Updated `ENTERPRISE_AUDIT_REPORT.md` — marked 4 risks as RESOLVED, added schema fixes table, bumped Enterprise Readiness Score to 8.7/10

## [1.3.0] - 2026-06-25

### Security — Critical Fixes
- **CRITICAL**: Hardcoded admin credentials removed from frontend source (`auth-onboarding.jsx`, `App.jsx`) and compiled bundle rebuilt
- **CRITICAL**: RSA private key now encrypted with `BestAvailableEncryption` instead of `NoEncryption()` — `security.py:46`
- **CRITICAL**: SQL injection vector in `api_keys.py` expires_sql fixed — f-string changed to parameterized bind variable
- **CRITICAL**: WebSocket broadcast/disconnect now use `scoped_channel` — prevents cross-tenant data leak (`main.py:517,519`)

### Security — High-Severity Fixes
- **HIGH**: CORS `allow_methods`/`allow_headers` restricted from wildcards to explicit safe lists
- **HIGH**: IP-based rate limiting added (`_check_ip_rate_limit` in `auth_service.py`) — 10 attempts/minute per IP per action
- **HIGH**: Rate limit cache DoS fixed — `.clear()` replaced with LRU eviction (`deps.py:27-28,101-102`)
- **HIGH**: Sanitize middleware no longer silently passes on JSON parse failure — logs warning instead (`sanitize.py:55-56`)
- **HIGH**: SAML debug mode disabled completely (was enabled when `IS_PRODUCTION is False`) — `saml_sso.py:30`
- **HIGH**: Rate limiting added to SSO callback endpoint — `@limiter.limit("10/minute")` on `sso.py:136`
- **HIGH**: Metrics endpoint now requires authentication — `api_v1.py:297-299`
- **HIGH**: API key prefix stores actual prefix instead of `"..."` suffix — `api_keys.py`
- **HIGH**: JSON sanitization switched from `html.escape` (double-encoding) to XSS pattern stripping — `sanitize.py`
- **HIGH**: JWT algorithm verification added — `get_unverified_header()` check before decode — `security.py:126-137`

### Database Model Fixes
- TokenBlacklist: Added `tenantId` column + expiry index
- SupplierPortal: Added `ondelete="SET NULL"` to FK columns (`awarded_to_vendor_id`, `created_by`)
- AuditLog: Added indexes on `createdAt` and `userId`
- BomItem: Added composite index on `(bomTemplateId, partId)`
- WorkOrder: Added composite index on `(status, due_date)`
- DigitalSignature: Added index on `mfa_type`

### Bug Fixes
- **SAML async bug**: `_prepare_saml_request()` changed from sync to `async def` (was `await` in sync function) — `saml_sso.py:58-78`

### Frontend
- Frontend rebuilt: `npm run build` — 109 modules, 1.78s, 0 errors
- Verified: hardcoded `admin123` no longer present in compiled bundle

## [1.2.0] - 2026-06-20

### Security — Critical Fixes
- **CRITICAL**: `get_users()` now scopes to tenantId — fixes horizontal privilege escalation where any authenticated user could enumerate all users across all tenants
- **CRITICAL**: `get_user(id)` now scopes to tenantId — fixes cross-tenant user data leak
- **CRITICAL**: JWT tokens now include `tenantId` claim — tenant isolation middleware was non-functional (previously always `None`)
- **CRITICAL**: `update_user()` and `delete_user()` now scope to tenantId
- **HIGH**: API key auth changed from O(n) full-table enumeration to indexed prefix lookup (`key_prefix` column)
- **HIGH**: `encryption.py` Fernet key derivation changed from plain truncation to SHA256 (previously only used 32 chars of key without hashing; now consistent with `totp_encryption.py`)
- **HIGH**: SolidWorks license key no longer returned in `/license/verify` response (was leaking `SOLIDWORKS_LICENSE_KEY` env var)
- **HIGH**: `isSuperuser` field removed from `UserUpdate` schema (could only be set by superusers, but without audit trail; now requires dedicated audited endpoint)
- **MEDIUM**: Removed duplicate `require_mfa_for_superuser` dependency (function was dead code — `get_current_superuser` already enforces MFA)

### Performance — Critical Fixes
- **CRITICAL**: N+1 queries eliminated in `procurement.py` — `get_procurement()`, `get_procurement_alerts()`, and all single-item endpoints used 3N+1 queries per request; now uses batch loading (2 queries total regardless of page size)
- **CRITICAL**: `get_folders()` in `documents.py` changed from loading ALL documents into memory to SQL `GROUP BY` aggregation — prevents OOM at scale
- **MEDIUM**: S3 storage client recreated per operation instead of caching a closed client (aiobotocore context manager bug: `async with client as c` closed the client after first use, making all subsequent uploads/downloads fail)

### Reliability
- Audit logging fire-and-forget tasks now tracked in `_pending_audit_tasks` set; app lifespan drains pending tasks on shutdown to prevent lost audit entries
- S3 storage: removed silent fallback to local filesystem (data inconsistency risk); client now properly created per-operation with aiobotocore session pattern

### Technical Debt Audit (ponytail/YAGNI)
- Completed full over-engineering audit across 5 layers: endpoints (60 files), models (118 classes, ~860 cols), core (25 files, 3,349 lines), tests (42 files, 269 tests), frontend (30 files, ~19,400 lines)
- Full enterprise-wide forensic audit: PostgreSQL bypass scan, security audit, performance audit, database audit, UI/UX audit, disaster recovery audit
- OpenBOM competitive gap analysis: 50% parity score; 5 P0 gaps identified (real-time collab, xBOM views, bulk import, CAD connectors, accessibility)

### Fixed
- `get_users()` no longer returns cross-tenant user data
- `get_user(id)` no longer leaks cross-tenant user data
- JWT `create_tokens_for_user()` now includes `tenantId` in both access and refresh tokens
- Removed `index=True` from remaining PK columns identified during audit
- Procurement N+1 queries fixed across 5 endpoints
- Documents folder counts use SQL aggregation instead of in-memory iteration
- S3 client no longer closed after first upload
- Encryption key derivation now uses SHA256 (consistent across encryption.py and totp_encryption.py)
### Fixed
- **Critical**: Test infrastructure no longer connects to production PostgreSQL (replaced lifespan with noop)
- **Critical**: `get_session_maker()` now uses test SQLite DB instead of production PostgreSQL
- **Critical**: All 48+ create endpoints now propagate `tenantId=current_user.tenantId`
- **Critical**: Supplier portal token auth replaced from in-memory dict to JWT (`create_access_token`/`verify_token`)
- **Critical**: `.env` test secrets replaced with generated secure secrets
- **Critical**: Password reset endpoint no longer leaks cross-tenant data (tenant validation after token match)
- **Critical**: `before_flush` listener added for UPDATE/DELETE tenant isolation
- **Critical**: TOTP secrets encrypted at rest using Fernet/AES in UserMfa model
- **Critical**: API key hashing switched from SHA-256 to bcrypt
- **Critical**: Redis-backed distributed rate limiting replaces in-memory slowapi
- BOM template `load` endpoint no longer crashes with MissingGreenlet (added selectinload)
- CRUD part lifecycle test uses correct paginated response format (`["items"]`)
- Kanban low-stock alert test updated for list response format
- Supplier portal endpoints no longer require JWT authentication (removed router-level dependency)
- CSRF middleware exempts `/api/v1/supplier-portal/` paths (uses own token auth)
- CSRF test updated for correct Bearer bypass behavior (307 → 200 scenario)
- Input sanitization now HTML-escapes `<`, `>`, `"`, `&` characters for XSS prevention
- Input sanitization now handles `application/x-www-form-urlencoded` form data via urlencode re-encoding
- Form data (`application/x-www-form-urlencoded`) was unsanitized — fixed with URL-encoded form re-encoding
- All 14 test files updated for paginated response format
- `pg_dump`/_find_tool() search expanded to include Linux paths
- Disk space check (`shutil.disk_usage()`) added before backup execution
- `backup_metadata` column name mismatch in `backup_history` model fixed
- `POST /api/v1/backup/restore/{backup_id}` HTTP restore endpoint added
- `config.py` secret strength validation with entropy checking and weak pattern detection
- `create_supplier_user` and `approve/reject price-update` endpoints now use proper admin auth (User) vs supplier auth (SupplierUser)

### Added
- 8 mandatory documentation files: FEATURE_CATALOG, SYSTEM_WORKFLOW, MODULE_REFERENCE, ARCHITECTURE, TESTING_AND_VALIDATION, OPEN_ITEMS, RELEASE_NOTES, CHANGELOG
- `DISABLE_AUDIT_LOG` and `DISABLE_CACHE_DB_FALLBACK` env vars for test isolation
- `register_tenant_listeners()` called in test conftest for tenant isolation in tests
- `noop_lifespan` context manager in test conftest to prevent production DB connection
- `app/core/totp_encryption.py` — New module for encrypting/decrypting TOTP secrets
- `docker-compose.prod.yml` — Production compose with PostgreSQL 16, Redis, PgBouncer, MinIO, Celery, pgBackRest, nginx, and multi-stage Dockerfile.prod
- `Dockerfile.prod` — Multi-stage production build with pg_dump, curl, and 4 workers
- Vendor XLSX/PDF export endpoints in `export_report.py`
- BOM XLSX export endpoint in `export_report.py`
- Tenant filtering on all export endpoints
- `get_current_supplier_user` dependency for JWT-based supplier auth

### Changed
- Test pass rate: 109/238 (45.8%) → 238/238 (100%)
- `app/tests/conftest.py`: imports all models before create_all, overrides session_maker, replaces lifespan
- `supplier_portal.py`: Replaced `_active_tokens` in-memory dict with JWT tokens via `create_access_token`
- `export_report.py`: Added tenant filtering on all queries, refactored helper functions, added vendor+BOM XLSX exports
- `bom_templates.py` schemas: Removed deprecated `bomData` field from create/update schemas
- `app/schemas/bom_template.py`: Removed deprecated `bomData` field
- `bom_templates.py` load endpoint now returns computed data from `bom_items` instead of raw JSON column

### Removed
- Deprecated `bomData` field from BomTemplateCreate and BomTemplateUpdate Pydantic schemas (column remains in model for backward compat, marked for future migration)

## [0.9.0] - Previous
- Initial feature-complete release with all 25+ modules
- Multi-tenant architecture with TenantAwareMixin
- JWT authentication with MFA support
- RBAC with 5 default roles
- Comprehensive middleware stack (CSRF, audit, rate limiting, sanitization)
