# Blackbox BOM — PROJECT REFERENCE (read this first)

> **Purpose:** the single source of truth for this project. Read this before scanning code or asking for context — it captures architecture, layout, features, DB, deployment, repos, and current state. **Keep it current:** update the relevant section (and the snapshot below) in the *same* change that alters the code. The deep-dive docs (CHANGELOG, ARCHITECTURE, FEATURE_CATALOG, MODULE_REFERENCE, SYSTEM_WORKFLOW, TESTING_AND_VALIDATION, OPEN_ITEMS, RELEASE_NOTES) go deeper; this is the primer that links them.

## 0. Snapshot
- **Version:** 2.1.0
- **Last updated:** 2026-08-09
- **Alembic head:** `056_cad_connections` (single, linear · 56 migrations) · fresh install builds **166 tables**
- **Test status:** backend suite now collects **868 tests** (verified this pass via `pytest --collect-only`, up from 648 — the jump is the export/import/xBOM/effectivity/UOM/requirements/CAD-connector work below). Full-suite pass/fail was **not re-run in this doc pass** (out of scope for a doc-only change); the fast SQLite track and the Postgres CI gate are both still the way to get a live number — see §9. Frontend: **182/182 vitest** across 86 files (unchanged, measured 2026-08-02; not re-verified in this pass — no frontend work shipped in this batch).
- **State:** feature-complete + published; remaining work is packaging/ops handoffs (see §12)

## 1. What it is
Blackbox BOM is a **local-first, on-prem enterprise BOM/PLM platform** (OpenBOM-competitor). Local-first = it runs fully in-house on the customer's machine/network with its own Postgres; cloud/internet is optional (only for update checks + optional integrations), never required to run.

## 2. Repos & attribution
| Repo | URL | Role | Authored as | AI co-author trailer |
|---|---|---|---|---|
| **blackbox** | github.com/Sumanth-Raj14/blackbox | work log (current `origin`) | Pavan (Blackbox Factories) + an AI `Co-Authored-By` trailer | yes |
| **BBF-BOM** | github.com/Sumanth-Raj14/BBF-BOM | **your published repo** | Sumanth-Raj-BBF `<sumanthraj@blackboxfactories.com>` | **no** |

Both hold **identical content**. BBF-BOM is produced by cloning blackbox's `master`, re-authoring every commit to you and stripping the AI co-author trailers (in an isolated clone `C:\Users\tsuma\Downloads\bbf-final.git`), then force-pushing. To make a GitHub contributor graph attribute commits to your profile, add+verify `sumanthraj@blackboxfactories.com` in GitHub → Settings → Emails.

## 3. Tech stack
- **Backend:** Python (FastAPI) + async SQLAlchemy 2.0 + PostgreSQL + Alembic. Auth: RS256 JWT + RBAC. Async (asyncpg). **603** API routes under `/api/v1`.
- **Frontend:** React + Vite (build → `frontend/dist`).
- **DB:** PostgreSQL 16 (bundled/portable for desktop) / 18 (dev machine). Multi-tenant.
- **Packaging:** PyInstaller (backend + launcher) + Inno Setup installer + portable Postgres (Windows desktop bundle).

