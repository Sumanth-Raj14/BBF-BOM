# Blackbox BOM — Open Items & Technical Debt

**Document Date:** 2026-07-19  
**Current Release:** v2.1.0 (master)  
**Contact:** sumanth@blackboxfactories.com

---

## Executive Summary

This document tracks outstanding work across the Blackbox BOM platform (backend + frontend + plugin). Current shipped release is v2.1.0 on master. All three feature branches have been merged to master: feat/regulated (FDA Part 11 + RoHS/REACH), feat/zoho-books (two-way Zoho Books sync), and feat/polish (WCAG-AA dark mode, a11y modes, mobile/scanner polish). Fresh PostgreSQL installs are fully supported; head is now `048_index_foreign_keys` (48 migrations) with **160 tables**.

**Recently resolved (v2.1.0 release):**
1. ✅ **Migration collision resolved** — feat/regulated `041_part11_esignatures` and feat/zoho-books `041_zoho_books_sync_tables` relinked into linear chain via Alembic rebase (041_compliance_pack -> 041_part11_esignatures -> 042_substance_reference_data -> 043_part_composition_declarations -> 044_compliance_evaluations -> 041_zoho_books_sync_tables)
2. ✅ **Fresh Postgres install now works** — VARCHAR(32) blocker fixed in alembic/env.py; DATABASE_URL + .env fallback implemented with POSTGRES_USER/PASSWORD/SERVER support (same pattern as app/core/config.py)
3. ✅ **3 compliance orphan tables resolved** — compliance_packs, substance_reference_data, part_composition_declarations now properly modeled in migrations 042-044
4. ✅ **ALLOWED_HOSTS/testserver misconfig fixed** — pytest now passes testserver; unblocked ~412 of 414 previously-failing tests

**Recently resolved (2026-08-01 — Postgres hard gate):**
5. ✅ **Full test-suite re-baseline DONE on real Postgres** — `Test Suite on Postgres` CI job is a green HARD GATE: **634 passed / 0 failed / 1 skipped / 1 xfailed** on PG16. No remaining test failures. (See CHANGELOG `[Unreleased]` and TEST_FAILURES_TRIAGE.md resolution banner.)
6. ✅ **Migration-system tests fixed** — re-pinned to real head `047`; offline-SQL test `xfail`ed (documented); obsolete `sql_archive` test removed.

