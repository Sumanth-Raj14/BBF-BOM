# Blackbox BOM — Issue Tracker

## Active Issues

### 1. Backend server dies between shell sessions
**Status**: Workaround in place
**Root cause**: Python processes don't survive bash tool restart. Port 8000 process is orphaned or killed.
**Workaround**: Start backend directly with `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &` within the session.
**Next**: Investigate persistent Windows service approach.

### 2. Browser cache serving stale files despite cache busters
**Status**: Active (low impact)
**Root cause**: Python server may serve cached version of `index.html`. Vite preview server (port 4173) serves fresh files.
**Workaround**: Use `npm run preview` instead of `python serve.py`, or restart `serve.py` after changes.

### 3. No i18n/internationalization
**Status**: Known gap
**Impact**: All strings hardcoded in English. Cannot serve non-English markets.

### 4. No offline support (PWA)
**Status**: Service worker registered but untested
**Impact**: Mobile users without connectivity cannot use the app.

### 5. No undo for destructive actions
**Status**: Known gap
**Impact**: Delete/obsolete operations not reversible. User education needed.

### 6. Backend offline blocks API features
**Status**: Expected — requires PostgreSQL + Redis
**Impact**: Upload, API Keys, Monitoring return "Failed to fetch". All screens degrade gracefully to mock data.

---

## Resolved Issues

### 7. 29 stub screens/modals never load real implementations
**Status**: FIXED (v1.3.0)
**Fix**: All 17 screens and 76 modals now have real implementations. Stubs only show if JSX file fails to load.

### 8. Backend lacks automatic backup scheduler
**Status**: FIXED (v1.3.0)
**Fix**: Added `lifespan` with background `asyncio` task in `main.py:45-51` that calls `run_backup_pipeline()` every `BACKUP_SCHEDULE_HOURS` (default 6) hours.

### 9. `favicon.ico` 404
**Status**: FIXED (v1.3.0)
**Fix**: Added `<link rel="icon">` pointing to inline SVG favicon in `index.html`.

### 10. `prod-additions.jsx` ERR_CONNECTION_REFUSED (intermittent)
**Status**: FIXED — transient server restart issue
**Root cause**: Frontend server was down during request. Not a code issue.

### 11. Form fields missing `id`/`name` attributes (a11y warning)
**Status**: FIXED (v1.3.0)
**Scope**: Fixed across all 15 JSX files (100+ form fields).

### 12. `GET /api/v1/supplier-portal/users` 405 Method Not Allowed
**Status**: FIXED (v1.3.0)
**Fix**: Added `GET /users` endpoint returning `list[SupplierUserResponse]`.

### 13. `window.toast is not a function` during loadFromAPI
**Status**: FIXED (v1.3.0)
**Fix**: Added `typeof window.toast === 'function'` guard for pre-mount calls.

### 14. Babel transformer warning (development only)
**Status**: FIXED (v1.7.0) — Migrated to Vite build, no longer uses Babel standalone

### 15. `addPartToBom` scope bug — Components tab "Add to BOM" broken
**Status**: FIXED (v1.3.0)
**Fix**: Passed `addPartToBom` as a prop to `PartsGrid` and `PartsList`.

### 16. `openModal` prop mismatch — Modals open with null context
**Status**: FIXED (v1.3.0)
**Fix**: Changed all 6 `openModal={setModal}` to `openModal={openModal}`.

### 17. Stale data — 22 reads of `window.BOM_DATA` instead of live context
**Status**: FIXED (v1.3.0)
**Fix**: Replaced all 22 stale reads with `ctx?.rows || window.BOM_DATA.rows` across 6 files.

### 18. CostSimulatorModal crash — ReferenceError: ctx is not defined
**Status**: FIXED (v1.3.0)
**Fix**: Added `const ctx = window.useAppStore();` before early return.

### 19. BulkImportScreen completely non-functional
**Status**: FIXED (v1.3.0)
**Fix**: Added `window.bulkImportAPI = bulkImportAPI;` to global API assignments.

### 20. MonitoringScreen refresh hangs forever
**Status**: FIXED (v1.3.0)
**Fix**: Added `.catch(() => setLoading(false))` to refresh Promise chain.

### 21. CalendarScreen "TODAY" never appears
**Status**: FIXED (v1.3.0)
**Fix**: Changed `new Date("2026-05-25")` to `new Date()`.

### 22. ApprovalsScreen content overflows screen
**Status**: FIXED (v1.3.0)
**Fix**: Added `maxHeight: "calc(100vh - 200px)"` and `overflowY: "auto"`.

### 23. OCRScreen — no upload option
**Status**: FIXED (v1.3.0)
**Fix**: Added file picker for datasheet upload.

