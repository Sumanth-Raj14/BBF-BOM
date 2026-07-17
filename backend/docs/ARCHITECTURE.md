# Architecture

## Overview
FastAPI monolith with async SQLAlchemy ORM, multi-tenant isolation, and comprehensive middleware stack.

## Request Lifecycle
```
HTTP Request
  → CORSMiddleware
  → SessionTimeoutMiddleware
  → SecurityHeadersMiddleware
  → RateLimitMiddleware (Redis-backed, fallback to in-memory)
  → CompressionMiddleware
  → InputSanitizationMiddleware (XSS prevention)
  → CSRFMiddleware (double-submit cookie)
  → RequestIDMiddleware
  → AuditLogMiddleware (request logging, drained on shutdown)
  → MetricsMiddleware (Prometheus)
  → Router → Depends(get_current_user) → JWT verification (with tenantId claim)
          → TenantContext.set() from JWT claims
          → Endpoint handler → ORM query → Response
```

## Multi-Tenant Architecture
- **TenantAwareMixin** — Base class adding `tenantId` column to tenant-scoped tables
- **TenantContext** — Thread-local storage for current tenant ID (set per-request)
- **Event Listeners** (`register_tenant_listeners`):
  - `before_insert` — Auto-populates `tenantId` from context
  - `do_orm_execute` — Auto-adds `WHERE tenantId = ?` to SELECT queries
- **RBAC** — Roles and permissions are tenant-scoped

## Database Strategy
- **SQLite** for development/testing (single file, no setup)
- **PostgreSQL 15+** for production (full feature set)
- **Alembic** for schema migrations
- **Hybrid properties** for computed fields, eager-loaded in queries

## Middleware Stack Order
1. CORSMiddleware (outermost)
2. SessionTimeoutMiddleware
3. SecurityHeadersMiddleware
4. RateLimitMiddleware (Redis-backed)
5. CompressionMiddleware
6. InputSanitizationMiddleware
7. CSRFMiddleware
8. RequestIDMiddleware
9. AuditLogMiddleware (with shutdown drain)
10. MetricsMiddleware (innermost)

## Database Layer
- **SQLAlchemy async ORM** with `async_session_maker`
- **Tenant isolation** via `before_insert` / `do_orm_execute` event listeners
- **Batch loading** replaces N+1 pattern in procurement endpoints
- **SQL aggregation** for folder/document counts (replaces in-memory iteration)
- **Known technical debt**: 55+ PKs with redundant `index=True`, 30+ FKs missing `ON DELETE CASCADE`, missing composite indexes on `(tenantId, status/category)` patterns

## Testing Architecture
- **Inner tests** (`app/tests/`) — 238 tests (v1.1.0 baseline), SQLite, session-scoped engine
- **Outer tests** (`tests/`) — 41 tests, SQLite, function-scoped schema recreation
- **Key fixtures**: `test_engine` (session), `clean_db` (autouse), `auth_headers`, `test_user`
- CSRF bypass via `Authorization: Bearer` header
- Supplier portal uses JWT tokens (replaced in-memory dict in v1.2.0)
- Lifespan replaced with `noop_lifespan` to prevent production DB connection in tests