## 4. Repo layout & entry points
```
backend/
  app/main.py                 # FastAPI app + lifespan; serves SPA when SERVE_FRONTEND/dist present
  app/api/api_v1.py           # router aggregation
  app/api/endpoints/*.py      # 79 endpoint modules (603 routes)
  app/models/*.py             # 79 model modules / ~163 mapped classes (Base + TenantAwareMixin)
  app/services/*.py           # 24 business-logic services
  app/core/                   # config.py (settings), deps.py, security, tenant_events.py (tenant isolation), backup.py
  app/db/                     # session.py (async engine incl. resolve_database_url() — TEST_DATABASE_URL > DATABASE_URL > settings.DATABASE_URI, see §9), base.py (Base + model registry)
  alembic/                    # env.py + versions/*.py (56 migrations, head 056_cad_connections); alembic.ini
  scripts/                    # init_db.py (schema bootstrap), db_backup.py, pitr_restore.py, restore_wizard.py, startup_health_check.py, _db_guard.py (refuses to seed a DB that doesn't look like test/e2e/scratch/sweep — see §9)
  app/tests/                  # pytest (SQLite via create_all)
  docker-compose.yml, Dockerfile(.prod), .env (gitignored — real secrets)
frontend/
  src/root/*.jsx              # SHIM layer: register components on window.* (dashboard, mobile-scanner, overlays, bom-editor, tweaks-panel, ...)
  src/components/**           # LIVE owners: screens/ (incl. MembersScreen.jsx), modals/, cad/CadViewer.jsx, ui/ (primitives), LazyScreens.jsx (registry), NavRail.jsx
  src/services/*.js           # ES-module replacements for retired window globals (navigation.js, poDraft.js, screenDataBridge.js, dataService.js)
  src/screens/App.jsx         # routes; src/context/AppCtx.jsx (state); src/utils/storage.js; src/hooks/useAutosave.js; styles.css (design tokens)
  e2e/                        # Playwright specs: smoke.spec.js, real-flows.spec.js, auth.setup.js (run manually — no CI job)
desktop/                      # WS7 Windows packaging (see §8)
docs/                         # design specs, runbooks, data dictionary, API reference
solidworks-plugin/            # SolidWorks add-in (C#) + CI + build checklist
install.ps1 / install.bat / Makefile / docker-compose.yml   # deploy entry points
```
**Frontend shim rule:** `src/root/*.jsx` files register components on `window.*`; the real implementations live in `src/components/**` and are wired via `LazyScreens.jsx`. Edit the live owner, not the shim.

## 5. Feature catalog (status)
**Shipped (v2.1.0):** canonical BOM + editor (instance lines, closure-table explosion/where-used), Parts/Items catalog, Procurement (POs `po_headers`, vendors, RFQs, receiving), Inventory/Warehouse, ECO/change management + approvals, Quality (CAPA, deviation, FAI), **FDA 21 CFR Part 11 e-signatures**, **RoHS/REACH substance compliance**, **Zoho Books two-way sync** (OAuth, outbound parts/vendors/POs, inbound poll + conflict engine, lifecycle cascade-clean, rate-limit token-bucket), ClickUp/Cliq integration + test-connection, Documents, Projects/Work-orders/Teams, **RBAC (5 roles: Admin/Engineering/Procurement/Finance/Viewer) + per-persona dashboards**, audit trail, **WCAG-AA dark mode + high-contrast + colorblind a11y**, autosave (Part + BOM editors), backup/retention/PITR, **desktop single-click packaging + auto-updater**.
**Added since v2.1.0 (on `master`, unreleased):**
- **Members & Privileges screen** (`frontend/src/components/screens/MembersScreen.jsx`, route `/members`, nav entry in `NavRail.jsx`) — role assignment and enable/disable over the RBAC API, which had existed backend-only with no UI.
- **Real 3D CAD viewer** (`frontend/src/components/cad/CadViewer.jsx`) — STEP/STP/IGES/IGS tessellated in-browser by `occt-import-js` (WASM OpenCascade); STL/OBJ/GLTF/GLB/PLY/3MF loaded by `three`. Proprietary native CAD (`.sldprt`, `.sldasm`, `.ipt`, `.iam`, `.prt`, `.catpart`) is explicitly **not** supported and says so.
- **Document download endpoint** `GET /api/v1/documents/{id}/download` — the vault could list and accept uploads but nothing could ever read the bytes back. Serves S3-backed and local files, with a `realpath`-containment guard so a tampered `filePath` row cannot escape the upload root.
- **Honest CAD import modal** — `CADImportModal.jsx` no longer runs a fake progress bar and hardcoded parts list; it states the SolidWorks add-in is required.
- **No demo-data fallback in `AppCtx`** — `rows` now defaults to `[]` instead of the bundled demo BOM, so screens show real data or an honest empty state (`[]` is truthy, which also neutralises the downstream `ctx?.rows || BOM_DATA.rows` fallbacks).
- **`backend/scripts/seed_e2e_fixture.py`** — multi-level BOM fixture for end-to-end runs (`--clean` removes it).
- **All FK columns indexed** — migration `048_index_foreign_keys` creates indexes on the 30 FK columns that had none; 0 FK columns remain without index coverage.

