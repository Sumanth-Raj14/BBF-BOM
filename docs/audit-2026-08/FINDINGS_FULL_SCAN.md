# Full-Repo Line-by-Line Scan — Findings

**Date:** 2 August 2026  
**Scope:** every first-party source file under `bom tool v1/bom-tool/`, read in full. Excluded by instruction: `_archive/` and `reference ui/` (vendored third-party: babel, CDN React). Also excluded: `node_modules`, build/dist/release artifacts, lockfiles.  
**Method:** 13 parallel reader agents, one per directory scope, 513 files read line-by-line (~1,900 files considered). Each finding carries a concrete `file:line` and the failure it causes. Frontend findings are tagged **[LIVE]** if the file is reachable from `src/main.jsx`, or _[dead layer]_ if it is part of the in-progress migration and not yet mounted.

**Totals:** 74 findings — 5 critical, 24 high, 23 medium, 22 low.

> Severity was assigned by the (Sonnet) scan agents. The controller re-verifies critical/high before fixing; a few are reclassified in the notes (e.g. the SSO buttons are a dead button, not an auth bypass — the backend rejects the empty password).

---

## CRITICAL (5)

### C-01 · bug · `frontend/src/root/final-polish.jsx:961` **[LIVE]**

**printPO() prints a PO line labeled 'Tax (GST 18%)' but the actual tax amount is computed at 8%, so the printed total does not match its own stated rate**

- **Evidence:** line 827: `const tax = lineCost * 0.08;` computes 8%, but line 961 renders the label `__t("printPo.tax") || "Tax (GST 18%)"` next to `(tax * getInrRate())` — an 18%-labeled line showing an 8%-computed amount, on a document (`printPO`) meant to be printed/sent to a real vendor.
- **Fix:** Make the tax rate a single named constant used both for the computed value and the label (e.g. GST_RATE = 0.18), and derive `tax` from it.

### C-02 · fabrication · `frontend/src/root/final-polish.jsx:25` **[LIVE]**

**ApprovalsScreen (/approvals) always appends 5 hardcoded fake approval requests alongside any real ones; approving/rejecting them shows a success toast but only 'BOM Revision' kind actually mutates state**

- **Evidence:** approvalsList useMemo unconditionally does out.push({kind:'Purchase Order', target:'PO-2026-0491', requester:'K. Singh', date:'2026-05-25', value:174300}, ...4 more fake rows with fabricated names/dates/₹ amounts...). act(a,action) only updates ctx.approvals when a.kind==='BOM Revision'; for the other 4 fabricated kinds it just calls toast(`Approved · ${a.target}`) with no backing mutation. Route confirmed live at screens/App.jsx:492-495 via LazyScreens ApprovalsScreen -> root/final-polish.jsx.
- **Fix:** Load approvals entirely from a real endpoint (POs pending approval, vendor onboarding, part release, cost variance) or remove the hardcoded seed rows and show an honest empty state; only fire the success toast after a real mutation succeeds.

### C-03 · security · `backend/.dockerignore:1`

**.dockerignore does not exclude rsa_keys/ or .secret_key, so Dockerfile's COPY . . bakes the live JWT RSA private key and app secret key into the Docker image**

- **Evidence:** backend/Dockerfile:19 does `COPY . .`. backend/.dockerignore:1-17 only lists `__pycache__, *.pyc, *.pyo, .env, .git, .gitignore, *.md, test.db, bom.db, .DS_Store, .venv, venv, node_modules, dist, *.sqlite, backups/, uploads/*.gz` — no entry for `rsa_keys/` or `.secret_key`. Confirmed both exist on disk: backend/rsa_keys/private.pem (3.4K, the JWT signing key per SECURITY_ROTATION_NOTES.md:23 and app/core/security.py:_ensure_rsa_keys) and backend/.secret_key (54B). Anyone who obtains the built image (registry pull, `docker save`, CI artifact, compromised host) gets the private JWT signing key and app secret, enough to forge valid auth tokens.
- **Fix:** Add rsa_keys/, .secret_key, *.pem, *.log, *.pid to .dockerignore; mount keys at runtime via secret/volume instead of copying them into the build context.

### C-04 · security · `backend/app/api/endpoints/compliance_api.py:102`

**Compliance standard CRUD (list/get/update/delete) and part-compliance/certify lookups use raw text() SQL with no tenantId filter and no role check, despite the table having a tenantId column.**

- **Evidence:** update_compliance/delete_compliance (lines 102-165) run `SELECT/UPDATE/DELETE ... FROM compliance WHERE id = :id` with no tenantId predicate, behind only Depends(get_current_user). create_compliance (line 76) proves the column exists: `INSERT INTO compliance (name, description, "tenantId") VALUES (...)`. get_part_compliance/certify_part (lines 272-346) similarly do `SELECT id, pn, name FROM parts WHERE id = :pid` with no tenant check. Net effect: any authenticated user of any tenant can read, rename, or permanently delete another tenant's compliance standards, and view/certify another tenant's parts by ID.
- **Fix:** Bind current_user.tenantId and add AND tenantId = :tid to every query in this file; consider gating mutations behind require_admin/require_engineering.

### C-05 · security · `backend/app/services/part_service.py:122`

**bulk_delete_parts has zero tenant scoping and bypasses both of the app's tenant-isolation safety nets, letting any tenant delete another tenant's Parts by ID.**

- **Evidence:** async def bulk_delete_parts(db, part_ids): result = await db.execute(delete(Part).where(Part.id.in_(part_ids))); await db.commit(); return result.rowcount -- called from api/endpoints/parts.py:126-135 with req.ids taken directly from the request body, gated only by require_parts_delete (checks the permission, not the tenant of the target rows). This is a Core delete() statement: core/tenant_events.py's _register_select_filter only patches is_select ORM statements, and _register_update_delete_filter only inspects session.dirty/session.deleted (ORM-tracked loaded instances) on before_flush -- a Core bulk delete never populates either, so neither guard fires. Any user with parts:delete in tenant A can pass tenant B's (small, sequential, guessable) part IDs and permanently delete them. Contrast with zoho_inbound.py's cascade_clean, which explicitly filters its Core delete() by tenantId == tenant_id.

---

## HIGH (24)

### H-01 · bug · `.github/workflows/ci.yml:283`

