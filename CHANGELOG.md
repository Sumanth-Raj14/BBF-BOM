# Changelog

All notable changes to the Blackbox BOM Management Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-07-19
**Regulated compliance, Zoho Books integration, polish a11y/mobile, WS7 desktop packaging + auto-update shipped.**

### Added
- **WS7 Desktop Packaging & Auto-Update**: Single-click Windows installer (via Inno Setup `installer.iss`) bundles portable Postgres + PyInstaller backend + built frontend. Launcher (`launcher.py`) handles init/start/crash-safe stop of bundled cluster, DB bootstrap, uvicorn, and browser launch. Updater (`updater.py`, 31 tests) performs local-first version-feed check → download → SHA-256 verify → silent installer apply, auto-migrates existing data, preserves `.env`. Build pipeline (`build.py`) with signing support.
- **DB Bootstrap Consolidation**: `scripts/init_db.py` is now the single schema owner — idempotent greenfield bootstrap (create_all + alembic stamp head) and existing DB upgrade (alembic upgrade head) in one invocation. Wired into deploy path (Makefile, docker-entrypoint.sh, compose, INSTALL, runbook). Fixes 3 Postgres-only bugs (env.py version_num VARCHAR + .env fallback; CheckConstraint camelCase quoting; 3 orphan compliance tables now modeled + migration 041_compliance).
- **Postgres Production Hardening**: Postgres-track CI workflow added; `db_backup.py` fixed (30-retention); fresh install via installer or `python -m scripts.init_db` now production-ready.
- **feat/regulated (MERGED)**: FDA 21 CFR Part 11 e-signatures + RoHS/REACH substance compliance — digital signatures on ECOs/approvals/uploads, compliance attestation, substance restriction database, audit trail enhancements (non-repudiation, signature verification, regulatory export).
- **feat/zoho-books (MERGED)**: Two-way Zoho Books sync — part master ↔ Zoho item mapping, vendor master ↔ Zoho contacts, PO line items → Zoho bills, cost changes → landing cost updates, async outbox worker, full audit log, sync UI + Zoho Books screen.
- **feat/polish (MERGED)**: WCAG-AA dark mode (true dark, not just `prefers-color-scheme`), high-contrast (AAA) + colorblind modes (deuteranopia/protanopia/tritanopia), mobile barcode scanner UI, advanced tweaks panel (density/theme/language/debug/cache), secrets management (`compose-secrets`), configurable WAL path.

### Fixed
- **Test Infrastructure**: ALLOWED_HOSTS now allows `testserver` under pytest (prod-safe) — unblocked ~412 of 414 previously-failing/erroring tests (single TrustedHostMiddleware misconfig, not 73 broken features).

### Changed
- Alembic migration head now: `041_zoho_books_sync_tables` (linear chain: 040 → 041_compliance → 041_part11 → 042_substance_ref → 043_part_composition → 044_compliance_evals → 041_zoho_books). Fresh install creates 155 tables.
- Version: product bumped to 2.1.0 from 2.0.0.

### Database Schema
- **Head**: 041_zoho_books_sync_tables
- **Table count**: 155 (fresh install)
- **All three feature branches** (regulated, zoho-books, polish) now reflected in schema

---

## [2.0.1-rc] - 2026-07-19
**Postgres Production Bring-Up: Schema Migration Complete, Alembic Bugs Identified**

### Technical Notes
- **Live Postgres deployment**: Schema successfully migrated from alembic revision 029 (`fix_column_mismatches`) through 040 (`postgres_rls_tenant_isolation`) on production PostgreSQL instance. Database now running on Postgres 18.4 with 135 tables, all RLS policies in place (opt-in, default off).

### Fixed
- **Alembic revision ID length**: Migration 036 (`role_permission_tenant_scoped`) has a 33-character revision ID, but Alembic's default `alembic_version.version_num` is VARCHAR(32), causing fresh Postgres installs to fail at that revision. Column widened to VARCHAR(64) post-deployment; permanent fix pending in `alembic/env.py`.

### Known Issues / Deployment Blockers

