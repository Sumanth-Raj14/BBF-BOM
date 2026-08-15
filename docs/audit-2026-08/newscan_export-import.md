# Audit: export-import area

Files read in full:
- backend/app/services/export_service.py
- backend/app/services/import_service.py
- backend/app/api/endpoints/export_report.py
- backend/app/api/endpoints/bulk_import.py
- backend/app/models/export_template.py
- backend/app/models/bulk_import.py (referenced, read for constraint verification)
- backend/app/schemas/bulk_import.py (referenced)

## CRITICAL — Cross-tenant data leak / IDOR in bulk_import.py

Router only requires `Depends(get_current_user)` (any authenticated user, any tenant).
Four endpoints never add a `tenantId` predicate, unlike `_get_job_or_404` used by
upload/mapping/commit/jobs:

1. `GET /{job_id}/status` (bulk_import.py:393-425) — `select(BulkImportJob).where(BulkImportJob.id == job_id)`,
   no tenant filter. Returns full job + all BulkImportRow.rowData (raw imported
   part/vendor data — cost, mpn, vendor names, etc.) for ANY job_id, to any
   authenticated user of ANY tenant. Simple IDOR: increment job_id to read
   another tenant's staged import data.
2. `GET /{job_id}/errors` (bulk_import.py:428-452) — same pattern, same leak, for
   another tenant's row-level error/rowData.
3. `POST /{job_id}/process` (bulk_import.py:283-296) — `select(BulkImportJob).where(BulkImportJob.id == job_id)`,
   no tenant filter, AND then mutates another tenant's `BulkImportRow` rows
   in place (`row.rowData = mapped; row.status = "processed"`) and commits.
   Cross-tenant write, not just read.
4. `GET /all/status` (bulk_import.py:338-357) — deliberately unscoped ("every
   tenant's jobs"), acknowledged unsafe in the very next function's docstring
   ("not safe for a tenant-facing UI to call") yet still routed and reachable
   by any authenticated user of any tenant. Leaks filenames/mappingConfig for
   every tenant's import jobs.

Contrast: `upload`, `/{job_id}/mapping`, `/{job_id}/commit`, `GET /jobs` all
correctly scope via `_get_job_or_404`/`.where(..., tenantId == current_user.tenantId)`.
The unscoped four are the exact "everything except ORM select() auto-filter
must be scoped explicitly" failure mode called out for this codebase — these
ARE ORM selects, but with no tenantId predicate added at all, so the ORM
auto-filter tenant_events.py provides (if any) is not in play here since this
is a manual `.where()` list missing the clause, not a raw text() SQL case.

Frontend (`BulkImportModal.jsx`) only calls `/mapping` and `/commit`, so the
primary React app never exercises the vulnerable endpoints — but they are
live, routed, auth-only API surface (mobile/integrations/direct API callers
would hit them).

## HIGH — `/process` sets a job status value forbidden by the DB CHECK constraint

bulk_import.py:320: `job.status = "completed" if errors == 0 else "completed_with_errors"`.

`ck_bulk_import_jobs_status` (models/bulk_import.py:26-29, restored in
alembic/versions/049_restore_check_constraints.py:45) only allows
`'pending', 'processing', 'completed', 'failed', 'cancelled', 'uploaded'`.
`"completed_with_errors"` is not in that list. Whenever any row in the batch
raises inside the `try` (e.g. `row.rowData` is `None` so `.get()` throws
AttributeError), `errors > 0` and the subsequent `await db.commit()` at
line 322 raises `IntegrityError` (CHECK constraint violation) instead of
returning the response — the endpoint 500s on its own error-reporting path.
`test_bulk_import.py:60` and `test_integration.py:156` both assert
`status in ("completed", "completed_with_errors")` but apparently never
drive a row into the exception branch, so this was never caught by the
self-reported-green tests.

## MEDIUM — `/process` is a second, competing "import" endpoint that never writes Part rows (fabricated success)

bulk_import.py:283-335. Unlike `/commit` (the real, validated, tenant-scoped
upsert path documented at the top of import_service.py and used by the
frontend), `/process`:
- does not call `import_service.validate_row` or any type/enum coercion,
- does not touch the `Part` table at all — it only remaps and rewrites
  `BulkImportRow.rowData` in place and marks rows "processed",
- still returns `BulkImportJobResponse` with `status="completed"` and a
  `processedRows` count, indistinguishable from a real successful import to
  any caller that doesn't know the two endpoints differ.

If any client (other than the current React app) calls this route expecting
an import, it gets a "completed" response and non-zero processedRows while
zero Part records were created or updated — a success response for an
action that did not happen.

## Reviewed, no defect found

- `export_service.py` filter/column handling: filter keys are allow-listed
  per entity (`FILTERS`) and only ever used via `getattr(Model, key) == value`
  inside SQLAlchemy `.where()` — bound parameters, not string interpolation;
  no SQL injection. Column keys are validated against `COLUMNS[entity]`
  before being used to build `column_pairs`.
- Tenant scoping in `_rows_parts/_rows_vendors/_rows_purchase_orders/_rows_bom`
  and in `list_templates`/`get_template_or_404`: all add
  `.where(Model.tenantId == tenant_id)` when `tenant_id is not None`,
  consistent with the rest of this service treating `None` as an explicit
  "no tenant scoping" mode (not exercised via HTTP — every endpoint in
  export_report.py passes `current_user.tenantId`).
- `_get_conversion_rate`: raises 400 rather than silently assuming a 1:1
  rate when no exchange rate is on file — correctly avoids the "silent
  wrongness" currency-conversion antipattern.
- `render_export`/`_rows_bom` BOM tenant check: `if tenant_id is not None and
  bom.tenantId != tenant_id: raise 404` — correct ownership check before
  reading BOMItems.
- Legacy `export/bom/xlsx` and `export/bom/pdf` raw `text()` SQL
  (export_report.py:251-320, 323-418) all bind `:tid`/`:ten` from
  `current_user.tenantId` on every query — correctly tenant-scoped, and the
  comment documents a real prior 500 (querying nonexistent columns on
  bom_items) that was fixed by joining through parts.
- `commit_import`: per-row `async with db.begin_nested()` SAVEPOINT with
  `except IntegrityError` catch matches the documented "one bad row doesn't
  sink the batch" transaction model; upsert key is `pn` scoped by
  `tenantId` — correct natural key, not vulnerable to cross-tenant match.
- `import_service.validate_row`/`validate_mapping_targets`: unknown target
  fields rejected before any DB write; numeric/bool/enum coercion is
  explicit and rejects (does not silently default) bad values.
- `MAX_FILE_SIZE_BYTES` (10MB) and `MAX_ROWS` (20,000) are enforced in both
  `_parse_csv`'s caller (`parse_file`) and inside `_parse_xlsx`'s row loop —
  bounded, not unbounded ingestion.

## Lower-priority / noted but not reported as findings

- `commit_import` does one SELECT + one flush per row (N+1) for up to 20,000
  rows to preserve per-row SAVEPOINT isolation — a real perf cost at the
  documented row ceiling, but appears to be an intentional tradeoff for
  correctness (isolate bad rows), not an oversight. Not reported as a top
  finding.
- `models/bulk_import.py`: `mappingConfig = Column(JSON, default={})` is a
  shared-mutable-default pattern, but every call site replaces the dict
  wholesale (`job.mappingConfig = {...}`) rather than mutating in place, so
  it doesn't currently manifest as a live bug.