**deploy-staging/deploy-production jobs run `docker compose ... api`, but no compose file in the repo defines a service named `api` (it's `backend` everywhere).**

- **Evidence:** ci.yml:285-288 runs `docker compose pull api && docker compose up -d --no-deps api && docker compose exec api alembic upgrade head`. docker-compose.yml:54 names the service `backend`; Makefile:59 uses `docker compose exec backend python -m scripts.init_db`. There is no `api` service anywhere in the repo. Independently confirmed as a known unfixed gap by RECOMMENDED_MAJOR_IMPROVEMENTS.md:504,520 ("align the deploy job's compose service name to `backend`"). Both staging and production deploy steps fail with "no such service: api" if the remote host's compose file matches this repo's.
- **Fix:** Change `api` to `backend` in both deploy jobs (lines ~285-289 and ~315-317).

### H-02 · bug · `.github/workflows/ci.yml:254`

**build-and-push job builds context `.` (repo root) with no Dockerfile argument, but there is no Dockerfile at the repo root.**

- **Evidence:** ci.yml:254-260 `docker/build-push-action@v5` with `context: .` and no `file:` param. Verified: only `backend/Dockerfile` and `frontend/Dockerfile` exist; no `./Dockerfile`. This job runs on every push to main/develop (`if: github.event_name == 'push'`), so it fails deterministically. Also flagged in RECOMMENDED_MAJOR_IMPROVEMENTS.md:504 ("there is no Dockerfile at the repository root").
- **Fix:** Split into two build-push steps pointing at backend/Dockerfile and frontend/Dockerfile, or add file: explicitly.

### H-03 · bug · `.github/workflows/ci.yml:96`

**test-backend job runs bare `alembic upgrade head` against a brand-new empty Postgres container, which the project's own postgres-ci.yml documents as guaranteed to fail.**

- **Evidence:** ci.yml:96-97 `run: alembic upgrade head` against a fresh `postgres:15` service with no bootstrap. postgres-ci.yml:4-13 (header comment) states this exact pattern fails because "migrations 004+ reference tables (po_headers and ~73 others) that only ever existed via Base.metadata.create_all() and weren't formalized into migrations until revision 022" — which is why postgres-ci.yml uses `python -m scripts.init_db` instead. RECOMMENDED_MAJOR_IMPROVEMENTS.md:504 independently flags the same job as broken for the same reason.
- **Fix:** Replace the bare `alembic upgrade head` with `python -m scripts.init_db` as postgres-ci.yml does.

### H-04 · bug · `backend/alembic/versions/009_backup_and_schema_fixes.py:60`

**Uses invalid PostgreSQL syntax `ADD CONSTRAINT IF NOT EXISTS`, which will raise a syntax error and abort the whole migration transaction.**

- **Evidence:** op.execute("ALTER TABLE po_headers ADD CONSTRAINT IF NOT EXISTS fk_po_headers_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id)") -- Postgres supports ADD COLUMN IF NOT EXISTS and DROP CONSTRAINT IF EXISTS, but there is no IF NOT EXISTS clause for ADD CONSTRAINT. Running this against real Postgres raises a syntax error, aborting the entire 009 upgrade() transaction (backup_history table, its indexes, and the documents/parts column adds all roll back too). Later migrations (013, 016, 022) correctly use `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` for this exact idempotency need.
- **Fix:** Wrap in a DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$; block like migrations 013/016/022 do.

### H-05 · bug · `backend/alembic/versions/033_money_columns_numeric.py:80`

**contextlib.suppress(Exception) around each op.alter_column inside one Alembic transaction: the first failing column aborts the Postgres transaction, and every subsequent alter_column call is then also silently swallowed, so the migration reports success while applying none of its column changes.**

- **Evidence:** for table, columns in _MONEY_COLUMNS.items():
    for col in columns:
        with contextlib.suppress(Exception):
            op.alter_column(table, col, existing_type=OLD_TYPE, type_=NEW_TYPE)

Alembic runs the whole revision in one transaction (backend/alembic/env.py: `with context.begin_transaction(): context.run_migrations()`). Once one ALTER fails (e.g. column missing/wrong type on a given deployment), Postgres marks the transaction aborted; every later statement on that connection raises too, and the broad except swallows all of them. Nothing rolls back to a savepoint, so at COMMIT the entire transaction (including any statements that ran before the failure) is discarded by Postgres -- a 'successful', stamped migration that changed nothing. Same pattern repeats in 027_datetime_timezone_standardization.py:104 and 034_qty_columns_numeric.py:52.
- **Fix:** Use a SAVEPOINT per column (op.get_bind().begin_nested()) before each alter_column so a single failure doesn't poison the whole transaction, or run outside a transaction with explicit per-statement error handling and logging instead of silently suppressing.

### H-06 · bug · `backend/app/models/supplier_portal.py:77`

**RfqHeader.created_by is nullable=False but its FK uses ondelete="SET NULL", so deleting a user who ever created an RFQ raises a NOT NULL violation and blocks the delete.**

- **Evidence:** created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False, index=True) -- Postgres fires ON DELETE SET NULL on this FK when the referenced user is deleted, but the column itself forbids NULL, so the DELETE fails with an IntegrityError ("null value in column created_by violates not-null constraint"). Grepped every other ondelete="SET NULL" FK in app/models/*.py (team.py:30, zoho_sync.py:108, compliance.py:49, etc.) and all of them are correctly nullable=True; this is the only nullable=False+SET NULL pair in the codebase.
- **Fix:** Either make created_by nullable=True (matches the SET NULL intent), or switch ondelete to CASCADE/RESTRICT if the RFQ (or the delete) should not survive/succeed.

### H-07 · bug · `backend/app/scripts/create_admin.py:54`

**create_admin.py always crashes: it imports the AsyncSessionLocal placeholder (None) instead of lazily initializing the engine, breaking the documented admin-bootstrap flow.**

- **Evidence:** Line 23 does `from app.db.session import AsyncSessionLocal`; line 54 does `async with AsyncSessionLocal() as db:`. In session.py, AsyncSessionLocal = None is a placeholder only reassigned inside init_engine(). create_admin.py never calls init_engine()/get_session_maker(), and `from x import y` copies the value at import time, so its local AsyncSessionLocal stays None. Running it exactly as documented in admin-guide.md ('docker compose exec api python -m app.scripts.create_admin') spawns a fresh process where init_engine() never ran, so AsyncSessionLocal() raises TypeError: 'NoneType' object is not callable.
- **Fix:** Use `async with (await get_session_maker())() as db:` like every other module in the codebase (e.g. app/core/backup.py).

### H-08 · bug · `solidworks-plugin/BlackboxBOM.SolidWorks/BlackboxBOM.SolidWorks.csproj:95`

**csproj EmbeddedResource references Resources\BlackboxBOM.ico, which does not exist anywhere in the repo -> build fails with MSB3030**

- **Evidence:** <ItemGroup>\n  <EmbeddedResource Include="Resources\\BlackboxBOM.ico" />\n</ItemGroup>\nGlob for solidworks-plugin/**/Resources/** returns no matches. MSBuild's EmbeddedResource requires the file to exist; a missing file is a hard build error, independent of (and in addition to) the project's own SolidWorksApiRedistDir guard. The plugin cannot compile as shipped even with a real SolidWorks install present.
- **Fix:** Add the missing Resources/BlackboxBOM.ico file, or remove the <EmbeddedResource> line.

### H-09 · data-loss · `frontend/src/components/ModalsHost.jsx:249` **[LIVE]**

**Confirming a BOM 'Release' (described to the user as locking a revision, creating an immutable snapshot, and notifying engineering/procurement/finance) only mutates local React state and toasts success -- nothing is persisted to the backend.**

- **Evidence:** onConfirm={() => { const newVer = ...; const newRev = String.fromCharCode(project.rev.charCodeAt(0) + 1); setProject({ ...project, version: newVer, rev: newRev, updated: "2026-05-25" }); setNotifications([...]); toast(__t("bomShell.releaseConfirmLabel") + " " + newVer, { kind: "success" }); }} -- no api.* call; a page refresh loses the 'release' entirely even though the dialog claims the changelog was sent to three departments. The adjacent 'Approve' ConfirmModal (lines 289-320) has the identical no-persistence pattern.
- **Fix:** Call the real BOM release/approve API (mirroring how ECRScreen/ESignDialog gate real state changes through api.eco.action) before updating local state and toasting success.

### H-10 · data-loss · `frontend/src/root/power-features.jsx:383` **[LIVE]**

**WorkOrdersScreen's persist() only updates local component state; 'Report build', 'Report defect', and 'Create Work Order' all call it and show success toasts, but nothing is ever written to the server even though screenData.workOrders.create/.update already exist**

- **Evidence:** `const persist = (next) => { setOrders(next); };` is the only implementation, called from the 'Report build' onSelect (line 478-489: `persist(next); toast(...'Build reported'...)`), 'Report defect' onSelect (line 494-506), and the 'Create Work Order' button (line 587-618). frontend/src/services/screenDataBridge.js:136-141 defines `screenData.workOrders.create`/`.update`/`.remove` with real backend fallback wrappers, none of which are called from any of these three write paths — only `.list()` is used, for the initial read.
- **Fix:** Route persist()'s mutations through `screenData.workOrders.update`/`.create` and only update local state / show the success toast after that call resolves.

### H-11 · fabrication · `frontend/src/components/modals/AutoScrapeModal.jsx:65` _[dead layer — not reachable from main.jsx]_

**Auto-scrape modal always returns the same hardcoded STM32H743 part dataset as if it were freshly scraped from the internet, regardless of the part number entered.**

- **Evidence:** const fake = { manufacturer: "STMicroelectronics", package: "LQFP-100", core_speed_mhz: 480, ..., market_price_min: 14.2, market_price_max: 22.8, alternate_vendors: "Digi-Key, Mouser, Arrow, RS Components" }; setMerged(fake); setSources([{ name: "Manufacturer (ST.com)", fields: 6, confidence: 0.96 }, ...]); -- runs after a setInterval fake progress bar; no api.* call exists anywhere in the file, so any part number scraped shows identical fabricated specs/prices/vendors that the user can apply onto a real part.
- **Fix:** Wire to a real api.scraping/api.parts enrichment endpoint (as InternetScrapeModal.jsx in the same folder does) or replace with an honest 'not implemented' state like CADImportModal.jsx was already rewritten to do.

### H-12 · fabrication · `frontend/src/components/modals/ImportRFQsModal.jsx:27` _[dead layer — not reachable from main.jsx]_

**Import RFQs modal shows 4 hardcoded fake quotes labeled as detected from the inbox, and 'Import accepted' never calls any backend API.**

- **Evidence:** const [items, setItems] = React.useState([{ vendor: "Mean Well", pn: "EL-PSU-240W", qty: 50, unit: 82.5, total: 4125, status: "pending" }, ... 4 fixed rows]); subtitle={... "4 quotes detected from inbox"}; const submit = () => { onClose(); ... toast(`${n} RFQs imported · added to procurement pipeline`) }; -- no api.* call in submit(), the 4 rows never change and are not read from any inbox.
- **Fix:** Load real RFQ responses via api.supplierPortal (as RFQCompareModal.jsx does) and call a real import endpoint on submit, or mark the feature as not yet implemented.

### H-13 · fabrication · `frontend/src/components/modals/QuoteHistoryModal.jsx:14` _[dead layer — not reachable from main.jsx]_

**Quote history modal shows a fixed hardcoded list of 8 quotes (dates, prices, stats) for every vendor, ignoring the vendor prop's actual identity/data.**

- **Evidence:** export default function QuoteHistoryModal({ open, onClose, vendor }) { if (!open || !vendor || !vendor.name) return null; const quotes = [ { id: "Q-2026-0182", date: "2026-05-12", pn: "EL-PSU-240W", qty: 100, unit: 82.5, total: 8250, status: "accepted" }, ... ]; -- vendor is only used for the title text; the same 8 quotes/avg-unit/acceptance-rate stats render for any vendor clicked.
- **Fix:** Fetch real quote/price history for vendor.apiId (e.g. api.priceHistory or a vendor-quotes endpoint, mirroring VendorDetailModal.jsx's real-data wiring in the same directory) instead of the static array.

### H-14 · fabrication · `frontend/src/context/AppCtx.jsx:231` **[LIVE]**

**comments and approvals state is permanently seeded with hardcoded fake demo data and never overwritten by the real API response**

- **Evidence:** `const [comments, setComments] = React.useState(INITIAL_COMMENTS);` and `const [approvals, setApprovals] = React.useState(INITIAL_APPROVALS);` (utils/constants.js lines 10-28) contain hand-written fake names/comments ("E. Chen", "H743 errata ES0392") and fake approval statuses for parts like "ATL-MFR-CHS". `dataService.refresh('comments')`/`refresh('approvals')` call the real backend via screenData, but grepping every setComments/setApprovals call site in this file shows only the initial useState — nothing ever feeds the fetched data back into these two pieces of state (comment at line 379: 'comments and approvals sync removed from localStorage' confirms the sync path was cut). Every screen reading ctx.comments/ctx.approvals shows this fake seed data for the entire session, for every tenant.
- **Fix:** Call setComments/setApprovals from dataService.refresh('comments'/'approvals') results (mirroring how apiParts/apiVendors are wired), and drop the fake INITIAL_COMMENTS/INITIAL_APPROVALS fallback, or clearly gate it behind an explicit empty/demo state.

### H-15 · fabrication · `frontend/src/root/auth-onboarding.jsx:72` **[LIVE]**

**'Forgot password' flow never calls any backend endpoint and always shows a fake 'reset link sent' success toast, even though a real POST /api/v1/auth/forgot-password endpoint exists and is unused by the frontend**

- **Evidence:** submit(): `if (mode === "forgot") { toast(__t("auth.passwordResetSent") + " " + email, { kind: "success" }); setMode("signin"); return; }` — no api call, works fully offline, works for any email including nonexistent ones. Confirmed via grep: frontend/openapi.json:20271 defines `/api/v1/auth/forgot-password` (ForgotPasswordRequest schema at :7483) and frontend/api.js has no forgotPassword method at all.
- **Fix:** Call the existing /auth/forgot-password endpoint from this branch and only show success once the request actually succeeds (or a generic 'if this email exists...' message after a real API call, per standard password-reset UX).

### H-16 · fabrication · `frontend/src/root/final-polish.jsx:826` **[LIVE]**

**printPO() bakes fabricated fallback values (unit cost $12, vendor name 'Mean Well', a hardcoded street address, and a hardcoded 'K. Singh' signatory) into every generated Purchase Order document when real data is missing**

- **Evidence:** `const lineCost = (item.qty||0) * (item.cost||12);` — falls back to a fake $12/unit cost that flows into subtotal/tax/total; line 907 `h(item.vendor || "Mean Well")`; line 912 `"<div>1234 Industrial Park</div>"` hardcoded for every vendor; lines 990-994 `__t("printPo.authorizedBy") || "Authorized by Buyer · K. Singh, Procurement Lead"` signs every PO with a fabricated named employee.
- **Fix:** Fall back to an explicit '—'/TBD placeholder instead of a numeric/name default when real cost/vendor/address/signatory data is unavailable, so a fabricated value never enters the printed total or a legal-looking document.

### H-17 · fabrication · `frontend/src/root/power-features.jsx:720` **[LIVE]**

**NCRScreen (/ncr) seeds state with 4 hardcoded fake Non-Conformance Reports and every 'create NCR' only updates local React state — never calls the backend, despite a working screenData.quality.ncr.create wrapper existing**

- **Evidence:** `const [ncrs, setNcrs] = React.useState([{id:"NCR-2026-018", pn:"EL-PSU-240W", ..., reporter:"M. Park", date:"2026-05-23"}, ...3 more...]);` and `createNcr()` (line 776-824) ends with `setNcrs([entry, ...ncrs]); ... toast(id + " created for " + entry.pn, {kind:"success"});` with no api/screenData call anywhere in the component. frontend/src/services/screenDataBridge.js:171-173 already exposes `screenData.quality.ncr.list`/`.create` with a real backend fallback, and the sibling screen root/qms-dashboard.jsx correctly calls `api.quality.ncr.list()` for the same data — this screen bypasses both.
- **Fix:** Replace the hardcoded seed array with `screenData.quality.ncr.list()` on mount and route createNcr() through `screenData.quality.ncr.create()`, mirroring qms-dashboard.jsx.

### H-18 · fabrication · `frontend/src/screens/BomEditorScreen.jsx:264` **[LIVE]**

**BOM ribbon/tabs show hardcoded fake stats (row counts, lead-time delta, risk flags, approval fraction) unrelated to actual BOM data**

- **Evidence:** Static literals baked into JSX: `<span className="count">87</span>` (hierarchy tab), `<span className="count">64</span>` (flat tab), `<div className="delta up">▲ +3d STM32H7</div>` (Critical Lead cell), `<div className="delta up">▲ 1 supplier · 1 dup · 1 origin</div>` (Risk Flags cell), `<div className="delta flat">3 of 4 sub-assys approved</div>` (Status cell), and `{bomTab === "flat" ? "64" : "87"} rows · 64 unique` in the filter bar. None reference `r` (the real rollup object used two lines above for r.parts/r.bomCost/r.lead) or ctx.rows/data.rows — every tenant sees the same fake '87 rows', '64 unique', 'STM32H7' lead delta and '3 of 4 sub-assys approved' regardless of their real BOM contents.
- **Fix:** Derive these from the actual rows/rollup (e.g. rows.length, computed unique count, computed lead-time delta and approval fraction from ctx.approvals) instead of literal strings.

### H-19 · inconsistency · `.github/workflows/ci.yml:111`

**The blocking 'Test Backend' CI job runs the legacy, superseded 5-file backend/tests/ suite instead of the real ~140-file backend/app/tests/ suite, giving a misleading green check/coverage number.**

- **Evidence:** ci.yml sets working-directory: backend (line 20) then runs `python -m pytest tests/ -v --tb=short --asyncio-mode=auto --cov=app --cov-report=xml --cov-report=term` (line 111). Passing the explicit path `tests/` overrides backend/pytest.ini's `testpaths = app/tests`, so this job only ever collects backend/tests/ (test_api.py, test_auth.py, test_crud.py, test_rbac.py, test_search.py; ~30 tests). backend/pytest.ini:1-6 explicitly documents that directory as legacy/leaky and 'superseded by app/tests', with testpaths = app/tests set specifically so plain `pytest` picks up the real suite instead. The PR-facing job named 'Test Backend' (with coverage upload + JUnit reporter) therefore represents ~30 superficial tests, not the ~140 files covering RLS/tenant isolation, tar-slip, ERP-honesty, Part-11 e-sign, money/qty precision, etc.
- **Fix:** Change ci.yml's test-backend step to `pytest app/tests/` (or drop the explicit path so pytest.ini's testpaths applies), or rename/remove the job so its label doesn't overstate coverage.

### H-20 · inconsistency · `backend/app/services/bom_service.py:2076`

**apply_template creates BOMItem rows without the BomClosure self-row every other creation path writes, and without emitting bom.item.created, permanently corrupting closure-backed where-used for template-created items and their future descendants.**

- **Evidence:** for ti in template_items.scalars().all(): db.add(BOMItem(bom_id=bom.id, part_id=ti.partId, ...)); items_created += 1  -- never calls _closure_add_item (the sole producer of BomClosure rows in the codebase, otherwise only called from create_bom_item at line ~475) and never calls webhook_service.emit_event. get_where_used_via_closure (line 956) resolves ancestors ONLY via BomClosure, never via parent_item_id, so these items report no usages. Worse: if a user later adds a child under a template item via create_bom_item, _closure_add_item's ancestor-inheritance step (querying BomClosure.descendant_item_id == parent_item_id) finds nothing for the parentless-in-closure template item, so the new child also never gets its ancestor chain recorded -- a permanent, silently-growing gap.

### H-21 · security · `backend/app/api/api_v1.py:373`

**GET /api/v1/health/detailed requires no authentication and leaks internal business/system data, plus returns hardcoded 'security enabled' fields that are never actually checked.**

- **Evidence:** detailed_health(db) has no Depends(get_current_user), unlike /metrics two lines above which has user: User = Depends(get_current_user). get_detailed_health() in health.py returns row counts for users/parts/boms/po_headers/work_orders/eco_headers/backup_history, memory/disk/platform, Redis status, and hardcoded blocks such as health['authentication']={'mfa_available': True, ..., 'sso_providers': ['google','github','microsoft']} and health['security']={'csrf_protection': True, 'rate_limiting_enabled': True, ...} that are compile-time constants, not derived from settings. The existing test (test_monitoring.py) passes auth_headers even though none are required, indicating the missing auth dependency was unintentional.
- **Fix:** Add Depends(get_current_superuser) matching /metrics, and compute authentication/security fields from live settings instead of hardcoding True/provider lists.

### H-22 · security · `backend/app/api/endpoints/bom_items.py:166`

**Bulk BOM-item delete uses a Core-style delete() statement filtered only by id, bypassing the app's tenant-isolation event listener, allowing cross-tenant deletion.**

- **Evidence:** result = await db.execute(delete(BomItem).where(BomItem.id.in_(req.ids))) has no tenantId predicate. app/core/tenant_events.py's tenant guard only auto-filters ORM select() and inspects session.dirty/session.deleted for mutate/delete -- it does not intercept bulk Core delete()/update() statements. Sibling endpoints vendors.py:198 and notifications.py:153 correctly add Vendor.tenantId == current_user.tenantId / Notification.userId == current_user.id to their bulk deletes; bom_items.py omits the equivalent guard, so a require_parts_write user in tenant A can delete tenant B's BomItem rows by ID.
- **Fix:** Add , BomItem.tenantId == current_user.tenantId to the delete()'s where() clause.

### H-23 · security · `backend/app/api/endpoints/routing_api.py:61`

**Systemic tenant-isolation bypass across raw-SQL (text()) endpoint modules: routing/process-plan tables, resource scheduling, service-BOM, and PO/order-tracking stats are read without a tenantId filter, unlike ORM-backed endpoints which are auto-scoped.**

- **Evidence:** routing_api.py:61 SELECT rt.* FROM routing_tables and :109 SELECT * FROM routing_tables WHERE id = :id have no tenant predicate even though create_routing (line 87) sets tenantId on insert. Same pattern in resource_api.py (work_centers:68, resource_schedules:102-130, labor_rates:165, timesheet_entries:199), service_bom.py (service_bom_headers/items:80-138), po_order.py::po_stats (100-127) and order_tracking.py::tracking_stats (151-163) -- the latter two are inconsistent within their own function since sibling ORM select() calls two lines away ARE auto-filtered by app/core/tenant_events.py, which only intercepts ORM SELECTs, not raw text().
- **Fix:** Move these modules to ORM select() so the existing tenant_events.py listener applies automatically, or bind current_user.tenantId and add an explicit tenantId predicate to every raw query, as export_report.py already does correctly.

### H-24 · security · `frontend/src/root/auth-onboarding.jsx:87` **[LIVE]**

**All three SSO buttons (Google/Microsoft/SAML) fabricate the same hardcoded admin identity with an empty password instead of performing any real OAuth/SAML flow**

- **Evidence:** `const sso = (provider) => { setLoading(true); setTimeout(() => { setLoading(false); onSignIn({ email: "admin@blackbox.com", password: "", name: "Admin User", via: provider }); }, 800); };` — no redirect/popup to any identity provider ever occurs; the fabricated identity is handed to the real api.auth.login call in screens/App.jsx:300-320 regardless of which SSO button (Google/Microsoft/SAML, lines 175/191/205) was clicked.
- **Fix:** Either implement real OAuth/SAML redirects or remove/hide the SSO buttons until they are backed by a real identity-provider flow.

---

## MEDIUM (23)

### M-01 · bug · `backend/scripts/restore_wizard.py:385`

**The module's own documented usage `--backup-id=5` never matches the argv parser, which only recognizes the space-separated form; running it as documented silently falls through to the interactive prompt.**

- **Evidence:** Docstring at line 5: `python -m scripts.restore_wizard --backup-id=5`. Parser: `if "--backup-id" in sys.argv: idx = sys.argv.index("--backup-id") + 1; backup_id = int(sys.argv[idx])...`. sys.argv contains the single token "--backup-id=5", not "--backup-id", so the `in` check is False and execution falls into interactive_mode(), which calls input() -- hangs/fails in any non-interactive caller (cron, CI, runbook) that follows the script's own documented syntax instead of restoring the requested backup.
- **Fix:** Parse with argparse (`--backup-id`, type=int) instead of manual sys.argv scanning, or accept both `--backup-id X` and `--backup-id=X` forms.

### M-02 · bug · `frontend/src/components/screens/DiffScreen.jsx:11` _[dead layer — not reachable from main.jsx]_

**'Compare Revisions' screen always diffs hardcoded BOM ids 1 and 2 via the real API, never the BOM/project actually open in the app.**

- **Evidence:** const [bom1Id] = React.useState(1); const [bom2Id] = React.useState(2); ... api.bomEnterprise.compare(bom1Id, bom2Id).then(...) -- bom1Id/bom2Id have no setter and ctx.project/ctx.bomId are never read, so switching projects in TopBar has no effect on what this screen diffs; for any project other than the one whose BOMs happen to be id 1 and 2, the comparison is either wrong or empty.
- **Fix:** Derive bom1Id/bom2Id from the active project/BOM in context (ctx.bomId or similar) instead of a fixed literal.

### M-03 · bug · `frontend/src/root/modals-extra.jsx:538` **[LIVE]**

**APIKeysModal's 'Copy' buttons (for the newly generated key and for a key's prefix) show a 'Copied ...' success toast without ever writing to the clipboard**

- **Evidence:** generate() success action: `onClick: () => toast((__t("apiKeys.copied") || "Copied ") + rawKey)`; table row button: `onClick={() => toast((__t("apiKeys.copied") || "Copied ") + (k.key_prefix || ""))}` — neither calls navigator.clipboard.writeText, unlike the correctly-implemented equivalents in this same directory (power-features.jsx:1404/1494 and overlays.jsx:1999-2000, which both call `navigator.clipboard?.writeText(...)`).
- **Fix:** Call `navigator.clipboard.writeText(rawKey)` / `writeText(k.key_prefix)` before showing the 'Copied' toast.

### M-04 · crash · `frontend/src/components/screens/ProcurementScreen.jsx:526` _[dead layer — not reachable from main.jsx]_

**PO line-item row click/render calls .slice()/.length directly on item.itemName with no null guard, unlike every sibling field on the same row -- a PO with a line item missing itemName throws and breaks the whole expanded-row table.**

- **Evidence:** onClick={(e) => { e.stopPropagation(); toast("Opening component: " + item.itemName.slice(0, 40)); }} ... {item.itemName.length > 50 ? item.itemName.slice(0, 50) + "…" : item.itemName} -- item.itemDesc on the very next column is guarded with `|| "—"`, but item.itemName (populated straight from the real poOrdersAPI payload) is not.
- **Fix:** Guard with `(item.itemName || "").slice(...)` / fall back to a placeholder like the other fields in this row.

### M-05 · data-loss · `backend/.dockerignore:8`

**.dockerignore excludes only the literal test.db, not the 15+ test_*.db files present in the directory, so stale test/seed databases get shipped into the built image**

- **Evidence:** Directory listing shows test_derivatives_track_e.db, test_final.db, test_hostfix.db, test_merge_a.db, test_p0.db, test_p0_full.db, test_rebase2.db, test_rebaseline.db, test_trackd.db, test_triage.db, test_ws1.db, test_ws2.db, test_ws3_orig.db, test_zrl.db (2.5-3.4MB each) — none match .dockerignore's `test.db`, `bom.db`, or `*.sqlite` patterns, so COPY . . (Dockerfile:19) includes them, bloating the image and potentially shipping stale seeded data (CHANGELOG.md:102 documents past hardcoded 'admin123' seed credentials) into a build artifact.
- **Fix:** Add `test_*.db` (or `*.db`) to .dockerignore.

### M-06 · dead-code · `backend/app/schemas/document.py:7`

**app/schemas/document.py is never imported anywhere in the codebase and its DocumentBase requires fields (name, description) that don't exist on the Document ORM model, so it would break immediately if ever wired up.**

- **Evidence:** DocumentBase declares `name: str` (required) and `description: Optional[str]`. app/models/document.py's Document model has no `name` or `description` column at all (it has filename/originalName instead). Confirmed dead via grep -rn "from app.schemas.document" backend/app -> 0 matches; the real, wired-up schema is a separate local inline Pydantic class defined directly inside the documents endpoint file. DocumentResponse(from_attributes=True) against a real row would raise a Pydantic validation error for the missing `name` attribute; DocumentCreate(**dict) fed into Document(**dict) would raise TypeError for the unknown `name`/`description` kwargs. The same dead-schema-vs-model-drift pattern also exists in app/schemas/project.py (status defaults to 'active', which violates the model's own CHECK constraint ck_projects_status -> only 'Draft','Review','Released','Deprecated','Archived','Completed','Cancelled' allowed) and app/schemas/price_history.py (requires a `vendor`/`quantity` field that doesn't exist on the PriceHistory model; the real column is `vendorId`). All three are confirmed dead via grep -rn "from app.schemas." across backend/app.
- **Fix:** Delete the dead schemas/document.py, schemas/project.py and schemas/price_history.py, or fix their fields to match the real ORM models and wire them into the endpoints instead of the endpoints' local duplicate classes.

### M-07 · dead-code · `frontend/src/utils/bom.ts:65` _[dead layer — not reachable from main.jsx]_

**Unused duplicate of convertApiPartsToTree with a regressed single-argument signature that silently drops bom_items_master linkage if ever imported**

- **Evidence:** bom.ts exports `convertApiPartsToTree(apiParts: ApiPart[])` with no bomItems param and no bomItemId/refDes/findNumber/imageDocumentId fields, while the actually-imported frontend/src/utils/bom.js exports the two-argument version used everywhere (root/bom-editor.jsx, AppCtx.jsx, parts-screen.jsx, detail-drawer.jsx, dataService.js). Grep across frontend/src found zero importers of bom.ts. If anyone imports from './bom.ts'/'./bom' ambiguously in the future, BOM rows lose structural edit/delete/reorder linkage per bom.js's own header comment.
- **Fix:** Delete frontend/src/utils/bom.ts; it has no callers and is out of sync with the real implementation.

### M-08 · dead-code · `solidworks-plugin/BlackboxBOM.SolidWorks/EventWatcher.cs:103`

**MonitorAssemblyEvents/MonitorFeatureEvents (the only hooks for real component add/remove and feature create/modify/delete notifications) are never called from anywhere in the codebase**

- **Evidence:** Repo-wide grep for MonitorAssemblyEvents|MonitorFeatureEvents matches only their own definitions in EventWatcher.cs. BlackboxBomAddin.SetupEventWatchers() (BlackboxBomAddin.cs:337-345) only calls StartWatching(), which wires ActiveDocChangeNotify/FileSaveNotify/FileSavePostNotify/ComponentActiveStateChangeNotify/ComponentVisibilityChangeNotify -- none of which are actual add/remove/feature-create events. OnComponentActiveStateChange (EventWatcher.cs:77-88) fires OnComponentAdded/OnComponentRemoved on component-activation state, not on real insertion/deletion. The class's own doc comment ('Monitors document save, component add/remove, feature changes', line 10-12) is therefore not true for add/remove/feature-create in normal use -- BomPanel's 'Component added/removed'/'Feature created' status notifications are effectively unreachable.
- **Fix:** Call MonitorFeatureEvents(model) and, when the active doc is an assembly, MonitorAssemblyEvents(assembly) from the document-open/ActiveDocChangeNotify path.

### M-09 · doc-mismatch · `MODULE_REFERENCE.md:1361`

**MODULE_REFERENCE.md's Known Limitations section presents the Alembic VARCHAR(32) and .env-ignoring issues as unresolved, contradicting PROJECT_REFERENCE.md/OPEN_ITEMS.md which mark both RESOLVED.**

- **Evidence:** MODULE_REFERENCE.md:1361-1373: "Alembic VARCHAR(32) Issue ... Status: Documented, not yet resolved" and "Alembic ENV VAR Handling ... Status: Documented, workaround in place". PROJECT_REFERENCE.md:71-74 and OPEN_ITEMS.md:14-15,40-42 both state (with resolved markers) that alembic/env.py now auto-widens the column and reads POSTGRES_*/.env fallback. MODULE_REFERENCE.md is listed in PROJECT_REFERENCE.md as a deep-dive doc kept in sync, so a reader trusting it gets stale/contradicted status.
- **Fix:** Update MODULE_REFERENCE.md's Known Limitations section to match the resolved status recorded elsewhere, or remove it.