**Recently resolved (2026-08-02 — post-v2.1.0 work on `master`):**
7. ✅ **Foreign keys indexed (improvement #6)** — migration `048_index_foreign_keys` adds an index to each of the 30 FK columns that lacked one; 0 FK columns remain without index coverage.
8. ✅ **Members & Privileges UI** — `frontend/src/components/screens/MembersScreen.jsx` at `/members`; the RBAC API finally has an interface.
9. ✅ **Real 3D CAD viewer** — `frontend/src/components/cad/CadViewer.jsx` (STEP/IGES via `occt-import-js` WASM; STL/OBJ/GLTF/PLY/3MF via `three`). Proprietary `.sldprt`/`.sldasm` are explicitly unsupported.
10. ✅ **Document download endpoint** — `GET /api/v1/documents/{id}/download`, previously absent entirely, with a `realpath` containment guard against path traversal.
11. ✅ **Demo-data fallbacks removed** — `AppCtx` no longer substitutes the bundled demo BOM for real data, and the CAD import modal no longer fakes an import.

**Current blocking issues:**
- PITR/WAL end-to-end live verification in packaged desktop environment
- E2E Playwright suite exists but **is not wired into CI on `master`** — see the status table

---

## Status Table: Open Items by Type

| Item | Type | Severity | Owner | Status | Target | Notes |
|------|------|----------|-------|--------|--------|-------|
| **Alembic VARCHAR(32) blocker (036)** | Bug | CRITICAL | Backend | ✅ RESOLVED | v2.1 | Fixed in alembic/env.py with .env fallback support and POSTGRES_USER/PASSWORD/SERVER parsing. Fresh Postgres installs now succeed. |
| **Migration 041 collision (regulated ↔ zoho-books)** | Bug | CRITICAL | Backend | ✅ RESOLVED | v2.1 | Resolved via linear relink. Both branches merged to master in sequence: 041_compliance_pack -> 041_part11_esignatures -> 042+ -> 041_zoho_books_sync_tables. |
| **Alembic .env fallback** | Bug | HIGH | Backend | ✅ RESOLVED | v2.1 | Fixed. alembic/env.py now reads POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_SERVER from .env via python-dotenv, same pattern as app/core/config.py. |
| **3 compliance orphan tables** | Bug | HIGH | Backend | ✅ RESOLVED | v2.1 | Fixed. compliance_packs, substance_reference_data, part_composition_declarations now properly modeled in migrations 042-044. |
| **ALLOWED_HOSTS/testserver misconfig** | Bug | HIGH | Backend | ✅ RESOLVED | v2.1 | Fixed. pytest now allows 'testserver' in ALLOWED_HOSTS. Unblocked ~412 of 414 previously-failing tests. |
| **Test suite RE-BASELINE (post-ALLOWED_HOSTS)** | Testing | HIGH | Backend | ✅ RESOLVED | v2.1 | Done on real Postgres: `Test Suite on Postgres` CI = **634 passed / 0 failed / 1 skipped / 1 xfailed** (PG16). This is now the authoritative hard gate. |
| **Test suite SQLite-only (local)** | Infrastructure | MEDIUM | Backend | OPEN | v2.2 | Fast local/dev track is still SQLite. CI now runs the FULL suite on real Postgres (hard gate) + a fresh-install bootstrap job, so PG-only behavior is covered in CI. A local docker-compose.test.yml Postgres runner is still a nice-to-have for pre-push parity. |
| **E2E Playwright not wired into CI** | Testing | HIGH | Frontend | OPEN | v2.2 | `frontend/e2e/real-flows.spec.js` + `smoke.spec.js` exist and pass against a live backend, and `backend/scripts/seed_e2e_fixture.py` seeds the data, but **no workflow in `.github/workflows/` runs Playwright on `master`** — so E2E is manual and non-gating. The CI job and an additional `write-flows.spec.js` suite are on the unmerged branch `test/e2e-ci-and-write-flows`; merging it closes this. |
| **`window.*` app-globals → ES modules (improvement #2)** | Tech Debt | MEDIUM | Frontend | IN PROGRESS | v2.2 | `window.__nav` → `src/services/navigation.js`, `window.__poDraft` → `src/services/poDraft.js`, `window.INR_RATE` → `src/utils/currency.js`, and `apiConnected` moved onto React context. **One live `window.INR_RATE` read remains, at `frontend/src/utils/download.ts:137`.** Many app globals are still registered by the `src/root/*.jsx` shim layer; the migration is not finished and there is still no lint rule blocking new `window.<AppGlobal>` references. |
| **Unindexed foreign keys (improvement #6)** | Performance | MEDIUM | Backend | ✅ RESOLVED | v2.2 | Migration `048_index_foreign_keys` indexes all 30 previously-unindexed FK columns (`ix_<table>_<column>`, matching SQLAlchemy defaults so migrated and fresh schemas agree). 0 remain. |
| **~73 pre-existing test failures** | Testing | MEDIUM | Backend | ✅ RESOLVED | v2.1 | 0 failures on the Postgres hard gate. The prior "~73 stubs" were the ALLOWED_HOSTS-masked cascade plus a handful of stale test contracts, all fixed. |
| **feat/regulated merged** | Integration | HIGH | Backend | ✅ RESOLVED | v2.1 | Merged to master. FDA 21 CFR Part 11 e-signatures + RoHS/REACH substance compliance. Live in v2.1.0. |
| **feat/zoho-books merged** | Integration | HIGH | Backend | ✅ RESOLVED | v2.1 | Merged to master. Two-way Zoho Books sync (parts/items, vendors/contacts, POs, cost) with conflict resolution engine. Live in v2.1.0. |
| **feat/polish merged** | Integration | MEDIUM | Frontend | ✅ RESOLVED | v2.1 | Merged to master. Real WCAG-AA dark mode + high-contrast/colorblind a11y modes. Mobile scanner polish. Compose secrets + backup WAL path fixes. Live in v2.1.0. |
| **PITR/WAL live verification** | Operations | HIGH | DevOps | OPEN | v2.2 | End-to-end point-in-time recovery test in packaged desktop environment. Config shipped in WS7 (postgresql.conf.template + DURABILITY.md); live test execution pending. |
| **SolidWorks in-CAD build/test** | External | MEDIUM | SolidWorks | OPEN | v2.0.1 | Requires Windows machine with SolidWorks 2018+ installed. Cannot be tested in CI (no SolidWorks SDK in Docker). Manually verify on Windows before each release. See solidworks-plugin/BUILD_AND_TEST_CHECKLIST.md. |
| **ClickUp integration live tokens** | External | MEDIUM | Integrations | BLOCKED | v2.1 | Live ClickUp API token + workspace ID required for feat/ws3-cliq-clickup branch. Token stored in .env (never committed). |
| **Cliq integration live credentials** | External | MEDIUM | Integrations | BLOCKED | v2.1 | Zoho Cliq OAuth client ID/secret required. Token rotation/refresh needs testing against live Zoho tenant. |
| **Zoho Books OAuth credentials** | External | MEDIUM | Integrations | BLOCKED | v2.1 | Zoho Books client ID/secret + redirect_uri required for feat/zoho-books sync. OAuth flow needs testing against live Books instance. |
| **Desktop app installer code-signing cert** | Security | HIGH | DevOps | OPEN | v2.2 | setup.exe (Inno Setup) requires Authenticode signature for Windows SmartScreen bypass. Certificate procurement + signing automation pending. |
| **Comprehensive UI autosave (drafts)** | Feature | MEDIUM | Frontend | OPEN | v2.2 | Partial autosave of part/BOM drafts exists. Full autosave for all unsaved edits (assembly configs, vendor quotes, work orders) not yet implemented. |
| **Zoho Books proactive rate-limit handling** | Reliability | MEDIUM | Backend | OPEN | v2.2 | Sync service lacks proactive token-bucket rate-limiting for Zoho API. Deferred by feature author to live-hardening phase. Add exponential backoff + adaptive rate limiting. |
| **Backup/restore never tested against live DB** | Operations | HIGH | DevOps | OPEN | v2.0.1 | All backup/restore scripts (pg_dump, pg_basebackup, scripts/backup-data.sh/.ps1, restore-data.sh/.ps1) are code-only. Never executed against production or full-scale test DB. Runbook untested. |
| **E2E tests empty** | Testing | HIGH | Frontend | OPEN | v2.1 | app/tests/e2e/ exists but contains 0 tests. Playwright configured; no scenarios implemented. |
| **Push/finalize to BBF-BOM production** | Operations | HIGH | DevOps | OPEN | v2.1.1 | Deploy v2.1.0 to production BBF-BOM infrastructure. Includes final security review, load testing baseline, and operational readiness assessment. |
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
| **Mfg-BOM workbook field parity (7 items)** | Feature Gap | MEDIUM | Product | OPEN | v2.5 | Field-level parity with a customer's "Master Manufacturing BOM" workbook. Top item = per-line component image thumbnails in the BOM grid (HIGH). See [Manufacturing-BOM Workbook Field-Parity Backlog](#manufacturing-bom-workbook-field-parity-backlog-2026-07-19). Logged 2026-07-19 from a gap analysis; **no code changes made** — tracking only. |

---

## Known Bugs — RESOLVED in v2.1.0

### 1. Alembic Migration Version Column Too Small (VARCHAR(32)) — ✅ FIXED
**File:** `backend/alembic/env.py`  
**Severity:** CRITICAL — was blocking fresh Postgres installs  
**Status:** RESOLVED  
**Description:**  
Alembic's default `alembic_version.version_num` column is VARCHAR(32). Migration names like `036_role_permission_tenant_scoped` (39 chars) exceeded the limit.

**Fix Applied:**
- Modified `backend/alembic/env.py` to detect Postgres and auto-widen `alembic_version.version_num` to VARCHAR(255) on first run
- Added .env fallback support (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_SERVER)
- Fresh Postgres installs now succeed; migration chain builds 159 tables without errors

**References:**
- `backend/alembic/env.py` (fixed version with widening logic)
- Single Alembic head: `048_index_foreign_keys`

---

### 2. Alembic Ignores .env; Falls Back to Hardcoded Empty Password — ✅ FIXED
**File:** `backend/alembic/env.py`  
**Severity:** HIGH — was silent authentication failures  
**Status:** RESOLVED  
**Description:**  
`alembic upgrade head` previously fell back to hardcoded `postgresql+asyncpg://bom_user:@localhost:5432/bom_db` in alembic.ini if DATABASE_URL was not exported.

**Fix Applied:**
- Modified `backend/alembic/env.py` to load .env via `python-dotenv`
- Now checks `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_SERVER` (same pattern as app/core/config.py)
- DATABASE_URL is also still checked for backward compatibility
- Migrations authenticate correctly with database credentials from .env

**References:**
- `backend/alembic/env.py` (fixed version)
- `backend/scripts/docker-entrypoint.sh` (uses same pattern)

---

## Branch Integration Status — ALL MERGED to Master (v2.1.0)

### feat/regulated (FDA 21 CFR Part 11 + RoHS/REACH) — ✅ MERGED
**Status:** Merged to master in v2.1.0  
**Migration:** `041_part11_esignatures.py` (linear chain integrated)  
**Components:**
- Backend: DigitalSignature model + HMAC signing, audit trail constraints
- Frontend: Signature capture UI + compliance audit logs
- API: 12 new endpoints for signing, witness authentication, change tracking
- Compliance tables: substance_reference_data, part_composition_declarations (migrations 042-044)

**Completion:**
- ✅ Migration collision resolved via linear relink
- ✅ Merged conflicts resolved
- ✅ All compliance models verified (155 tables in fresh Postgres install)
- ⚠ Integration tests for signature workflows not yet comprehensive; recommend E2E coverage in v2.2

---

### feat/zoho-books (Two-Way Zoho Books Sync) — ✅ MERGED
**Status:** Merged to master in v2.1.0  
**Migration:** `041_zoho_books_sync_tables.py` (final in linear chain)  
**Components:**
- Backend: ZohoSyncJob, ZohoSyncLog, ConflictResolution models + sync service
- Frontend: Sync status UI, conflict resolution modal
- API: 8 new endpoints for sync config, status polling, conflict handling
- Conflict engine: Monetary conflict detection + review queue + cascade-clean lifecycle

**Completion:**
- ✅ Migration collision resolved
- ✅ Merged to master successfully
- ⚠ Requires live Zoho Books OAuth credentials for testing (not yet run against production)
- ⚠ Sync state machine needs production battle-testing (deferred to v2.2)
- ⚠ Proactive rate-limiting not implemented (deferred to live-hardening phase)

---

### feat/polish (WCAG-AA Dark Mode, a11y, Mobile Scanner) — ✅ MERGED
**Status:** Merged to master in v2.1.0  
**Migration:** None (frontend-only + backend config changes)  
**Components:**
- Frontend: Real dark mode (not inverted colors) + high-contrast mode + colorblind modes (deuteranopia, protanopia, protanopia, tritanopia, monochromacy)
- Mobile scanner: Redesigned barcode scanner UI with tweaks-panel tokens
- Backend: compose secrets migration fix + backup WAL path normalization + duplicate className cleanup

**Completion:**
- ✅ Merged to master
- ✅ All colorblind modes tested internally
- ⚠ No formal WCAG 2.1 AA audit (recommend independent a11y audit in v2.2)

---

## Testing & Quality Assurance

### Test Coverage (current, measured 2026-08-02)
**Backend:** suite collects **648 tests** and runs on the **Postgres hard gate** (real PG16, `Test Suite on Postgres` CI job). On the fast SQLite track: **640 passed / 6 failed / 2 skipped**, where all 6 failures are Postgres-only SQL (`TO_CHAR`, `NOW() - INTERVAL`, `ILIKE`, `ts_rank`, `::date`) in `test_analytics`/`test_search` that SQLite cannot parse. The PG gate was not re-run in this documentation pass — the previously recorded 634 passed / 0 failed / 1 skipped / 1 xfailed predates the tests added since.  
- **Database:** SQLite for fast local/dev; the FULL suite runs against real PostgreSQL 16 in CI (authoritative hard gate) plus a fresh-install `init_db` bootstrap job.
- **Skipped (1):** `test_migration_up_down_cycle` (needs a live localhost PG). **xfailed (1):** `test_migration_offline_sql` (offline `--sql` generation unsupported by design).
- **Pre-existing failures:** none remaining — the ALLOWED_HOSTS-masked cascade and the handful of stale test contracts are all fixed.

**Frontend:** **182 unit tests passing across 86 files** (Vitest), run by the `Test Frontend` job in `ci.yml`.  
- **E2E:** `frontend/e2e/` holds `smoke.spec.js`, `real-flows.spec.js` and `auth.setup.js`, with `backend/scripts/seed_e2e_fixture.py` seeding a multi-level BOM. They pass against a live backend but **no CI workflow runs them**, so they are manual and non-gating. (`backend/app/tests/e2e/` is still an empty stub.)
- **Load testing:** locustfile.py exists; no passing baseline.

### Test Infrastructure Issues — Priority Fix Needed
1. ✅ **Test suite RE-BASELINE** — DONE. Full suite runs on the real-Postgres hard gate. Suite size has since grown to 648 collected tests; re-measure the PG numbers from the latest CI run rather than trusting a figure recorded here.
2. **SQLite vs. Postgres divergence** — Local dev uses SQLite (faster); the full suite + a fresh-install bootstrap now run on real Postgres in CI, so PG-only behavior is covered. A local docker-compose.test.yml runner is still a nice-to-have for pre-push parity.
3. **Outer test suite not consolidated** — tests/ (function-scoped, slow, 10+ min) should merge with app/tests/ (session-scoped, fast, 4-5 min). Different conftest setups.
4. **E2E coverage exists but does not gate** — `real-flows.spec.js` now covers auth reachability, anonymous rejection, wrong-password rejection, real login and per-screen crash checks against a live backend. Still uncovered end-to-end: BOM explosion, PO approval, signature workflows and Zoho sync conflict resolution. And because no CI job runs Playwright on `master`, none of it blocks a merge.
5. **Load testing baseline missing** — locustfile.py exists; no evidence of passing benchmarks for 500 endpoints, 50 concurrent users, 5-min ramp.

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

### Desktop Packaging & Deployment (WS7 Completed, Live Verification Pending)
**Status:** Shipped in v2.1.0; live testing pending  
**Files:** `desktop/launcher.py`, `desktop/updater.py`, `desktop/installer.iss`, `desktop/build.py`, `DESKTOP_PACKAGING.md`, `DURABILITY.md`  
**Components:**
- Single-click Windows installer (Inno Setup) bundling portable Postgres + PyInstaller backend + built frontend
- launcher.py: Init/start/crash-safe stop of bundled cluster, init_db bootstrap, uvicorn, browser, single-instance lock
- updater.py: Local-first version-feed check → download → SHA-256 verify → silent installer apply (31 tests)
- PostgreSQL config: DURABILITY.md + postgresql.conf.template for PITR/WAL

**Validation Checklist:**
- [x] Single-click install succeeds (WS7 delivered)
- [x] Desktop environment initialization verified (launcher.py)
- [x] Silent update mechanism tested (updater.py + 31 tests)
- [ ] PITR/WAL end-to-end live test (config shipped; live execution pending)
- [ ] Backup/restore in packaged environment verified
- [ ] Code-signing certificate (Authenticode) for setup.exe (SmartScreen bypass)

**Target:** v2.2 (PITR/WAL live verification + code-signing)

---

### Backup/Restore Never Tested Against Live Database
**Files:** `scripts/backup-data.sh`, `scripts/backup-data.ps1`, `scripts/restore-data.sh`, `scripts/restore-data.ps1`, `backend/app/core/backup.py`  
**Status:** Code-only; never executed against production  
**Risk:** Restore may fail on real data. Runbook untested.

**Validation Checklist:**
- [ ] Full backup succeeds against 100GB+ database
- [ ] Restore to fresh machine succeeds (data integrity verified)
- [ ] Incremental backups via pg_basebackup tested
- [ ] Point-in-time recovery (PITR) tested in packaged desktop environment
- [ ] Backup encryption/compression verified
- [ ] Network backup (S3) tested with real AWS credentials
- [ ] Backup retention policy enforced
- [ ] Automated restore drill scheduled

**Target:** v2.0.1 → v2.2 (must complete before production deployment)

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

## Manufacturing-BOM Workbook Field-Parity Backlog (2026-07-19)

**Source:** gap analysis of a customer's `Master Manufacturing BOM.xlsx` (32 tabs: Machining, Fabrication, Anodising, Fasteners, Misumi, Festo, Electronics, Pneumatics, Budget, POs, Not Yet Ordered, etc.) against the current tool.
**Finding:** ~80% of the workbook's per-line detail already maps to existing tool concepts (parts, custom attributes, documents, inventory, vendors, POs). The items below are the ~20% that are **not native** and would be needed for true field-level parity.
**Status:** LOGGED ONLY — no product code was changed. This is the confirmed enhancement backlog for later prioritization. Related existing gap: "Excel direct import" (see Feature Gaps table) and `COMPARISON.md`.

Ordered by the priority the customer weighted (image-per-line is the top item, called out twice):

| # | Enhancement | What the tool has today | What's missing (the gap) | Priority | Est. effort |
|---|-------------|-------------------------|--------------------------|----------|-------------|
| 1 | **Per-line component image / thumbnail** | Images attach as documents to a part | A thumbnail-per-row shown inline in the BOM grid, and preserved on rows imported from vendor-catalog tabs (item 7). This is a per-line image *column*, not a separate documents area. | **HIGH** | Medium |
| 2 | **Structured Process / Precision / Machining-process fields** | Only generic custom attributes | Native, typed columns with controlled vocab (e.g. Process = Routing/Milling; Precision = High/Medium; source = COTS) so they filter/report/roll-up, not free-text customs | MEDIUM | Medium |
| 3 | **Typed multi-CAD-link columns per line** | One documents area per part | Separate native per-line fields: DWG + STEP + DXF links **and** a "drawing status" field, distinct from generic document attachments | MEDIUM | Medium |
| 4 | **Required-vs-Utilized-vs-Inventory reconciliation view** | Data exists across inventory + BOM + procurement domains | A single grid showing, per component: needed / used-in-machine / in-stock / $ amount in one screen. Data is present but not surfaced as one native reconciliation view | MEDIUM (high value) | High |
| 5 | **Dual per-part approval (Internal + External)** | Approval is workflow/ECO-based | Two independent approval flags (Internal approved + External approved) per component line, as the workbook models them | MEDIUM | Low–Medium |
| 6 | **Phased ordering + Budget-vs-actual + "Not Yet Ordered" views** | POs exist | Procurement/budget rollup views: phased ordering, budget-vs-actual, and a "not yet ordered" queue as out-of-box screens | MEDIUM | High |
| 7 | **Vendor-catalog import (Misumi / Festo tabs)** | One consolidated vendor/part model (structurally better than per-vendor sheets) | An importer that maps per-vendor catalog tabs into the unified model — **and carries the per-line image column** (ties back to item 1) rather than dropping it | LOW–MEDIUM | Medium |

**Note on item 7:** the tool's single vendor/part model is deliberately better than keeping one sheet per vendor, so those tabs would be *imported and consolidated*, not preserved as separate sheets. The one thing that must survive the import is the image column, which is why it reinforces item 1.

**Target:** v2.5 (feature parity pass). None of these block v2.1.0 / production deploy.

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
Per the project plan: feat/regulated, feat/zoho-books, and feat/polish are feature-complete. No new features until v2.1. Focus: bug fixes, testing, merge integration.

---

## Production Deployment Readiness

### Push to BBF-BOM Production
**Status:** PENDING  
**Scope:** Deploy v2.1.0 to production BBF-BOM infrastructure  
**Pre-requisites:**
- [x] All feature branches merged to master
- [x] Migration chain linear (041 → 042 → 043 → 044 → 041_zoho_books)
- [x] Fresh Postgres install verified (155 tables)
- [x] ALLOWED_HOSTS/testserver fixed
- [ ] Full test suite RE-BASELINE completed
- [ ] PITR/WAL live verification in packaged environment
- [ ] Load testing baseline established (500 endpoints, 50 concurrent users)
- [ ] Final security review completed
- [ ] Code-signing certificate acquired for installer

**Deployment Steps:**
1. Final regression testing (RE-BASELINE results + E2E smoke tests)
2. Production environment setup (Postgres 16+, DNS, SSL/TLS)
3. Staged rollout (dev → staging → production)
4. Live Zoho Books credentials provisioned
5. Live ClickUp + Cliq credentials provisioned (if feat/ws3-cliq-clickup merged)
6. Database backup + PITR validation on production cluster
7. Operational runbooks finalized

**Target:** v2.1.1 (post-v2.1.0 stabilization period, ~1-2 weeks)

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

1. **PostgreSQL 16+** is production database. SQLite test support is temporary fallback only. Fresh Postgres installs now verified working (155 tables, linear migration chain).
2. **Multi-tenancy via app-layer filtering** is primary isolation. Row-level security (ENABLE_RLS) is opt-in defense-in-depth.
3. **JWT RS256** (not HS256) for all tokens. Algorithm confusion protection in place.
4. **master branch** is stable and deployable. All three feature branches now merged (regulated, zoho-books, polish). Hotfixes go to master; feature branches are long-lived development streams.
5. **Backup/restore procedure is correct** but untested. Assume data loss until validated against 100GB+ database.
6. **SolidWorks COM interop** is stable within supported versions (2018+). Assume no vendor API breaking changes.
7. **Desktop packager (WS7)** is production-ready for Windows. PITR/WAL live verification needed before claiming full disaster-recovery parity.
8. **Zoho Books sync** requires live OAuth credentials. Sync state machine not yet battle-tested against production API; deferred to live-hardening (v2.2).

---

## Success Criteria for v2.1.0 Closure

**RESOLVED:**
- [x] Migration 036 VARCHAR(32) blocker resolved (auto-widening in env.py + .env fallback)
- [x] feat/regulated & feat/zoho-books merged (041 collision fixed via linear relink)
- [x] feat/polish merged (dark mode + a11y modes shipped)
- [x] 3 compliance orphan tables resolved (substance_reference_data, part_composition_declarations)
- [x] ALLOWED_HOSTS/testserver misconfig fixed (unblocked ~412 tests)
- [x] Alembic .env fallback implemented (POSTGRES_USER/PASSWORD/SERVER support)

**PENDING FOR v2.2 / v2.1.1:**
- [ ] Full test suite RE-BASELINE after ALLOWED_HOSTS fix (measure true pass/fail of 412 unblocked tests)
- [ ] PITR/WAL end-to-end live verification in packaged desktop environment
- [ ] Full backup → restore cycle tested against 100GB+ live database
- [ ] Postgres local test runner configured (docker-compose.test.yml for dev)
- [ ] E2E test suite populated (minimum 10 critical workflows)
- [ ] Desktop installer code-signing certificate (Authenticode signature)
- [ ] Zoho Books proactive rate-limiting (token-bucket + exponential backoff)
- [ ] Comprehensive UI autosave for all unsaved edits
- [ ] Independent WCAG 2.1 AA accessibility audit
- [ ] Push/finalize to BBF-BOM production

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

**Last Updated:** 2026-07-19 (v2.1.0 release)  
**Maintained By:** Backend Team  
**Next Review:** 2026-08-16  
**Changes in v2.1.0:**
- All three feature branches merged (regulated, zoho-books, polish)
- Alembic VARCHAR(32) blocker fixed + .env fallback implemented
- 3 compliance orphan tables resolved
- ALLOWED_HOSTS/testserver misconfig fixed (412 tests unblocked)
- Migration collision resolved via linear relink
- Fresh Postgres installs now verified (155 tables)
- Desktop packaging (WS7) shipped; PITR/WAL live verification pending
- Identified 5 new OPEN items (test RE-BASELINE, PITR verification, code-signing, autosave, rate-limiting)
- Added "Manufacturing-BOM Workbook Field-Parity Backlog" (7 items, v2.5 target) from a customer xlsx gap analysis — tracking only, no code changes
