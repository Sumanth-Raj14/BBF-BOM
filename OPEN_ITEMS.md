# Blackbox BOM — Open Items & Technical Debt

**Document Date:** 2026-07-19  
**Current Release:** v2.0.0 (master)  
**Contact:** sumanth@blackboxfactories.com

---

## Executive Summary

This document tracks outstanding work across the Blackbox BOM platform (backend + frontend + plugin + branches). Current shipped release is v2.0.0 on master. Three feature branches built and awaiting integration: feat/regulated (FDA Part 11 + RoHS/REACH), feat/zoho-books (two-way Zoho Books sync), and feat/polish (WCAG-AA dark mode, a11y modes, mobile/scanner polish).

**Critical blocking issues:**
1. **Migration 036 VARCHAR(32) blocker** — Alembic's `alembic_version.version_num` column is VARCHAR(32), but migration names like `036_role_permission_tenant_scoped` (39 chars) exceed the limit. Fresh Postgres installs fail at 036. ✗ UNRESOLVED (permanent fix pending in alembic/env.py)
2. **Migration collision on branch merge** — feat/regulated and feat/zoho-books both have `041_*` migrations. Renumbering required before merge.
3. **Alembic authentication fallback** — alembic/env.py ignores .env file; falls back to hardcoded empty password in alembic.ini if DATABASE_URL not exported. Database migrations fail silently.

---

## Status Table: Open Items by Type