### M-10 · doc-mismatch · `README.md:101`

**README.md instructs `docker compose -f docker-compose.prod.yml up -d`, but no docker-compose.prod.yml exists anywhere in the repo.**

- **Evidence:** README.md:101-105: "### Docker (Production, full stack - monitoring/MinIO/pgBackRest)\ncd backend\ndocker compose -f docker-compose.prod.yml up -d". Verified via directory listing: no docker-compose.prod.yml exists at root or under backend/. Also README.md:11 lists infra as "Docker Compose, Prometheus/Grafana, PgBouncer, MinIO, ngix" while docker-compose.yml:13-17 explicitly documents PgBouncer as intentionally omitted, and the actual compose file defines only db/redis/backend/frontend - no Prometheus, Grafana, PgBouncer, or MinIO containers.
- **Fix:** Remove the docker-compose.prod.yml instructions or add the file; align README's infra list with docker-compose.yml's actual services.

### M-11 · fabrication · `RELEASE_NOTES.md:297`

**RELEASE_NOTES.md claims docker/postgres/init.sql runs an ALTER TABLE to widen alembic_version.version_num, but init.sql contains no such statement.**

- **Evidence:** RELEASE_NOTES.md:296-297: "Workaround: Automated in docker-compose.yml via docker/postgres/init.sql, which runs ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64) on DB init." Actual full contents of docker/postgres/init.sql: `CREATE EXTENSION IF NOT EXISTS pgcrypto;` and `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` — no ALTER TABLE statement exists in that file or anywhere in docker/. The real fix lives in backend/alembic/env.py (per PROJECT_REFERENCE.md:72), a different mechanism entirely.
- **Fix:** Correct RELEASE_NOTES.md to point at alembic/env.py's runtime widening logic instead of a nonexistent init.sql statement.