#### Issue #1: Alembic Authentication Falls Back to Hardcoded Empty Password
- **Location**: `backend/alembic/env.py:17-19`, `backend/alembic/alembic.ini:14`
- **Impact**: Migrations fail to authenticate unless `DATABASE_URL` env var is explicitly exported. On fresh Postgres installs, if `DATABASE_URL` is not set, `env.py` falls back to the hardcoded connection string in `alembic.ini` — `postgresql+asyncpg://bom_user:@localhost:5432/bom_db` (empty password, matches only local-dev). Deployment procedures must ensure `DATABASE_URL` is set with full credentials before running `alembic upgrade head`.
- **Workaround**: Export `DATABASE_URL` environment variable with correct auth before migration runs; OR update `alembic/env.py` to read `.env` directly (currently ignores app's `.env` file).

#### Issue #2: SQLite Test Suite Does Not Catch Postgres-Specific Defects
- **Location**: `backend/app/tests/conftest.py`, `backend/.github/workflows/ci.yml`
- **Impact**: All 72+ backend test files run on SQLite, not Postgres. Postgres-specific issues are not caught in CI:
  - VARCHAR length enforcement (e.g., migration 036 VARCHAR(32) → 33-char ID)
  - Row-Level Security behavior and policy interactions
  - Dialect-specific SQL syntax (e.g., PostgreSQL-only functions, operators)
  - Enum types and array columns
  - Composite foreign keys and complex constraints
- **Test Status**: ~73 pre-existing test failures documented as unrelated stubs (missing endpoint implementations, infrastructure dependencies). Full Postgres test suite not yet implemented.
- **Recommendation**: Implement PostgreSQL test database integration in CI pipeline (similar to existing `docker-compose.test.yml` structure); parallelize SQLite + Postgres test runs.

### Files Changed
- `backend/alembic/versions/040_postgres_rls_tenant_isolation.py` — Schema migrated, RLS enabled on all tenant tables
- (alembic_version column widening not yet committed; permanent fix in progress)

### Database Schema Status
- **Head Revision**: 040_postgres_rls_tenant_isolation (2026-07-18)
- **Applied Migrations**: 001 through 040 (40 total)
- **Tenant Isolation**: Opt-in Postgres RLS + app-layer filtering (defense-in-depth)
- **Previous Revision**: 039_bom_closure_table (closure table for fast multi-level BOM explosion/where-used)

---

## [2.0.0] - 2026-07-18
Enterprise transformation release — production-ready, OpenBOM-competitive, **local-first**.
Supersedes the untagged 1.x line.

### Added
- **Canonical BOM model**: tenant- and bom-scoped instance-line CRUD in `bom_items_master`; the BOM editor
  persists structural edits via `bomItemsAPI` (honest failure surfacing) instead of the global Part.
- **WS5 performance**: BOM adjacency **closure table** for fast multi-level explosion + where-used.
- Opt-in Postgres **Row-Level Security** (defense-in-depth; default off; SQLite-safe).
- Cliq + ClickUp one-way mirror + notifications (async outbox worker); status tagged to person/team.
- SolidWorks backend multi-level BOM ingest + plugin login (C# plugin build pending a CAD machine).
- **Design-system foundation**: CSS tokens, self-hosted Geist, two-tone WCAG-AA accent, 3-step density,
  collapsible labeled nav rail, `ScreenHeader` + content-width frame; token-only primitive library.
- **WS6 one-click local-first deployment**: `docker-compose.yml` (auto-migrate + seed), Windows
  `install.ps1`/`install.bat`, `backup-data`/`restore-data` transfer scripts, `INSTALL.md`, Makefile, Dockerfiles.
- Enterprise-grade PostgreSQL dump script with retention; root `CHANGELOG.md`.

### Changed
- **Full UI overhaul**: 18 main screens + 18 modals + 10 advanced screens + enterprise/admin monoliths swept
  onto the design system; accessibility pass (keyboard, ARIA, WCAG AA).
- Money columns `FLOAT` → `Numeric(18,4)`; BOM quantities `Integer` → `Numeric(10,4)`.
- Business keys (part/bom/PO/serial/ECO numbers) → composite `(tenantId, key)` uniqueness.
- **[CRITICAL]** Eradicated `localStorage` reliance for primary engineering data; `bom-editor.jsx` /
  `parts-screen.jsx` defer to `AppCtx.jsx` + FastAPI/PostgreSQL.
- Hardened persistence for deep hierarchical BOMs.

### Fixed
- BOM explosion scoped by `bom_id` + tenant with effective-quantity rollups (fixes cross-tenant leak + global-tree bug).
- Two BOM-editor crashes.
- ECO state-machine guards (no self-approval; illegal transitions blocked on action/approve/implement);
  work-order status CHECK reconciled (incl. on_hold/scrapped).

### Security
- Secure self-registration (bootstrap-first; cannot join an existing tenant).
- Honest failure semantics end-to-end (no success-masking of failed writes; honest ERP status).

### Removed
- Legacy `PurchaseOrder` model (canonical `POHeader`/`POLineItem`).
- `storage.bomRows/workOrders/comments/poDrafts` from `storage.js` (+ editor `.set()/.remove()` calls).

Database: single Alembic head `040_postgres_rls_tenant_isolation`.

---

## [v1.48.0] - 2026-07-06

### Added
- Comprehensive BBF Enterprise branding to replace generic SaaS UI.
- High-density manufacturing tables in detail drawers and main BOM grids.

### Changed
- `dashboard.jsx` stripped of oversized KPI marketing cards in favor of a dense, professional engineering layout.
- `BomEditorScreen.jsx` updated to reclaim vertical real-estate by removing the oversized ribbon.

### Fixed
- Fixed 38 backward-compatible `window.*` shims after module refactoring.

---

## Project Release Notes

The Blackbox BOM platform shipped v2.0.0 on 2026-07-18, marking the completion of a comprehensive enterprise transformation. The application is production-ready, runs entirely on-premises (local-first), and includes:

- **Canonical BOM editor** with instant persistence
- **Multi-tenant isolation** at both app and database layers (opt-in Postgres RLS)
- **Enterprise design system** with WCAG-AA accessibility
- **One-click local deployment** (Windows + Docker)
- **Integration ecosystem** (ClickUp, Cliq, SolidWorks, ERP)
- **Advanced manufacturing features** (closure tables, service BOMs, work orders, ECR, compliance, etc.)

### Pending Features (Not Yet Merged)
The following branches are feature-complete but await final review:
- **feat/regulated** — FDA 21 CFR Part 11 e-signatures + RoHS/REACH substance compliance
- **feat/zoho-books** — Two-way Zoho Books sync (parts/items, vendors/contacts, POs, cost)
- **feat/polish** — WCAG-AA dark mode + high-contrast/colorblind a11y modes, mobile-scanner tweaks

### Documentation
For full architecture, feature catalog, and testing guidance, see:
- `ARCHITECTURE.md` — System architecture, component tree, data flow, security layers
- `FEATURE_CATALOG.md` — All features organized by domain (BOM, Parts, Procurement, Manufacturing, etc.)
- `TESTING_AND_VALIDATION.md` — Test strategy, coverage, running instructions, CI/CD
- `INSTALL.md` — One-click deployment guide for Windows and Docker
- `frontend/CHANGELOG.md` — Detailed frontend commit history and UI transformations