| Item | Type | Severity | Owner | Status | Target | Notes |
|------|------|----------|-------|--------|--------|-------|
| **Alembic VARCHAR(32) blocker (036)** | Bug | CRITICAL | Backend | OPEN | v2.1 | Fresh Postgres installs fail at migration 036. Column width = 32, migration id = 39 chars. Permanent fix: widen alembic_version.version_num via migration or env.py auto-fix. SQLite tests never catch this. |
| **Migration 041 collision (regulated ↔ zoho-books)** | Bug | CRITICAL | Backend | OPEN | Merge | `041_part11_esignatures.py` vs `041_zoho_books_sync_tables.py`. Renumber zoho-books to 042+ before merge. |
| **Alembic .env fallback** | Bug | HIGH | Backend | OPEN | v2.1 | alembic/env.py reads only DATABASE_URL/DATABASE_URI, ignores .env. Falls back to hardcoded empty password (bom_user:@localhost) in alembic.ini. Migrations fail unless DATABASE_URL exported. |
| **Test suite SQLite-only** | Infrastructure | HIGH | Backend | OPEN | v2.1 | 238 app/tests run on SQLite; 41 outer tests on SQLite. PostgreSQL CI only in GitHub Actions. Postgres-specific defects (VARCHAR enforcement, RLS, dialect SQL) not caught locally. |
| **~73 pre-existing test failures** | Testing | MEDIUM | Backend | OPEN | v2.1 | Documented as unrelated stubs (see backend/docs/TESTING_AND_VALIDATION.md v1.1.0 baseline). No systematic coverage of enterprise models (ECO, MBOM, Work Orders, Quality). |
| **feat/regulated not merged** | Integration | HIGH | Backend | OPEN | v2.1 | Branch off master. FDA 21 CFR Part 11 e-signatures + RoHS/REACH substance compliance. Blocked by migration 041 collision. |
| **feat/zoho-books not merged** | Integration | HIGH | Backend | OPEN | v2.1 | Branch off master. Two-way Zoho Books sync (parts/items, vendors/contacts, POs, cost). Blocked by migration 041 collision. |
| **feat/polish not merged** | Integration | MEDIUM | Frontend | OPEN | v2.1 | Branch off master. Real WCAG-AA dark mode + high-contrast/colorblind a11y modes. Mobile scanner polish. Compose secrets + backup WAL path fixes. |
| **SolidWorks in-CAD build/test** | External | MEDIUM | SolidWorks | OPEN | v2.0.1 | Requires Windows machine with SolidWorks 2018+ installed. Cannot be tested in CI (no SolidWorks SDK in Docker). Manually verify on Windows before each release. See solidworks-plugin/BUILD_AND_TEST_CHECKLIST.md. |
| **ClickUp integration live tokens** | External | MEDIUM | Integrations | BLOCKED | v2.1 | Live ClickUp API token + workspace ID required for feat/ws3-cliq-clickup branch. Token stored in .env (never committed). |
| **Cliq integration live credentials** | External | MEDIUM | Integrations | BLOCKED | v2.1 | Zoho Cliq OAuth client ID/secret required. Token rotation/refresh needs testing against live Zoho tenant. |
| **Zoho Books OAuth credentials** | External | MEDIUM | Integrations | BLOCKED | v2.1 | Zoho Books client ID/secret + redirect_uri required for feat/zoho-books sync. OAuth flow needs testing against live Books instance. |
| **Backup/restore never tested against live DB** | Operations | HIGH | DevOps | OPEN | v2.0.1 | All backup/restore scripts (pg_dump, pg_basebackup, scripts/backup-data.sh/.ps1, restore-data.sh/.ps1) are code-only. Never executed against production or full-scale test DB. Runbook untested. |
| **E2E tests empty** | Testing | HIGH | Frontend | OPEN | v2.1 | app/tests/e2e/ exists but contains 0 tests. Playwright configured; no scenarios implemented. |
| **Load testing no passing results** | Testing | MEDIUM | QA | OPEN | v2.1 | locustfile.py exists. No evidence of passing benchmarks or performance baseline. |
| **Docker image digests not pinned** | DevOps | MEDIUM | DevOps | OPEN | v2.0.1 | All Dockerfiles + compose files have `@sha256:REPLACE_WITH_ACTUAL_DIGEST` or un-pinned versioned tags. Requires Docker daemon + registry auth to resolve. |
| **~1,094 window.* references remain** | Tech Debt | MEDIUM | Frontend | OPEN | v3.0 | ES module migration Phase 4 (shim removal) deferred. Largest remaining: window.api (226), window.Icon (93), window.INR (92), window.Modal (81). Phases 1-3 complete. |
| **~726 inline styles remain** | Tech Debt | MEDIUM | Frontend | OPEN | v2.5 | CSS migration incomplete. Complex/dynamic styles require per-file manual conversion. |
| **Japanese locale 20% complete** | Localization | LOW | Frontend | OPEN | v2.5 | ja.json = 430 lines; en.json = 2,115 lines. |
| **WCAG 2.1 AA accessibility unaudited** | Compliance | MEDIUM | Frontend | OPEN | v2.5 | No formal a11y audit. Partial WCAG work in feat/polish (dark mode, colorblind modes, contrast). |
| **Outer test suite consolidation** | Infrastructure | MEDIUM | Backend | OPEN | v2.1 | tests/ (41 tests, function-scoped conftest) needs merging with app/tests/ (238 tests, session-scoped). Different fixture setups. |
| **55+ PK columns have index=True** | Code Quality | LOW | Backend | OPEN | v3.0 | Non-functional on PKs; clutters schema. Fix in model definitions. |
| **30+ FK relationships missing ON DELETE CASCADE** | Code Quality | HIGH | Backend | OPEN | v2.1 | Risk of orphaned rows. Partial fix in migration 028; remaining ~30 need review. |
| **Composite indexes missing** | Performance | MEDIUM | Backend | OPEN | v2.1 | Add on (tenantId, status), (tenantId, category), (tenantId, created_at) for query performance. |
| **Part numbering scheme UI** | Feature Gap | LOW | Frontend | OPEN | v2.5 | Table exists (part_numbering_schemes); no API endpoints or UI. Auto-numbering not usable. |
| **ISO compliance reporting** | Feature Gap | LOW | Backend | OPEN | v3.0 | ISO 9001/13485/AS9100 compliance report generation. Models exist; export endpoints missing. |
| **MES integration** | Feature Gap | LOW | Backend | OPEN | v3.0 | No Manufacturing Execution System integration endpoints. |
| **RFQ response tracking** | Feature Gap | LOW | Backend | OPEN | v2.5 | RFQ models exist; supplier response workflows not fully implemented. |
| **Encryption key rotation** | Security | MEDIUM | Backend | OPEN | v2.2 | TOTP encryption uses single Fernet key. No key rotation or escrow mechanism. |
| **Secret management (production)** | Security | HIGH | DevOps | OPEN | v2.1 | .env secrets should move to vault/secret manager for production. Currently file-based. |