### M-12 · fabrication · `backend/app/api/endpoints/inventory_api.py:332`

**get_stock_valuation multiplies on-hand quantity by a hardcoded 1.0 instead of unit cost, so the reported USD 'estimated_total_value' is actually just a sum of quantities mislabeled as a dollar valuation.**

- **Evidence:** total_value += float(item.quantity_on_hand or 0) * 1.0 -- no Part.cost or costing table is joined/looked up anywhere in the function, yet the response includes "currency": "USD" alongside estimated_total_value, presenting a quantity count as real financial data.
- **Fix:** Join Inventory.part_id to Part.cost (or a proper cost source) and multiply quantity by that value.

### M-13 · fabrication · `backend/app/services/bom_service.py:1974`

**import_bom never fetches or parses file_url -- it creates an empty draft BOM and unconditionally returns import_status: 'success' with items_imported: 0, for any file_url including invalid ones.**

- **Evidence:** async def import_bom(db, file_url, project_id, format='csv'): ... bom = BOM(name=..., description=f"Imported from {file_url} ({format})", ...); db.add(bom); await db.commit(); return {"bom_id": bom.id, "import_status": "success", "items_imported": 0, "warnings": [...]} -- file_url is validated as required but never downloaded/read; no CSV/Excel parsing exists. A caller checking import_status alone cannot distinguish 'nothing was imported because this is a stub' from a real success.

