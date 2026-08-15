# export-backend build writeup

## What was built

1. **`backend/app/services/export_service.py` (new)** — single export engine for
   `bom | parts | vendors | purchase_orders` -> `csv | xlsx | pdf | json`.
   - `COLUMNS` dict is the single source of truth for the column catalogue
     (key/label/default) per entity — backs `GET /export/columns` and all
     column validation/ordering, so the UI's picker and the renderer can never
     disagree.
   - `resolve_columns()` validates `columns` against the catalogue -> `400` on
     any unknown key (not silently dropped); falls back to the entity's
     default columns (bom's default list drops `level` when `indented=False`).
   - `validate_filters()` allow-lists filter keys per entity -> `400` on
     anything else.
   - `_rows_bom()` fetches `BOMItem` (canonical `boms`/`bom_items_master`,
     joined to `Part`), tenant-scoped, drops `exclude_from_bom` subtrees and
     (when `include_sub_assemblies=False`) non-root items, then does a
     parent-first DFS (siblings by `sort_order`/`id`) for correct
     parent-child order. Reuses `bom_service._compute_levels_and_effective_qty`
     / `_drop_excluded_subtrees` / `get_bom_or_404` rather than re-deriving
     level/roll-up logic. `indented=True` -> `quantity` is the effective
     (roll-up) quantity; `indented=False` -> raw line quantity.
   - `_get_conversion_rate()` looks up `ExchangeRate` (USD -> target,
     tenant-scoped, latest `effective_date`); **no rate on file -> `400`**,
     never a fabricated 1:1 conversion.
   - `render_export()` is the one orchestrator every route below calls.

2. **`POST /api/v1/export`, `GET /api/v1/export/columns`,
   `GET/POST /api/v1/export/templates`, `DELETE /api/v1/export/templates/{id}`**
   — added to `export_report.py` exactly per the shared contract. Template
   merge: `body.model_fields_set` identifies which fields the caller
   explicitly set; the saved template's `config` fills in only the rest
   (explicit always wins), per contract.

3. **Fixed the broken BOM export SQL** in `export_report.py`'s
   `/export/bom/xlsx` and `/export/bom/pdf` (the legacy `bom_templates` +
   `bom_items` pair, keyed by `template_id` — a different, older system from
   the canonical `BOM`/`BOMItem` used by `entity="bom"` above). It was
   selecting `pn/name/uom/category/vendor/cost` directly off `bom_items`,
   which has none of those columns — every call 500'd. Now joins
   `bom_items` -> `parts` on `partId`, and also emits `referenceDesignator`
   (previously emitted by no export).

4. **`bom_enterprise.py`'s `POST /{bom_id}/export`** now delegates to
   `export_service.render_export(entity="bom", ...)` and streams the real
   file — it no longer accepts `format` and silently returns JSON regardless.
   `format=excel` (this endpoint's historical alias) maps to `xlsx`.

5. **Back-compat routes** `/export/parts/xlsx`, `/export/parts/pdf`,
   `/export/vendors/xlsx`, `/export/vendors/pdf`, `/export/pos/xlsx` now
   delegate to `export_service` instead of duplicating openpyxl/reportlab
   code. Bonus fix found along the way: the *old* vendors raw-SQL selected
   `contact, email, phone, category, rating, status, paymentTerms` — none of
   which exist on the `vendors` table (checked against `Vendor` model +
   migration `001_initial`); that route was already silently broken (500).
   Routing it through the ORM `Vendor` model fixes it as a side effect.
   `/export/summary` untouched (works, no format param).

6. **`ExportTemplate` model** (`backend/app/models/export_template.py`,
   tenant-scoped, `config` JSON) + **`alembic/versions/051_export_templates.py`**
   (head was `050_rfq_headers_created_by_nullable`; new head is
   `051_export_templates`; includes the same RLS-backstop helper pattern used
   by migrations 045/046).

## Proof

`backend/app/tests/test_export_service.py` — 13 tests, all passing against a
scratch SQLite DB (`TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_*.db`,
deleted after each run):

- CSV honours requested column **order** (`["name","pn"]` -> header
  `Name,Part Number` and rows follow).
- Unknown column -> `400` with the bad key named in the response body (not
  silently dropped).
- Unknown `entity` / `format` -> `400`.
- `xlsx` export loaded back with `openpyxl.load_workbook` and asserted on
  real header/cell values (a real, readable workbook, not just "some bytes").
- Indented BOM export: 2-level tree (parent qty 2, child qty 3) -> levels
  `[1,2]`, quantities `[2.0, 6.0]` (child's EFFECTIVE/rolled-up qty =
  3*2, not raw 3).
- Flat BOM export: same tree -> quantities `[2.0, 3.0]` (raw line qty).
- `entity="bom"` without `bom_id` -> `400`.
- Tenant isolation: a second tenant's part is invisible to `entity="parts"`
  export even when it shares the same DB and request path.
- Template CRUD end-to-end, including explicit `format` overriding a saved
  template's `format` on the same request.
- Currency conversion with no `ExchangeRate` on file -> `400` (no fabricated
  rate).
- `bom_enterprise.py`'s `POST /{bom_id}/export?format=csv` returns a real
  `text/csv` body containing the part number (proves the format param is
  now honoured, not ignored).

Also re-ran the pre-existing suites most likely to be touched by this change
— `test_export_report.py`, `test_bom_enterprise.py`, `test_bom_mass_rollup.py`,
`test_bom_core_correctness.py`, `test_bom_closure.py`,
`test_tenant_select_isolation.py` — **25 passed, 0 failed** (no regressions).

`python -m alembic heads` -> single head `051_export_templates` (no branch).

Command used (from `backend/`):
```
TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_export_test.db python -m pytest app/tests/test_export_service.py -q
```
Scratch DB files deleted afterward.

## Files touched (all within the assigned ownership list)

- `backend/app/services/export_service.py` (new)
- `backend/app/api/endpoints/export_report.py`
- `backend/app/api/endpoints/bom_enterprise.py` (only `export_bom`, plus the
  three imports it needed: `io`, `StreamingResponse`, `export_service`)
- `backend/app/models/export_template.py` (new)
- `backend/alembic/versions/051_export_templates.py` (new)
- `backend/app/tests/test_export_service.py` (new)

## One necessary touch outside the strict file list

Added a single import line to `backend/app/models/__init__.py`
(`from app.models.export_template import ExportTemplate`) — every other model
in this codebase is registered there so `Base.metadata` (and the tenant
isolation listeners, which walk `TenantAwareMixin.__subclasses__()`) sees it;
skipping this would make the new table invisible to `create_all()`/Alembic
autogenerate parity and to tenant isolation. No other line in that file was
touched.

## Deviations from a literal contract reading

- **`PageParams`** was not used — export returns the full filtered result set
  as one file (that's the point of an export), not a paginated page.
- Two BOM export systems now coexist by necessity: the shared contract's
  `entity="bom"` (canonical `BOM`/`BOMItem`, keyed by `bom_id`) and the legacy
  `/export/bom/xlsx|pdf` (`BomTemplate`/`BomItem`, keyed by `template_id`).
  They query different tables with different keys — merging them would
  change the legacy routes' input contract. Per the task's own wording ("FIX
  the broken BOM export SQL" as a separate bullet from "keep the existing
  ...-style routes working... via the new service"), the legacy pair got a
  direct SQL fix instead of being rerouted through `export_service`.
- Money-column currency conversion only touches columns actually present in
  the resolved column list for a given call (cheaper, same observable result).