**Added since v2.1.0, this pass (2026-08-09):**
- **Configurable export** — `POST /api/v1/export` (`app/api/endpoints/export_report.py`): csv/xlsx/pdf/json, column selection + order, filters, currency, and BOM indented-vs-flat output with roll-up and reference-designator grouping. `GET /export/columns` lists exportable columns; `/export/templates` is GET/POST/DELETE (saved column-set + filter presets, migration `051_export_templates`; **no PUT** — edit via delete+recreate today).
- **Real CSV/XLSX import** — three-step flow in `app/api/endpoints/bulk_import.py`: `POST /import/upload` (stages the file) → `POST /import/{job}/mapping` (validate-only, no writes) → `POST /import/{job}/commit` (creates the real records). Also `/import/{job}/process`, `/import/jobs`, `/import/{job}/status`, `/import/{job}/errors`, `/import/all/status`.
- **xBOM** — `boms.bom_type` (EBOM/MBOM/SBOM, migration `052_bom_types`); MBOM routes (`app/api/endpoints/mbom_api.py`: headers, items, operations CRUD) and `POST /mbom/derive` (EBOM→MBOM derivation).
- **Effectivity on BOM lines** — date/serial/lot columns on BOM items (migration `053_bom_effectivity`) + `GET /bom-items/resolved?asOfDate=&asOfSerial=` to resolve the applicable line set as of a point in time/serial.
- **Multi-UOM + conversion** — migration `054_uom_conversion`; `app/api/endpoints/uom_api.py`: `GET /uom/units`, `GET /uom/convert`, `POST /uom/rollup-quantities`.
- **Requirements management** — migration `055_requirements`; `app/api/endpoints/requirements_api.py`: requirement CRUD, `GET /requirements/coverage`, `GET /requirements/by-part/{part_id}`, and linking tables to parts (`/{id}/parts`) and BOMs (`/{id}/boms`) for traceability/coverage reporting.
- **CAD connector framework** — `boms`/tenant-scoped `cad_connections` table (migration `056_cad_connections`), `app/api/endpoints/cad_connectors.py` (types, CRUD, test-connection, list documents, import). Credentials are Fernet-encrypted at rest per-tenant (`app/models/cad_connection.py`, reusing the same `app/core/encryption` mechanism as the existing ERP connector — no new crypto). Vendors: **Onshape** and **Fusion (Autodesk APS)** are implemented and covered by tests, but those tests use `httpx.MockTransport` (mocked HTTP, no live vendor account) — **not live-verified**; exercising them for real needs Onshape API keys / an Autodesk APS app registration. **Altium** has two paths: the cloud (Altium 365) API path is likewise mocked-HTTP only, but `POST /cad-connectors/altium/import-file` (direct BOM CSV/XLSX file upload, no Altium 365 account) is tested against real DB writes end-to-end and works today with zero external credentials.
- **Configurable rate limits** — `RATE_LIMIT_USER_PER_MINUTE` (default 1200) / `RATE_LIMIT_API_KEY_PER_MINUTE` (default 600) in `app/core/config.py`, read by `app/core/deps.py`. Previously hardcoded.
- **DB safety rail** — `app/db/session.py` `resolve_database_url()` now honors `TEST_DATABASE_URL > DATABASE_URL > settings.DATABASE_URI` (previously silently fell through to live Postgres, which caused a real incident: a test/reset script hit `bom_db`). `backend/scripts/_db_guard.py` adds `require_non_production_db()` — any fixture/seed/credential-reset script must call it before touching the DB; it allows sqlite and any Postgres DB name carrying a whole-token `test`/`e2e`/`scratch`/`sweep` marker, else raises (with an explicit `ALLOW_SEED_ON_LIVE_DB` opt-out escape hatch).

**Prepared, needs external creds/hardware:** SolidWorks in-CAD add-in (needs a SolidWorks machine); ClickUp/Cliq (needs live tokens); Zoho Books (needs OAuth creds + sandbox to tune rate-limit); Onshape/Fusion/Altium-365 CAD connectors (need Onshape API keys / an Autodesk APS app / Altium 365 credentials respectively — the Altium **file-upload** path is the one exception that needs none of that, see above).

