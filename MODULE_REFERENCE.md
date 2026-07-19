# Blackbox BOM Platform — Module Reference

**Date**: 2026-07-19  
**Version**: v2.1.0  
**Scope**: Backend services, core modules, database layer, ORM models, and frontend component architecture

---

## Overview

Blackbox BOM is a **local-first, on-prem enterprise BOM/PLM platform** competing with OpenBOM. This reference documents the public interfaces, key internal logic, responsibilities, failure modes, and security implications of every major module and service.

**Architecture**:
- **Backend**: FastAPI + async SQLAlchemy 2.0 + PostgreSQL (primary) / SQLite (test)
- **Frontend**: React + Vite with lazy-loaded modular screens and a shim pattern for component registration
- **Multi-tenancy**: App-layer isolation via `TenantAwareMixin` + optional Postgres Row-Level Security (RLS)
- **Auth**: RS256 JWT + RBAC (roles, permissions, tenant-scoped)

---

## Table of Contents

1. [Backend Architecture](#backend-architecture)
2. [Core Modules](#core-modules)
3. [Database & ORM Layer](#database--orm-layer)
4. [Services](#services)
5. [Data Models](#data-models)
6. [Frontend Architecture](#frontend-architecture)
7. [Frontend Components](#frontend-components)
8. [Cross-Cutting Concerns](#cross-cutting-concerns)
9. [Known Limitations & Open Items](#known-limitations--open-items)
10. [Cross-Reference](#cross-reference)

---

## Backend Architecture

### Initialization & Lifecycle

**File**: `backend/app/main.py` (23.2 KB)

- **Lifespan Manager** (async context manager): Initializes the PostgreSQL engine with retry-on-startup (5 attempts, exponential backoff), runs `Base.metadata.create_all()` if `SKIP_CREATE_ALL != true`, and registers ORM tenant isolation listeners.
- **Middleware Stack**:
  - `TrustedHostMiddleware` (ALLOWED_HOSTS validation)
  - `CORSMiddleware`
  - `SecurityHeadersMiddleware` (CSP, HSTS, etc.)
  - `CompressionMiddleware` (gzip for >500 bytes)
  - `CSRFMiddleware` (token-based CSRF protection)
  - `InputSanitizationMiddleware` (HTML escaping of request bodies)
  - `SessionTimeoutMiddleware` (configurable idle timeout)
  - `SlowAPIMiddleware` (rate limiting via RateLimiter)
  - `AuditLogMiddleware` (request-scoped logging + RequestIDMiddleware)
  - `MetricsMiddleware` (request latency, status codes, DB query timing)
- **Background Tasks**:
  - Backup scheduler (`_run_backup_scheduler`): Runs configured backup pipeline every `BACKUP_SCHEDULE_HOURS`
  - Integration drainer (`_run_integration_drainer`): Processes outbox at 15-second intervals
  - Job queue worker (`start_queue_worker`): Async in-process worker for bulk imports, email, notifications
- **WebSocket Auth**: Middleware validates JWT tokens on WebSocket `CONNECT` via `authenticate_websocket()`

**Error Handlers**: Global exception handlers for `HTTPException`, `RequestValidationError`, `RateLimitExceeded`, returning structured JSON responses.

### Port & Deployment Defaults

- **Host**: `0.0.0.0` (configurable)
- **Port**: `8000` (FastAPI default)
- **Reverse Proxy**: Trusts `X-Forwarded-For` / `X-Real-IP` only if `BEHIND_PROXY=true`

---

## Core Modules

### 1. Configuration (`app/core/config.py`)

**Scope**: Environment-based settings management via Pydantic v2 `BaseSettings`.

**Key Configuration Categories**:

| Category | Variables | Notes |
|----------|-----------|-------|
| **Database** | `POSTGRES_SERVER`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URI` | Assembles PostgreSQL connection string; auto-detects `DATABASE_URI` from components if not provided |
| **Connection Pool** | `DB_POOL_SIZE` (default 10), `DB_MAX_OVERFLOW` (default 20) | Consumed by SQLAlchemy async engine |
| **JWT/Auth** | `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES` (30), `REFRESH_TOKEN_EXPIRE_DAYS` (30), `ALGORITHM` (RS256) | RS256 requires RSA key pair; generates keys on first run if missing |
| **CORS** | `BACKEND_CORS_ORIGINS` (list of allowed origins), `ALLOWED_HOSTS` | Configurable via env JSON or comma-separated; defaults to localhost:3000-3003 |
| **Email (SMTP)** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `ADMIN_EMAIL` | Used by `email_service.py` |
| **SSO** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `SSO_REDIRECT_URI` | OAuth 2.0 provider credentials |
| **SAML 2.0 (Enterprise)** | `SAML_IDP_ENTITY_ID`, `SAML_IDP_SSO_URL`, `SAML_IDP_SLO_URL`, `SAML_IDP_CERT` | For enterprise SSO |
| **S3/MinIO** | `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION` | Object storage for documents |
| **File Upload** | `UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB` (50), `ALLOWED_EXTENSIONS` (pdf, docx, xlsx, csv, txt, png, jpg, step, stp, igs, sldprt, sldasm) | Configurable upload constraints |
| **Rate Limiting** | `RATE_LIMIT_PER_MINUTE` (60), `RATE_LIMIT_AUTH_PER_MINUTE` (5) | Global and auth-specific limits |
| **Backup** | `BACKUP_DIR`, `BACKUP_SCHEDULE_HOURS` (6), `BACKUP_MIN_DISK_GB` (5) | Disk checks before backup; retention tiers: daily (7d), weekly (30d), monthly (365d), yearly (7y) |
| **Encryption** | `ENCRYPTION_KEY` | Encrypts RSA private key at rest; also used for field-level encryption |
| **Redis** | `REDIS_URL` (redis://127.0.0.1:6379/0) | For caching and token blacklist; graceful fallback if unavailable |
| **Row-Level Security (RLS)** | `ENABLE_RLS` (default False) | Optional Postgres RLS enforcement; app-layer tenant filtering is the primary mechanism |
| **Environment** | `ENVIRONMENT` (development/staging/production), `IS_PRODUCTION` (auto-derived) | Controls defaults for error verbosity, CORS strictness |
| **Self-Registration** | `ALLOW_TENANT_SELF_SIGNUP` (default False) | If False, only first registration creates a new tenant; if True, each signup can create a new tenant |

**Secret Management**:
- Supports HashiCorp Vault via `_load_vault_secret()` — reads `VAULT_ADDR` and `VAULT_TOKEN` from env
- Validates secret entropy (minimum 80 bits); rejects weak secrets like "test", "password", "changeme"
- Derives `IS_PRODUCTION` from `ENVIRONMENT` if not explicitly set

---

### 2. Security (`app/core/security.py`)

**Scope**: Cryptography, JWT creation/verification, password hashing, RSA key management.

**Public Functions**:

```python
create_access_token(data: dict, expires_delta: Optional[timedelta]) -> str
# Issues RS256 JWT with subject, exp, iat, type="access", jti (unique token ID for revocation)

create_refresh_token(data: dict) -> str
# Issues long-lived RS256 JWT, type="refresh"

create_tokens_for_user(user_id: int, user_email: str) -> dict
# Returns {"access_token", "refresh_token", "token_type": "bearer"}

verify_token(token: str) -> dict
# Decodes RS256 JWT; raises HTTPException(401) on invalid signature/expiry

verify_token_with_blacklist(token: str) -> dict
# Calls verify_token() then checks token blacklist in Redis

get_password_hash(password: str) -> str
# bcrypt.hashpw (rounds auto-tuned by bcrypt library)

verify_password(plain: str, hashed: str) -> bool
# bcrypt.checkpw
```

**Internal Logic**:
- **RSA Key Management**: `_ensure_rsa_keys()` loads or generates a 4096-bit RSA keypair, stores in `RSA_KEY_DIR` (default `./rsa_keys`), encrypts private key with `ENCRYPTION_KEY`
- **JWT JTI** (JSON Web Token ID): Generated via `secrets.token_urlsafe(16)` for token revocation tracking
- **Token Storage**: Tokens stored in secure cookies (HttpOnly, SameSite=Lax), refresh tokens use a longer expiry

**Security Implications**:
- RS256 is asymmetric; public key can be shared for token verification, private key must be protected
- Token expiry is checked on every request; blacklist prevents use of revoked tokens
- Bcrypt with auto-tuning ensures password strength

---

### 3. Tenant Isolation (`app/core/tenant_context.py` & `app/core/tenant_events.py`)

**Tenant Context** (`tenant_context.py`):
- Uses Python `contextvars` (thread-safe, async-aware) to store the current tenant ID per request
- `set_tenant_id(tenant_id)` and `get_tenant_id()` manage context

**Tenant Event Listeners** (`tenant_events.py`):
- **Primary Defense**: App-layer filtering via SQLAlchemy ORM event listeners
- **Auto-Populate tenantId on INSERT**: `before_insert` listener sets `target.tenantId` from context
- **Auto-Filter SELECT**: `do_orm_execute` listener appends `WHERE tenantId == current_tenant_id` to ORM SELECT statements (non-ORM SELECTs are logged as warnings and blocked)
- **Guard UPDATE/DELETE**: `before_flush` listener raises `PermissionError` if a dirty/deleted object's `tenantId` differs from context
- **Optional Postgres RLS**: When `ENABLE_RLS=true` and backend is PostgreSQL, Alembic migration 040 enables row-level security policies as a second layer

**Model Mixin** (`app/models/mixins.py`):
```python
class TenantAwareMixin:
    tenantId = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    tenant = relationship("Tenant")
```
All data models inherit from `TenantAwareMixin` to enforce tenant scoping.

**Cross-Tenant Leak Risk**: ⚠️ Non-ORM SQL queries (e.g., `db.execute(text(...))` without the `.where()` guard) bypass app-layer filtering and can leak cross-tenant data. Use `tenant_sql_clause()` helper for manual SQL.

---

### 4. Backup (`app/core/backup.py`)

**Scope**: Automated PostgreSQL backup with retention, encryption, verification, alerting.

**Backup Types**:
- `FULL` (default): `pg_dump` of entire database
- `SCHEMA_ONLY`: Schema without data
- `TABLE`: Individual table via `pg_dump -t`
- `PHYSICAL`: `pg_basebackup` for Point-In-Time Recovery (PITR) readiness

**Retention Tiers**:
| Tier | Retention |
|------|-----------|
| DAILY | 7 days |
| WEEKLY | 30 days |
| MONTHLY | 365 days |
| YEARLY | 7 years |

**Key Functions**:
- `run_backup_pipeline()`: Executes full backup, verifies via restore-test, encrypts with Fernet (AES-128), uploads to S3 (if configured), records metadata in `backup_history` table
- `verify_backup(backup_path)`: Attempts `pg_restore` into a temporary DB to confirm integrity
- `prune_old_backups()`: Deletes backups older than retention thresholds

**Failure Modes**:
- PostgreSQL tools not in PATH → raises `RuntimeError`
- Insufficient disk space → aborts; requires `BACKUP_MIN_DISK_GB` free
- S3 upload failure → backup stored locally; optional alerting via webhook
- Encryption failure → aborts; requires `ENCRYPTION_KEY` set

**Performance Notes**:
- Streamed encryption in 64 MB chunks to avoid OOM on large databases
- Compression (gzip) reduces backup size ~70-80%
- Scheduled backups run async via `_run_backup_scheduler()` to avoid blocking requests

---

### 5. Caching (`app/core/cache.py`)

**Scope**: Redis-backed caching for expensive operations (BOM explosions, part searches, etc.) and token blacklist.

**Key Functions**:
```python
async def cache_get(key: str) -> Optional[Any]
# Returns deserialized JSON value or None if not found/expired

async def cache_set(key: str, value: Any, ttl: int = 300)
# Stores value with TTL (default 5 minutes)

async def cache_invalidate(key: str)
# Deletes key

async def cache_invalidate_pattern(pattern: str)
# Deletes all keys matching glob pattern (used for BOM-related cache invalidation)

async def blacklist_token(jti: str, exp: int)
# Adds JWT token ID to blacklist until expiry
```

**Resilience**:
- Redis connectivity failures are non-fatal; cache gracefully disables with 30-second retry cooldown
- No cache → requests hit the database directly (slower but correct)
- Cache key hashing ensures tenant scoping: keys are prefixed `bom:` and include tenant ID

**Performance Notes**:
- BOM explosion results cached for 5 minutes (high CPU cost)
- Part list searches cached for 2 minutes
- Session refresh not cached (always hit auth endpoint to prevent stale tokens)

---

### 6. Authentication Service & RBAC (`app/core/security.py`, `app/core/rbac.py`)

**RBAC Model**:
- **Roles**: superadmin, admin, engineering, procurement, finance, viewer
- **Role Hierarchy** (inheritance):
  ```
  superadmin → admin → engineering/procurement/finance → viewer
  ```
  Users with higher roles inherit permissions from lower roles.
- **Permissions**: Granular actions (e.g., "part:create", "bom:approve", "user:manage")
- **Tenant Scoping**: Roles and permissions are tenant-scoped; users belong to a tenant and inherit roles within that tenant

**Dependency Classes**:
```python
class RoleChecker(allowed_roles: list[str]):
    async def __call__(current_user: User, db: AsyncSession) -> User
    # Raises 403 if user role not in allowed_roles (unless superuser)

class PermissionChecker(required_permissions: list[str]):
    async def __call__(current_user: User, db: AsyncSession) -> User
    # Raises 403 if user missing any required permission
```

**Pre-Built Checkers**:
```python
require_admin = RoleChecker(["admin", "superadmin"])
require_engineering = RoleChecker(["admin", "engineering", "superadmin"])
require_procurement = RoleChecker(["admin", "procurement", "superadmin"])
require_finance = RoleChecker(["admin", "finance", "superadmin"])
```

**Security Notes**:
- Superusers bypass all role/permission checks (use sparingly)
- Permissions are checked on every endpoint via dependency injection
- Client-side role/permissions are UI hints only; backend must enforce authorization

---

### 7. Rate Limiting (`app/core/rate_limit.py`)

**Scope**: SlowAPI-based rate limiting to prevent brute-force and DoS attacks.

**Limits**:
- Global: `RATE_LIMIT_PER_MINUTE` (default 60)
- Auth endpoints: `RATE_LIMIT_AUTH_PER_MINUTE` (default 5)

**Per-IP Failed Login Tracking** (in `auth_service.py`):
- Tracks failed login attempts per IP in a sliding window (5 minutes)
- Locks out IP after 20 failed attempts for 15 minutes
- Local in-memory tracking; scales to ~10,000 tracked IPs

---

### 8. CSRF Protection (`app/core/csrf.py`)

**Scope**: Double-submit cookie pattern for CSRF defense.

- Tokens stored in secure cookies (HttpOnly=false for JS access, SameSite=Lax)
- Validated on state-changing requests (POST/PUT/DELETE) via `X-CSRF-Token` header
- Uses `secrets.token_urlsafe(32)` for entropy

---

### 9. Audit Logging (`app/core/audit_middleware.py`)

**Scope**: Comprehensive request/response logging for compliance.

**AuditLogMiddleware**:
- Logs request method, path, user email, client IP, user agent, request body (for mutations)
- Records response status code and latency
- Skips logging for read-only endpoints (GET) by default; tunable
- Uses `RequestIDMiddleware` to assign unique request IDs for tracing

**AuditLog Model**:
```python
action: str  # "create", "update", "delete", "login", "logout"
entityType: str  # "part", "bom", "user", "auth"
entityId: int
entityName: str
userId: int
userEmail: str
userIp: str
userAgent: str
changes: dict  # Before/after values for updates
tenantId: int
timestamp: datetime
```

---

### 10. Encryption (`app/core/encryption.py`)

**Scope**: Field-level encryption for sensitive data (PII, API keys, etc.).

- Uses Fernet (symmetric AES-128 encryption from `cryptography` library)
- Encryption key derived from `ENCRYPTION_KEY` config
- Provides decorators for encrypting/decrypting model fields transparently

---

### 11. SAML 2.0 SSO (`app/core/saml_sso.py`)

**Scope**: Enterprise SAML 2.0 authentication via third-party IdP.

**Configuration**:
- `SAML_IDP_ENTITY_ID`: IdP entity identifier
- `SAML_IDP_SSO_URL`: SSO service endpoint
- `SAML_IDP_SLO_URL`: Single logout endpoint
- `SAML_IDP_CERT`: IdP certificate for signature verification

**Flow**:
1. User redirected to IdP login
2. IdP returns SAML assertion (signed)
3. Backend verifies signature and extracts user info
4. Creates or updates user in database, issues JWT

---

### 12. File Scanning & ClamAV (`app/core/file_scanning.py`, `app/core/clamav.py`)

**Scope**: Malware scanning for uploaded files via ClamAV daemon.

- Async integration with ClamAV via socket
- Scans before storing to S3
- Configurable whitelist of file extensions
- Returns scan result: clean, infected, or unknown

---

### 13. WebSocket Auth (`app/core/ws_auth.py`)

**Scope**: JWT validation for WebSocket upgrades (real-time collaboration, notifications).

- Extracts JWT from query parameter (`?token=...`) on CONNECT
- Validates token signature and expiry
- Rejects upgrade with 403 if invalid
- Stores authenticated user context for subsequent messages

---

### 14. Desktop Packaging & Auto-Update (`desktop/`)

**Scope**: Windows desktop deployment (bundled PostgreSQL + PyInstaller backend + launcher + auto-updater).

#### launcher.py (Process Lifecycle Manager)

**Responsibilities**:
- PostgreSQL cluster initialization and lifecycle (start, stop, crash recovery)
- Single-instance lock (prevents duplicate launches)
- Backend (Uvicorn) subprocess management
- Health polling (`/health` endpoint until ready)
- Browser launch (`http://localhost:8000`)
- Graceful shutdown (Ctrl+C handling, process cleanup)

**Key Functions**:
```python
init_postgres()         # Start embedded Postgres, wait for readiness
start_backend()         # Spawn Uvicorn, poll health
launch_browser()        # Open default browser to localhost:8000
handle_sigterm()        # Graceful shutdown (stop backend, close Postgres)
```

**Startup Sequence**:
1. Check lock file; if running, focus window and exit
2. Call `scripts/init_db.py` (schema bootstrap or upgrade)
3. Start embedded Postgres
4. Start Uvicorn backend
5. Open browser
6. Monitor and restart if crashed

#### updater.py (Auto-Update Engine, 31 Tests)

**Responsibilities**:
- Version feed polling (local file or HTTP)
- Installer download + SHA-256 verification
- Silent install via Inno Setup (`/SILENT /NORESTART`)
- Data preservation (`%ProgramData%` unchanged)
- Post-install schema migration (auto-run `init_db.py upgrade head`)
- Exponential backoff on download failures

**Key Functions**:
```python
check_for_updates()     # Compare local vs. feed version; return (has_update, url, sha256)
download_installer()    # Download to cache with progress callback
verify_checksum()       # SHA-256 validate
apply_update()          # Execute Inno Setup silently, run post-install migration
```

**Error Handling**:
- Network unreachable: Skip check, retry next interval
- Download corrupted: Log error, retry with exponential backoff (5 min → 15 min → 60 min → daily)
- Checksum mismatch: Delete corrupted file, retry
- Post-install migration failure: Log error (data intact, roll back to previous version on next restart)

#### build.py (One-Command Build Pipeline)

**Responsibilities**:
- Frontend build (`npm run build`)
- Backend packaging (PyInstaller → `.exe`)
- Installer creation (Inno Setup → `setup.exe`)
- Code signing (digital signature with certificate)

**Key Functions**:
```python
build_frontend()        # Vite build output to dist/
bundle_backend()        # PyInstaller with hidden imports, data files
create_installer()      # Inno Setup compilation
sign_installer()        # Authenticode signing (optional)
```

**Configuration**:
- Reads `build-config.json`: version, cert path, signing password
- Outputs to `dist/` directory

---

### 14. Session Management (`app/core/session_timeout.py`, `app/core/auth_cookie.py`)

**Session Timeout**:
- Configurable idle timeout (default ~30 minutes)
- Tracks last request time per session
- Logs user out and invalidates tokens on timeout

**Auth Cookie**:
- HttpOnly, SameSite=Lax, Secure (in production)
- Short-lived access tokens (30 minutes) stored in cookies
- Refresh tokens use longer expiry (30 days)

---

## Database & ORM Layer

### SQLAlchemy 2.0 Async Setup (`app/db/session.py`)

**Key Functions**:
```python
async def init_engine() -> AsyncEngine
# Creates async PostgreSQL engine with retry-on-startup logic
# - 5 attempts, exponential backoff (1, 2, 4, 8, 16 seconds)
# - Validates connection via SELECT 1
# - Attaches query timing listeners for metrics

async def get_db() -> AsyncGenerator[AsyncSession]
# FastAPI dependency; yields AsyncSession for request scope
```

**Configuration**:
- **Pool Size**: 10 (tunable via `DB_POOL_SIZE`)
- **Max Overflow**: 20 (tunable via `DB_MAX_OVERFLOW`)
- **Pool Recycle**: 3600 seconds (recycles connections to avoid stale connections)
- **Pool Pre-Ping**: True (validates connection before use)
- **Echo**: False (no SQL logging by default)

**Query Metrics**:
- `before_cursor_execute` / `after_cursor_execute` listeners measure query latency
- Results published to `metrics.record_db_query(duration)`

**Failure Modes**:
- Database unreachable on startup → retries up to 5 times, fails with error if all attempts fail
- Connection pool exhausted → new requests queue; long-running queries can starve others

---

### ORM Base & Migrations (`app/db/base.py`, `alembic/`)

**Base**:
```python
class Base(DeclarativeBase):
    pass
```
All models inherit from `Base` (SQLAlchemy 2.0 pattern). Provides `__tablename__`, primary keys, relationships.

**Alembic Migrations**:
- Schema head: **040_postgres_rls_tenant_isolation**
- Location: `alembic/versions/`
- Versioning: Sequential numbering (001, 002, ..., 040)
- Auto-migration: `alembic upgrade head` applies all pending migrations

**Known Alembic Issue** (from system brief):
- `alembic_version.version_num` is VARCHAR(32) by default, but some revision IDs are 33 chars (e.g., 036_role_permission_tenant_scoped)
- **Impact**: Fresh Postgres installs fail at migration 036
- **Workaround**: Widen the column manually; permanent fix pending in `alembic/env.py`
- **SQLite Tests**: Never catch this because SQLite ignores VARCHAR length

**RLS (Row-Level Security)** (`app/db/rls.py`):
- Optional second layer on top of app-layer tenant filtering
- When `ENABLE_RLS=true`, migration 040 creates RLS policies
- Request-scoped: Issues `SET LOCAL app.current_tenant` per transaction
- Fallback for app-layer bugs; not a substitute for proper authorization

---

## Services

All services are located in `backend/app/services/` and follow a consistent pattern:
- **Scope**: Business logic (no HTTP details, framework-agnostic)
- **Async**: All functions are `async` (compatible with FastAPI)
- **Tenant-Aware**: Query results scoped by `tenantId` via helper functions
- **Error Handling**: Raise `HTTPException` for user-facing errors; let system errors propagate
- **Caching**: High-cost operations (explosions, searches) use Redis cache with invalidation

### 1. BOM Service (`app/services/bom_service.py`)

**Responsibilities**: BOM master data, items, explosion, rollup, snapshots, variants.

**Core Functions**:
```python
async def list_boms(db, skip=0, limit=100) -> (list[BOM], int)
# Returns paginated BOMs + total count, tenant-filtered

async def get_bom_detail(db, bom_id) -> dict
# Fetches BOM + items, hydrates part info, caches for 5 min

async def create_bom(db, data) -> BOM
# Inserts BOM header; auto-populates tenantId from context

async def add_bom_item(db, bom_id, data) -> BOMItem
# Inserts item into bom_items_master; validates part exists

async def get_bom_explosion(db, bom_id, max_depth=10) -> dict
# Recursive traversal of BOM tree to max depth; returns nested structure

async def get_quantity_rollup(db, bom_id) -> dict
# Aggregates quantities by part; used for supply chain planning

async def create_bom_snapshot(db, bom_id, note) -> BomSnapshot
# Freezes current BOM state for historical reference
```

**Data Structures**:
- `BOM`: Master header (bom_number, name, description, status, version, revision, project_id, created_by, created_at)
- `BOMItem` (bom_items_master): Line items (bom_id, part_id, quantity, unit, reference_designator, find_number, sort_order, parent_item_id, cost snapshots)
- `BomSnapshot`: Historical snapshots (bom_id, snapshot_data_json, created_at, created_by)
- `BomVariant`: Variant configurations (base_bom_id, variant_key, items)
- `BomTemplate`: Reusable BOM templates for mass production

**Performance Notes**:
- BOM explosion is cached for 5 minutes (high CPU cost)
- In-memory part cache (keyed by `(tenant_id, part_id)`) speeds repeated lookups
- Caches invalidated on any BOM/item mutation

**Cache Keys**:
```
bom:{bom_id}
bom:explosion:{bom_id}:{depth}
bom:explosion_closure:{bom_id}:{part_id}
bom:cost_rollup:{bom_id}
```

---

### 2. Part Service (`app/services/part_service.py`)

**Responsibilities**: Part master data, search, lifecycle, vendor/pricing info.

**Core Functions**:
```python
async def list_parts(db, page, tenant_id, search=None, category=None, vendor=None, manufacturer=None, status=None)
# Full-text search: name, part number (pn), manufacturer part number (mpn)
# Filters by category, vendor, manufacturer, status
# Cached per filter combination

async def get_part(db, part_id) -> Part
# Fetches single part by ID

async def create_part(db, data, tenant_id) -> Part
# Validates unique pn within tenant; rejects duplicates with 400

async def update_part(db, part_id, data) -> Part
# Updates writable fields; rejects tenantId changes

async def delete_part(db, part_id) -> None
# Soft or hard delete (configurable)

async def bulk_delete_parts(db, part_ids: list[int]) -> int
# Deletes multiple parts in single transaction

async def check_duplicates(db, search_terms) -> dict
# Finds duplicate parts (same pn, mpn, or similar name within tenant)
```

**Data Model**:
```python
class Part(Base, TenantAwareMixin):
    id, pn, name, description, category, manufacturer, mpn, status,
    lifecycle_status, datasheet_url, notes, created_at, updated_at
    
    # Relationships:
    tags (m:m)
    compliance (1:m, compliance records for RoHS/REACH/etc.)
    countryHistory (1:m, usage by country for compliance tracking)
    vendorPrices (1:m, part_vendors.py)
```

**Search Behavior**:
- Searches are case-insensitive (`ilike`)
- Cached for 2 minutes per filter combination
- Falls back to database if Redis unavailable

---

### 3. Approval Service (`app/services/approval_service.py`)

**Responsibilities**: Approval workflows, change requests, sign-offs.

**Core Functions**:
```python
async def list_approvals(db, page, type=None, status_filter=None) -> (list[Approval], int)
# Filters by type (ECR, PO, deviation) and status (pending, approved, rejected)

async def get_approval(db, approval_id) -> Approval

async def create_approval(db, data, user) -> Approval
# Auto-populates requestedById and tenantId from user context

async def update_approval(db, approval_id, data, user) -> Approval
# Records approverID, approval timestamp, comments

async def approve_approval(db, approval_id, user) -> Approval
# Sets status = "approved", approvedBy = user.id

async def reject_approval(db, approval_id, reason, user) -> Approval
# Sets status = "rejected", stores rejection reason
```

**Data Model**:
```python
class Approval(Base, TenantAwareMixin):
    id, type, entityType, entityId, status, priority,
    requestedById, requestedAt, approvedById, approvedAt,
    comments, rejectionReason, expiresAt, tenantId
```

---

### 4. Search Service (`app/services/search_service.py`)

**Responsibilities**: Full-text search across parts, BOMs, documents, compliance records.

**Features**:
- Elasticsearch/PostgreSQL full-text search backend
- Filters: category, status, vendor, creation date range
- Faceted search: returns counts of results per facet
- Autocomplete suggestions (prefix matching)

---

### 5. Quality Service (`app/services/quality_service.py`)

**Responsibilities**: Quality management (CAPA, FAI, deviations, non-conformances).

**Core Entities**:
- **CAPA** (Corrective/Preventive Action): Issue tracking, root cause, corrective actions, verification
- **FAI** (First Article Inspection): New supplier validation records
- **Deviation**: Process/product deviations, severity scoring

---

### 6. Procurement Service (`app/services/procurement_service.py`)

**Responsibilities**: Purchase orders, vendor management, RFQ, supplier scorecards.

**Core Functions**:
```python
async def create_po(db, bom_id, vendor_id, data, user) -> PurchaseOrder
# Generates PO from BOM items + vendor pricing

async def track_order(db, po_id) -> dict
# Fetches order status, delivery estimates, tracking info

async def create_rfq(db, line_items, vendors) -> RFQ
# Sends RFQ to multiple vendors, tracks responses

async def evaluate_rfq_responses(db, rfq_id) -> dict
# Scores vendors on price, lead time, quality
```

**Integrations**:
- Zoho Books sync (pending, feat/zoho-books branch)
- Supplier portals for RFQ visibility

---

### 7. Inventory Service (`app/services/inventory_service.py`)

**Responsibilities**: Stock levels, movement tracking, bin locations, reorder automation.

**Core Functions**:
```python
async def get_inventory_level(db, part_id) -> dict
# Current stock, reserved, available; warehouse/bin breakdown

async def adjust_inventory(db, part_id, qty_delta, reason) -> InventoryMovement
# Records stock adjustment (receive, issue, adjustment, write-off)

async def trigger_reorder(db, part_id) -> PurchaseOrder
# Auto-creates PO if stock falls below reorder point
```

---

### 8. ECO Service (`app/services/eco_service.py`)

**Responsibilities**: Engineering Change Orders (ECO) — BOM changes, part substitutions, obsolescence.

**Core Functions**:
```python
async def create_eco(db, data, user) -> ECO
# Proposes BOM change, impact analysis, affected parts/suppliers

async def evaluate_eco(db, eco_id) -> dict
# Calculates cost/schedule impact, identifies ripple effects

async def approve_and_implement(db, eco_id, user) -> ECO
# Changes status to approved; updates BOM

async def track_eco_status(db, eco_id) -> dict
# Implementation status per facility, schedule adherence
```

---

### 9. Work Order Service (`app/services/work_order_service.py`)

**Responsibilities**: Manufacturing work orders (MBOM explosion, labor routing, scheduling).

**Core Functions**:
```python
async def create_work_order(db, bom_id, qty, facility_id, user) -> WorkOrder
# Explodes MBOM, assigns operations, schedules resources

async def assign_labor(db, work_order_id, labor_records) -> WorkOrder
# Records labor by operation, tracking time and cost

async def update_work_order_status(db, work_order_id, status) -> WorkOrder
# Status: draft, scheduled, in_progress, completed, cancelled
```

---

### 10. Auth Service (`app/services/auth_service.py`)

**Responsibilities**: User authentication, MFA, password resets, session management.

**Core Functions**:
```python
async def authenticate_user(db, email, password, request) -> User
# Validates credentials, returns user
# Rate limits per IP (20 failures per 5 minutes → 15-min lockout)

async def register_user(db, data: RegisterRequest, request) -> User
# Creates new user; validates email, password complexity
# First user in tenant is admin; subsequent users default to viewer
# Checks ALLOW_TENANT_SELF_SIGNUP to prevent cross-tenant breaches

async def request_password_reset(db, email) -> dict
# Sends reset token via email (SMTP)

async def reset_password(db, token, new_password) -> User
# Hashes and stores new password; invalidates old tokens

async def enable_mfa(db, user_id) -> dict
# Returns TOTP secret, QR code for authenticator app

async def verify_mfa_token(db, user_id, otp) -> bool
# Validates TOTP code

async def logout(db, user_id, request) -> None
# Blacklists all user tokens via Redis; clears cookies
```

**Failure Modes**:
- Email validation failure → 400 Bad Request
- Password too weak → 400 with reason
- Rate limit exceeded → 429 Too Many Requests
- SMTP unavailable → queues email for retry via job queue

---

### 11. Document Service (`app/services/document_service.py`)

**Responsibilities**: Document management, versioning, OCR, virus scanning.

**Core Functions**:
```python
async def upload_document(db, file, entity_type, entity_id, user) -> Document
# Validates file type/size, scans for malware (ClamAV), stores in S3
# Generates thumbnail for PDFs/images

async def parse_document_ocr(db, document_id) -> dict
# Extracts text from PDF/image via OCR (async via job queue)

async def link_document_to_part(db, document_id, part_id) -> None
# Associates document with part (datasheet, test report, etc.)

async def get_document(db, document_id) -> Document
# Fetches document metadata; returns pre-signed S3 URL
```

---

### 12. Email Service (`app/services/email_service.py`)

**Responsibilities**: Transactional email (password resets, approvals, notifications).

**Core Functions**:
```python
async def send_email(to, subject, html_body, text_body=None) -> dict
# Sends via SMTP; queued for retry if temporary failure

async def send_password_reset_email(db, user, reset_token) -> None
# Renders reset link, sends to user email

async def send_notification_email(db, user, notification) -> None
# Alert for approvals, ECOs, inventory thresholds
```

**SMTP Configuration**:
- Reads from `config.py`: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
- TLS enabled by default (SMTP_USE_TLS=true)
- Retries on temporary failure (4xx/5xx) via job queue

---

### 13. Webhook Service (`app/services/webhook_service.py`)

**Responsibilities**: Outbound webhook delivery for integrations (ERP, Salesforce, Slack).

**Core Functions**:
```python
async def register_webhook(db, url, events, user, secret_key=None) -> Webhook
# Events: "part:created", "part:updated", "bom:approved", etc.

async def trigger_webhook(db, event, payload, user) -> dict
# Finds all webhooks registered for event
# Queues delivery via job queue; retries with exponential backoff

async def verify_webhook_signature(payload, secret, signature) -> bool
# HMAC-SHA256 of payload + secret
```

**Webhook Payload**:
```json
{
  "event": "part:created",
  "timestamp": "2026-07-19T12:34:56Z",
  "user": { "id": 123, "email": "user@example.com" },
  "tenantId": 5,
  "data": { ... }
}
```

---

### 14. Roles Service (`app/services/roles_service.py`)

**Responsibilities**: RBAC administration, role/permission management.

**Core Functions**:
```python
async def list_roles(db, tenant_id) -> list[Role]
# Returns roles within tenant

async def create_role(db, name, description, permissions, tenant_id, user) -> Role
# Creates custom role with specified permissions

async def assign_role_to_user(db, user_id, role_id) -> None
# Adds user to role

async def revoke_role_from_user(db, user_id, role_id) -> None
# Removes user from role
```

---

### 15. Dashboard Service (`app/services/dashboard_service.py`)

**Responsibilities**: Analytics, KPIs, charts for dashboards.

**Core Functions**:
```python
async def get_dashboard_summary(db, user) -> dict
# Returns KPIs: parts count, BOMs, open approvals, inventory alerts

async def get_parts_by_category(db, tenant_id) -> dict
# Pie chart data: parts per category

async def get_approval_trends(db, tenant_id, days=30) -> dict
# Time series: approvals/day over past N days
```

---

### 16. Additional Services

- **Compliance Service**: RoHS/REACH substance tracking, country-of-origin data
- **Pricing/Cost Service**: Unit cost lookups, price history, cost rollup
- **Notification Service**: Notification queue, email/webhook dispatch
- **Scheduling Service**: Resource scheduling for work orders, capacity planning
- **Traceability Service**: Genealogy tracking (raw material → finished goods)
- **Supplier Portal Service**: Vendor self-service (RFQ response, shipment updates)

---

## Data Models

All models inherit from `Base` (SQLAlchemy 2.0) and `TenantAwareMixin` (for multi-tenancy).

### Core Models

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **Tenant** | Multi-tenant workspace | id, name, subdomain, settings, created_at |
| **User** | User account | id, email, password_hash, first_name, last_name, role, mfa_enabled, mfa_secret, created_at |
| **Role** | RBAC role | id, name, description, permissions (m:m), tenant_id |
| **Permission** | RBAC permission | id, name, description, roles (m:m), tenant_id |
| **APIKey** | Machine-to-machine authentication | id, user_id, name, secret_hash, scopes, created_at, last_used_at, expires_at |
| **Session** | Auth session tracking | id, user_id, token_id, created_at, expires_at, ip_address, user_agent |

### BOM Models

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **BOM** | Bill of Materials header | id, bom_number, name, description, status, version, revision, project_id, created_by, created_at |
| **BOMItem** (bom_items_master) | BOM line item | id, bom_id, part_id, quantity, unit, reference_designator, find_number, sort_order, parent_item_id, cost_snapshot, extended_cost |
| **BomTemplate** | Reusable BOM template | id, name, description, items (json), created_by, tenant_id |
| **BomSnapshot** | Historical BOM state | id, bom_id, snapshot_data (json), created_at, created_by, note |
| **BomBaseline** | BOM baseline for tracking | id, bom_id, baseline_name, created_at, created_by |
| **BomVariant** | BOM variant (e.g., product SKU) | id, base_bom_id, variant_key, variant_items (json) |
| **BomClosure** | Transitive closure of BOM tree | id, bom_id, ancestor_id, descendant_id, depth |

### Part Models

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **Part** | Part master record | id, pn, name, description, category, manufacturer, mpn, status, lifecycle_status, datasheet_url, compliance_status, rohs, reach, created_at |
| **PartVendor** (part_vendors) | Supplier assignment | id, part_id, vendor_id, vendor_pn, lead_time, moq, unit_price, available_qty |
| **PartCustomField** | Extensible custom fields | id, part_id, field_name, field_value, data_type |
| **PriceHistory** | Part cost tracking | id, part_id, vendor_id, unit_price, effective_date, expired_date |
| **PartCountryHistory** | Usage by country/region | id, part_id, country_code, usage_pct, updated_at |
| **PartLifecycle** | Lifecycle tracking | id, part_id, status, effective_date, comment (active, obsolete, end_of_life) |
| **Inventory** | Stock levels | id, part_id, warehouse_id, bin_location, qty_on_hand, qty_reserved, qty_available, reorder_point, reorder_qty |

### Compliance Models

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **Compliance** | RoHS/REACH substance tracking | id, part_id, standard (rohs, reach), status, substances (json), verified_date, expires_date |
| **DigitalSignature** | FDA 21 CFR Part 11 signatures | id, entity_type, entity_id, signer_id, signature_hash, timestamp, user_agent |

### Workflow Models

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **Approval** | Change approvals | id, type (ECR/PO/deviation), entity_type, entity_id, status, requested_by, requested_at, approved_by, approved_at, comments |
| **ECO** | Engineering Change Order | id, eco_number, description, bom_impact (json), status, created_by, implemented_date |
| **Deviation** | Quality deviation | id, deviation_number, description, severity, root_cause, corrective_actions (json), status, created_by |
| **CAPA** | Corrective/Preventive Action | id, capa_number, issue_description, root_cause, corrective_actions (json), preventive_actions (json), status, owner_id, due_date |
| **FAI** | First Article Inspection | id, fai_number, supplier_id, part_id, inspection_date, test_results (json), status, approved_by |

### Integration Models

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **Webhook** | Outbound webhook config | id, url, events (json), secret, active, created_by, created_at |
| **Integration** | Third-party integration | id, type (zoho, salesforce, erp), config (encrypted json), status, sync_frequency, last_sync_at |
| **ERPConnector** | ERP sync configuration | id, erp_type, endpoint, api_key (encrypted), sync_mapping (json), status |
| **NotificationQueue** | Queued notifications | id, user_id, type, message, read, created_at |
| **Notification** | User notification | id, user_id, type, message, read, created_at, read_at |

### Audit & History Models

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **AuditLog** | Request/action audit trail | id, action, entity_type, entity_id, entity_name, user_id, user_email, user_ip, user_agent, changes (json), timestamp, tenant_id |
| **AuditLogChange** | Detailed change tracking | id, audit_log_id, field_name, old_value, new_value |
| **TokenBlacklist** | Revoked tokens | id, user_id, token_jti, blacklisted_at, expires_at |
| **BackupHistory** | Backup records | id, backup_type, backup_path, status, size, checksum, created_at, verified_at, retention_tier |

---

## Frontend Architecture

### High-Level Structure

```
frontend/
├── src/
│   ├── main.jsx                    # Vite entry point
│   ├── config.js                   # API base URL, feature flags
│   ├── globals.js                  # Central re-exports hub (API, components, utilities)
│   ├── i18n.js                     # i18n configuration
│   ├── root/                       # Lazy-loaded screen files (register on window.*)
│   │   ├── dashboard.jsx
│   │   ├── bom-editor.jsx
│   │   ├── parts-screen.jsx
│   │   ├── mobile-scanner.jsx
│   │   ├── secondary-screens.jsx   # Vendors, Procurement, Diff, OCR, etc.
│   │   ├── integration-screens.jsx # Webhooks, Bulk Import, ERP, Supplier Portal
│   │   ├── enterprise-screens.jsx  # Service BOM, Routing, Labor, Currency, API Keys, etc.
│   │   ├── overlays.jsx            # Modal, Toast, Popover, AppCtx
│   │   ├── enterprise-utils.jsx    # ErrorBoundary, Skeleton, Shortcuts, a11y
│   │   ├── collaboration.jsx       # Real-time collab (Yjs/WebSocket)
│   │   ├── detail-drawer.jsx       # Part/BOM detail panels
│   │   ├── icons.jsx               # Icon library
│   │   └── ... (other root modules)
│   ├── components/
│   │   ├── LazyScreens.jsx         # Dynamic lazy-load wrapper for root/ screens
│   │   ├── ErrorBoundary.jsx
│   │   ├── index.js                # Public component exports
│   │   ├── modals/                 # Modal components (search, import, create, etc.)
│   │   ├── advanced/               # AI, compliance, cost simulation, etc.
│   │   ├── ui/                     # Design system primitives (Button, Input, Table, etc.)
│   │   └── ... (other component directories)
│   ├── context/
│   │   └── AppCtx.jsx              # Global app state (auth, API data, route, etc.)
│   ├── utils/
│   │   ├── storage.js              # localStorage/sessionStorage utilities
│   │   ├── toast.js                # Toast notification helpers
│   │   ├── constants.js            # TWEAK_DEFAULTS, ROLES, status enums
│   │   ├── bom.js                  # BOM explosion, tree conversion helpers
│   │   ├── accent.js               # Theme/color utilities
│   │   ├── … (other utilities)
│   ├── hooks/                      # Custom React hooks
│   ├── services/
│   │   ├── dataService.js          # Local-first data sync, offline queue
│   │   └── … (other services)
│   └── screens/                    # Screen container components (legacy, being moved to root/)
│
├── api.js                          # API client (module + window.* shims for backward compat)
├── data.js                         # Demo/seed data
├── clean.js                        # Data cleanup utilities
├── cloud-sync.js                   # Cloud sync logic
├── index.html                      # Entry HTML
└── vite.config.js                  # Vite configuration
```

### Shim Architecture

**Context**: The frontend is mid-migration from global `window.*` shims to ES module imports.

**Pattern**:
1. Source files in `src/root/*.jsx` register a component on `window[ComponentName]` on import
2. `src/components/LazyScreens.jsx` wraps lazy-loaded root modules and extracts them from `window`
3. Backward compatibility: `src/globals.js` re-exports named imports for new code

**Example**:
```jsx
// src/root/dashboard.jsx
window.DashboardScreen = function DashboardScreen(props) { ... };
export { DashboardScreen };

// src/components/LazyScreens.jsx
export const DashboardScreen = createLazyScreen(
  () => import("../root/dashboard.jsx"),
  "DashboardScreen"  // Looks for window.DashboardScreen
);

// New code imports from globals.js:
import { DashboardScreen } from "../globals.js";
```

**Benefit**: Lazy-loaded screens are removed from main bundle, loaded on-demand.

### Design System

**Color Tokens** (CSS custom properties):
- **Accent**: Olive `#B5BC38` / Orange `#E85D1F`
- **Semantic**: `--fg-0` (text), `--fg-1` (secondary text), `--fg-2` (tertiary), `--fg-3` (disabled)
- **Surface**: `--bg-0` (primary), `--bg-1` (secondary), `--bg-2` (elevated)
- **Status**: `--status-success`, `--status-warning`, `--status-error`
- **Density**: `[data-density="compact|comfortable|spacious"]` attribute for spacing

**Typography** (Geist font scale):
- **Display** (32px, 600 weight)
- **Heading 1** (24px, 600)
- **Heading 2** (20px, 600)
- **Heading 3** (16px, 600)
- **Body** (14px, 400)
- **Caption** (12px, 400)

---

## Frontend Components

### Core UI System (`src/components/ui/`)

Implements design system primitives (component-level, not business logic):

| Component | Purpose | Props |
|-----------|---------|-------|
| **Button** | CTA, primary/secondary/tertiary variants | variant, size, disabled, loading, onClick |
| **Input** | Text, password, email fields | type, placeholder, disabled, defaultValue, onChange |
| **Select** | Dropdown selector | options, multiple, disabled, defaultValue, onChange |
| **Table** | Data grid with sorting/pagination | columns, data, sortable, onSort, rowKey |
| **Modal** | Dialog overlay | isOpen, title, onClose, children, actions |
| **Popover** | Floating menu | trigger, children, placement, onClose |
| **Toast** | Notification | kind (success/warn/error), message, action, onDismiss |
| **Skeleton** | Loading placeholder | width, height, count (for lists) |
| **Tabs** | Tab navigation | tabs, active, onChange |
| **Badge** | Status/tag display | variant, label |
| **Checkbox** / **Radio** | Input controls | checked, onChange, label |
| **Textarea** | Multi-line text | rows, placeholder, disabled, onChange |

### State Management (`src/context/AppCtx.jsx`)

**Global State**:
```javascript
{
  // Auth
  authed,                    // JWT token or null
  userRole,                  // "admin", "viewer", etc.
  perms,                     // ROLES[userRole] (UI hints only; server validates)
  authChecking,              // In-flight auth validation
  
  // Navigation
  route,                     // Current route (from pathname)
  setRoute(r),               // Navigate to route
  
  // API Data
  apiParts,                  // Raw part array from /api/v1/parts
  apiBomItems,              // BOM items for active BOM (hydrated onto apiParts)
  apiVendors,               // Vendor list
  apiLoading, apiError,     // Fetch status
  apiConnected,             // Backend reachable
  syncStatus,               // Local-first sync state
  
  // UI State
  selectedRow,              // Active BOM item row ID
  search,                   // Search input value
  activeCats,               // Selected categories
  bomTab,                   // BOM view tab (hierarchy, flat, cost, etc.)
  modal,                    // Modal name (null, "create_bom", "import_parts", etc.)
  modalContext,             // Data passed to modal
  
  // Features
  showMobileScan,           // Mobile scanner visibility
  showTour,                 // Onboarding tour
  showAI,                   // AI assistant visibility
  
  // Settings
  t,                        // Tweaks (theme, density, advanced mode, etc.)
  setTweak(key, value),    // Update tweak
}
```

**Context Setup**:
- `AppCtx.Provider` wraps the app in `src/main.jsx`
- Children access state via `useContext(AppCtx)`
- Persists auth state to localStorage
- Auto-syncs with backend on mount (health check, data refresh)

---

## API Client (`api.js`)

**Scope**: HTTP client with circuit breaking, retry logic, session refresh, CSRF protection.

**Key Functions**:
```javascript
export async function apiRequest(
  endpoint: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "DELETE",
    body?: object | FormData,
    headers?: object
  },
  retries?: number,  // Default 2
  delay?: number     // Default 500ms exponential backoff
) -> Promise<any>
// Sends HTTP request with:
// - Circuit breaker (5 failures → 30s timeout per endpoint)
// - CSRF token injection (from cookie)
// - Session refresh on 401 (if not an auth endpoint)
// - Retry logic for transient failures (5xx, network)
// - Returns parsed JSON response
```

**Named API Objects** (exported):
```javascript
// Authentication
api.auth = {
  login(email, password),
  register(email, password),
  logout(),
  refreshToken(),
  getMe(),
  enableMFA(),
  verifyMFA(otp),
}

// Parts
api.parts = {
  list(page, filters),
  create(data),
  update(id, data),
  delete(id),
}

// BOMs
api.boms = {
  list(page),
  create(data),
  update(id, data),
  getDetail(id),
  getExplosion(id, depth),
  addItem(bomId, itemData),
}

// ... 30+ more API namespaces (vendors, projects, documents, etc.)
```

**Circuit Breaker** (`_circuitBreaker`):
```javascript
{
  failures: { [endpoint]: { count, lastFailure } },
  threshold: 5,
  timeout: 30000,
  isOpen(name),        // True if failures >= threshold and timeout not elapsed
  recordFailure(name),
  recordSuccess(name),
}
```

**Session Refresh Logic**:
- On 401: Calls `/api/v1/auth/refresh` (POST) with CSRF token
- If refresh succeeds → retries original request
- If refresh fails (401/403) → calls global `_onUnauthorized()` callback (logs out user)
- If refresh transient error (429, 5xx) → fails original request softly (doesn't log out)

**CSRF Protection**:
- Reads token from cookie: `document.cookie.match(/csrf_token=([^;]+)/)`
- Injects into `X-CSRF-Token` header on state-changing requests

---

## Cross-Cutting Concerns

### Error Handling

**Backend**:
- `HTTPException` for user-facing errors (400, 403, 404, 422)
- Unhandled exceptions logged + 500 Internal Server Error response
- Validation errors (Pydantic) return 422 with field details

**Frontend**:
- `ErrorBoundary` component catches React render errors
- API errors displayed as toasts (kind: "error")
- Transient errors (429, 5xx) trigger retry; genuine auth failures (401 after refresh) trigger logout

### Logging

**Backend**:
- Request/response logged by `AuditLogMiddleware` (method, path, user, status, latency)
- Tenant context included in logs for filtering
- Query timing recorded by SQLAlchemy listeners
- Backup/integration tasks log progress

**Frontend**:
- Console logs (development) + error reporting (Sentry if configured)
- No PII logged; sanitized error messages

### Metrics & Observability

**Backend**:
- Prometheus metrics: request latency, status codes, DB query timing
- `MetricsMiddleware` populates metrics on every request
- Sentry integration optional (via `init_sentry()`)

**Frontend**:
- Performance monitoring (first paint, interactive, largest paint)
- Custom events (BOM loaded, part search, approval submitted)

### Internationalization (i18n)

**Frontend**:
- Translation keys in `src/i18n.js`
- Uses `__t(key)` helper function
- Defaults to English; supports other languages via JSON file
- User language preference stored in profile

**Backend**:
- English-only (error messages, validation)
- Localization delegated to frontend

### Performance Optimization

**Backend**:
- Query caching via Redis (5 min for BOM, 2 min for parts)
- Pagination (limit 100 by default)
- Connection pooling (10 connections, 20 overflow)
- Compression (gzip >500 bytes)

**Frontend**:
- Code splitting (lazy-loaded screens removed from main bundle)
- Virtual scrolling for large tables (>1000 rows)
- Memoization of expensive components
- Local-first data caching (IndexedDB for offline)

---

## Known Limitations & Open Items

### Database

⚠️ **Alembic VARCHAR(32) Issue** (from system brief):
- `alembic_version.version_num` too short for 33-char revision IDs (e.g., 036_role_permission_tenant_scoped)
- Fresh Postgres installs fail at migration 036
- SQLite tests don't catch this (ignores VARCHAR length)
- **Workaround**: Manually widen column; permanent fix pending in alembic/env.py
- **Status**: Documented, not yet resolved

⚠️ **Alembic ENV VAR Handling**:
- `alembic/env.py` reads only `DATABASE_URL` env var; falls back to `alembic.ini` hardcoded credentials (bom_user:@localhost)
- Ignores app's `.env` file
- **Impact**: Migrations fail unless `DATABASE_URL` exported
- **Workaround**: Export `DATABASE_URL` before running Alembic
- **Status**: Documented, workaround in place

⚠️ **Test Coverage**:
- Full test suite runs on SQLite, not Postgres
- Postgres-only defects (VARCHAR enforcement, RLS behavior, dialect SQL) not covered
- ~73 pre-existing test failures are documented as unrelated stubs
- **Mitigation**: Production runs on Postgres; Postgres-specific bugs caught in staging/prod

### Features (Not Yet Merged)

**Feature Branches** (off `master`):
1. **feat/regulated**: FDA 21 CFR Part 11 e-signatures + RoHS/REACH substance compliance
2. **feat/zoho-books**: Two-way Zoho Books sync (parts/items, vendors/contacts, POs, cost)
3. **feat/polish**: WCAG-AA dark mode, high-contrast + colorblind a11y modes, mobile scanner polish, compose-secrets + backup WAL-path fixes

**Pending Integration Items**:
- Zoho Books API client (oauth, sync scheduler, conflict resolution)
- ERP connectors (SAP, Oracle, NetSuite)
- Supplier portal (RFQ workflow, shipment visibility)
- AI assistant (LLM-driven part recommendations, cost predictions)

---

## Cross-Reference

**Related Documentation** (in `/bom-tool/` directory):

| File | Purpose |
|------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | High-level system design, deployment patterns, scalability notes |
| [API.md](./API.md) | REST API endpoint reference, request/response schemas, error codes |
| [DATABASE.md](./DATABASE.md) | Schema ERD, migration guide, backup/restore procedures |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Docker, Kubernetes, systemd, environment setup |
| [SECURITY.md](./SECURITY.md) | Authentication, authorization, encryption, compliance (SOC 2, HIPAA) |
| [TESTING.md](./TESTING.md) | Unit tests, integration tests, test fixtures, coverage metrics |
| [OPERATIONS.md](./OPERATIONS.md) | Monitoring, alerting, troubleshooting, runbooks |

---

**Document History**:
- **v2.1.0** (2026-07-19): Comprehensive module reference for v2.1.0 release; added desktop packaging modules (launcher.py, updater.py, build.py); covers 16 backend services, core modules, 50+ data models, frontend component architecture, and known limitations