---

## Known Bugs

### 1. Alembic Migration Version Column Too Small (VARCHAR(32))
**File:** `backend/alembic/env.py`, `backend/alembic.ini`  
**Severity:** CRITICAL — blocks fresh Postgres installs  
**Description:**  
Alembic's default `alembic_version.version_num` column is VARCHAR(32). Current migration names exceed this:
- `036_role_permission_tenant_scoped` = 39 characters
- `024_json_column_normalization_phase2` = 41 characters  
- `027_datetime_timezone_standardization` = 43 characters

Fresh Postgres installs fail at migration 036 with:
```
value too long for type character varying(32)
```

**Workaround:** Use SQLite for testing (masks the issue). Use `postgresql+asyncpg://...` with exported `DATABASE_URL` env var in dev to trigger the path that auto-upgrades the column.

**Root Cause:** Alembic's built-in version table creation uses hardcoded VARCHAR(32). The migration engine never updates this column width.

**Permanent Fix:** Pending in alembic/env.py. Options:
1. Add a pre-migration hook that widens the column on first run against Postgres.
2. Create a migration file that explicitly widens `alembic_version.version_num`.
3. Auto-generate alembic migrations with shorter revision IDs (e.g., sequential integers).

**References:**
- `backend/alembic/versions/036_role_permission_tenant_scoped.py` (39 chars)
- `backend/alembic.ini:16` (hardcoded empty password)

---

### 2. Alembic Ignores .env; Falls Back to Hardcoded Empty Password
**File:** `backend/alembic/env.py:17-19`, `backend/alembic.ini:16`  
**Severity:** HIGH — silent authentication failures  
**Description:**  
`alembic upgrade head` reads environment:
1. Checks `DATABASE_URL` env var
2. Checks `DATABASE_URI` env var
3. Falls back to hardcoded `postgresql+asyncpg://bom_user:@localhost:5432/bom_db` in alembic.ini

The .env file is **never read** by alembic. If DATABASE_URL is not exported, migrations authenticate as `bom_user` with an empty password.

On machines where `bom_user` requires a non-empty password (production, staging):
```bash
$ alembic upgrade head
# Fails silently — connection refused or authentication failed
```

**Workaround:**
```bash
export DATABASE_URL=postgresql+asyncpg://bom_user:${POSTGRES_PASSWORD}@${POSTGRES_SERVER}:5432/bom_db
alembic upgrade head
```

Or use `docker-compose` entrypoint (`backend/scripts/docker-entrypoint.sh`), which sets DATABASE_URL before calling alembic.

**Permanent Fix:** Modify `backend/alembic/env.py` to:
1. Load .env via `python-dotenv`
2. Check `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_SERVER` in alembic/env.py
3. Build connection string from those vars (same pattern as app/core/config.py)

**References:**
- `backend/alembic/env.py:17-19`
- `backend/alembic.ini:16`
- `backend/scripts/docker-entrypoint.sh` (correct pattern)

---

## Branch Integration Blockers

### feat/regulated (FDA 21 CFR Part 11 + RoHS/REACH)
**Status:** Built, not merged  
**Last commit:** `bc9c724` — "fix(regulated): compliance GET endpoints read-only/idempotent"  
**Migration:** `041_part11_esignatures.py` → **COLLISION WITH feat/zoho-books**  
**Components:**
- Backend: DigitalSignature model + HMAC signing, audit trail constraints
- Frontend: Signature capture UI + compliance audit logs (not yet in main)
- API: 12 new endpoints for signing, witness authentication, change tracking

**Blockers:**
1. Migration 041 collision — must renumber to 042 before merge
2. Merge conflicts with master (master is at 040; feat/regulated is at 041)
3. No integration tests for signature workflows
4. SolidWorks plugin compliance build not tested

**Target:** v2.1 (post-collision resolution)

---

### feat/zoho-books (Two-Way Zoho Books Sync)
**Status:** Built, not merged  
**Last commit:** `8ece198` — "feat(zoho): increment 2b - inbound poll + field-level conflict resolution + reconciliation"  
**Migration:** `041_zoho_books_sync_tables.py` → **COLLISION WITH feat/regulated**  
**Components:**
- Backend: ZohoSyncJob, ZohoSyncLog, ConflictResolution models + sync service
- Frontend: Sync status UI, conflict resolution modal
- API: 8 new endpoints for sync config, status polling, conflict handling

