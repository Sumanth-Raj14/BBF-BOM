# Fix Coverage — Full-Repo Scan (2026-08-02)

Ledger for every one of the 74 findings in FINDINGS_FULL_SCAN.md: fixed (with commit) or deferred (with reason).

**43 fixed · 31 deferred.** Fix commits on branch `wip/gap-closing-2026-08-02`:
`c6d4565` backend security/infra/schema/CI · `dbcab0d` frontend live-fabrication · `12f0736` doc mismatches · `d351863` API-key security + BOM integrity + valuation.

## CRITICAL — 5 fixed / 5 total

| Status | Finding | Location | Note |
|---|---|---|---|
| ✅ dbcab0d | printPO() prints a PO line labeled 'Tax (GST 18%)' but the actual tax amount is computed a | `frontend/src/root/final-polish.jsx:961` |  |
| ✅ dbcab0d | ApprovalsScreen (/approvals) always appends 5 hardcoded fake approval requests alongside a | `frontend/src/root/final-polish.jsx:25` |  |
| ✅ c6d4565 | .dockerignore does not exclude rsa_keys/ or .secret_key, so Dockerfile's COPY . . bakes th | `backend/.dockerignore:1` |  |
| ✅ c6d4565 | Compliance standard CRUD (list/get/update/delete) and part-compliance/certify lookups use  | `backend/app/api/endpoints/compliance_api.py:102` |  |
| ✅ c6d4565 | bulk_delete_parts has zero tenant scoping and bypasses both of the app's tenant-isolation  | `backend/app/services/part_service.py:122` |  |

## HIGH — 21 fixed / 24 total

