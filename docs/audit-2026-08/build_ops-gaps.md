# ops-gaps writeup

## 1. Notification delivery scheduler

`process_notification_queue()` (backend/app/services/email_service.py) was correct but had
zero callers. `app/core/job_queue.py` is a one-shot job queue (bulk import / single emails),
not a periodic scheduler, and is unrelated to draining the NotificationQueue table.

Fix mirrors the existing `_run_integration_drainer` pattern already in `backend/app/main.py`:

- Added `_run_notification_drainer(interval)` to `backend/app/main.py`: a `while True` loop that
  opens its own DB session (`get_session_maker()`), calls `process_notification_queue(db)`, logs
  how many rows it drained, sleeps `interval` seconds, and repeats. A single sequential loop means
  a run can never overlap the next one by construction (no lock needed — ponytail: skip a lock,
  add one only if a future change makes iterations concurrent).
- Wired into `lifespan()`: started via `asyncio.create_task` alongside the other schedulers, and
  cancelled in the shutdown block, same as `_backup_task` / `_integration_drain_task` / `_zoho_poll_task`.
- New setting `NOTIFICATION_QUEUE_DRAIN_INTERVAL_SECONDS` (default 30) added to `backend/app/core/config.py`.
- Exceptions inside one drain are caught/logged and do not kill the scheduler task (verified by test).

Tests: `backend/app/tests/test_notification_scheduler.py`
- `test_notification_drainer_sends_queued_email_and_marks_it_sent` — queues a real
  NotificationQueue row, patches `send_email` to avoid real SMTP, runs the actual
  `_run_notification_drainer` coroutine as a background task, and asserts the email was "sent"
  and the row flipped `is_sent=True`.
- `test_notification_drainer_survives_a_failed_drain` — patches `process_notification_queue` to
  raise, and proves the scheduler keeps ticking (calls it more than once) instead of dying.

## 2. eco_approvals rows never created

Nothing wrote to `eco_approvals` — `perform_eco_action`'s "approve" branch inserted a row for
the *approving* user, but nothing created the *pending* rows an ECO submission is supposed to
generate. `_eco_recipients` had a comment admitting this ("nothing writes those yet") and fell
back to a live role query every time.

Fix, in `backend/app/services/eco_service.py`:
- Factored the existing role lookup (`Role.name.in_(ECO_APPROVER_ROLES)`, `isActive`, tenant-scoped)
  out of `_eco_recipients` into `_resolve_eco_approvers(db, eco)` — no new approver model, reuses
  the same admin/superadmin role gate that `approve` itself already enforces.
- `perform_eco_action`'s `"submit"` branch now creates one pending `EcoApproval` row per resolved
  approver (skipping any approver who already has an open pending row for this ECO, so a
  reject→resubmit cycle reuses the still-open approval instead of piling up duplicates).
- `"approve"` now looks for the current approver's own pending row and fills it in
  (status/comments/signed_at/digital_signature) instead of leaving it dangling forever while
  inserting an unrelated second "approved" row. Falls back to inserting a fresh row only for a
  legacy ECO or an approver acting outside the resolved chain (edge case, not the common path).
- `_eco_recipients("submit")` still reads pending `eco_approvals` first and only falls back to
  the role query if none exist (e.g. a tenant with no eligible approver at submit time) — same
  contract, now normally satisfied by real rows instead of the fallback.

Tests added to `backend/app/tests/test_eco_change_control.py`:
- `test_submit_creates_pending_approval_row_for_designated_approver` — submit creates exactly one
  pending row for the tenant's designated approver, correct `approval_order`/`tenantId`.
- `test_submit_creates_pending_approval_row_per_designated_approver` — two admins on the tenant
  each get their own pending row with distinct `approval_order`.
- `test_approve_fills_in_pending_row_instead_of_duplicating` — approving updates the existing
  pending row in place rather than leaving a stray pending row plus a new approved one.
- All pre-existing eco_change_control / eco_implement tests still pass unmodified.

## 3. Routing read scoping

`backend/app/api/endpoints/routing_api.py`: `list_process_plans` and `get_process_plan` were raw
`text()` SQL with no tenant predicate (the inserts were already fixed). Scoped both with the
existing `tenant_sql_clause` helper exactly like `list_routings`/`get_routing` in the same file:
- `list_process_plans`: `tenant_sql_clause("pp")` appended to the `WHERE 1=1 ...` clause.
- `get_process_plan`: `tenant_sql_clause()` appended to the `WHERE id = :id ...` clause.

Tests added to `backend/app/tests/test_routing_api.py`:
- `test_process_plans_list_scoped_to_tenant` — tenant A's list only shows tenant A's plan, not
  tenant B's.
- `test_process_plan_get_scoped_to_tenant` — tenant A fetching tenant B's plan id gets 404.
- Both use a real non-superuser, tenant-scoped login (`_scoped_login` helper added to the file) —
  the existing `auth_headers` fixture is a superuser, and `User.effective_tenant_id` returns
  `None` for superusers, so requests made with it carry no tenant context at all and would not
  have caught this bug either way.

## Verification

```
cd backend
TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_opsgaps.db python -m pytest \
  app/tests/test_notification_scheduler.py app/tests/test_routing_api.py \
  app/tests/test_eco_change_control.py app/tests/test_eco_implement.py -q
# 23 passed
```
Scratch db deleted after the run. Also did a plain `python -c "import app.main; ..."` to confirm
no import/syntax errors in the touched files.

## Files touched
- backend/app/main.py (lifespan wiring: new `_run_notification_drainer`, task start/cancel)
- backend/app/core/config.py (added `NOTIFICATION_QUEUE_DRAIN_INTERVAL_SECONDS` only)
- backend/app/services/eco_service.py (approval-row creation/consumption + `_resolve_eco_approvers`)
- backend/app/api/endpoints/routing_api.py (tenant scoping on the two reads)
- backend/app/tests/test_notification_scheduler.py (new)
- backend/app/tests/test_eco_change_control.py (3 new tests)
- backend/app/tests/test_routing_api.py (2 new tests + scoped-login helper)

No Alembic migration created. No git commands run. No files touched outside the listed set.