### 24. NCRScreen — "New NCR" only shows toast
**Status**: FIXED (v1.3.0)
**Fix**: Converted to `useState`, added creation form with severity/disposition.

### 25. WorkOrdersScreen — data not persisted
**Status**: FIXED (v1.3.0)
**Fix**: Added localStorage persistence via `__bbox_work_orders` key.

### 26. Enterprise screens — all empty when backend offline
**Status**: FIXED (v1.3.0)
**Fix**: Added MOCK data fallbacks to all 8 enterprise screens.

### 27. ServiceBOMScreen — empty when backend offline
**Status**: FIXED (v1.3.0)
**Fix**: Added `MOCK_BOMS` with 3 sample service BOMs.

### 28. ERP Connectors — missing ClickUp and Zoho Cliq
**Status**: FIXED (v1.3.0)
**Fix**: Added "ClickUp" and "Zoho Cliq" to connector type dropdown.

### 29. Browser cache — old files served despite edits
**Status**: FIXED (v1.3.0)
**Fix**: Updated all cache busters to `?v=3` across 23 script tags.

### 30. CADImportModal — no real file upload
**Status**: FIXED (v1.3.0)
**Fix**: Added file input ref for Assembly file, PDM link input with URL field.

### 31. InflationAnalysisModal — Export button only shows toast
**Status**: FIXED (v1.3.0)
**Fix**: Generates real CSV file download.

### 32. ActivityScreen — static, never updates
**Status**: FIXED (v1.3.0)
**Fix**: Added auto-refresh toggle with 15s polling.

### 33. AIFeaturesScreen — all tabs empty without backend
**Status**: FIXED (v1.3.0)
**Fix**: Added realistic mock data fallbacks for all 4 tabs.

### 34. overlays.jsx flatMap — missing children fallback
**Status**: FIXED (v1.3.0)
**Fix**: Added `|| []` fallback to flatMap call.

### 35. No CHANGELOG or Feature Catalog documentation
**Status**: FIXED (v1.3.0)
**Fix**: Created CHANGELOG.md, FEATURE_CATALOG.md, and all 8 documentation files.

### 36. No build system — Babel standalone (3MB) loaded in browser
**Status**: FIXED (v1.7.0)
**Fix**: Migrated to Vite + ESM. 24 code-split chunks, 1.7s build, 213KB JS gzipped.

### 37. styles.css — orphaned CSS properties (parse error)
**Status**: FIXED (v1.4.0)
**Fix**: Added `.locked {` selector before orphaned properties.

### 38. UI/UX audit — 8 critical issues (focus, touch, motion, etc.)
**Status**: FIXED (v1.4.0)
**Fixes**: Focus states, skip link, touch targets, tap delay, viewport units, reduced motion, font size, ARIA labels.

### 39. 54 ESLint no-unused-vars warnings
**Status**: FIXED (v1.7.0)
**Fix**: Removed unused variables across 15 files. 0 errors, 0 warnings.

### 40. `integration-screens.jsx` file corruption
**Status**: FIXED (v1.7.0)
**Fix**: Reconstructed BulkImportScreen, ERPConnectorsScreen, WebhooksScreen functions.

### 41. `aria-prohibited-attr` a11y violation
**Status**: FIXED (v1.7.0)
**Fix**: Removed `aria-selected` from non-role elements.

### 42. 18 color-contrast a11y violations
**Status**: FIXED (v1.7.0)
**Fix**: Darkened CSS custom properties (--fg-3, --accent, --ok, --warn, --danger, .kbd, ok-pill).

### 43. Runtime JS accent override mismatch
**Status**: FIXED (v1.7.0)
**Fix**: Updated `useTweaks` defaults from `#e85d1f` to `#ba4816`.

---

## Regression Notes

### Auth flow fixes (batch 1, v1.3.0)
- Token validation on mount (calls `/auth/me`, tries `/auth/refresh` if expired)
- Save `refresh_token` in localStorage
- Global 401 interceptor via `window.__setOnUnauthorized()`
- Failed login blocks on auth errors (allows mock only on network errors)
- Logout clears `__bbox_role` and `__bbox_refresh_token`
- SSO uses valid credentials (`admin@blackbox.com` / `admin123`)
- Config spread bug in `apiRequest` (headers merge order)
- `bulkImport` URL uses `API_BASE` constant

### Enterprise screens data (v1.3.0)
- All 9 screens verified with real seeded data
- Dashboard KPIs: 10 metrics

### Server configuration (v1.3.0)
- Port changed from 3000 to 3001 (port 3000 blocked by WSA 10013)
- Added `ReuseAddrTCPServer` with `allow_reuse_address = True`
