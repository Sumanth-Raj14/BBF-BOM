# bulk-import-tenancy fixes

File: `backend/app/api/endpoints/bulk_import.py`
Tests: `backend/app/tests/test_bulk_import.py` (4 new tests appended)
`backend/app/models/bulk_import.py` — **not touched**, no status value needed to change.

## 1-3. CRITICAL — cross-tenant IDOR/mutation on `/status`, `/errors`, `/process`

All three built a plain `select(BulkImportJob).where(BulkImportJob.id == job_id)`
with no tenant predicate, then a second unscoped select on `BulkImportRow`.
`/process` then wrote to those rows and committed — a cross-tenant mutation,
not just a read.

Fix: added `current_user: User = Depends(get_current_user)` to all three, and
replaced the manual job lookup with the existing `_get_job_or_404(db, job_id,
current_user.tenantId)` helper (already used correctly by `/mapping` and
`/commit`). Added `BulkImportRow.tenantId == current_user.tenantId` to every
rows query in all three endpoints.

## 4. HIGH — `GET /all/status` unscoped across every tenant

Decision: **deleted the route**, did not scope it. It had zero callers
anywhere in the codebase (frontend only calls `/mapping`, `/commit`,
`/jobs`), and its own neighbouring docstring already admitted it was "not
safe for a tenant-facing UI to call." Dead, dangerous, unused surface —
adding a tenant filter would just be resurrecting a route nobody asked for.
`/jobs` already provides the tenant-scoped equivalent. Updated `/jobs`'s
docstring to record why the old route is gone instead of pointing at it.

## 5. HIGH — `/process` writes a status value the DB CHECK constraint forbids

`job.status = "completed" if errors == 0 else "completed_with_errors"` —
`"completed_with_errors"` is not in `ck_bulk_import_jobs_status`
(pending/processing/completed/failed/cancelled/uploaded). Any row erroring
made the endpoint's own `await db.commit()` raise `IntegrityError` (confirmed
in the red-before run below), turning a partial-failure response into a 500.

Fix: always `job.status = "completed"`, matching `commit_import`'s existing
comment/approach; `errorRows`/`processedRows` on the response conveys the
partial-failure detail. No model/migration change needed — the constraint
was already correct, the endpoint was writing an out-of-range value.

## Tests added (all FAIL against pre-fix code — verified, not asserted)

- `test_status_refuses_other_tenant`
- `test_errors_refuses_other_tenant`
- `test_process_refuses_other_tenant` (also asserts tenant A's row is
  unmutated afterward)
- `test_process_completes_without_integrity_error_on_bad_row` (forces a row
  into the except branch by nulling `rowData`, asserts 200 + `status ==
  "completed"` + `errorRows == 1`, not a 500)

New fixtures `second_tenant` / `user_t2` / `auth_headers_t2` mirror the
existing pattern in `test_derivatives.py` — a real second tenant + real
second logged-in user, so tenant scoping is exercised through the actual
per-request auth path (`get_current_user` → JWT `tenantId` claim →
`TenantContext`), not just a second DB row under the same ambient test
context.

### Red-before verification (done, not skipped)

Temporarily restored the original endpoint code (saved the fixed file
first), ran the 4 new tests against it:

```
4 failed:
test_status_refuses_other_tenant   -> 200 (leaked tenant A's job+rowData)
test_errors_refuses_other_tenant   -> 200 (leaked tenant A's error rows)
test_process_refuses_other_tenant  -> 200 (mutated tenant A's job/rows)
test_process_completes_without_integrity_error_on_bad_row
    -> sqlite3.IntegrityError: CHECK constraint failed:
       ck_bulk_import_jobs_ck_bulk_import_jobs_status
```

Then restored the fix and reran:

```
backend/app/tests/test_bulk_import.py -> 21 passed (17 original + 4 new)
backend/app/tests/test_integration.py -> 5 passed
```

Scratch SQLite DBs (`scratch_bulkimport_red.db`, `scratch_bulkimport_green.db`,
`scratch_bulkimport_integ.db`) all deleted after the runs. Live `sweep.db` /
Postgres `bom_db` were never touched.

## Out of scope, not touched

- `compliance_api.py`, `substance_compliance_api.py`, `analytics.py`,
  `budgets.py`, `dashboards_api.py`, `order_tracking.py`, `DiffScreen.jsx`,
  `supplier_portal` — per instructions, another wave owns these.
- The MEDIUM finding from the audit doc ("`/process` is a second import path
  that never writes `Part` rows") was not in this task's assigned list (3
  CRITICAL + 2 HIGH only) and was left as-is.