## 6. Database
- **Multi-tenancy:** primary = app-layer (`app/core/tenant_events.py` auto-filters SELECT, guards UPDATE/DELETE, auto-populates `tenantId` on INSERT). Opt-in Postgres RLS (`ENABLE_RLS`, default off) is defense-in-depth (migration 040).
- **Schema owner / bootstrap:** `backend/scripts/init_db.py` — greenfield DB → `Base.metadata.create_all()` + `alembic stamp head`; existing DB → `alembic upgrade head`. Wired into the deploy path (Makefile, docker-entrypoint.sh, INSTALL, runbook). **This exists because the historical migration chain can't build from base** (migration 004 references `po_headers`, a `create_all`-era table not formalized until 022).
- **Migrations:** 56 files in `backend/alembic/versions`; single linear head `056_cad_connections` (chain: 040→041_compliance→041_part11→042_substance→043_composition→044_evaluations→041_zoho→045→046→047→048→049→050→051_export_templates→052_bom_types→053_bom_effectivity→054_uom_conversion→055_requirements→056_cad_connections; the two `041_*` files thread linearly — not a multi-head split). `alembic/env.py` reads `DATABASE_URL` else falls back to `settings.DATABASE_URI`, and widens `alembic_version.version_num` to VARCHAR(255) on Postgres.
- **Dev DB:** native Postgres 18 `bom_db` (owner `bom_user`), at head, on `127.0.0.1:5432`. `bom_user` password = the 24-char `POSTGRES_PASSWORD` in `backend/.env`; superuser `postgres` password = `admin` (dev machine only).
- **Three Postgres-only bugs fixed this cycle** (invisible to SQLite tests): (1) `version_num` VARCHAR(32) truncation at migration 036; (2) env.py ignoring `.env`; (3) `CheckConstraint` raw-SQL camelCase columns unquoted (Postgres folds to lowercase) — fixed in capa/contract/deviation/document models.

## 7. Backup / durability
- `scripts/db_backup.py` — pg_dump, 30-backup retention (builds libpq URL from `POSTGRES_*`, locates pg_dump).
- WAL archiving + PITR: `app/core/backup.py` (`restore_physical_backup`), `scripts/pitr_restore.py` — `restore_command` is platform-aware (`copy /Y` on Windows, `cp` on Linux). `desktop/postgresql.conf.template` + `desktop/DURABILITY.md`.
- **Committed data survives power loss** (Postgres ACID/WAL). Full PITR replay-to-timestamp is validated in the packaged env (bundled cluster with `archive_mode=on`).

## 8. Desktop packaging & auto-update (`desktop/`)
- `launcher.py` (+ `launcher.exe`, built) — inits/starts the bundled Postgres cluster, runs `init_db`, launches uvicorn, opens the browser, single-instance lock, crash-safe shutdown. Runs the bundled `backend.exe` when present, else the dev python path.
- `updater.py` (+ 31 tests) — local-first auto-updater: checks a version feed → downloads → **SHA-256 verify** → applies via silent installer → **preserves data + .env** → auto-migrates on next launch.
- `backend.spec`/`backend_entry.py` (+ `backend.exe`, built) — PyInstaller backend bundle; `app.main` serves the built frontend (guarded, off by default).
- `installer.iss` (Inno Setup) + `fetch_postgres.ps1` (portable Postgres) + `build.py` (one-command pipeline: frontend → PyInstaller → Postgres → assemble → iscc → optional sign → feed.json).
- **Install layout:** `%ProgramFiles%\BlackboxBOM` (binaries) + `%ProgramData%\BlackboxBOM` (pgdata, .env, backups, wal_archive — persists across updates).
- **To build the installer:** on a Windows box, install Inno Setup 6, then `python desktop/build.py --skip-frontend` → `desktop/dist/BlackboxBOM-Setup-2.1.0.exe`. Unsigned unless a code-signing cert is set (`CODE_SIGN_PFX`). Full steps: `desktop/DESKTOP_PACKAGING.md`.

## 9. Testing
- **Postgres CI is the authoritative gate and is a HARD GATE that passes green:** `.github/workflows/postgres-ci.yml` runs (a) a fresh `init_db` bootstrap on a real Postgres 16 service, asserting the stamped revision equals `EXPECTED_HEAD` (now `056_cad_connections`, bumped for this pass), and (b) the **full pytest suite against real PG16** (session-scoped asyncio loops via `-o`, required for asyncpg). A red here blocks merge. The suite currently collects **868 tests** (verified via `pytest --collect-only` this pass); the last *recorded* green PG result (634 passed / 0 failed / 1 skipped / 1 xfailed) predates the tests added since and has not been re-run — read the latest CI run for the live number. Uses inline throwaway CI creds (a disposable `bom_test_db`); **no repo secret required**.
- **DB URL resolution / seed safety:** `app/db/session.resolve_database_url()` picks `TEST_DATABASE_URL` over `DATABASE_URL` over `settings.DATABASE_URI`, in that order — fixed after an incident (2026-08-09) where a fixture/reset script ignored `TEST_DATABASE_URL` and hit the live `bom_db`. Any script that seeds fixtures or resets credentials must call `scripts/_db_guard.py`'s `require_non_production_db()` first, which raises unless the resolved URL is sqlite or a Postgres DB name carrying a `test`/`e2e`/`scratch`/`sweep` token. **Never point `TEST_DATABASE_URL` at the live `bom_db`; always use a scratch/e2e-named database and delete it after.**
  - The 1 skip = `test_migration_up_down_cycle` (needs a live localhost PG). The 1 xfail = `test_migration_offline_sql` (offline `--sql` generation is unsupported by design — several migrations call runtime `inspect()` for conditional DDL; `init_db` is the supported bootstrap).