**Blockers:**
1. Migration 041 collision — must renumber to 042 before merge
2. Requires live Zoho Books OAuth credentials (client_id, client_secret, redirect_uri)
3. Sync state machine not battle-tested against production Zoho API
4. Bidirectional sync conflict resolution strategy needs validation

**Target:** v2.1 (post-collision resolution)

---

### feat/polish (WCAG-AA Dark Mode, a11y, Mobile Scanner)
**Status:** Built, not merged  
**Last commit:** `df6949d` — "feat(polish): high-contrast + colorblind-safe a11y modes (item 14)"  
**Migration:** None (frontend-only + backend config changes)  
**Components:**
- Frontend: Real dark mode (not inverted colors) + high-contrast mode + colorblind modes (deuteranopia, protanopia, tritanopia, monochromacy)
- Mobile scanner: Redesigned barcode scanner UI
- Tweaks panel: Moved to CSS tokens for accessibility
- Backend fixes: compose secrets + backup WAL path + duplicate className cleanup

**Blockers:**
1. Not merged to master; feat branch only
2. No accessibility audit (WCAG 2.1 AA not formally verified)
3. Colorblind modes need external validation (internal testing only)

**Target:** v2.1 (soft blocker; ready to merge anytime)

---

## Testing & Quality Assurance

### Test Coverage
**Backend:** 238 tests (app/tests/) + 41 tests (tests/) = **279 total**  
- **Database:** SQLite only. PostgreSQL CI in GitHub Actions, but no local PostgreSQL test runner.
- **Markers:** `@pytest.mark.requires_postgres` skips 1 test on SQLite; rest pass due to schema compatibility.
- **Pre-existing failures:** ~73 tests documented as stubs (see backend/docs/TESTING_AND_VALIDATION.md v1.1.0 baseline). Unrelated to current development.

**Frontend:** 96 unit tests (Vitest) + **0 E2E tests**  
- **E2E:** app/tests/e2e/ exists but empty. Playwright configured; no scenarios.
- **Load testing:** locustfile.py exists; no passing baseline.

### Test Infrastructure Issues
1. **SQLite masks Postgres bugs** — VARCHAR column widths, RLS behavior, dialect-specific SQL only fail on Postgres. Fresh installs against Postgres fail at migration 036.
2. **Outer test suite not consolidated** — tests/ (function-scoped, slow, 10+ min) should merge with app/tests/ (session-scoped, fast, 4-5 min). Different conftest setups.
3. **No E2E coverage** — Critical workflows (multi-tenant auth, BOM explosion, PO approval, signature workflows) not tested end-to-end.
4. **Load testing baseline missing** — locustfile.py exists; no evidence of passing benchmarks for 500 endpoints, 50 concurrent users, 5-min ramp.

### References
- `backend/app/tests/conftest.py` (session-scoped)
- `backend/tests/conftest.py` (function-scoped)
- `backend/pytest.ini` (test config)
- `backend/docs/TESTING_AND_VALIDATION.md` (testing guide)

---

## External Dependencies & Credentials

### ClickUp Integration (feat/ws3-cliq-clickup)
**Status:** Branch exists; not merged to master  
**Required:** ClickUp API token + workspace ID  
**Storage:** .env (CLICKUP_API_TOKEN, CLICKUP_WORKSPACE_ID)  
**Action:** Obtain from ClickUp workspace settings; test sync endpoints against live workspace.

### Cliq Integration (same branch)
**Status:** Branch exists  
**Required:** Zoho Cliq OAuth client ID/secret  
**Storage:** .env (ZOHO_CLIQ_CLIENT_ID, ZOHO_CLIQ_CLIENT_SECRET)  
**Action:** Register app in Zoho Cliq developer portal; test message posting.

### Zoho Books Sync (feat/zoho-books)
**Status:** Branch built; blocked on migration 041 collision  
**Required:** Zoho Books OAuth client ID/secret/redirect_uri  
**Storage:** .env (ZOHO_BOOKS_CLIENT_ID, ZOHO_BOOKS_CLIENT_SECRET, ZOHO_BOOKS_REDIRECT_URI)  
**Action:** Register app in Zoho Books developer portal; test bidirectional sync against live Books instance.

