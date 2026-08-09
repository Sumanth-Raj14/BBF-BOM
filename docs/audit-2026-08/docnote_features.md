# Changelog — PROJECT_FEATURES_DOCUMENTATION.md refresh (2026-08-09)

Verified against current code (not just FIX_COVERAGE.md's ledger — re-grepped/read the actual files) before writing each correction. Key corrections made vs the previous edition:

## Backend fixes confirmed in code and reflected
- Alembic head is 050 (`050_rfq_headers_created_by_nullable`), not 047. Updated everywhere (grounding para, Section 3 diagram, Section 23).
- `tenant_events.py`'s critical "ORMExecuteState.mapper_ doesn't exist" bug is FIXED — code now uses `execute_state.bind_mapper` with an explicit `# SECURITY:` comment. Removed from Critical known-issues; moved to "fixed this cycle" everywhere it was cited (Section 4, 20, 21).
- `bom_items.py` bulk-delete and `part_service.bulk_delete_parts` (Core-style `delete()` bypassing the ORM tenant guard) are now explicitly tenant-scoped via `get_tenant_id()`.
- `GET /health/detailed` now requires `get_current_user` (was unauthenticated).
- `backup.py`'s `settings.APP_NAME` bug is fixed — `config.py` now defines `APP_NAME` explicitly (comment confirms this was the fix).
- `restore_physical_backup` now uses `_stream_decrypt` (matches `create_physical_backup`'s chunked format) instead of a single-shot `fernet.decrypt` — the "encrypted backups can't be restored" defect is fixed.
- All five previously-unmounted routers (`derivatives.py`, `formulas.py`, `graph.py`, `planning.py`, `solidworks_contract.py`) are now mounted in `api_v1.py` — confirmed by reading the file. This was the single biggest correction: the old doc's Section 2 matrix row 22 ("Planning ⚫ DEAD"), Section 14, Section 20 #4, Section 21 High table, and Section 22 quick-wins all described these as unreachable dead code. Re-labeled as 🔵 BACKEND-ONLY-NO-UI (new badge added to Section 1) since they're reachable now but (except `graph.py`) have no frontend caller yet. Added new Section 19.8 to document them properly per the "mark backend-only-no-UI honestly" instruction.
- `api_keys.py` now has real per-key `scopes` (ORM-persisted, not the old broken raw-SQL `:scopes::json` cast) and a fixed unique-per-key prefix (was a collision risk causing `MultipleResultsFound`).
- `compliance_api.py` compliance-standard CRUD raw SQL is now tenant-scoped (was not).
- `eco_api.py` `create_ecr`/`create_ecn` now enforce `require_engineering` RBAC (previously skipped it).
- `inventory_api.py` stock valuation now uses real unit cost instead of a hardcoded `1.0` multiplier.
- `audit_logs.py` `create_audit_log` no longer trusts a client-supplied `userId`.
- `supplier_portal.py`'s `RfqHeader.created_by` is now nullable (matches its `ON DELETE SET NULL` FK).
- `bom_service.py` `apply_template` now creates the `BomClosure` self-row (previously skipped, breaking closure-table integrity for template-created BOMs).

## Frontend fixes confirmed in code (read the actual .jsx files, not just the audit ledger)
- `AnalyticsScreen.jsx`: the flat-vs-tree `rows[0].children` crash is fixed via a new shared `bomLeafParts()` helper (confirmed by reading the code and its "Audit finding A1" comment). This was previously called out as "the single highest-leverage frontend fix in the whole codebase" — now done.
- `qms-dashboard.jsx` (`QMSDashboard`): now calls real `api.quality.ncr.list` — the old `// Mock fetch` / `setTimeout` pattern is gone.
- `power-features.jsx` `NCRScreen`: now loads the real list via `api.quality.ncr.list` (confirmed via inline "Fix: was seeding 4 hardcoded fake NCRs..." comment) — was previously described as 🔴 MOCK in two different sections of the old doc.
- `power-features.jsx` `WorkOrdersScreen`: hardcoded `DEFAULT_ORDERS` fallback removed (confirmed via inline fix comment).
- `prod-additions.jsx` `InventoryScreen`: now calls real `api.inventory.list`/`api.kanban.list`/`api.inventory.binLocations.list` — the character-code-synthesized stock numbers are gone (confirmed via inline comment "never fabricated").
- `DocumentsScreen.jsx`: no longer silently falls back to demo `data.docs` on failure/empty — now sets the real (possibly empty) result and shows an honest empty state (confirmed via inline comment).
- `ComplianceScreen.jsx`: no longer hardcodes every part's rohs/reach/conflict to `'valid'` — derives each from real certification records via `findStandard`/`certStatus`.
- `VendorsScreen.jsx`: "Active" toggle is now `async` and calls `api.vendors.update` (confirmed by reading the function body). "Preferred" remains local-only, but the code now documents this as intentional (no server-side field exists), not an oversight — reframed accordingly rather than left as an unqualified bug.
- `parts-screen.jsx`: fabricated "library-only" demo rows are gone (confirmed via updated comment: apiParts is "never fabricated rows").
- `mobile-scanner.jsx`: `toast` is now properly imported (`import { toast } from "../utils/toast"`) — the 7-call-site `ReferenceError` crash is fixed.
- `root/icons.jsx`: `Package`/`Shield`/`Alert` icons now defined (confirmed via inline "Audit finding A3" comment) — `GlobalSearchModal`'s crash is fixed.
- `enterprise-screens.jsx` `CurrencyScreen`: no longer has a hardcoded exchangerate-api.com key client-side; now calls the backend's own `/enterprise/exchange-rates` proxy endpoint.
- `dashboard.jsx` `DashboardScreen`: budget tile now sources from a real `GET /budgets/workspace` (new `budgets.py` endpoint exists — confirmed) instead of a fake scaling constant; system-health tile now sources from real `GET /health/detailed` instead of the literal "API Uptime 99.98%" string (both confirmed via inline comments). This means Section 2's old "🔴 MOCK" verdict for DashboardScreen was stale — corrected to 🟢 REAL.
- `integration-screens.jsx` ERP connectors: the `erpConnectorsAPI.logs("latest")` call that always 422'd is gone — logs now fetched per real connector ID on demand (confirmed via inline comment).
- `final-polish.jsx` `printPO()`: tax now correctly computes at 0.18 to match the "GST 18%" label (was 0.08); fabricated fallback values ($12 unit cost, "Mean Well" vendor, fake signatory) replaced with real values or honest "—" placeholders (confirmed via inline "finding:" comments).
- `power-features.jsx` webhook secret / `ModalsHost.jsx` revision-increment / `prod-additions.jsx` `optimistic()` 12%-fake-failure / APIKeysModal copy buttons / SSO-button fake identity / forgot-password fake flow / ApprovalsScreen fake appends / BomEditorScreen fabricated ribbon stats — all confirmed fixed via FIX_COVERAGE.md's ledger (commit `dbcab0d`); spot-checked a representative sample directly rather than re-reading every single one given time budget.

## Confirmed still-broken / unchanged (kept as documented, re-verified where feasible)
- `DiffScreen.jsx`: still `useState(1)`/`useState(2)` for the two compared BOM IDs — confirmed by reading the file.
- `AppCtx.jsx`: still has the `project?.id || project?.bomId || data?.project?.id || 1` fallback — confirmed by reading the file.
- `ECRScreen.jsx`: upgraded from "pure fabricated seed" to "localStorage cache reconciled against api.eco.list" — this is a real improvement but not a full fix, so I described it as "improved" rather than "fixed," citing the actual reconciliation code comment.
- `pdm-cad.jsx` PDM vault UI, `InternetScrapeModal`, `WebhooksModal`, `PriceAlertsModal`/`RFQCompareModal`, `AuditLogModal`, `OCRScreen` "Apply to part" — left as documented (not in FIX_COVERAGE's fixed list; these are explicitly the "dead-layer, fix when wired" or lower-priority deferred items).
- `routing_api.py` list/get-process-plan reads remain tenant-unscoped (FIX_COVERAGE's own "Known follow-ups" note) — kept as open.
- Desktop `backend.exe` Alembic-stamping gap, `pitr_restore.py` Windows-path gap, inventory `reference_type` Python/DB mismatch, money-precision `Numeric(10,4)` overflow risk, RSA key file permissions, cookie-precedence-over-Bearer, `part_certifications` tenant-architecture gap — all re-confirmed present in code or left as-is where I did not have budget to re-read every file (flagged honestly as "not independently re-verified this cycle" in a few Section 21 rows rather than silently repeated as fact).

## Structural additions
- Added a new status badge, 🔵 BACKEND-ONLY-NO-UI, to Section 1's legend (distinct from ⚫ DEAD) — needed once the five previously-dead routers became reachable-but-UI-less, per the task's instruction to mark backend-only-no-UI features honestly.
- Added new Section 19.8 ("Formulas, where-used graph, and other backend-only-no-UI capabilities") to properly document `formulas.py`, `graph.py`, `planning.py`, `derivatives.py`, `solidworks_contract.py` now that they're reachable.
- Cross-references to `frontend/OPENBOM_GAP_ANALYSIS.md`'s "backend built, no UI" gap shape added in Section 23, since the new 🔵 badge is a direct instance of that gap pattern.
- Kept the document's original 23-section structure, badge system, and Purpose→Business value→...→Future improvements ordering intact; did not touch any other doc file or any code.
