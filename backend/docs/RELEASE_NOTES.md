# Release Notes

## v1.3.0 (Current)
Security hardening release — critical fixes across hardcoded credentials, RSA encryption, SQL injection, WebSocket tenant isolation, CORS hardening, JWT algorithm verification, IP rate limiting, and database model fixes.

### Security — Critical
- **CRITICAL**: Hardcoded `admin@blackbox.com:admin123` removed from frontend source and compiled bundle
- **CRITICAL**: RSA private key encryption changed from `NoEncryption()` to `BestAvailableEncryption`
- **CRITICAL**: SQL injection in `api_keys.py` expires_sql fixed — f-string to parameterized bind
- **CRITICAL**: WebSocket broadcast/disconnect now uses `scoped_channel` — prevents cross-tenant data leak

### Security — High
- **HIGH**: CORS `allow_methods`/`allow_headers` restricted from wildcards to explicit lists
- **HIGH**: IP-based rate limiting added — 10 attempts/minute per IP per action before account lockout
- **HIGH**: Rate limit cache DoS fixed — LRU eviction replaces `.clear()` on overflow
- **HIGH**: Sanitize middleware logs warning instead of silently passing on JSON parse failure
- **HIGH**: SAML debug mode disabled always (was enabled in non-production)
- **HIGH**: SSO callback rate limited to 10/minute
- **HIGH**: `/metrics` endpoint now requires JWT authentication
- **HIGH**: API key prefix stores actual prefix instead of `"..."` suffix
- **HIGH**: JSON sanitization uses XSS pattern stripping instead of `html.escape()` (double-encoding fix)
- **HIGH**: JWT algorithm verification via `get_unverified_header()` — prevents algorithm confusion

### Database Model Fixes
- TokenBlacklist: Added `tenantId` column + expiry index
- SupplierPortal: `ondelete="SET NULL"` on FK columns
- AuditLog, BomItem, WorkOrder, DigitalSignature: New indexes for query performance

### Bug Fixes
- SAML `_prepare_saml_request()` now properly async (was `await` in sync function)

### Frontend
- Rebuilt: 109 modules, 1.78s, 0 errors; `admin123` verified absent from compiled bundle

### Known Issues (v1.3.0)
- `.env` and `.secret_key` still tracked in git (need `git rm --cached`)
- Outer test suite (`tests/`) consolidation pending
- 55+ model files still have `index=True` on PK columns
- 30+ FK relationships missing `ON DELETE CASCADE`
- `bomData` JSON column still exists — needs Alembic migration

## v1.2.0
Security & performance audit release — critical fixes across tenant isolation, auth, N+1 queries, and encryption.

### Security — Critical
- **CRITICAL**: Tenant isolation enforced on `get_users()`/`get_user()` — fixed horizontal privilege escalation
- **CRITICAL**: JWT tokens now include `tenantId` claim (was always `None`)
- **HIGH**: API key auth changed from O(n) full-table scan to indexed prefix lookup
- **HIGH**: Encryption key derivation changed from plain truncation to SHA256 (Fernet consistency)
- **HIGH**: SolidWorks license key no longer leaked in API response
- **HIGH**: `isSuperuser` removed from `UserUpdate` schema (requires audited endpoint)
- **MEDIUM**: Duplicate `require_mfa_for_superuser` dependency removed

### Performance — Critical
- **CRITICAL**: N+1 queries eliminated in procurement (3N+1 → 2 queries per request)
- **CRITICAL**: `get_folders()` changed from in-memory iteration to SQL `GROUP BY` aggregation
- **MEDIUM**: S3 client no longer closed after first use (aiobotocore context manager bug)

### Reliability
- Audit fire-and-forget tasks tracked in `_pending_audit_tasks`; drained on shutdown
- S3 storage: removed silent local filesystem fallback (data inconsistency risk)

### Full Audit Sweep (Phase 10)
- PostgreSQL bypass scan
- Security audit
- Performance audit
- Database audit (PK indexes, FK cascades, composite indexes, CHECK constraints flagged)
- UI/UX audit
- Disaster recovery audit
- OpenBOM gap analysis (50% parity score)
- Enterprise readiness scoring

## v1.1.0
Production-hardened release with enterprise security, infrastructure, and reporting.

### Security Hardening
- Supplier portal token auth: in-memory dict → JWT (`create_access_token`/`verify_token`)
- `.env` test secrets replaced with generated secure secrets
- Password reset cross-tenant data leak fixed (tenant validation after token match)
- UPDATE/DELETE tenant isolation via `before_flush` listener in `tenant_events.py`
- TOTP secrets encrypted at rest using Fernet/AES (new `totp_encryption.py` module)
- API key hashing: SHA-256 → bcrypt
- Redis-backed distributed rate limiting (with in-memory fallback)
- Input sanitization extended to `application/x-www-form-urlencoded` form data
- Secret strength validation in `config.py` (entropy + weak pattern detection)
- `create_supplier_user` and `approve/reject price-update` endpoints use proper admin auth

### Infrastructure
- `docker-compose.prod.yml`: PostgreSQL 16, Redis, PgBouncer, MinIO, Celery worker, pgBackRest, nginx
- `Dockerfile.prod`: Multi-stage production build with 4 workers, health checks, resource limits
- Linux pg_dump paths added to backup script
- Disk space check before backup execution
- `POST /api/v1/backup/restore/{backup_id}` HTTP restore endpoint

### Enterprise Reporting
- Vendor XLSX and PDF export endpoints
- BOM XLSX export endpoint (previously PDF only)
- Tenant-aware filtering on all export endpoints (`WHERE "tenantId" = :tid`)
- Refactored export helpers (`_build_header`, `_auto_width`)

### BOM Management
- Deprecated `bomData` field removed from create/update schemas
- `load` endpoint returns computed data from normalized `bom_items` instead of raw JSON column
- BOM explosion, quantity rollup, and cost rollup APIs already implemented

### Test Infrastructure
- 238 passing tests, 1 skipped
- All 7 supplier portal tests updated for JWT auth (passing)
- BOM template tests updated for schema changes (no `bomData` field)
- Full test suite verified: 238 passed, 1 skipped, 0 failures

### Known Issues (v1.2.0)
- Outer test suite (`tests/`) consolidation pending — different conftest setups
- 55+ model files still have `index=True` on PK columns (non-functional but noisy)
- 30+ FK relationships missing `ON DELETE CASCADE`
- Composite indexes needed on `(tenantId, status)` / `(tenantId, category)` patterns
- `bomData` JSON column still exists in schema — needs Alembic migration
- Phase 12 frontend consolidation pending (two frontend apps + test directories)
