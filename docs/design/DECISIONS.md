# Build Decisions — Enterprise Transformation

**Date:** 2026-07-17 · **Status:** locked (govern the XL-architectural + UI-refinement builds)

Resolved with the stakeholder to unblock the remaining build. See the design briefs in
`docs/design/` and `docs/audit/`. Principle: **local-first** (on-prem/in-house primary, cloud optional).

## XL architectural
| # | Decision | Choice |
|---|----------|--------|
| 1 | Canonical BOM model | `BOM`/`BOMItem` (`bom_items_master`) is the single source of truth; build the missing instance-line CRUD; editor persists BOM lines there (NOT the global Part); template model stays a library. |
| 2 | Existing BOM data | **Clean cutover** — structural edits were never persisted; start fresh. |
| 3 | Deprecated PO model | **Drop `PurchaseOrder` now** (fix the column-drifted `consolidate_po.py`, dry-run, remove). `POHeader`/`POLineItem` canonical. |
| 4 | RLS | **Build now, flagged + staged**: `SET LOCAL app.current_tenant` per txn (survives pgbouncer transaction pooling), `FORCE ROW LEVEL SECURITY` (app owns tables), Postgres-only test track. |
| 5 | Quantity precision | `Integer` → `Numeric(10,4)` (fractional quantities). |
| 6 | Money precision | `FLOAT` → `Numeric` on all cost/price columns. |
| 7 | Unique keys | Business keys (pn, bom_number, poNumber, serial, eco_number, …) → composite `(tenantId, key)`. |
| 8 | Regulatory depth | **Defer** full 21 CFR Part 11 e-sign + RoHS/REACH substance model to a later regulated-features build; keep the surgical ECO guardrails from P0. |

## UI refinement
| # | Decision | Choice |
|---|----------|--------|
| 1 | Accent | Two-tone: BBF olive `#B5BC38` decorative + AA-compliant orange (~`#e85d1f`) for interactive/text/focus + a darker `--accent-text`. |
| 2 | Typeface | Geist + Geist Mono, self-hosted (no CDN). |
| 3 | Dark mode | Cut the broken toggle now; build real AA dark mode later. |
| 4 | A11y mode | Remove the dead high-contrast/colorblind toggle; meet WCAG AA + full keyboard/ARIA in the foundation; dedicated modes later. |
| 5 | Nav/IA | Labeled collapsible rail (~240px, collapsible to icons, visible section headers); promote ~8–12 top-level, nest the rest, absorb the avatar-menu features. |
| 6 | Density | 3-step (dense/normal/comfortable); default **dense on data grids** (Parts, BOM), normal elsewhere. |
| 7 | Content width | Centered ~1360–1440px for reading/card/form screens; full-bleed for BOM/Parts data grids. |
| 8 | Tweaks panel | Refactor `.twk-*` controls onto app tokens (one visual language) — low priority. |
| 9 | Benchmark | Blend of all four: **Linear** (baseline density/restraint/feel) · **GitHub** (dense tables/IA) · **Fusion Manage + OpenBOM** (PLM domain surfaces) · **Jira** (work-management boards/queues/admin). |

## Build approach
Foundation-first for UI (tokens+components → screen sweep → a11y). Backend order: integrity hygiene (money/qty/keys) → X1 → RLS. Independent workstreams run on parallel worktrees; the interdependent backend core stays sequential.