| Status | Finding | Location | Note |
|---|---|---|---|
| ✅ c6d4565 | deploy-staging/deploy-production jobs run `docker compose ... api`, but no compose file in | `.github/workflows/ci.yml:283` |  |
| ✅ c6d4565 | build-and-push job builds context `.` (repo root) with no Dockerfile argument, but there i | `.github/workflows/ci.yml:254` |  |
| ✅ c6d4565 | test-backend job runs bare `alembic upgrade head` against a brand-new empty Postgres conta | `.github/workflows/ci.yml:96` |  |
| ✅ c6d4565 | Uses invalid PostgreSQL syntax `ADD CONSTRAINT IF NOT EXISTS`, which will raise a syntax e | `backend/alembic/versions/009_backup_and_schema_fixes.py:60` |  |
| ✅ c6d4565 | contextlib.suppress(Exception) around each op.alter_column inside one Alembic transaction: | `backend/alembic/versions/033_money_columns_numeric.py:80` |  |
| ✅ c6d4565 | RfqHeader.created_by is nullable=False but its FK uses ondelete="SET NULL", so deleting a  | `backend/app/models/supplier_portal.py:77` |  |
| ✅ c6d4565 | create_admin.py always crashes: it imports the AsyncSessionLocal placeholder (None) instea | `backend/app/scripts/create_admin.py:54` |  |
| ✅ c6d4565 | csproj EmbeddedResource references Resources\BlackboxBOM.ico, which does not exist anywher | `solidworks-plugin/BlackboxBOM.SolidWorks/BlackboxBOM.SolidWorks.csproj:95` |  |
| ✅ dbcab0d | Confirming a BOM 'Release' (described to the user as locking a revision, creating an immut | `frontend/src/components/ModalsHost.jsx:249` |  |
| ✅ dbcab0d | WorkOrdersScreen's persist() only updates local component state; 'Report build', 'Report d | `frontend/src/root/power-features.jsx:383` |  |
| ⏳ dead layer — not mounted in the live app; fix when wired | Auto-scrape modal always returns the same hardcoded STM32H743 part dataset as if it were f | `frontend/src/components/modals/AutoScrapeModal.jsx:65` | dead layer — not mounted in the live app; fix when wired |
| ⏳ dead layer — not mounted in the live app; fix when wired | Import RFQs modal shows 4 hardcoded fake quotes labeled as detected from the inbox, and 'I | `frontend/src/components/modals/ImportRFQsModal.jsx:27` | dead layer — not mounted in the live app; fix when wired |
| ⏳ dead layer — not mounted in the live app; fix when wired | Quote history modal shows a fixed hardcoded list of 8 quotes (dates, prices, stats) for ev | `frontend/src/components/modals/QuoteHistoryModal.jsx:14` | dead layer — not mounted in the live app; fix when wired |
| ✅ dbcab0d | comments and approvals state is permanently seeded with hardcoded fake demo data and never | `frontend/src/context/AppCtx.jsx:231` |  |
| ✅ dbcab0d | 'Forgot password' flow never calls any backend endpoint and always shows a fake 'reset lin | `frontend/src/root/auth-onboarding.jsx:72` |  |
| ✅ dbcab0d | printPO() bakes fabricated fallback values (unit cost $12, vendor name 'Mean Well', a hard | `frontend/src/root/final-polish.jsx:826` |  |
| ✅ dbcab0d | NCRScreen (/ncr) seeds state with 4 hardcoded fake Non-Conformance Reports and every 'crea | `frontend/src/root/power-features.jsx:720` |  |
| ✅ dbcab0d | BOM ribbon/tabs show hardcoded fake stats (row counts, lead-time delta, risk flags, approv | `frontend/src/screens/BomEditorScreen.jsx:264` |  |
| ✅ c6d4565 | The blocking 'Test Backend' CI job runs the legacy, superseded 5-file backend/tests/ suite | `.github/workflows/ci.yml:111` |  |
| ✅ d351863 | apply_template creates BOMItem rows without the BomClosure self-row every other creation p | `backend/app/services/bom_service.py:2076` |  |
| ✅ c6d4565 | GET /api/v1/health/detailed requires no authentication and leaks internal business/system  | `backend/app/api/api_v1.py:373` |  |
| ✅ c6d4565 | Bulk BOM-item delete uses a Core-style delete() statement filtered only by id, bypassing t | `backend/app/api/endpoints/bom_items.py:166` |  |
| ✅ c6d4565 | Systemic tenant-isolation bypass across raw-SQL (text()) endpoint modules: routing/process | `backend/app/api/endpoints/routing_api.py:61` |  |
| ✅ dbcab0d | All three SSO buttons (Google/Microsoft/SAML) fabricate the same hardcoded admin identity  | `frontend/src/root/auth-onboarding.jsx:87` |  |

## MEDIUM — 10 fixed / 23 total

| Status | Finding | Location | Note |
|---|---|---|---|
| ⏳ lower-priority tail — see notes | The module's own documented usage `--backup-id=5` never matches the argv parser, which onl | `backend/scripts/restore_wizard.py:385` | lower-priority tail — see notes |
| ⏳ dead layer — not mounted in the live app; fix when wired | 'Compare Revisions' screen always diffs hardcoded BOM ids 1 and 2 via the real API, never  | `frontend/src/components/screens/DiffScreen.jsx:11` | dead layer — not mounted in the live app; fix when wired |
| ✅ dbcab0d | APIKeysModal's 'Copy' buttons (for the newly generated key and for a key's prefix) show a  | `frontend/src/root/modals-extra.jsx:538` |  |
| ⏳ dead layer — not mounted in the live app; fix when wired | PO line-item row click/render calls .slice()/.length directly on item.itemName with no nul | `frontend/src/components/screens/ProcurementScreen.jsx:526` | dead layer — not mounted in the live app; fix when wired |
| ✅ c6d4565 | .dockerignore excludes only the literal test.db, not the 15+ test_*.db files present in th | `backend/.dockerignore:8` |  |
| ⏳ lower-priority tail — see notes | app/schemas/document.py is never imported anywhere in the codebase and its DocumentBase re | `backend/app/schemas/document.py:7` | lower-priority tail — see notes |
| ⏳ dead layer — not mounted in the live app; fix when wired | Unused duplicate of convertApiPartsToTree with a regressed single-argument signature that  | `frontend/src/utils/bom.ts:65` | dead layer — not mounted in the live app; fix when wired |
| ⏳ lower-priority tail — see notes | MonitorAssemblyEvents/MonitorFeatureEvents (the only hooks for real component add/remove a | `solidworks-plugin/BlackboxBOM.SolidWorks/EventWatcher.cs:103` | lower-priority tail — see notes |
| ✅ 12f0736 | MODULE_REFERENCE.md's Known Limitations section presents the Alembic VARCHAR(32) and .env- | `MODULE_REFERENCE.md:1361` |  |
| ✅ 12f0736 | README.md instructs `docker compose -f docker-compose.prod.yml up -d`, but no docker-compo | `README.md:101` |  |
| ✅ 12f0736 | RELEASE_NOTES.md claims docker/postgres/init.sql runs an ALTER TABLE to widen alembic_vers | `RELEASE_NOTES.md:297` |  |
| ✅ d351863 | get_stock_valuation multiplies on-hand quantity by a hardcoded 1.0 instead of unit cost, s | `backend/app/api/endpoints/inventory_api.py:332` |  |
| ✅ d351863 | import_bom never fetches or parses file_url -- it creates an empty draft BOM and unconditi | `backend/app/services/bom_service.py:1974` |  |
| ⏳ dead layer — not mounted in the live app; fix when wired | Workspace Settings modal (members, roles table, integrations, billing) is built entirely f | `frontend/src/components/modals/SettingsModal.jsx:325` | dead layer — not mounted in the live app; fix when wired |
| ⏳ dead layer — not mounted in the live app; fix when wired | The 'PDF report' export downloads a plain-text string (whose own copy says '(mock PDF)') l | `frontend/src/components/screens/AnalyticsScreen.jsx:341` | dead layer — not mounted in the live app; fix when wired |
| ✅ dbcab0d | MobileScanView (reachable from the account popover's unconditional 'Open mobile scan view' | `frontend/src/root/auth-onboarding.jsx:724` |  |
| ✅ dbcab0d | WorkOrdersScreen silently substitutes 5 hardcoded fake work orders whenever the real list  | `frontend/src/root/power-features.jsx:310` |  |
| ⏳ lower-priority tail — see notes | AuditLogMiddleware records request.client.host directly instead of the proxy-aware get_cli | `backend/app/core/audit_middleware.py:92` | lower-priority tail — see notes |
| ⏳ lower-priority tail — see notes | Contract.contractType's inline comment documents display values that don't match its own C | `backend/app/models/contract.py:33` | lower-priority tail — see notes |
| ⏳ lower-priority tail — see notes | Nav-rail group label text (.bbf-nav-header) is colored with --bbf-olive (2.06:1 on white), | `frontend/styles.css:4756` | lower-priority tail — see notes |
| ✅ c6d4565 | create_ecr/create_ecn skip the require_engineering gate applied to every other ECO mutatio | `backend/app/api/endpoints/eco_api.py:322` |  |
| ⏳ lower-priority tail — see notes | Redis-backed per-user/per-API-key rate limiter uses int(time.time()) as both the sorted-se | `backend/app/core/deps.py:40` | lower-priority tail — see notes |
| ⏳ lower-priority tail — see notes | A real-looking generated secret value is committed to source control and not covered by .g | `desktop/.secret_key:1` | lower-priority tail — see notes |

## LOW — 7 fixed / 22 total

| Status | Finding | Location | Note |
|---|---|---|---|
| ⏳ lower-priority tail — see notes | `--cleanup-only --dry-run` never calls cleanup_old_backups(), so it prints a static placeh | `backend/scripts/backup_cron.py:49` | lower-priority tail — see notes |
| ✅ dbcab0d | Revision increment only reads the first character of project.rev and blindly increments it | `frontend/src/components/ModalsHost.jsx:252` |  |
| ⏳ lower-priority tail — see notes | enqueue_job() and its registered handlers (bulk_import, email) have no caller anywhere in  | `backend/app/core/job_queue.py:36` | lower-priority tail — see notes |
| ⏳ lower-priority tail — see notes | auto_populate_tenant_id() is defined but never registered as an SQLAlchemy event listener  | `backend/app/core/tenant_events.py:108` | lower-priority tail — see notes |
| ⏳ lower-priority tail — see notes | ZohoBooksClient.list_records is defined twice with identical bodies; the first definition  | `backend/app/integrations/zoho_client.py:329` | lower-priority tail — see notes |
| ⏳ lower-priority tail — see notes | transfer_inventory executes the destination-warehouse existence check and the source-inven | `backend/app/services/inventory_service.py:214` | lower-priority tail — see notes |
| ⏳ lower-priority tail — see notes | Prometheus scrape config targets raw Postgres/Redis ports over HTTP for /metrics, which th | `docker/monitoring/prometheus.yml:21` | lower-priority tail — see notes |
| ✅ dbcab0d | optimistic() helper randomly fabricates a save failure 12% of the time 'for demo purposes' | `frontend/src/root/prod-additions.jsx:980` |  |
| ✅ 12f0736 | Cross-Reference table links to API.md, DATABASE.md, DEPLOYMENT.md, TESTING.md, OPERATIONS. | `MODULE_REFERENCE.md:1396` |  |
| ✅ 12f0736 | README.md's Quick Start and Documentation table reference `cd "BOM and PRD"` and `BOM and  | `README.md:31` |  |
| ⏳ lower-priority tail — see notes | revoke_all_sessions's docstring promises the current session is preserved ('except current | `backend/app/api/endpoints/sessions.py:113` | lower-priority tail — see notes |
| ⏳ lower-priority tail — see notes | Benchmark runs entirely against an in-memory SQLite engine but prints that it is inserting | `backend/scripts/benchmark_bom.py:64` | lower-priority tail — see notes |
| ⏳ dead layer — not mounted in the live app; fix when wired | Profile modal shows a hardcoded 'Elena Chen' profile and 'Save changes' only toasts succes | `frontend/src/components/modals/ProfileModal.jsx:25` | dead layer — not mounted in the live app; fix when wired |
| ⏳ dead layer — not mounted in the live app; fix when wired | Multiple analytics panels (vendor heat map, country-of-origin, parts health score, downloa | `frontend/src/components/screens/AnalyticsScreen.jsx:151` | dead layer — not mounted in the live app; fix when wired |
| ✅ c6d4565 | The legacy-suite CI job names its Postgres service database 'bom_db' instead of the 'bom_t | `.github/workflows/ci.yml:65` |  |
| ⏳ lower-priority tail — see notes | Backend app Dockerfile still uses a floating base image tag (python:3.12-slim), contradict | `backend/Dockerfile:2` | lower-priority tail — see notes |
| ⏳ lower-priority tail — see notes | MetricsMiddleware.EXCLUDED_PATHS lists bare paths ('/metrics', '/health/detailed') but the | `backend/app/monitoring/metrics.py:272` | lower-priority tail — see notes |
| ⏳ lower-priority tail — see notes | All dependencies use open-ended range specifiers with no lockfile or hash pinning, so pip  | `backend/requirements.txt:1` | lower-priority tail — see notes |
| ⏳ lower-priority tail — see notes | nginx's real Cache-Control header (max-age=3600) for `location /` overrides index.html's m | `frontend/nginx.conf:14` | lower-priority tail — see notes |
| ✅ c6d4565 | create_audit_log accepts a client-supplied userId with no verification, letting any authen | `backend/app/api/endpoints/audit_logs.py:79` |  |
| ⏳ lower-priority tail — see notes | ERP connector CRUD (including apiKey storage/rotation) requires only basic login, unlike c | `backend/app/api/endpoints/erp_connectors.py:19` | lower-priority tail — see notes |
| ✅ dbcab0d | Webhook 'secret' is generated client-side with Math.random(), a non-cryptographic PRNG, fo | `frontend/src/root/integration-screens.jsx:470` |  |

## Deferred — grouped

**Dead-layer fabrication (not reachable from `src/main.jsx`; fix when the file is wired into the app):** SourcingView, AutoScrapeModal, ImportRFQsModal, QuoteHistoryModal, SettingsModal, ProfileModal, and the DiffScreen/AnalyticsScreen/ProcurementScreen items under `components/screens` that the live router does not mount.

**Known follow-ups flagged during fixing (need a design decision or larger work):**
- `process_notification_queue` has no scheduler — ECO notification rows are created but never drained.
- Nothing creates `eco_approvals` rows — the notifications and the ECR approval UI read an empty table.
- `routing_api` list/get_process_plan *reads* are still tenant-unscoped (inserts were fixed).
- Low-severity dead code (unused schemas, duplicate functions, unregistered listeners) and remaining doc-polish items — enumerated in FINDINGS_FULL_SCAN.md, no correctness impact.
