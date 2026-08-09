# Changelog — PROJECT_ARCHITECTURE.md refresh (2026-08-09)

Doc was already structurally complete (all 15 spec sections + 5 required Mermaid diagram types present). This pass corrected facts against the current code rather than rewriting structure. All claims below were verified by reading the actual current source (not inferred from audit docs alone), except where explicitly cited as audit-sourced.

## Corrected counts
- Migration head: `047_solidworks_integration` → `050_rfq_headers_created_by_nullable` (verified: `backend/alembic/versions/` has 50 files; added 048_index_foreign_keys, 049_restore_check_constraints, 050_rfq_headers_created_by_nullable since the doc was last written).
- Endpoint modules: 73 → 74 (verified via `ls backend/app/api/endpoints`).
- Model modules: ~70 → ~74 (verified via `ls backend/app/models`).
- Route count: ~549 → ~558 (counted `@router.<verb>(` decorators across all endpoint files).
- Mounted sub-routers: ~68 → ~70 (5 previously-orphaned routers now mounted, see below).

## Corrected behavior (code now differs from what the doc said)
1. **Multi-tenancy SELECT auto-filter (Section 5.5, 8.3) — was "dead code", now WORKS.** Read `app/core/tenant_events.py`: the listener now uses `execute_state.bind_mapper` (not the nonexistent `mapper_`), deliberately un-guarded by try/except. ORM SELECTs on tenant-aware models are genuinely filtered now. Rewrote Section 5.5's Layer 1 description and Section 8.3's DB interaction rules to say so, while preserving the residual truth: raw `text()` SQL and bulk Core update/delete still need explicit scoping — cited the specific fixed instances (`bulk_delete_parts`, bulk BOM-item delete, `routing_api.py` writes) and the one still-deferred read-path gap (`routing_api.py` list/get).
2. **Five "never mounted" routers (Section 7.3, 14) — now all mounted.** Read `backend/app/api/api_v1.py` directly: `graph`, `derivatives`, `formulas`, `planning`, `solidworks_contract` are all `include_router`'d with explicit prefixes, with an in-code comment confirming the fix ("audit finding A9"). Rewrote the bullet in Section 7.3 and moved the item to a "Fixed since last pass" table in Section 14.
3. **`/health/detailed` (Section 7.1) — now auth-gated.** Read `api_v1.py`: the handler now takes `Depends(get_current_user)` and strips fabricated `security`/`authentication` blocks from the response, with an in-code comment confirming this was a fix. Doc previously didn't mention the auth status at all.
4. **API key scopes + prefix collision (Section 5.3) — now enforced/fixed.** Read `app/core/deps.py` (`_authenticate_by_api_key`, `_required_api_key_scope`) and `app/api/endpoints/api_keys.py`: scopes (`read`/`write`) are now enforced with default-deny (403 on mismatch), and keys get a unique prefix (`bkb<hex>_...`) instead of the literal `"bkb"` that used to cause `MultipleResultsFound`. Added this as new content — doc previously said nothing about scopes.
5. **Backups (Section 5.8, 14) — both previously-cited bugs are fixed.** Read `app/core/backup.py`: physical-backup restore now uses chunked `_stream_decrypt` matching the chunked encryption (no more single-shot `InvalidToken`); `Settings.APP_NAME` (checked `config.py`) is now a real field, so the failure-alert email path no longer raises `AttributeError`. Rewrote Section 5.8 and the Section 14 table.
6. **Desktop PITR restore (Section 3.1, 14) — now Windows-aware.** Read `backend/scripts/pitr_restore.py`: branches on `os.name == "nt"` and uses `copy`/`cp` appropriately. Doc previously called this a live gap; it's fixed. (The *separate*, still-true gap — bundled desktop installs never running Alembic — was left as-is; verified still true via `desktop/launcher.py`'s own comments.)
7. **WebSocket doc locks (Section 5.7, 14) — cross-tenant collision and disconnect-leak both fixed.** Read `app/main.py`'s `ConnectionManager`: `doc_locks` is keyed by `(channel, document_id)` (in-code comment confirms this was the tenant-collision fix), and `disconnect()` now releases + broadcasts release of every lock the disconnecting user held. Also noted the WS per-IP rate limiter's timestamp-collision fix (float+uuid member, finding "A13") and flagged that the *same* bug is still unfixed in `deps.py`'s per-user/per-API-key limiters (verified by reading both — asymmetric fix, worth knowing).
8. **Frontend circuit breaker / retry bugs (Section 9.4, 14) — both fixed.** Read `frontend/api.js`: 4xx (except 408/429) is now tagged and excluded from circuit-breaker accounting and retry; non-idempotent methods no longer auto-retry on transient failure. In-code comments cite "audit finding A4".
9. **`mobile-scanner.jsx` toast import bug — fixed.** Verified the import line exists now.
10. **Hardcoded exchange-rate API key in `enterprise-screens.jsx` — fixed.** It now calls the backend's own `/enterprise/exchange-rates` endpoint instead of an external API with an embedded key.
11. **`rows[0].children` crash pattern (Section 10, 14) — footprint shrank from "~10 components" to 3 verified call sites** (`BOMTemplatesModal.jsx`, `detail-drawer.jsx`, `AnalyticsScreen.jsx`), confirmed by grep. Softened the claim to match.
12. **CI issues (Section 14) — the specific `ci.yml` breakages the doc cited (alembic-against-empty-PG, missing build-push Dockerfile, compose service-name mismatch, superseded legacy test suite) are fixed per `docs/audit-2026-08/FIX_COVERAGE.md` (commit `c6d4565`).** Kept `postgres-ci.yml` as the still-authoritative gate (unchanged, matches system context).

## Things checked and left unchanged (still accurate)
- `SessionTimeoutMiddleware` still only re-validates JWT `exp`, no real inactivity logic (read `session_timeout.py` in full).
- `tenant_middleware.py` still unregistered/dead (confirmed via `main.py`'s own comment).
- Multipart uploads in `api.js` still bypass CSRF/refresh/circuit-breaker by design (confirmed by reading the code comment).
- Login-treats-500-as-offline behavior: not found among fixed items, left as a known issue.
- `docker-compose.yml`: reconfirmed Redis is deployed by default in the compose stack (with a required password) but remains architecturally optional for the app itself (in-memory fallbacks) — no contradiction, left as-is.
- Added one new item not previously called out: `app/core/job_queue.py`'s `enqueue_job()` has no caller anywhere in the codebase — the worker starts at lifespan but currently has no producers (verified in FIX_COVERAGE.md, cross-referenced against the code).

## Not independently re-verified (time-boxed; carried over from the existing doc as-is)
`parts.primary_vendor_id` cascade-delete claim, inverted BOM parent/child relationship claim, `bom_items_master` Numeric(10,4) claim, inventory reference-type Python/DB CHECK mismatch, service worker offline-shell gap, login-500-as-offline. None of these were contradicted by anything found during this pass; left untouched per the instruction to preserve still-correct content.

## Scope discipline
Only `PROJECT_ARCHITECTURE.md` was edited. No code, no other doc, no git operations.
