# Blackbox BOM — System Workflow & Architecture

**Version**: 2.0.0 (2026-07-19)  
**Status**: Production Shipped  
**Audience**: Developers, DevOps, Enterprise Operators

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Request Lifecycle](#request-lifecycle)
3. [Authentication & Authorization](#authentication--authorization)
4. [Multi-Tenant Isolation](#multi-tenant-isolation)
5. [Event & Integration Flow](#event--integration-flow)
6. [Error Handling & Recovery](#error-handling--recovery)
7. [Background Tasks](#background-tasks)
8. [User Journeys](#user-journeys)
9. [Notification & Real-Time](#notification--real-time)
10. [State Management](#state-management)
11. [Performance Optimization](#performance-optimization)
12. [Database Migrations](#database-migrations)
13. [Security Validation Flows](#security-validation-flows)

---

## System Architecture Overview

### High-Level Stack

```
┌──────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + Vite)                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Browser                                                       ││
│  │  • index.html (entry point)                                  ││
│  │  • src/components/** (React components)                      ││
│  │  • src/context/AppCtx.jsx (global state)                     ││
│  │  • src/api.js (HTTP client with retry/auth)                  ││
│  │  • localStorage (local-first fallback)                       ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────┬──────────────────────────────────┘
                              │ REST HTTP / WebSocket
                              │ (port 8000 in dev, 443 in prod)
┌─────────────────────────────▼──────────────────────────────────┐
│                    BACKEND (FastAPI + Python)                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ main.py                                                      ││
│  │  • Middleware stack (CORS, CSRF, Rate Limit, Auth, etc.)     ││
│  │  • Exception handlers (401/403/429/500)                      ││
│  │  • WebSocket endpoint for real-time collab                   ││
│  │  • Background tasks (backup scheduler, integration drainer)  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌──────────────┬──────────────┬─────────────────────────────┐  │
│  │ app/api/     │ app/core/    │ app/services/               │  │
│  │ endpoints/   │              │                             │  │
│  │              │ • deps.py    │ • BOM logic                 │  │
│  │ • auth.py    │ • rbac.py    │ • Part/Vendor management    │  │
│  │ • parts.py   │ • security.py│ • Purchase orders           │  │
│  │ • bom.py     │ • tenant_*.py│ • Integrations (ClickUp...)  │  │
│  │ • ...        │ • backup.py  │ • Analytics/Reports         │  │
│  │              │              │                             │  │
│  └──────────────┴──────────────┴─────────────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Database Layer (SQLAlchemy ORM)                              ││
│  │  • app/models/** (User, Part, BOM, Vendor, PO, etc.)        ││
│  │  • app/db/session.py (async session mgmt, retry logic)       ││
│  │  • app/db/rls.py (Postgres Row-Level Security)               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────┬──────────────────────────────────┘
                              │ Connection pool (10-30 connections)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      POSTGRESQL DATABASE                          │
│  • users, roles, permissions                                     │
│  • parts, part_vendors, part_custom_fields                       │
│  • boms, bom_items, bom_items_master (transactional)             │
│  • purchase_orders, po_line_items                                │
│  • vendors, contacts, exchange_rates                             │
│  • documents, audit_logs, user_data_store                        │
│  • calendar_events, approvals, revisions, work_queue             │
│  • integration_outbox, integration_connections (async delivery)  │
│  • api_keys, user_mfa (security)                                 │
│  • Alembic version table (schema migrations)                     │
│  • RLS policies (opt-in tenant isolation defense-in-depth)       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐  ┌──────────────────────────────┐
│     REDIS (Optional)         │  │  DISK STORAGE                │
│  • Rate limit counters       │  │  • Backup directory          │
│  • Session cache             │  │  • PostgreSQL WAL archive    │
│  • Integration retry backoff │  │  • S3 (optional)             │
│  • Real-time pub/sub         │  │  • Encrypted backup          │
└──────────────────────────────┘  └──────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Tech |
|-----------|---|---|
| **Frontend** | UI rendering, local state, request formatting | React, Vite, IndexedDB/localStorage |
| **Backend API** | Request routing, auth, RBAC, business logic, data validation | FastAPI, async SQLAlchemy |
| **Database** | Transactional data store, multi-tenant isolation | PostgreSQL 14+ |
| **Redis** | Rate limiting, session cache, async task queuing | Redis 6+ (optional) |
| **Backup System** | Full/incremental backups, WAL archiving, recovery | pg_dump, pg_basebackup |
| **Integration Layer** | Outbox pattern for async ClickUp/Zoho sync | Async HTTP clients |

---

## Request Lifecycle

### Complete HTTP Request Flow

```mermaid
sequenceDiagram
    participant Browser as Client (Browser)
    participant Nginx as Nginx Reverse Proxy
    participant Middleware as Middleware Stack
    participant Auth as Auth Module
    participant Tenant as Tenant Context
    participant RBAC as RBAC Layer
    participant Handler as Endpoint Handler
    participant ORM as SQLAlchemy ORM
    participant DB as PostgreSQL

    Browser->>Nginx: HTTP Request + Headers
    note over Nginx: Rate limit check<br/>TLS termination
    Nginx->>Middleware: Forward to :8000

    Middleware->>Middleware: RequestIDMiddleware: assign req_id
    Middleware->>Middleware: AuditLogMiddleware: log request
    Middleware->>Middleware: MetricsMiddleware: start timer
    Middleware->>Middleware: InputSanitizationMiddleware: clean input
    Middleware->>Middleware: CSRFMiddleware: validate token
    Middleware->>Middleware: CORSMiddleware: check origin
    
    Middleware->>Auth: get_current_user(token or API key)
    
    alt Bearer Token Auth
        Auth->>DB: verify_token_with_blacklist(token)
        DB->>Auth: payload (if valid)
        Auth->>Auth: extract tenantId, isSuperuser from JWT
        Auth->>Tenant: set_tenant_id(effective_tenant_id)
        Auth->>DB: SELECT User WHERE id = sub
        DB->>Auth: user row
    else API Key Auth
        Auth->>DB: [apply_rls_auth_bootstrap] SELECT ApiKey WHERE key_prefix = X
        DB->>Auth: api_key row
        Auth->>Auth: bcrypt.verify(key, api_key.key_hash)
        Auth->>DB: [apply_rls_auth_bootstrap] SELECT User WHERE id = api_key.user_id
        DB->>Auth: user row
        Auth->>Tenant: set_tenant_id(user.effective_tenant_id)
    end
    
    Auth->>Auth: Rate limit check (user or API key)
    Auth->>Middleware: Return User object
    
    Middleware->>RBAC: RoleChecker(allowed_roles) or PermissionChecker(perms)
    RBAC->>DB: SELECT Role/Permission WHERE user.id = X
    DB->>RBAC: user's roles/permissions
    RBAC->>RBAC: Check hierarchy (admin inherits engineer perms)
    RBAC->>RBAC: Check if required role/perm present
    RBAC->>Middleware: Return User or 403 Forbidden
    
    Middleware->>Handler: Call endpoint handler
    Handler->>Handler: Validate request body schema
    Handler->>ORM: Query: SELECT * FROM parts
    
    note over ORM: Tenant Isolation Event Listener Fires
    ORM->>ORM: Get current tenant_id from context
    ORM->>ORM: Inject WHERE clause: parts.tenantId = tenant_id
    ORM->>DB: SELECT * FROM parts WHERE tenantId = :tenant_id
    
    DB->>DB: Check RLS policies (opt-in)
    DB->>DB: Execute query filtered by tenantId
    DB->>ORM: Return rows (tenant-isolated)
    
    Handler->>Handler: Map ORM objects to response schemas
    Handler->>Handler: Format response (JSON)
    Handler->>Middleware: Return response
    
    Middleware->>Middleware: AuditLogMiddleware: async log to DB
    Middleware->>Middleware: MetricsMiddleware: record duration
    Middleware->>Nginx: HTTP 200 + JSON body
    Nginx->>Browser: Response to client
```

### Request Lifecycle State Diagram

```
Incoming Request
       │
       ▼
┌──────────────────────────────┐
│  Middleware Stack Processing │
│  • RequestIDMiddleware       │
│  • AuditLogMiddleware        │
│  • MetricsMiddleware         │
│  • InputSanitizationMiddleware│
│  • CSRFMiddleware            │
│  • CORSMiddleware            │
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│   Authentication (deps.py)   │
│  ┌────────────────────────┐  │
│  │ Extract credentials:   │  │
│  │ • Bearer token (JWT)   │  │
│  │ • API key header       │  │
│  └────────────────────────┘  │
│         │                    │
│         ▼                    │
│  ┌────────────────────────┐  │
│  │ Verify signature/hash  │  │
│  │ Rate limit check       │  │
│  │ Load User from DB      │  │
│  └────────────────────────┘  │
│         │                    │
│    ┌────┴────┐              │
│    │ Success │ (401)        │
│    │         │ Failure      │
└────┼─────────┼──────────────┘
     │         │
     │ ┌───────▼─────┐
     │ │  Raise 401  │
     │ │  "Creds OK" │
     │ └─────────────┘
     │
     ▼
┌──────────────────────────────┐
│  Tenant Isolation Setup      │
│  • set_tenant_id(tid)        │
│  • apply_rls_tenant_context()│
│  (Postgres RLS opt-in)       │
└──────────────────────────────┘
     │
     ▼
┌──────────────────────────────┐
│   RBAC Authorization         │
│  • Check user roles          │
│  • Check permissions         │
│  • Role hierarchy (inherit)  │
│  • Superuser bypass          │
└──────────────────────────────┘
     │
     ├─── Permission OK ───────┐
     │                         │
     │                    ┌────▼──────────┐
     │                    │ Raise 403      │
     │                    │ "Insufficient" │
     │                    └────────────────┘
     │
     ▼
┌──────────────────────────────┐
│  Endpoint Handler Execution  │
│  • Validate schema           │
│  • Business logic            │
│  • ORM queries (auto-filtered)│
└──────────────────────────────┘
     │
     ├─── Success ───┬──── Error ────┐
     │               │               │
     ▼               ▼               ▼
  200 OK         422/400         500 ISE
 JSON Response    Validation   Exception
                   Error       Handler
```

---

## Authentication & Authorization

### JWT Token Verification Flow (v1.32.0)

```python
verify_token_with_blacklist(token):
  → jwt.get_unverified_header(token) → Extract "alg" claim
    → Is alg in settings.ALGORITHM? (RS256 only, no HS256 fallback)
      → YES: jwt.decode(token, key, algorithms=[alg]) → Return payload
      → NO: Raise InvalidTokenError("Algorithm mismatch")
  → Is token in Redis blacklist?
    → YES: Raise InvalidTokenError("Token revoked")
    → NO: Return payload dict
```

**Token Claims** (set at login in `create_tokens_for_user`):
- `sub` (int): User ID
- `email` (str): User email
- `tenantId` (int): Home tenant ID (None for superusers)
- `isSuperuser` (bool): Escalated privileges
- `exp` (int): Expiry timestamp (30 minutes from issue)
- `iat` (int): Issued at
- `jti` (str): Unique ID (for blacklisting)

### RBAC Role Hierarchy

```
superadmin (top) ──┬─→ admin ──┬─→ engineering ──┐
                   │           ├─→ procurement ──┼─→ viewer (bottom)
                   │           ├─→ finance ──────┤
                   └─→ inherited roles ──────────┘
```

**Permission Model** (role → permission many-to-many):
- Role `admin` has permissions: `parts:write`, `projects:write`, `vendors:write`, `procurement:write`, etc.
- Role `engineer` has permissions: `parts:read`, `parts:write`, `projects:read`, `projects:write`
- Role `viewer` has permissions: `parts:read`, `projects:read` (read-only)

**Superuser Behavior**:
- Bypasses all role/permission checks
- Can view/edit all tenant data (when `effective_tenant_id = None`)
- Requires MFA in production (enforced at `get_current_superuser`)

### API Key Authentication Flow (v1.33.0)

```
Request with X-API-Key header:
  → Extract key_prefix = api_key.split("_")[0] (first 4 chars)
  → [apply_rls_auth_bootstrap] to bypass RLS for auth lookups
    → Query: SELECT ApiKey WHERE is_active=true AND key_prefix = X
    → bcrypt.verify(full_key, stored_hash)
      → Match: Continue to user lookup
      → No match OR expired: Return 401
  → Query: SELECT User WHERE id = api_key.user_id
  → Rate limit check: 120 req/min per API key (Redis-backed or in-memory fallback)
  → [clear_rls_auth_bootstrap] once auth succeeds
  → [apply_rls_tenant_context] for business logic queries
```

**Rate Limits by Auth Type**:
| Type | Limit | Window | Backend |
|------|-------|--------|---------|
| Bearer Token (user) | 300 req/min | 60s | Redis + in-memory fallback |
| API Key | 120 req/min | 60s | Redis + in-memory fallback |
| WebSocket connection | 30 per minute | 60s | Per-IP, in-memory |
| IP-based (login attempts) | 10/60s | 60s | In-memory |

---

## Multi-Tenant Isolation

### Tenant Context Management (app/core/tenant_context.py)

```python
# Thread-local context variable for the current request
_tenant_context: ContextVar[Optional[int]] = ContextVar('tenant_id', default=None)

def set_tenant_id(tenant_id: Optional[int]) -> None:
    """Set the tenant for this request. Called once per request during auth."""
    _tenant_context.set(tenant_id)

def get_tenant_id() -> Optional[int]:
    """Get the tenant for this request. Used by ORM listeners and query builders."""
    return _tenant_context.get()
```

**Key Properties**:
- `tenant_id = None` for superusers (cross-tenant visibility)
- `tenant_id = 1` for regular users (single-tenant isolation)
- Set once in `get_current_user()` or `get_current_superuser()` during auth
- Available in all downstream query/ORM operations via context variable

### ORM-Level Tenant Filtering (app/core/tenant_events.py)

```mermaid
graph TD
    A["SQLAlchemy Query Execution"] --> B{Is ORM statement?}
    B -->|No| C["Warn: Non-ORM SELECT detected"]
    B -->|Yes| D{Is SELECT query?}
    D -->|No| E["Allow UPDATE/DELETE<br/>but warn if modifying<br/>cross-tenant rows"]
    D -->|Yes| F{Entity inherits<br/>TenantAwareMixin?}
    F -->|No| G["Pass through<br/>unchanged"]
    F -->|Yes| H["Get tenant_id<br/>from context"]
    H --> I{tenant_id is None?}
    I -->|Yes<br/>superuser| J["No filter<br/>cross-tenant"]
    I -->|No<br/>regular user| K["Inject WHERE<br/>tenantId = tenant_id"]
    K --> L["Execute filtered<br/>query"]
    G --> M["Query executes"]
    J --> M
    L --> M
```

**Example**:

```python
# Code: await db.execute(select(Part).where(Part.partNumber == "RES-10K"))

# Execution (non-superuser, tenant=1):
# SELECT * FROM parts WHERE partNumber = 'RES-10K' AND tenantId = 1

# Execution (superuser, tenant=None):
# SELECT * FROM parts WHERE partNumber = 'RES-10K'
```

### INSERT Auto-Population (before_insert event)

```python
@event.listens_for(TenantAwareMixin, "before_insert")
def set_tenant_id(mapper, connection, target):
    if target.tenantId is None:
        tid = get_tenant_id()
        if tid is not None:
            target.tenantId = tid
```

**Result**: Every new row automatically belongs to the creating user's tenant.

### Postgres Row-Level Security (RLS) — Defense-in-Depth (Opt-in)

When `ENABLE_RLS=true` and using PostgreSQL:
1. Migration 040 creates RLS policies on all `TenantAwareMixin` tables
2. Each policy restricts rows: `WHERE tenantId = current_setting('rls.tenant_id')`
3. App-layer code sets `SET LOCAL rls.tenant_id = :tenant_id` per transaction
4. Database enforces isolation even if app-layer filtering is bypassed (e.g., raw SQL)

**Trade-off**: Small performance cost (~1-2%) for defense-in-depth.

---

## Event & Integration Flow

### Integration Outbox Pattern (Async-Safe)

The system decouples external integrations (ClickUp, Zoho Cliq) from the request lifecycle using an outbox pattern:

```mermaid
sequenceDiagram
    participant API as API Endpoint
    participant DB as PostgreSQL
    participant Outbox as Integration Outbox
    participant Drainer as Background Drainer<br/>every 15s
    participant External as External API<br/>ClickUp/Cliq

    API->>API: Process business logic<br/>(create/update entity)
    API->>DB: Emit integration event<br/>emit_integration_event()
    
    Note over DB: For each enabled<br/>integration connection<br/>for this tenant:
    
    DB->>Outbox: INSERT IntegrationOutbox<br/>{entity_type, entity_id,<br/>action, payload,<br/>status="pending"}
    
    DB->>API: Commit transaction<br/>(synchronous part done)
    API->>API: Return response<br/>to client immediately
    
    Note over Drainer: Every 15 seconds
    Drainer->>DB: SELECT IntegrationOutbox<br/>WHERE status='pending'<br/>AND next_attempt_at <= NOW
    DB->>Drainer: Return pending rows<br/>(limit 20)
    
    loop For each pending row
        Drainer->>External: POST /task (ClickUp)<br/>or .post_message (Cliq)
        alt Success
            External->>Drainer: 200 OK + external_id
            Drainer->>DB: UPDATE Outbox<br/>status='sent'
            Drainer->>DB: INSERT IntegrationExternalLink<br/>{entity_id, external_id}
        else Failure
            External->>Drainer: 4xx/5xx error
            Drainer->>Drainer: Exponential backoff<br/>next_attempt_at = now + 2^attempt
            Drainer->>DB: UPDATE Outbox<br/>status='pending'<br/>attempts++<br/>last_error
            
            alt attempts >= 5
                Drainer->>DB: Mark as 'dead'<br/>manual retry needed
            end
        end
    end
    
    Drainer->>DB: Commit all updates
```

**Key Properties**:
1. **Synchronous**: INSERT to outbox happens in same transaction as entity creation
2. **Guaranteed Delivery**: Retry with exponential backoff (2^n seconds, max 5 attempts)
3. **Dead Letter**: After 5 failures, marked as `dead` for manual review
4. **Deduplication**: External links prevent duplicate syncs on update
5. **Tenant-Scoped**: Each row carries tenantId; drainer respects it

### Event Types & Actions

| Entity Type | Actions | Emitted On | External Link |
|-------------|---------|-----------|---|
| `work_order` | create, update, close | POST/PUT /work-queue | ClickUp task in "BBOM · Work Orders" list |
| `capa` | create, update, close, implement | POST/PUT /capa | ClickUp task in "BBOM · CAPAs" list |
| `eco` | create, update, approve | POST/PUT /approvals?type=ecr | ClickUp task in "BBOM · ECOs" list |
| `ncr` | create, update, close | POST/PUT /ncr | ClickUp task in "BBOM · NCRs" list |
| `approval` | create, update | POST/PUT /approvals | ClickUp task in "BBOM · Approvals" list |
| `purchase_order` | create, update, ship | POST/PUT /purchase-orders | ClickUp task in "BBOM · Purchase Orders" list |

### Event Emission Points

| Endpoint | Entity Type | Trigger |
|----------|---|---|
| `POST /parts` | (no event) | Not integrated |
| `POST /vendors` | (no event) | Not integrated |
| `POST /work-queue` | `work_order` | Auto-emit to ClickUp |
| `PUT /work-queue/{id}` | `work_order` | Auto-emit update |
| `POST /capa` | `capa` | Auto-emit |
| `POST /approvals?type=ecr` | `eco` | Auto-emit |
| `PATCH /approvals/{id}?action=approve` | `eco` | Auto-emit status change |
| `POST /purchase-orders` | `purchase_order` | Auto-emit |

---

## Error Handling & Recovery

### Exception Hierarchy

```python
HTTP Exception         (FastAPI/Starlette)
  ├─ 400 Bad Request (validation, invalid input)
  ├─ 401 Unauthorized (missing/invalid credentials)
  ├─ 403 Forbidden (auth OK, but no permission)
  ├─ 404 Not Found (resource doesn't exist or cross-tenant)
  ├─ 409 Conflict (unique constraint, race condition)
  ├─ 429 Too Many Requests (rate limit exceeded)
  ├─ 500 Internal Server Error (unhandled exception)
  └─ 503 Service Unavailable (DB unavailable, backup in progress)

Application Exception
  ├─ PermissionError (cross-tenant access attempt, update/delete guard)
  ├─ ValueError (invalid enum, polymorphic type mismatch)
  └─ RuntimeError (engine not initialized, session timeout)
```

### Global Error Handling Flow (main.py exception handlers)

```mermaid
graph TD
    A["Exception Raised<br/>in Endpoint"] --> B{Exception Type?}
    B -->|RequestValidationError| C["422 Unprocessable<br/>Entity"]
    B -->|HTTPException| D["Pass through<br/>status_code"]
    B -->|RateLimitExceeded| E["429 Too Many<br/>Requests"]
    B -->|Uncaught<br/>Exception| F["Log exception<br/>to Sentry"]
    F --> G["500 Internal<br/>Server Error"]
    
    C --> H["Format error<br/>response"]
    D --> H
    E --> H
    G --> H
    
    H --> I["Add request_id<br/>to response"]
    I --> J["Return JSON"]
    J --> K["Client receives<br/>error + request_id"]
```

**Response Format**:

```json
{
  "status_code": 429,
  "detail": "Rate limit exceeded",
  "request_id": "req-abc123-xyz789"
}
```

The `request_id` allows tracing through audit logs and server logs.

### Client-Side Session Recovery (frontend/api.js)

```mermaid
graph TD
    A["API Request Returns 401"] --> B{Is auth endpoint?}
    B -->|Yes<br/>login/register/refresh| C["Raise 'Session expired'<br/>Don't refresh"]
    B -->|No| D["Attempt silent refresh<br/>POST /auth/refresh"]
    
    D --> E{Refresh response?}
    E -->|200 OK| F["Retry original<br/>request"]
    E -->|401/403| G["Session genuinely<br/>invalid"]
    E -->|429/5xx| H["Transient failure<br/>keep session"]
    E -->|Network error| H
    
    G --> I["Fire _onUnauthorized<br/>callback"]
    I --> J["Clear localStorage<br/>redirect to /login"]
    
    F --> K["Return original<br/>response"]
    H --> L["Throw 'temporarily<br/>unavailable'<br/>caller retries"]
```

**Key Insight**: Distinguishes between genuine 401 (invalid session) and transient errors (rate limiting, 5xx, network blips). Prevents logout loops on backend restarts.

### Backup Recovery (on-prem disaster recovery)

```
Database corrupted or lost
       │
       ▼
┌──────────────────────────┐
│ Locate latest backup     │
│ (full or incremental)    │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Verify backup integrity  │
│ (checksum, restore test) │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Stop application         │
│ (prevent new writes)     │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ pg_restore from backup   │
│ (full or PITR)           │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Re-run migrations        │
│ (Alembic upgrade head)   │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Verify data integrity    │
│ (FK constraints, counts) │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Restart application      │
│ (health checks pass)     │
└──────────────────────────┘
```

---

## Background Tasks

### Backup Scheduler (FastAPI lifespan)

```mermaid
graph TD
    A["App startup<br/>lifespan context"] --> B["asyncio.create_task<br/>_run_backup_scheduler"]
    B --> C["Every BACKUP_SCHEDULE_HOURS<br/>seconds"]
    C --> D["Call run_backup_pipeline"]
    
    D --> E{Pipeline type?}
    E -->|Logical| F["pg_dump<br/>→ compressed<br/>→ verified"]
    E -->|Physical| G["pg_basebackup<br/>→ compressed<br/>→ encrypted"]
    E -->|Both| H["Run logical +<br/>physical in sequence"]
    
    F --> I["Store backup<br/>on disk/S3"]
    G --> I
    H --> I
    
    I --> J["Insert record<br/>into backups table"]
    J --> K["Log result<br/>to application log"]
    K --> L["Sleep until<br/>next interval"]
    
    L --> C
    
    M["App shutdown<br/>signal"] --> N["Cancel<br/>backup task"]
    N --> O["Drain pending<br/>audit tasks"]
    O --> P["Close DB<br/>connections"]
```

**Configuration** (env vars):
- `BACKUP_SCHEDULE_HOURS`: Interval (default 6 hours)
- `BACKUP_DIR`: Local directory (default /backups)
- `ENABLE_PHYSICAL_BACKUP`: pg_basebackup (default false)
- `BACKUP_ENCRYPTION_KEY`: GPG key ID (optional)

**Health Indicators**:
- `GET /health` returns backup status
- Each backup recorded with size, checksum, type
- Failed backups logged to Sentry

### Integration Outbox Drainer (FastAPI lifespan)

```mermaid
graph TD
    A["App startup"] --> B["asyncio.create_task<br/>_run_integration_drainer"]
    B --> C["Every 15 seconds"]
    C --> D["Call drain_integration_outbox_once"]
    
    D --> E["Own DB session<br/>(not request-scoped)"]
    E --> F["SELECT IntegrationOutbox<br/>WHERE status='pending'<br/>LIMIT 20"]
    
    F --> G["For each row:<br/>build client +<br/>call external API"]
    
    G --> H{Success?}
    H -->|Yes| I["UPDATE status='sent'<br/>INSERT external link"]
    H -->|No| J["Increment attempt<br/>set next_attempt_at"]
    
    J --> K{attempts >= 5?}
    K -->|Yes| L["Mark as 'dead'<br/>manual review needed"]
    K -->|No| M["Keep as 'pending'<br/>exponential backoff"]
    
    I --> N["COMMIT<br/>return counts"]
    L --> N
    M --> N
    
    N --> O["Log delivery summary"]
    O --> P["Sleep 15 seconds"]
    P --> C
```

**Health Tracking**:
- `IntegrationConnection.last_checked_at`: Last delivery attempt
- `IntegrationConnection.status`: 'ok' or 'error'
- `IntegrationConnection.last_error`: Sanitized error message (no secrets)

---

## User Journeys

### Journey 1: First-Time User Registration & Tenant Creation

```mermaid
sequenceDiagram
    participant User as User<br/>Browser
    participant Frontend as Frontend<br/>React
    participant Auth as Auth API
    participant User_DB as User Table
    participant Tenant_DB as Tenant Table
    participant Session as Session/Auth

    User->>Frontend: Click "Sign Up"
    Frontend->>Frontend: Show registration form
    User->>Frontend: Enter email + password
    Frontend->>Auth: POST /auth/register<br/>{email, password,<br/>firstName, lastName}
    
    Auth->>Auth: Hash password (bcrypt)
    Auth->>Auth: Validate email format
    Auth->>User_DB: Check email unique
    
    alt Email already exists
        Auth->>Frontend: 409 Conflict
        Frontend->>User: Show error
    else New email
        Auth->>Tenant_DB: INSERT Tenant<br/>{name: "firstName's Workspace"}
        Auth->>User_DB: INSERT User<br/>{email, password_hash,<br/>firstName, lastName,<br/>tenantId}
        
        Auth->>Auth: Create JWT tokens<br/>{sub: user.id,<br/>tenantId: tenant.id,<br/>isSuperuser: false}
        
        Auth->>Session: Set auth cookies<br/>(access_token, refresh_token)
        Auth->>Frontend: 200 OK + tokens
        
        Frontend->>Frontend: Store auth in context
        Frontend->>Frontend: Redirect to /onboarding
    end
    
    Frontend->>Frontend: Show team invite form
    User->>Frontend: Enter team member emails
    Frontend->>Auth: POST /auth/invite<br/>{emails: [...]}
    
    Auth->>Auth: Generate invite tokens
    Auth->>Auth: Send emails (SMTP)
    
    Frontend->>Frontend: Redirect to /dashboard
    Frontend->>Frontend: Render quick-start: "Create your first part"
    User->>Frontend: Click "Add Part"
    Frontend->>Frontend: Show part creation modal
```

### Journey 2: Create a Part

```mermaid
sequenceDiagram
    participant User as User
    participant UI as Parts Screen<br/>React
    participant API as Parts API
    participant DB as PostgreSQL

    User->>UI: Click "Add New Part"
    UI->>UI: Open PartModal
    
    User->>UI: Fill form:<br/>partNumber, name,<br/>category, cost, leadTime
    User->>UI: Click "Save"
    
    UI->>API: POST /parts<br/>{partNumber, name,<br/>category, ...}
    
    API->>API: Validate schema
    API->>API: Verify partNumber unique<br/>(within tenant)
    
    API->>DB: INSERT Part<br/>{partNumber, name,<br/>tenantId: current_tenant,<br/>...}
    
    Note over DB: ORM event listener<br/>auto-populates tenantId
    
    DB->>API: Return Part + id
    API->>DB: INSERT AuditLog<br/>{action: 'create',<br/>entityType: 'part',<br/>entityId: part.id,<br/>userId: current_user.id,<br/>changes: {...}}
    
    API->>API: Return 201 Created
    UI->>UI: Add part to context
    UI->>UI: Toast "Part created"
    User->>UI: See part in list
```

### Journey 3: Build a BOM

```mermaid
sequenceDiagram
    participant User as User
    participant UI as BOM Editor<br/>React
    participant API as BOM API
    participant DB as PostgreSQL

    User->>UI: Click "New BOM"
    UI->>UI: Show modal: name + template
    User->>UI: Enter "Power Supply<br/>Module v2"
    
    UI->>API: POST /boms<br/>{projectId, name}
    API->>DB: INSERT BOM
    API->>API: Return BOM + id
    
    UI->>UI: Navigate to BOM editor
    UI->>UI: Show empty hierarchy table
    
    User->>UI: Click "Add Row"
    UI->>UI: Show part search modal
    User->>UI: Type "capacitor"
    
    UI->>API: GET /parts?search=capacitor
    API->>DB: SELECT parts<br/>WHERE tenantId = tenant<br/>AND name ILIKE '%capacitor%'
    DB->>API: Return matching parts
    API->>UI: Return parts list
    
    UI->>UI: Show 10 results
    User->>UI: Click "100µF 50V"
    UI->>UI: Add row: part=100µF, qty=2
    
    User->>UI: Repeat for other parts
    User->>UI: Click "Save"
    
    UI->>API: POST /bom-items<br/>[{partId, qty, refdes}, ...]
    
    Note over API: For each item
    
    API->>DB: INSERT BOMItem<br/>{bomId, partId, qty,<br/>tenantId}
    API->>DB: INSERT BOMItemMaster<br/>(for transactional<br/>structural edit tracking)
    
    DB->>API: Return created items
    API->>API: Emit integration event<br/>if ClickUp enabled
    API->>UI: Return 201 Created
    
    UI->>UI: Toast "BOM saved"
    UI->>UI: Show cost rollup +<br/>where-used
```

### Journey 4: Engineering Change Order (ECO)

```mermaid
sequenceDiagram
    participant Engineer as Engineer
    participant UI as ECO Screen
    participant API as Approvals API
    participant DB as PostgreSQL
    participant Manager as Manager<br/>Portal

    Engineer->>UI: Click "Create ECO"
    UI->>UI: Show ECO form
    
    Engineer->>UI: Fill:<br/>title, description,<br/>affected parts,<br/>old_value/new_value,<br/>reason
    Engineer->>UI: Click "Submit"
    
    UI->>API: POST /approvals<br/>{type: 'ecr',<br/>title, description,<br/>entity_type: 'part',<br/>entity_ids: [...],<br/>status: 'draft'}
    
    API->>API: Validate required fields
    API->>DB: INSERT Approval<br/>{type: 'ecr',<br/>status: 'draft',<br/>created_by: engineer.id}
    API->>DB: INSERT ApprovalItem<br/>{approval_id, part_id,<br/>old_value, new_value,<br/>attribute_name}
    
    DB->>API: Return approval
    API->>API: Emit integration event<br/>to ClickUp<br/>list="BBOM · ECOs"
    API->>UI: Return 201 Created
    
    Engineer->>UI: Click "Submit for Review"
    UI->>API: PATCH /approvals/{id}<br/>{status: 'under_review'}
    API->>DB: UPDATE Approval<br/>status='under_review'
    
    API->>DB: Send notification<br/>to admin users
    
    Manager->>UI: See ECO in<br/>Approvals inbox
    Manager->>UI: Click ECO
    Manager->>UI: Review changes
    Manager->>UI: Click "Approve"
    
    UI->>API: PATCH /approvals/{id}<br/>{status: 'approved',<br/>action: 'approve'}
    
    API->>API: RBAC: Verify admin role
    API->>DB: UPDATE Approval<br/>status='approved'
    API->>DB: UPDATE Part values<br/>(if applicable)
    API->>DB: INSERT AuditLog
    
    DB->>API: Changes committed
    API->>API: Emit ClickUp update<br/>status="approved"
    API->>UI: Return 200 OK
    
    Manager->>UI: Toast "ECO approved"
    Engineer->>UI: See status changed<br/>in inbox
```

---

## Notification & Real-Time

### In-App Notification Flow

```
Backend Event (e.g., approval updated)
       │
       ▼
┌──────────────────────────┐
│ POST /notifications      │
│ {userId, type, title,    │
│  message, link}          │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ INSERT Notification      │
│ {user_id, is_read,       │
│  created_at}             │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ WebSocket Broadcast      │
│ (if user connected)      │
│ Send to tenant channel   │
└──────────────────────────┘
       │
       ├─ Frontend polls     ├─ WebSocket receives
       │  GET /notifications │  message in real-time
       │  every 30s          │  (emit to React state)
       │                     │
       └─────────┬───────────┘
                 │
                 ▼
          ┌────────────────┐
          │ NotificationBell
          │ badge updates  │
          │ (count +1)     │
          └────────────────┘
                 │
                 ▼
          ┌────────────────┐
          │ User clicks    │
          │ opens list     │
          └────────────────┘
```

### WebSocket Tenant Scoping

```python
# Connection setup
GET /ws/activity_feed (with JWT in query/auth header)
  → authenticate_websocket(ws)
    → Extract tenantId from JWT
  → Scoped channel = f"tenant_{tenantId}:activity_feed"
  → Only users in same tenant can receive broadcasts

# Message broadcast
await ws_manager.broadcast(
    f"tenant_{tenantId}:approval_updated",
    {"type": "approval_updated", "approvalId": 123, ...}
)
  → Iterates active WebSocket connections for that channel
  → Sends only to users in that tenant
  → Cross-tenant leakage impossible
```

---

## State Management

### Frontend State Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    React Context (AppCtx)                 │
├───────────────────────────────────────────────────────────┤
│ • authed (bool) — user authenticated?                     │
│ • userRole (str) — current role (admin/engineer/viewer)   │
│ • apiParts (array) — parts from API                       │
│ • apiVendors (array) — vendors from API                   │
│ • apiBomItems (array) — bom_items for active BOM          │
│ • selectedRow (obj) — selected BOM item                   │
│ • modal (str) — active modal name                         │
│ • modalContext (obj) — data for modal                     │
│ • syncStatus (obj) — {syncing: bool, lastSync: timestamp} │
└───────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────┐
│                  localStorage (Persistent)                │
├───────────────────────────────────────────────────────────┤
│ • __bbox_auth — JWT token + refresh token                 │
│ • __bbox_role — user role                                 │
│ • __bbox_parts — parts cache                              │
│ • __bbox_vendors — vendors cache                          │
│ • __bbox_bom_data — active BOM (edit buffer)              │
│ • __bbox_comments — draft comments                        │
│ • __bbox_tweaks — UI preferences (density, font size)     │
└───────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────┐
│               Backend PostgreSQL (Source of Truth)        │
├───────────────────────────────────────────────────────────┤
│ All canonical data; frontend caches are read-through only │
└───────────────────────────────────────────────────────────┘
```

### Data Synchronization Flow

```mermaid
graph TD
    A["User edits part<br/>in form"] --> B["Update React<br/>state"]
    B --> C["Fire onChange<br/>event"]
    C --> D{Auto-save<br/>enabled?}
    D -->|Yes| E["Debounce 1s"]
    E --> F["PUT /parts/{id}<br/>with dirty fields"]
    D -->|No| G["Manual save<br/>button"]
    
    F --> H["API validates<br/>schema"]
    G --> H
    
    H --> I{Validation<br/>OK?}
    I -->|No| J["Show toast<br/>error"]
    I -->|Yes| K["UPDATE database<br/>row"]
    
    K --> L["Response returns<br/>updated part"]
    L --> M["Update localStorage<br/>cache"]
    M --> N["Update React state<br/>from response"]
    N --> O["UI reflects<br/>server state"]
```

---

## Performance Optimization

### N+1 Query Elimination (Batch Loading)

**Before (v1.10.0 — Naive Loop)**:

```python
bom = await db.execute(select(BOM).where(BOM.id == bom_id))
for item in bom.items:
    part = await db.execute(select(Part).where(Part.id == item.partId))  # +1 query per item
    # Process part
# Result: 1 + N queries for N items
```

**After (v1.11.0 — Batch Load)**:

```python
bom = await db.execute(select(BOM).where(BOM.id == bom_id))
# Get all part IDs
part_ids = [item.partId for item in bom.items]
# Single batch query
parts = await db.execute(select(Part).where(Part.id.in_(part_ids)))
parts_dict = {p.id: p for p in parts}
# Result: 2 queries (1 + 1 batch) regardless of N
```

### Redis Caching (Optional)

```python
async def get_bom_explosion(bom_id, level=0, db=None):
    cache_key = f"bom:explosion:{bom_id}:{level}"
    
    # Check Redis (if available)
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)
    
    # Cache miss → query database
    rows = await db.execute(select(BOMItem)...)
    result = [convert_to_schema(row) for row in rows]
    
    # Store in Redis (TTL 5 minutes)
    await redis.setex(cache_key, 300, json.dumps(result))
    
    return result
```

**Cache Invalidation**:
- On `POST /bom-items`: Delete `bom:*` keys for that BOM
- On `PUT /bom-items/{id}`: Delete `bom:*` keys for that BOM
- No explicit invalidation needed for reads (TTL handles expiry)

### Full-Text Search (PostgreSQL)

```sql
-- Index created in migration 012
CREATE INDEX idx_parts_search ON parts USING GIN (
    to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(pn, ''))
);

-- Query (FTS primary, ILIKE fallback for short queries)
SELECT * FROM parts
WHERE (
    to_tsvector('english', name || ' ' || pn) @@ 
    plainto_tsquery('english', 'resistor 10k')
)
OR (
    pn ILIKE '%resistor%' OR name ILIKE '%resistor%'
)
ORDER BY ts_rank(...) DESC;
```

---

## Database Migrations

### Migration Strategy (Alembic + PostgreSQL)

**Key Files**:
- `alembic/versions/` — Numbered migration scripts
- `alembic/env.py` — Migration environment config
- `alembic/alembic.ini` — Fallback DB credentials
- Current head: `040_postgres_rls_tenant_isolation.py`

**Known Issues (documented from Postgres bring-up)**:

1. **VARCHAR(32) Too Short for Alembic Version IDs**
   - Problem: Revision IDs like `036_role_permission_tenant_scoped` are 33+ chars
   - `alembic_version.version_num` column is VARCHAR(32) by default
   - **Fresh Postgres installs fail at migration 036**
   - SQLite never caught this (ignores VARCHAR length)
   - Workaround: Widen column in migration before 036
   - Permanent fix: Update `alembic/env.py` to CREATE TABLE with VARCHAR(64)

2. **DATABASE_URL Env Var Required for Alembic**
   - Alembic reads only `DATABASE_URL` env var (ignores app `.env`)
   - Falls back to hardcoded `alembic.ini` credentials (bom_user:@localhost)
   - Migrations fail to authenticate if DATABASE_URL not exported
   - **Fix**: Export before `alembic upgrade head`
   ```bash
   export DATABASE_URL=postgresql+psycopg://user:pass@host/db
   alembic upgrade head
   ```

3. **Test Suite Runs on SQLite, Not PostgreSQL**
   - ~73 pre-existing test failures documented (unrelated stubs)
   - Postgres-only defects (VARCHAR enforcement, RLS, dialect SQL) not tested
   - **Risk**: Postgres-specific features may have bugs not caught in CI
   - **Mitigation**: Run integration tests on real Postgres before production deploy

### Migration Execution Flow

```
Developer runs: alembic upgrade head
       │
       ▼
alembic/env.py reads DATABASE_URL
       │
       ├─ Found: Use it
       └─ Not found: Use alembic.ini fallback (bom_user:@localhost)
       │
       ▼
Connect to PostgreSQL
       │
       ▼
Load alembic_version table
       │
       ├─ Empty: Start from 000
       └─ Has rows: Get current version_num
       │
       ▼
SELECT all migration files from alembic/versions/
       │
       ▼
For each migration AFTER current version:
    │
    ├─ Read upgrade() function
    ├─ Execute SQL (op.create_table, op.execute, etc.)
    ├─ INSERT new row into alembic_version
    └─ Log completion
       │
       ▼
Commit all changes
       │
       ▼
Verify final version matches head
```

---

## Security Validation Flows

### JWT Algorithm Verification (v1.32.0 — Algorithm Confusion Fix)

```
POST /auth/login
       │
       ▼
verify_token_with_blacklist(token):
  → jwt.get_unverified_header(token) → Extract "alg" claim
    → Is alg in settings.ALGORITHM? (RS256 only, no HS256 fallback)
      → YES: jwt.decode(token, key, algorithms=[alg]) → Return payload
      → NO: Raise InvalidTokenError("Algorithm mismatch")
```

**v1.31.0 Vulnerability (Fixed)**:
- Code accepted any algorithm in JWT header
- Attacker could craft token with `"alg": "none"` → bypass signature check
- Attacker could use `"alg": "HS256"` with public key as HMAC secret → forge signature

**v1.32.0 Fix**:
- Explicitly list allowed algorithms: `algorithms=["RS256"]`
- Reject any token with different algorithm
- No HS256 fallback under any condition

### IP Rate Limiting (Before Account Lockout)

```
POST /auth/login from IP X.X.X.X:
  → _check_ip_rate_limit(ip_address, action="login")
    → Check _ip_attempts cache
      → < 10 attempts in 60s: Allow, increment counter
      → >= 10 attempts: Raise HTTPException(429, "Too many requests")
  → If IP rate limit passes:
    → Check account credentials
      → Failed: Increment _login_attempts[email]
        → >= 5 attempts: Lock account for 15 minutes
        → < 5 attempts: Return 401
      → Success: Create JWT + return 200
```

### CORS Hardening

```
Request with Origin header:
  → CORSMiddleware checks origin against allow_origins
  → If allowed:
    → Allow only specified methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
    → Allow only specified headers: Content-Type, Authorization, X-API-Key,
      X-CSRF-Token, X-Requested-With, Accept, Origin, Referer
  → If not allowed: Block with CORS error
```

### WebSocket Tenant Scoping

```
Client connects to WebSocket:
  → get_current_user via JWT → Extract tenantId
  → Generate scoped_channel = f"tenant_{tenantId}:{channel}"
  → Subscribe to scoped_channel
  → On broadcast: Publish to scoped_channel (NOT global channel)
  → On disconnect: Remove scoped_channel subscription
```

### Sanitization Pipeline

```
Incoming Request Body:
  → Parse Content-Type
    → application/json:
      → json.loads(body) → Walk JSON tree
        → String values: Strip XSS patterns (script tags, event handlers, etc.)
        → _strip_xss_from_json(value) — regex-based XSS pattern removal
    → application/x-www-form-urlencoded:
      → urllib.parse.parse_qs → Sanitize each value → urllib.encode
    → Parse failure: Log warning, pass original body (defense-in-depth
      — downstream sanitization applies)
  → Pass sanitized body to endpoint
```

### Password Reset Security Flow (v1.33.0)

```
POST /auth/forgot-password:
  → _check_ip_rate_limit(ip_address, "forgot-password") — 3/hour per IP
  → Generate bcrypt-hashed reset token, store with 1h TTL
  → Send email via SMTP (no timing leak — always returns 200)

POST /auth/reset-password:
  → _check_ip_rate_limit(ip_address, "reset-password") — 5/hour per IP
  → Load all users with unexpired tokens (O(n) bcrypt scan — necessary)
  → bcrypt.verify(token, hashed_token) → Match found?
    → YES: Update password, invalidate token
    → NO: Return 400
```

### API Key Authentication Flow (v1.33.0)

```
Request with X-API-Key header:
  → Extract key_prefix = api_key[:4] + "_" (first 4 chars before separator)
  → Look up by key_prefix index
  → bcrypt.verify(full_key, stored_hash)
    → Match: Attach user to request
    → No match OR expired: Return 401
```

### Backup MFA Enforcement (v1.32.0)

```
Before (v1.31.0):
  current_user: User = Depends(get_current_user)
  if not current_user.isSuperuser:
      raise HTTPException(403)             ← No MFA check

After (v1.32.0):
  current_user: User = Depends(get_current_superuser)
                                           ← Enforces MFA in production
```

### Webhook Tenant Scoping (v1.32.0)

```
Before (v1.31.0):
  @router.get("", response_model=list[...])
  async def list_subscriptions(db):        ← No current_user
      items = await webhook_service.list_subscriptions(db)
                                           ← Returns ALL tenants' subscriptions

After (v1.32.0):
  @router.get("", response_model=list[...])
  async def list_subscriptions(db, current_user):
      items = await webhook_service.list_subscriptions(db, current_user)
                                           ← Filters by tenantId
```

### SQL Injection Prevention (v1.32.0 — Parameterized Queries)

```
Before (v1.31.0):
  tenantId = current_user.tenantId
  tf = f'"tenantId" = {tenantId}'          ← SQL injection via JWT claim
  result = await db.execute(text(f"SELECT ... WHERE {tf}"))

After (v1.32.0):
  tf, params = _tenant_filter_params(current_user)
  # tf = '"tenantId" = :tenantId'
  # params = {"tenantId": current_user.tenantId}
  result = await db.execute(text(f"SELECT ... WHERE {tf}"), params)
                                           ← Bound parameter, safe
```

---

## Known Limitations & Open Items

### Pending Features (feature branches, not shipped)

1. **feat/regulated** — FDA 21 CFR Part 11 e-signatures + RoHS/REACH compliance
2. **feat/zoho-books** — Two-way Zoho Books sync (parts/items, vendors/contacts, POs, cost)
3. **feat/polish** — WCAG-AA dark mode, high-contrast + colorblind modes, mobile scanner polish

### Documented Postgres Issues

1. Alembic VARCHAR(32) too short for long revision IDs (affects fresh Postgres installs)
2. Alembic reads only DATABASE_URL env var; falls back to hardcoded credentials
3. Test suite runs on SQLite, not Postgres; Postgres-specific defects not caught in CI

### Design Constraints (Locked — 2026-07-17)

- XL-architectural decisions finalized; no further platform pivots
- Local-first (on-prem) storage with optional cloud connectivity
- Multi-tenant app-layer isolation + opt-in Postgres RLS defense-in-depth
- FastAPI + async SQLAlchemy 2.0 + PostgreSQL (no migration to other stacks)

---

## Appendix: Related Documentation

For comprehensive documentation on Blackbox BOM, refer to:

1. **ARCHITECTURE.md** — Component design, module boundaries, dependency graph
2. **OPEN_ITEMS.md** — Known issues, workarounds, pending features
3. **TESTING_AND_VALIDATION.md** — Test strategy, CI/CD pipeline, verification procedures
4. **MODULE_REFERENCE.md** — API endpoints catalog, schema definitions, examples
5. **FEATURE_CATALOG.md** — Feature overview, user workflows, roadmap
6. **CHANGELOG.md** — Version history, breaking changes, migration guides
7. **RELEASE_NOTES.md** — v2.0.0 features, bug fixes, performance improvements

---

**Last Updated**: 2026-07-19  
**Maintainers**: Blackbox Engineering Team  
**Questions?** Contact: engineering@blackboxfactories.com