- SQLite (`TEST_DATABASE_URL=sqlite+aiosqlite:///...`, `create_all`) is the **fast local/dev track** — same tests, function-scoped loops, no Postgres service needed. Postgres-only behavior (FK/NOT-NULL enforcement, identity sequences, full-text search, `::jsonb`, `RETURNING`, NUMERIC precision) only truly executes on the PG gate above.
- **Frontend unit tests:** `cd frontend; npx vitest run` — **182 passed / 182** across 86 files (measured 2026-08-02).
- **End-to-end (Playwright):** `frontend/e2e/` holds `smoke.spec.js`, `real-flows.spec.js` (auth reachability, anonymous rejection, wrong-password rejection, real login, per-screen crash checks) and `auth.setup.js`. `backend/scripts/seed_e2e_fixture.py` seeds a multi-level BOM to run them against. **These are run manually — there is no Playwright job in `.github/workflows/` on `master`**; the CI wiring and the `write-flows.spec.js` suite live on the unmerged branch `test/e2e-ci-and-write-flows`.
- `app/core/config.py` `_is_weak_secret` **hard-rejects any SECRET_KEY containing a `_WEAK_SECRET_VALUES` substring** ("secret","test","admin",…, stripping `-_!`) regardless of entropy — so CI/test secret *values* must avoid those substrings (the CI jobs use "suite"/"track", not "test"). A violation makes conftest fail to import → pytest exits 4 (looks like a usage error, not a test failure).

## 10. How to build & run
- **Dev backend:** `cd backend; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000` (uses `.env`→bom_db). Add `SERVE_FRONTEND=1 FRONTEND_DIST_DIR=../frontend/dist` to serve the built UI from the same process.
- **Dev frontend:** `cd frontend; npm run dev` (or `npm run build` → dist).
- **Schema:** `cd backend; python -m scripts.init_db`.
- **Backups:** `cd backend; python -m scripts.db_backup`.
- **Installer:** see §8.
- **Docker:** root `docker-compose.yml` (SKIP_CREATE_ALL=true; init_db owns schema).

## 11. Environment gotchas (this workspace)
- Windows + PowerShell primary; Bash also available. **RTK hook mangles bash `grep`/`head`/`tail`** — use the Grep/Read tools or Python. **`Remove-Item` is hook-blocked** — use `git clean` / `[System.IO.File]::Delete`. **`-ExecutionPolicy Bypass` and force-push to published repos are auto-mode-blocked** — the user runs/approves those.

## 12. Open items / what's on the user's side
- **BBF-BOM = primary going forward** (this repo's `origin` being pointed at BBF-BOM; git identity = Sumanth; no AI co-author trailers).
- **Enable branch protection** requiring the `Test Suite on Postgres` check (and `Fresh Install on Postgres`) before merge to `master` — the workflow is already a hard gate (fails the run); a GitHub branch-protection rule makes it *block* the merge button. User-only (GitHub Settings).
- **Build the signed/unsigned installer** on a Windows box (§8).
- **Live integration creds:** Zoho OAuth, ClickUp/Cliq tokens, SolidWorks machine.
- **Optional:** code-signing cert; extend autosave to more screens; full PITR replay test in the packaged app.

## 13. Deep-dive docs (kept in sync)
`CHANGELOG.md` · `RELEASE_NOTES.md` · `ARCHITECTURE.md` · `FEATURE_CATALOG.md` · `MODULE_REFERENCE.md` · `SYSTEM_WORKFLOW.md` · `TESTING_AND_VALIDATION.md` · `OPEN_ITEMS.md` · `TEST_FAILURES_TRIAGE.md` · `desktop/DESKTOP_PACKAGING.md` · `desktop/DURABILITY.md` · `DISASTER_RECOVERY_RUNBOOK.md`
