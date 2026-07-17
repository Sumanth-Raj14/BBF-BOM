# Open Items & Technical Debt

> **Last updated:** v1.3.0 security hardening completed. 18 items resolved.

## Resolved in v1.3.0
- [x] Hardcoded admin credentials removed from frontend source and compiled bundle
- [x] RSA private key encryption: `NoEncryption()` → `BestAvailableEncryption`
- [x] SQL injection in `api_keys.py` expires_sql fixed
- [x] WebSocket cross-tenant leak fixed (scoped_channel)
- [x] CORS wildcard methods/headers restricted
- [x] IP-based rate limiting added (`_check_ip_rate_limit`)
- [x] Rate limit cache `.clear()` replaced with LRU eviction
- [x] Sanitize middleware logs warning instead of silent pass on parse failure
- [x] SAML debug mode disabled always
- [x] SSO callback rate limited (10/minute)
- [x] `/metrics` endpoint now requires authentication
- [x] API key prefix stores actual prefix instead of `"..."` suffix
- [x] JSON sanitization uses XSS pattern stripping (no double-encoding)
- [x] JWT algorithm verification via `get_unverified_header()`
- [x] TokenBlacklist: added `tenantId` column + expiry index
- [x] SupplierPortal FK `ondelete="SET NULL"` added
- [x] Database indexes added across 4 models (AuditLog, BomItem, WorkOrder, DigitalSignature)
- [x] SAML `_prepare_saml_request()` now properly async

## Infrastructure
- [ ] **Outer test suite consolidation** — `tests/` has 3 unique test files (`test_api.py`, `test_rbac.py`, `test_search.py`) that use a different conftest from `app/tests/`. Consolidation requires reconciling fixture differences.
- [ ] **Phase 12: Frontend consolidation** — Two separate frontend apps need merging into one unified app. Test directories also need consolidation.
- [ ] **PostgreSQL test infrastructure** — Docker-based PostgreSQL test runner + CI pipeline. Currently only SQLite tested.
- [ ] **`test.db` cleanup** — Add `test.db` to `.gitignore`, ensure deletion between runs.
- [ ] **Seed enterprise data** — `seed_enterprise_data.py` exists but requires running against a live PostgreSQL instance.

## Database — Remaining from Audit
- [ ] **55+ PK columns still have `index=True`** — Non-functional on PKs but clutters schema. Fix in model definitions.
- [ ] **30+ FK relationships missing `ON DELETE CASCADE`** — Risk of orphaned rows. Add cascade rules.
- [ ] **Composite indexes needed** — Add on `(tenantId, status)` and `(tenantId, category)` for common query patterns.
- [ ] **CHECK constraints missing** — Add to `status` String columns (e.g. `status IN ('draft','active','archived')`).

## Code Quality
- [ ] **`bomData` JSON column removal** — Column exists in `bom_templates` table but is no longer written by API. Needs Alembic migration to drop.
- [ ] **`bomDataComputed` hybrid property** — Triggers lazy-loaded relationship. Currently eager-loaded via `selectinload`. Document this requirement for any new usage.
- [ ] **Hardcoded values** — Various endpoints have inline magic numbers (status strings, enum values).

## Security
- [ ] **CSRF exempt paths** — `/api/v1/supplier-portal/` is exempt from CSRF (uses JWT token auth). Review if this is appropriate.
- [ ] **Secret management** — Move `.env` secrets to vault/secret manager for production.
- [ ] **Rate limiting** — Verify Redis-based rate limit configuration for production workloads. Requires `init_limiter()` call during app startup.
- [ ] **Encryption key escrow/rotation** — TOTP encryption uses a single Fernet key. No key rotation or escrow mechanism.

## Feature Gaps (OpenBOM Parity)
- [ ] **RFQ management module** — Models and endpoints for Request for Quote workflow with vendor response tracking.
- [ ] **Multi-level BOM rollup API** — BOM explosion, quantity rollup, and cost rollup endpoints exist in `bom_enterprise.py`. Verify completeness.
- [ ] **Excel direct import** — CSV import only. Need openpyxl-based Excel file import.
- [ ] **Dashboard/analytics** — Prometheus metrics exist but no business dashboards (part counts, PO aging, etc.).
- [ ] **Part numbering UI** — Table exists, no API or UI for auto-numbering schemes.
- [ ] **ISO compliance reporting** — ISO 9001/13485/AS9100 compliance report generation.
- [ ] **MES integration** — No integration endpoints for Manufacturing Execution Systems.

## Testing Gaps
- [ ] **Test coverage for enterprise models** — ECO, MBOM, Work Orders, Inventory, Quality modules lack comprehensive test coverage.
- [ ] **E2E tests** — `app/tests/e2e/` exists but contains no tests. Needs implementation.
- [ ] **Load testing** — No load/performance tests configured.
- [ ] **Supplier portal CSRF test coverage** — Currently exempt from CSRF; should verify JWT-based auth is adequate.

## Documentation
- [ ] **API Reference** — `docs/API_REFERENCE.md` exists but may be outdated relative to current endpoints.
- [ ] **Admin Guide** — `docs/admin-guide.md` may need updates for multi-tenant configuration.
- [ ] **Release notes** — `RELEASE_NOTES.md` and `CHANGELOG.md` updated through v1.2.0.
