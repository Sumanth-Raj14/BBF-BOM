# Testing & Validation

## Test Suites

### Inner Tests (`app/tests/`)
- **238 tests** (v1.1.0 baseline), 1 skipped
- Run: `python -m pytest app/tests/ --tb=short -q`
- SQLite backend (`sqlite+aiosqlite:///./test.db`)
- Session-scoped engine fixture (tables created once per session)
- Autouse `clean_db` fixture deletes data after each test
- Duration: ~4-5 minutes

### Outer Tests (`tests/`) — Pending Consolidation
- **41 tests**
- Run: `python -m pytest tests/ --tb=short -q`
- SQLite backend
- Function-scoped `setup_db` recreates all tables per test (slow)
- Duration: 10+ minutes
- **Status**: Phase 12 — needs merging with inner test suite (different conftest setups)

## Test Framework
- **pytest** with `pytest-asyncio` for async test support
- **httpx.AsyncClient** with `ASGITransport` for ASGI-level testing
- **Factory pattern**: `test_user`, `auth_headers`, `test_tenant` fixtures
- **CSRF protection**: Bearer tokens bypass CSRF middleware checks
- **Supplier portal tests**: JWT-based auth (migrated from in-memory dict in v1.2.0)

## Infrastructure Fixes Applied

### Problem: Tests connected to production PostgreSQL
**Fix**: Replaced app lifespan with `noop_lifespan` in test conftest
**Files**: `app/tests/conftest.py`

### Problem: `get_session_maker()` bypassed test DB
**Fix**: Override `db_session_module._session_maker` in `test_engine` fixture
**Files**: `app/tests/conftest.py`, `app/core/audit_middleware.py`, `app/core/cache.py`

### Problem: 48+ endpoints missing `tenantId` on model construction
**Fix**: Added `tenantId=current_user.tenantId` to all create endpoints
**Files**: All endpoint files in `app/api/endpoints/`

### Problem: MissingGreenlet from lazy-loaded hybrid properties
**Fix**: Added `selectinload()` to BOM template load endpoint
**Files**: `app/api/endpoints/bom_templates.py`

### Problem: N+1 queries in procurement endpoints (v1.2.0)
**Fix**: Batch loading replaces 3N+1 pattern across 5 endpoints
**Files**: `app/api/endpoints/procurement.py`

### Problem: Unbounded memory in get_folders() (v1.2.0)
**Fix**: SQL GROUP BY aggregation replaces in-memory iteration
**Files**: `app/api/endpoints/documents.py`

### Problem: Audit tasks lost on shutdown (v1.2.0)
**Fix**: Fire-and-forget tasks tracked in set; drained in lifespan shutdown
**Files**: `app/core/audit_middleware.py`, `app/main.py`

## Test Categories
- **Unit tests** — Input sanitization, pagination helpers
- **Integration tests** — Full workflow: vendor → part → BOM → PO
- **API tests** — CRUD lifecycle, pagination, status codes
- **Security tests** — CSRF, rate limiting, auth edge cases
- **Multi-tenant tests** — Tenant isolation, cross-tenant prevention
