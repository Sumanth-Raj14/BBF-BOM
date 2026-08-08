# Cluster: schema-gates

## 1. RfqHeader.created_by nullable/SET NULL contradiction

**Confirmed real.** `app/models/supplier_portal.py` declared
`created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False, index=True)`.
`ondelete="SET NULL"` promises the RFQ survives its creator's deletion by
nulling the column; `nullable=False` makes that impossible — on Postgres the
FK action fires as `UPDATE rfq_headers SET created_by = NULL ...`, which then
violates the NOT NULL constraint and the whole user-delete transaction
aborts, instead of silently orphaning the RFQ as intended.

**Fix:** `nullable=False` → `nullable=True` in the model
(`app/models/supplier_portal.py:75-78`), plus a new Alembic migration,
`alembic/versions/050_rfq_headers_created_by_nullable.py` (down_revision =
`049_restore_check_constraints`, verified as the true head by tracing the
down_revision chain from `001_initial` — there are duplicate `041_*` filename
prefixes but the chain resolves uniquely to 049). The migration:
`ALTER TABLE rfq_headers ALTER COLUMN created_by DROP NOT NULL`, guarded with
`if bind.dialect.name != "postgresql": return` (SQLite test schema is built
fresh from the model via `create_all()`, so it's already correct) — same
guard pattern as migrations 048/049. A matching `downgrade()` restores
`SET NOT NULL`.

**Repo-wide audit for the same contradiction:** grepped every
`ForeignKey(..., ondelete="SET NULL")` column across `app/models/` (23 hits
in `bom.py`, `audit_log.py`, `compliance.py`, `compliance_evaluation.py`,
`part_composition.py`, `part_country_history.py`, `quality.py`,
`substance.py`, `supplier_portal.py`, `sw_integration.py`, `team.py`,
`user_data.py`, `work_order.py`, `zoho_sync.py`). `rfq_headers.created_by`
was the *only* one with an explicit `nullable=False` — every other SET NULL
FK either omits `nullable` (SQLAlchemy default is `True`) or states
`nullable=True` explicitly. No other model needed the same fix.

## 2. Missing require_engineering gate on create_ecr / create_ecn

**Confirmed real.** In `app/api/endpoints/eco_api.py`, every other ECO
mutation (`create_eco`, `add_eco_item`, `eco_action`, `implement_eco`)
depends on `require_engineering`. `create_ecn` and `create_ecr` only
depended on `get_current_user`, so any authenticated user who merely cleared
the router-level `require_viewer` gate (e.g. a plain "viewer" role) could
issue ECNs/ECRs.

**Fix:** added `current_user: User = Depends(require_engineering)` to both
`create_ecn` and `create_ecr` (`app/api/endpoints/eco_api.py`), matching the
gate every sibling mutation already uses.

## 3. Forgeable userId on audit-log creation

**Confirmed real.** `app/api/endpoints/audit_logs.py::create_audit_log` did
`AuditLog(**log.model_dump())`, and `AuditLogCreate.userId` is a
client-supplied required field — any authenticated user could POST
`{"userId": <someone else's id>, ...}` and have it written verbatim,
forging an audit trail entry under another user's identity.

**Fix:** build the row from `log.model_dump()` but overwrite `userId` with
`current_user.id` (the authenticated caller) before constructing the
`AuditLog`, ignoring whatever the client sent.

## Test: app/tests/test_eco_gates.py (new)

Reuses the non-superuser/role-bearing-user pattern from
`test_eco_change_control.py` (superuser test_user bypasses RBAC entirely, so
it can't exercise `require_engineering`). Creates a "viewer" role user (passes
the router's `require_viewer` gate, fails `require_engineering`) and asserts:

- `POST /api/v1/eco/ecr` as viewer → `403` (was: `201`, RFQ created)
- `POST /api/v1/eco/ecn` as viewer → `403` (was: `404`, request reached the
  eco-lookup instead of being gated)
- `POST /api/v1/audit-logs/` with a forged `userId=999999` in the body →
  `201`, but the response and the DB row's `userId` equal the *authenticated
  caller's* id, not `999999` (was: `999999` written verbatim)

**RED confirmed:** reverted the two eco_api.py dependency changes and the
audit_logs.py fix, reran `test_eco_gates.py` — all 3 tests failed exactly as
predicted:
```
FAILED test_create_ecr_rejects_non_engineering_user  -- create_ecr returned 201, not 403
FAILED test_create_ecn_rejects_non_engineering_user   -- assert 404 == 403
FAILED test_audit_log_userid_forgery_ignored           -- assert 999999 == 1
```
Reapplied the fixes; reran — `3 passed`. Also ran the fixed test file
together with `test_eco_api.py`, `test_eco_change_control.py`,
`test_eco_implement.py`, `test_audit_logs.py` — `22 passed` (an earlier run
in that combination hit a flaky `no such table: timesheet_entries` /
"database schema has changed" SQLite error from the file-based
`test.db` + threaded aiosqlite driver used when `TEST_DATABASE_URL` isn't
set; confirmed unrelated to this change by reproducing it, then getting a
clean pass on an identical immediate rerun, and by reproducing the same
pre-existing suite passing with `test_eco_gates.py` excluded).

## Files touched

- `app/models/supplier_portal.py` — `RfqHeader.created_by` → `nullable=True`
- `alembic/versions/050_rfq_headers_created_by_nullable.py` — new migration
- `app/api/endpoints/eco_api.py` — `require_engineering` gate on
  `create_ecn`/`create_ecr`
- `app/api/endpoints/audit_logs.py` — `userId` forced to
  `current_user.id`
- `app/tests/test_eco_gates.py` — new test, proving all three fixes

No existing migration file was edited. No other files were touched.