### M-14 · fabrication · `frontend/src/components/modals/SettingsModal.jsx:325` _[dead layer — not reachable from main.jsx]_

**Workspace Settings modal (members, roles table, integrations, billing) is built entirely from hardcoded arrays, and every mutating action including 'Save changes' and 'Delete workspace' only shows a toast -- nothing is sent to the backend.**

- **Evidence:** const members = [{ name: "E. Chen", email: "elena@blackboxfactories.com", role: "Admin", initials: "EC" }, ...]; ... <Button variant="primary" onClick={() => { onClose(); toast(__t("workspace.settingsSaved") || "Settings saved", { kind: "success" }); }}>{__t("workspace.saveChanges") || "Save changes"}</Button> -- same pattern for role changes ('Role updated for ...'), member removal, integration connect/disconnect, and the danger-zone 'Delete workspace' button ('This action cannot be undone... All data will be permanently deleted' shows a toast and does nothing).
- **Fix:** Wire to the real api.users/api.rbac endpoints already used correctly by screens/MembersScreen.jsx, and to real workspace/integration settings endpoints; remove or clearly label the hardcoded demo lists.

### M-15 · fabrication · `frontend/src/components/screens/AnalyticsScreen.jsx:341` _[dead layer — not reachable from main.jsx]_

**The 'PDF report' export downloads a plain-text string (whose own copy says '(mock PDF)') labeled with a .pdf filename and application/pdf MIME type -- not a real, openable PDF.**

