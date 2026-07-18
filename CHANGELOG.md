# Changelog

All notable changes to the Blackbox BOM Management Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [v1.48.0] - 2026-07-06
### Added
- Comprehensive BBF Enterprise branding to replace generic SaaS UI.
- High-density manufacturing tables in detail drawers and main BOM grids.

### Changed
- `dashboard.jsx` stripped of oversized KPI marketing cards in favor of a dense, professional engineering layout.
- `BomEditorScreen.jsx` updated to reclaim vertical real-estate by removing the oversized ribbon.

### Fixed
- Fixed 38 backward-compatible `window.*` shims after module refactoring.