### SolidWorks Plugin Build
**Status:** Built; requires Windows machine with SolidWorks 2018+  
**Required:** SolidWorks COM interop DLLs (ship with SolidWorks itself)  
**Location:** `C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\api\redist\`  
**Action:** Manual build on Windows. See `solidworks-plugin/BUILD_AND_TEST_CHECKLIST.md`.  
**CI Limitation:** Cannot test in Docker. Release process must include manual SolidWorks build verification.

---

## Operations & Disaster Recovery

### Backup/Restore Never Tested Against Live Database
**Files:** `scripts/backup-data.sh`, `scripts/backup-data.ps1`, `scripts/restore-data.sh`, `scripts/restore-data.ps1`, `backend/app/core/backup.py`  
**Status:** Code-only; never executed against production  
**Risk:** Restore may fail on real data. Runbook untested.

**Validation Checklist:**
- [ ] Full backup succeeds against 100GB+ database
- [ ] Restore to fresh machine succeeds (data integrity verified)
- [ ] Incremental backups via pg_basebackup tested
- [ ] Point-in-time recovery (PITR) tested
- [ ] Backup encryption/compression verified
- [ ] Network backup (S3) tested with real AWS credentials
- [ ] Backup retention policy enforced
- [ ] Automated restore drill scheduled

**Target:** v2.0.1 (must complete before production deployment)

---

## Technical Debt

### Frontend ES Module Migration (Phase 4 Pending)
**Status:** Phases 1-3 complete; Phase 4 (shim removal) deferred  
**Remaining:** ~1,094 `window.*` references  
**Largest:** window.api (226), window.Icon (93), window.INR (92), window.Modal (81), window.__nav (46)  
**Issue:** All exports in place (named ES modules). Shim removal blocked on consumer code migration to use ES imports. Deferred to minimize merge conflicts.

**Target:** v3.0 (non-blocking)

### Inline Style Migration (CSS Modernization)
**Status:** 148 styles converted; ~726 remain  
**Blocker:** Complex/dynamic styles (computed color, responsive layout) require per-file manual conversion  
**Issue:** Batch conversion script cannot handle all patterns safely.

**Target:** v2.5 (nice-to-have)

### Foreign Key Cascades (30+ Remaining)
**Status:** Partial fix in migration 028  
**Issue:** ~30 FK relationships still lack `ON DELETE CASCADE`. Risk of orphaned rows on part deletion.  
**Action:** Audit all FK constraints in models; add cascade rules where appropriate.

**Target:** v2.1

### Database Indexes & Constraints
**Status:** Partial coverage  
**Missing:** Composite indexes on (tenantId, status), (tenantId, category), (tenantId, created_at) for common query patterns  
**Missing:** CHECK constraints on status columns (e.g. `status IN ('draft','active','archived')`)

**Target:** v2.1

---

## Feature Gaps (vs. OpenBOM Parity)

| Feature | Status | Est. Effort |
|---------|--------|------------|
| RFQ supplier response tracking | Models exist; workflows incomplete | Medium |
| Multi-level BOM rollup API | Endpoints exist; completeness unverified | Low |
| Excel direct import | CSV only; openpyxl integration pending | Medium |
| Dashboard/analytics | Prometheus metrics exist; business dashboards missing | High |
| Part numbering schemes UI | Table exists; no API/UI | Low |
| ISO compliance reporting | Models exist; export endpoints missing | High |
| MES integration | No endpoints | High |

---

## Architecture & Design Decisions

### Current Architecture
```
Frontend (React + Vite)  ←→  Backend (FastAPI)  ←→  PostgreSQL + Redis
├── Shim architecture         ├── 500+ async API routes     ├── 99 tables
│   (src/root/*)              ├── SQLAlchemy 2.0 ORM        ├── Multi-tenant
│   ↓ wired via               ├── Alembic migrations (040)   │   (tenantId FK)
│   LazyScreens.jsx           ├── RBAC (5 default roles)    └── Row-level
│                             ├── JWT + SAML + TOTP            security (opt-in)
└── src/components/**         ├── Backup/DR (pg_dump, WAL)
    (real components)         └── WebSocket (collab)
```

### Locked Decisions (2026-07-17)
Per CLAUDE.md: feat/regulated, feat/zoho-books, and feat/polish are feature-complete. No new features until v2.1. Focus: bug fixes, testing, merge integration.

---

## Risks & Assumptions

### Technical Risks
1. **Postgres VARCHAR(32) blocker not understood upstream** — If Alembic core intentionally uses VARCHAR(32), widening the column may cause issues with older Alembic versions. Needs investigation.
2. **Bidirectional Zoho Books sync conflict resolution untested** — Algorithm in feat/zoho-books not battle-tested. Production data loss possible if conflict resolution fails.
3. **SolidWorks plugin COM interop brittle** — Plugin breaks if SolidWorks version changes or API changes. No automated CI testing possible.
4. **SQLite test gap masks production defects** — Fresh Postgres installs fail; SQLite tests pass. RLS behavior not tested. Postgres dialect SQL not tested.

### Business Risks
1. **Regulated industry features not verified** — feat/regulated uses HMAC signing + audit trail, but no independent audit against FDA 21 CFR Part 11. Compliance claim unvalidated.
2. **Backup restore untested** — DR runbook may fail on real data. Disaster recovery not validated.
3. **Japanese locale 20% complete** — If marketing commits to Japanese support, 80% of translation work remains.

### Operational Risks
1. **Manual SolidWorks plugin build required** — Release process must include Windows build step. Automation not possible.
2. **External API credentials not versioned** — ClickUp, Cliq, Zoho Books tokens in .env only. Lost tokens = feature outage.
3. **Docker image digests not pinned** — Supply chain attack surface (image tampering). Must pin digests before production.

---

## Assumptions

1. **PostgreSQL 16+** is production database. SQLite test support is temporary fallback only.
2. **Multi-tenancy via app-layer filtering** is primary isolation. Row-level security (ENABLE_RLS) is opt-in defense-in-depth.
3. **JWT RS256** (not HS256) for all tokens. Algorithm confusion protection in place.
4. **master branch** is stable and deployable. All hotfixes go to master; feature branches are long-lived development streams.
5. **Backup/restore procedure is correct** but untested. Assume data loss until validated.
6. **SolidWorks COM interop** is stable within supported versions (2018+). Assume no vendor API breaking changes.

---

## Success Criteria for Closure

- [ ] Migration 036 VARCHAR(32) blocker resolved (column widened to 64 or auto-fix in env.py)
- [ ] feat/regulated & feat/zoho-books merged (041 collision fixed, migrations renumbered)
- [ ] Full backup → restore cycle tested against 100GB+ live database
- [ ] Postgres CI test runner configured (docker-compose.test.yml running in GitHub Actions)
- [ ] E2E test suite populated (minimum 10 critical workflows)
- [ ] SolidWorks plugin build manual verification documented in release process
- [ ] Dark mode (feat/polish) merged; WCAG 2.1 AA compliance verified

---

## Cross-References

| Document | Location | Purpose |
|----------|----------|---------|
| Architecture | `backend/docs/ARCHITECTURE.md` | Backend system design, 500+ endpoints |
| Testing Guide | `backend/docs/TESTING_AND_VALIDATION.md` | Test suite setup, known test issues |
| Feature Catalog | `backend/docs/FEATURE_CATALOG.md` | Complete feature inventory |
| API Reference | `backend/docs/API_REFERENCE.md` | 500+ endpoint specs |
| Enterprise Audit | `ENTERPRISE_AUDIT_REPORT.md` | Full security & compliance audit |
| Disaster Recovery | `DISASTER_RECOVERY_RUNBOOK.md` | Backup/restore procedures |
| Frontend OPEN_ITEMS | `frontend/OPEN_ITEMS.md` | Frontend-specific open items |
| Backend OPEN_ITEMS | `backend/docs/OPEN_ITEMS.md` | Backend-specific open items (v1.3.0) |
| SolidWorks Checklist | `solidworks-plugin/BUILD_AND_TEST_CHECKLIST.md` | SolidWorks build & test guide |
| Install Guide | `INSTALL.md` | One-click local install, troubleshooting |

---

**Last Updated:** 2026-07-19  
**Maintained By:** Backend Team  
**Next Review:** 2026-08-16