- **Evidence:** downloadBlob(__t("analytics.reportContent") || "Analytics report (mock PDF)\nProject ATLAS · " + range + ... , "analytics_report.pdf", "application/pdf"); toast(__t("analytics.downloadedReport") || "Downloaded analytics_report.pdf", { kind: "success" }); -- the sibling CSV/'BOM summary'/'vendor comparison' exports in the same file correctly download .txt/.csv; only this path mislabels a text blob as a PDF.
- **Fix:** Either generate a real PDF (e.g. via a PDF library or a backend render endpoint) or rename the export/file extension to .txt and drop the misleading 'PDF report' label.

### M-16 · fabrication · `frontend/src/root/auth-onboarding.jsx:724` **[LIVE]**

**MobileScanView (reachable from the account popover's unconditional 'Open mobile scan view' item) fakes barcode scans by picking a random item from a hardcoded 4-item list instead of using the camera or any lookup API**

- **Evidence:** `const fakeScan = () => { setScanning(true); setTimeout(() => { const samples = [{pn:"EL-MCU-STM32H7", stock:142, loc:"A-12-03", status:"ok"}, ...3 more...]; const pick = samples[Math.floor(Math.random()*samples.length)]; setScans([{...pick, at: new Date().toLocaleTimeString(...)}, ...scans]); }, 900); };` bound to the 'Tap to Scan' button (line 808). Reachable via components/NavRail.jsx:549-560 `setShowMobileScan(true)` -> screens/App.jsx:365-366, listed without any 'demo' label (unlike the adjacent 'Switch role (demo)' section). A separate, correctly-implemented scanner exists at root/mobile-scanner.jsx using getUserMedia + api.parts.list/api.barcodes.lookup.
- **Fix:** Either wire this view to the real camera + api.barcodes.lookup path used by root/mobile-scanner.jsx, or remove this duplicate fake screen and point the nav item at the real one.

### M-17 · fabrication · `frontend/src/root/power-features.jsx:310` **[LIVE]**

**WorkOrdersScreen silently substitutes 5 hardcoded fake work orders whenever the real list is empty or the API call fails, with no indication to the user that the data isn't real**

- **Evidence:** `const DEFAULT_ORDERS = [ {id:"WO-2026-0042", bom:"ATLAS Mainframe v3.2.0", qty:25, ...}, ...4 more... ];` then `screenData.workOrders.list().then((data) => { if (data && data.length) setOrders(data); else setOrders(DEFAULT_ORDERS); }).catch(() => setOrders(DEFAULT_ORDERS));` — a genuinely empty tenant and a failed API call are both indistinguishable from 'here are 5 real work orders'.
- **Fix:** Render an honest EmptyState/ErrorState instead of falling back to a fabricated seed array.

### M-18 · inconsistency · `backend/app/core/audit_middleware.py:92`

**AuditLogMiddleware records request.client.host directly instead of the proxy-aware get_client_ip() helper, so behind a reverse proxy every audit_logs.userIp is the proxy's address, not the real client.**

- **Evidence:** client_ip = request.client.host if request.client else "unknown". The codebase has app/core/client_ip.py specifically to solve this (used by rate_limit.py and, per an explicit prior-audit comment in main.py, by the WS endpoint, because reading .client.host directly ignores the proxy). AuditLogMiddleware was not updated to use get_client_ip(), so with settings.BEHIND_PROXY=True (the documented nginx deployment) every audit trail entry attributes the action to the proxy IP, not the actual user.
- **Fix:** client_ip = get_client_ip(request) instead of request.client.host.

### M-19 · inconsistency · `backend/app/models/contract.py:33`

**Contract.contractType's inline comment documents display values that don't match its own CHECK constraint's allow-list, so following the comment produces DB-rejected values.**

- **Evidence:** Line 33: contractType = Column(String)  # "Blanket PO", "Volume Discount", "Long-term Agreement", "NDA" -- but lines 83-86: CheckConstraint("\"contractType\" IN ('blanket_po', 'volume_discount', 'annual', 'fixed_price', 'other')", name="ck_contracts_contract_type"). "Long-term Agreement" and "NDA" aren't allowed at all, and the overlapping values use different casing/spelling. app/schemas/contract.py's contractType is an unconstrained Optional[str] (no enum), so nothing stops a caller from using the comment's values and hitting a raw 500 IntegrityError. The only place in the repo that actually sets this field (backend/app/tests/test_contract.py:28) uses the CHECK-compliant 'blanket_po', confirming the comment itself is stale/wrong.
- **Fix:** Update the comment to list the real allowed values ('blanket_po','volume_discount','annual','fixed_price','other'), or widen the CHECK constraint to match the intended business vocabulary.

### M-20 · inconsistency · `frontend/styles.css:4756`

**Nav-rail group label text (.bbf-nav-header) is colored with --bbf-olive (2.06:1 on white), violating WCAG AA 4.5:1 and the file's own documented rule that olive must never carry text.**

- **Evidence:** styles.css:26-38 states '--bbf-olive is the brand mark hue: 2.06:1 against white, so it can never carry text ... keep --bbf-olive itself for decorative marks/borders/bars' and defines --bbf-olive-text (5.47:1/4.80:1) as the AA-safe substitute for text use. But .bbf-nav-header at line 4756 does `color: var(--bbf-olive);` directly on what is real, readable uppercase nav-group label text (e.g. section headers in the nav rail), not a decorative mark. Same violation, lower severity (decorative glyphs, not semantic labels) recurs at lines 571, 596, 614, 1991, 4428, 4679, 4686, 4734.
- **Fix:** Use var(--bbf-olive-text) for .bbf-nav-header (and the other text/glyph uses) as the file's own convention dictates.

### M-21 · security · `backend/app/api/endpoints/eco_api.py:322`

**create_ecr/create_ecn skip the require_engineering gate applied to every other ECO mutation in the file, and create_ecr accepts an unverified client-supplied requested_by user id.**

- **Evidence:** Router default is require_viewer (line 36); create_eco/add_eco_item/eco_action all upgrade to Depends(require_engineering), but create_ecn (line 288-293) and create_ecr (line 322-328) use only Depends(get_current_user). create_ecr additionally takes requested_by: int as a raw parameter and stores it verbatim (EcoHeader(..., requested_by=requested_by)) with no check against current_user.id, unlike /approve's explicit approver-identity guardrail a few lines above.
- **Fix:** Require require_engineering on both endpoints; drop the requested_by parameter or verify it equals current_user.id.

### M-22 · security · `backend/app/core/deps.py:40`

**Redis-backed per-user/per-API-key rate limiter uses int(time.time()) as both the sorted-set score and member, so bursts within the same second collapse into one entry and are undercounted -- the same bug already fixed in main.py's WS rate limiter (comment 'A13') but left open here.**

- **Evidence:** deps.py has `now = int(time.time())` then `pipe.zadd(key, {str(now): now})`. Two calls in the same wall-clock second write the identical ZADD member, so ZCARD never grows past 1 per second. main.py fixed the identical pattern in _check_ws_rate_limit with a comment explaining int(time.time()) as both score and member collapses a burst into one entry, and switched to a float score plus a unique uuid-suffixed member -- but the shared _check_redis_rate_limit in deps.py, which backs the 120/min API-key limit and 300/min per-user limit, was never given the same fix.
- **Fix:** Mirror main.py's fix: score by float time.time() and use a unique member string, not the truncated integer timestamp.

### M-23 · security · `desktop/.secret_key:1`

**A real-looking generated secret value is committed to source control and not covered by .gitignore, though nothing in the codebase reads this specific file**

- **Evidence:** {"key": "2t1ccVzPS6qcZQ_KOT-wAgdeTbqN8HxT4Hq0CqUM018"} -- desktop/.gitignore only excludes build/, dist/, pgsql/, *.exe, *.msi, and Python artifacts, not .secret_key. Grepped all .py files and case-insensitive 'secret_key' repo-wide: no code anywhere reads a file literally named '.secret_key' (the real secret lifecycle is launcher.py's ensure_env_secrets() writing a separate, gitignored DATA_DIR\.env at runtime). The file is orphaned but is still a concrete leaked-looking secret sitting in version control.
- **Fix:** Delete desktop/.secret_key from the repo (and rotate/revoke it if it was ever used anywhere), and add it to .gitignore.

---

## LOW (22)

### L-01 · bug · `backend/scripts/backup_cron.py:49`

**`--cleanup-only --dry-run` never calls cleanup_old_backups(), so it prints a static placeholder instead of an actual preview of what would be removed.**

- **Evidence:** if args.cleanup_only:
    if args.dry_run:
        print("[DRY RUN] Would clean up old backups")
    else:
        removed = await cleanup_old_backups(dry_run=args.dry_run)

cleanup_old_backups accepts a dry_run flag (used correctly elsewhere in the backup system) but is simply never invoked in the dry-run branch, so the top-level --dry-run help text ('Preview without changes') is not honored for the cleanup path -- no real preview data is ever shown.
- **Fix:** Call `removed = await cleanup_old_backups(dry_run=True)` and print what it returns instead of a hardcoded string.

### L-02 · bug · `frontend/src/components/ModalsHost.jsx:252` **[LIVE]**

**Revision increment only reads the first character of project.rev and blindly increments its char code, corrupting multi-character revisions and overflowing past 'Z'.**

- **Evidence:** const newRev = String.fromCharCode(project.rev.charCodeAt(0) + 1); -- for rev "AA" this produces a single-character "B" (data loss of the second letter); for rev "Z" this produces the non-alphanumeric "[" character.
- **Fix:** Use a proper revision-increment helper (e.g. base-26 string increment) instead of a raw single-char-code bump.

### L-03 · dead-code · `backend/app/core/job_queue.py:36`

**enqueue_job() and its registered handlers (bulk_import, email) have no caller anywhere in the codebase, yet the worker loop is still started/stopped on every app startup/shutdown.**

- **Evidence:** A repo-wide search for enqueue_job( finds only its own definition -- no endpoint or service ever calls it. bulk_import.py processes imports synchronously and never references this queue. Nonetheless main.py's lifespan() calls start_queue_worker() on startup and stop_queue_worker() on shutdown, so the worker loop runs while True with a 5s sleep forever scanning an always-empty _job_queue list.
- **Fix:** Either wire bulk_import/email sending through enqueue_job as apparently intended, or delete the unused queue machinery.

### L-04 · dead-code · `backend/app/core/tenant_events.py:108`

**auto_populate_tenant_id() is defined but never registered as an SQLAlchemy event listener and has no caller -- a dead duplicate of the listener actually registered inside _register_insert_listener.**

- **Evidence:** def auto_populate_tenant_id(mapper, connection, target) is never passed to event.listens_for/event.listen anywhere in the repo (only its own definition matches a search for the name). The real, active listener is the inner set_tenant_id closure registered a few lines above inside _register_insert_listener.
- **Fix:** Delete it, or if meant as a fallback for older SQLAlchemy, actually wire it in.

### L-05 · dead-code · `backend/app/integrations/zoho_client.py:329`

**ZohoBooksClient.list_records is defined twice with identical bodies; the first definition is unreachable dead code silently shadowed by the second.**

- **Evidence:** async def list_records(self, module, *, params=None): ... return await self._request("GET", f"/{module}", params=params)  -- appears verbatim at both line 329-337 and line 345-349 (separated only by list_settings). Python keeps the later definition; the earlier one can never be called. Harmless today since both bodies match, but a future edit to only one copy would silently diverge.

### L-06 · dead-code · `backend/app/services/inventory_service.py:214`

**transfer_inventory executes the destination-warehouse existence check and the source-inventory SELECT ... FOR UPDATE twice each -- the first result of each pair is discarded and re-queried verbatim.**

- **Evidence:** Lines 214-221 check to_warehouse_id exists; lines 223-230 SELECT Inventory FOR UPDATE into `from_inv` (result never used); lines 232-236 re-run the identical to_warehouse_id existence check; lines 238-242 re-run the identical SELECT ... FOR UPDATE and only THIS result (line 243) is used. Two redundant round-trips (one an extra row lock) per transfer with no behavioral difference -- clear refactor leftover.

### L-07 · dead-code · `docker/monitoring/prometheus.yml:21`

**Prometheus scrape config targets raw Postgres/Redis ports over HTTP for /metrics, which those services don't expose, and no Prometheus/exporter service is even wired into docker-compose.yml.**

- **Evidence:** docker/monitoring/prometheus.yml:21-30 defines jobs scraping db:5432 and redis:6379 with metrics_path: /metrics, scheme: http - Postgres/Redis speak their native wire protocols there, not HTTP, and need postgres_exporter/redis_exporter sidecars to expose /metrics. docker-compose.yml's services are only db, redis, backend, frontend - no prometheus, grafana, or exporter container is defined anywhere, so this file is not wired into the shipped stack at all.
- **Fix:** Either add prometheus/grafana + exporter services to a monitoring compose overlay and reference this config, or remove it if unused.

### L-08 · dead-code · `frontend/src/root/prod-additions.jsx:980` **[LIVE]**

**optimistic() helper randomly fabricates a save failure 12% of the time 'for demo purposes' (and calls opts.undo() on a mutation that actually succeeded); it is exported and attached to window but has no live caller anywhere in the codebase**

- **Evidence:** `export function optimistic(mutation, opts = {}) { try { mutation(); } catch (e) {...} if (Math.random() < 0.12) { setTimeout(() => { toast(opts.failLabel || "Save failed", {kind:"error", action:{...onClick: () => optimistic(mutation, opts)}}); opts.undo && opts.undo(); }, 600); } else if (opts.label) {...} } window.optimistic = optimistic;` — grepped `\boptimistic\(` across frontend/src: the only call site is the self-referential retry inside this same function.
- **Fix:** Delete this function (or wire it up and remove the random fake-failure branch) since nothing calls it today.

### L-09 · doc-mismatch · `MODULE_REFERENCE.md:1396`

**Cross-Reference table links to API.md, DATABASE.md, DEPLOYMENT.md, TESTING.md, OPERATIONS.md - none of which exist in the repo.**

- **Evidence:** MODULE_REFERENCE.md:1396-1409 links [API.md](./API.md), [DATABASE.md](./DATABASE.md), [DEPLOYMENT.md](./DEPLOYMENT.md), [TESTING.md](./TESTING.md), [OPERATIONS.md](./OPERATIONS.md). Verified: none of these 5 files exist anywhere in the repository. Similarly TESTING_AND_VALIDATION.md:799-808 links 8 files under docs/ (e.g. docs/ARCHITECTURE.md, docs/MODULE_REFERENCE.md) none of which exist - the real files live under backend/docs/ instead.
- **Fix:** Fix both cross-reference tables to point at files that actually exist (backend/docs/* or root *.md).

### L-10 · doc-mismatch · `README.md:31`

**README.md's Quick Start and Documentation table reference `cd "BOM and PRD"` and `BOM and PRD/*.md` paths that don't exist; the current frontend directory is `frontend/`.**

- **Evidence:** README.md:31 `cd "BOM and PRD"` and lines 164-171 list `BOM and PRD/RELEASE_NOTES.md`, `BOM and PRD/CHANGELOG.md`, etc. Verified `BOM and PRD` does not exist in the repo. PROJECT_REFERENCE.md section 4 (the authoritative current layout) shows the frontend lives at `frontend/`.
- **Fix:** Update README.md's paths to frontend/ and its doc table to point at the real root-level *.md files.

### L-11 · doc-mismatch · `backend/app/api/endpoints/sessions.py:113`

**revoke_all_sessions's docstring promises the current session is preserved ('except current') but the implementation deactivates every active session for the user including the one making the request.**

- **Evidence:** Docstring: 'Revoke all sessions for the current user (except current).' Code: update(UserSession).where(UserSession.userId == current_user.id).where(UserSession.isActive).values(isActive=False) -- no session id is excluded from the UPDATE, so calling this endpoint also revokes the caller's own current session, contradicting the docstring.
- **Fix:** Exclude the session tied to the current request's token from the WHERE clause, or correct the docstring.

### L-12 · doc-mismatch · `backend/scripts/benchmark_bom.py:64`

**Benchmark runs entirely against an in-memory SQLite engine but prints that it is inserting 'into PostgreSQL', misrepresenting what backend was actually measured.**

- **Evidence:** engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)  # line 14
...
print("Bulk inserting items into PostgreSQL...")  # line 64
The script never touches Postgres; its own console output falsely claims it did, which would mislead anyone reading benchmark results about whether the numbers reflect production database performance.
- **Fix:** Fix the print statement to say SQLite in-memory, or actually point the benchmark at a real Postgres connection if that's the intent.

### L-13 · fabrication · `frontend/src/components/modals/ProfileModal.jsx:25` _[dead layer — not reachable from main.jsx]_

**Profile modal shows a hardcoded 'Elena Chen' profile and 'Save changes' only toasts success without persisting any edited field.**

- **Evidence:** onClick={() => { onClose(); toast(__t("modals.profile.saved") || "Profile saved", { kind: "success" }); }} -- all Input/Select/Textarea fields use defaultValue (uncontrolled) with no onChange capture and no api call, so edited values are discarded when the modal closes.
- **Fix:** Capture field state and call a real api.users.update(currentUserId, ...) on save.

### L-14 · fabrication · `frontend/src/components/screens/AnalyticsScreen.jsx:151` _[dead layer — not reachable from main.jsx]_

**Multiple analytics panels (vendor heat map, country-of-origin, parts health score, downloadable BOM summary report, vendor cost comparison) silently fall back to the bundled demo BOM_DATA fixture whenever ctx.rows is unset, with no on-screen indication that the numbers shown/downloaded are demo data rather than the tenant's real BOM.**

- **Evidence:** const bomParts = bomLeafParts(ctx?.rows || BOM_DATA.rows); -- repeated at lines 151, 1016, 1271, 1486-1487, 1560, 1753, 1810, 1893 with no 'demo data' badge anywhere, unlike advanced/CostSimulatorModal.jsx's equivalent fallback which explicitly sets subtitle="No live BOM data loaded — showing demo figures, not real costs".
- **Fix:** Surface the same kind of explicit 'showing demo data' notice used in CostSimulatorModal.jsx whenever ctx.rows is empty/unset, instead of silently substituting the fixture.

### L-15 · inconsistency · `.github/workflows/ci.yml:65`

**The legacy-suite CI job names its Postgres service database 'bom_db' instead of the 'bom_test_db' convention used everywhere else in the repo's test config.**

- **Evidence:** ci.yml:65 and :100 set POSTGRES_DB: bom_db, while backend/app/tests/conftest.py:55 and backend/tests/conftest.py:41 both default to bom_test_db. Within this workflow it's a fresh ephemeral service container, not production, so no live-data risk today, but the naming deviates from the codebase's test-suffix convention and matches exactly the anti-pattern ('tests pointing at live bom_db') this audit was told to watch for.
- **Fix:** Rename the CI service/env db to bom_test_db for consistency with the rest of the test configs.

### L-16 · inconsistency · `backend/Dockerfile:2`

**Backend app Dockerfile still uses a floating base image tag (python:3.12-slim), contradicting CHANGELOG's claim that Docker image tags were pinned to specific versions**

- **Evidence:** Dockerfile:1 `# TODO: pin by digest in CI`, Dockerfile:2 `FROM python:3.12-slim`. CHANGELOG.md:55 (1.34.0) claims 'Docker image tags pinned from :latest to specific versions across all compose files (pgbackrest:2.53, pgbouncer:1.23, minio:RELEASE.2024-06-11, etc.)' but the app's own Dockerfile base image is still an unpinned floating tag that can pick up a new Python 3.12.x patch (and glibc/openssl) on every rebuild.
- **Fix:** Pin FROM python:3.12-slim@sha256:<digest> as the existing TODO already intends.

### L-17 · inconsistency · `backend/app/monitoring/metrics.py:272`

**MetricsMiddleware.EXCLUDED_PATHS lists bare paths ('/metrics', '/health/detailed') but the real registered routes are under the /api/v1 prefix, so the intended self-exclusion never actually matches for those two.**

- **Evidence:** EXCLUDED_PATHS = frozenset({'/metrics','/health','/health/detailed'}); later 'if path not in self.EXCLUDED_PATHS: metrics.record_request(...)'. api_v1.py registers these under settings.API_V1_STR, so request.url.path is '/api/v1/metrics' / '/api/v1/health/detailed', which never equals the bare strings; only the unprefixed root '/health' from main.py actually gets excluded, contrary to the comment 'e.g. the /metrics endpoint itself'.
- **Fix:** Compare against f'{settings.API_V1_STR}/metrics' etc., or match by suffix.

### L-18 · inconsistency · `backend/requirements.txt:1`

**All dependencies use open-ended range specifiers with no lockfile or hash pinning, so pip install -r requirements.txt is not reproducible across builds**

- **Evidence:** requirements.txt:1-29 e.g. `fastapi>=0.111,<1.0`, `sqlalchemy[asyncio]>=2.0,<3.0`, `pydantic[email]>=2.7,<3.0`; Dockerfile:17 runs `pip install --no-cache-dir -r requirements.txt` with no --require-hashes and no lockfile checked in, so two builds on different days can silently resolve different transitive versions.
- **Fix:** Generate and commit a locked requirements file (pip-compile / uv lock) and install with --require-hashes in the Dockerfile.

### L-19 · inconsistency · `frontend/nginx.conf:14`

**nginx's real Cache-Control header (max-age=3600) for `location /` overrides index.html's meta http-equiv no-cache directive, since try_files falls back to /index.html for that location.**

- **Evidence:** nginx.conf:12-15 `location / { try_files $uri $uri/ /index.html; add_header Cache-Control "public, max-age=3600"; }` vs index.html:15 `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/>`. Real HTTP headers win over meta tags in browsers, so the SPA shell referencing hashed build assets can be cached up to an hour, serving stale asset references right after a deploy.
- **Fix:** Add a location block for =/  (or /index.html) with `add_header Cache-Control "no-cache"` to match the intent already expressed in the HTML meta tag.

### L-20 · security · `backend/app/api/endpoints/audit_logs.py:79`

**create_audit_log accepts a client-supplied userId with no verification, letting any authenticated user fabricate audit-trail entries attributed to a different user.**

- **Evidence:** AuditLogBase requires userId: int from the request body, and db_log = AuditLog(**log.model_dump()) persists it as-is; the endpoint only requires Depends(get_current_user), with no check that userId == current_user.id or any elevated role.
- **Fix:** Ignore the client-supplied userId and always set it from current_user.id server-side, or require an admin role for entries attributed to someone else.

### L-21 · security · `backend/app/api/endpoints/erp_connectors.py:19`

**ERP connector CRUD (including apiKey storage/rotation) requires only basic login, unlike comparable integration-credential surfaces elsewhere in the codebase which require superuser/admin.**

- **Evidence:** router = APIRouter(dependencies=[Depends(get_current_user)]) -- create_connector/update_connector/delete_connector/sync_connector have no additional role dependency, whereas tenants.py uses get_current_superuser, roles_permissions.py uses require_admin, and integrations.py's connection upsert/delete/test all use get_current_superuser for the same class of 'manage third-party integration credentials' operation.
- **Fix:** Gate mutating ERP connector endpoints behind require_admin or get_current_superuser to match the rest of the app's integration-credential surfaces.

### L-22 · security · `frontend/src/root/integration-screens.jsx:470` **[LIVE]**

**Webhook 'secret' is generated client-side with Math.random(), a non-cryptographic PRNG, for a value used to sign/verify webhook deliveries**

- **Evidence:** `await webhooksAPI?.create({ url: newUrl, events: newEvents, secret: Math.random().toString(36).slice(2), active: true });`
- **Fix:** Generate the secret with `crypto.getRandomValues` (or let the backend generate it and return it) instead of Math.random().
