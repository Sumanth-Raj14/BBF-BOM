# Changelog

All notable changes to the Blackbox BOM Management Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Enterprise-grade PostgreSQL dump script (`backend/scripts/db_backup.py`) with 30-day retention policy.
- `bomItemsAPI` explicitly wired in `frontend/api.js`.
- Root-level `CHANGELOG.md` for enterprise audit compliance.

### Changed
- **[CRITICAL]** Eradicated `localStorage` reliance for primary engineering data. `storage.bomRows`, `storage.workOrders`, `storage.comments`, and `storage.poDrafts` have been stripped from the `storage.js` utility.
- `bom-editor.jsx` and `parts-screen.jsx` now correctly defer to `AppCtx.jsx` and the backend FastAPI for data mutability instead of writing to local cache.
- Hardened database persistence for deep hierarchical BOMs.

### Removed
- `storage.bomRows.set()` and `.remove()` statements removed from all frontend editor components to prevent desyncing from PostgreSQL.

## [v1.48.0] - 2026-07-06
### Added
- Comprehensive BBF Enterprise branding to replace generic SaaS UI.
- High-density manufacturing tables in detail drawers and main BOM grids.

### Changed
- `dashboard.jsx` stripped of oversized KPI marketing cards in favor of a dense, professional engineering layout.
- `BomEditorScreen.jsx` updated to reclaim vertical real-estate by removing the oversized ribbon.

### Fixed
- Fixed 38 backward-compatible `window.*` shims after module refactoring.
