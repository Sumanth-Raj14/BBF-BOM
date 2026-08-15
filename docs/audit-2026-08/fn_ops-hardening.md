# ops-hardening — writeup

## 1. Notification queue observability

- `backend/app/monitoring/metrics.py`: added 4 gauges to `MetricsCollector`
  (`notification_queue_last_drain_timestamp`, `_last_drain_success`,
  `_consecutive_failures`, `_last_drained_count`), a `record_notification_drain(success, drained)`
  method, wired into `export_prometheus()`, and a small `Gauge.get()` reader (needed to read
  a gauge's current value back out for `/health/detailed`).
- `backend/app/main.py` `_run_notification_drainer`: every tick now calls
  `metrics.record_notification_drain(...)`. A failure is logged with `exc_info=True` plus the
  running consecutive-failure count, and escalates to `logger.critical` at 3+ consecutive
  failures ("notifications are silently backing up"). The loop's own `try/except` was already
  present and already prevented an exception from killing the scheduler — that part needed no
  change, only the observability.
- `backend/app/monitoring/health.py` `get_detailed_health`: extended (not replaced) with a
  `notificationQueue` block: `lastDrainTimestamp`, `lastDrainSuccess`, `consecutiveFailures`,
  `lastDrainedCount` (from the metrics singleton) plus `pendingEmailCount` — a live
  `SELECT COUNT(*) FROM notifications_queue WHERE channel='email' AND is_sent IS NOT TRUE`.
  Portable SQL (`IS NOT TRUE`, no casts/NOW/INTERVAL) works on both SQLite and Postgres and
  correctly treats NULL as pending. This is a deliberate **global** count, same convention as
  the existing `_check_db_integrity` block in the same function (unscoped row counts across
  tenants) — it's an ops/admin surface, not a tenant-scoped request path.
- Existing `/api/v1/metrics` (Prometheus) and `/api/v1/health/detailed` endpoints were extended
  in place; no new endpoint was added, per the job's instruction.

## 2. BOM explosion at depth

New file `backend/app/tests/test_bom_scale.py`:
`test_deep_wide_bom_explosion_and_rollup_totals_correct` builds a real BOM with a 7-level
single-child "spine" (quantity ×2 per level, so effective quantity compounds deterministically)
and 300 sibling lines of one part attached at the bottom (level 8 → depth 8, 307 items total).
It then runs `get_bom_explosion_via_closure`, `get_quantity_rollup`, and `get_cost_rollup`,
asserting:
- combined runtime < 10s (generous; a genuine quadratic blowup would blow way past this),
- the tree shape is correct (single-child down the spine, 300-wide at the bottom),
- `quantity_rollup`'s total for the leaf part == `300 * 2**6` (hand-computed, not derived from
  the same code path),
- `cost_rollup.total_cost` == the same hand-computed total × unit cost.

Ran against SQLite; completed in well under a second in practice.

**N+1 findings (documented, not fixed — bom_service.py is owned by another agent this wave,
and neither fix is "small"):**
- `get_bom_explosion` (the recursive, non-closure explosion) issues one query per distinct
  *parent* node in the tree via `_build_explosion_tree`'s recursion — genuine N+1 for a bushy
  tree with many internal nodes. `get_bom_explosion_via_closure` (WS5) is the already-built fix
  for exactly this and should be preferred by callers; the recursive version still exists (and
  is asserted identical to it in `test_bom_closure.py`) presumably as the source of truth /
  fallback.
- `get_cost_rollup` calls `await uom_service.extended_cost(...)` once per line inside a Python
  loop. The same-unit case (the overwhelming majority of real BOMs) short-circuits with zero DB
  cost, but a line whose `unit` differs from its cost basis triggers a DB round trip *per such
  line*. `get_quantity_rollup` has the identical shape and already carries a `ponytail:` comment
  flagging it with an upgrade path (thread a conversion cache through `uom_service`); the same
  ceiling applies to `get_cost_rollup` and should get the same treatment when someone next
  touches that file.

## 3. Scheduler shutdown

Found and fixed a real bug: the lifespan teardown called `.cancel()` on all four scheduler
tasks (`_backup_task`, `_integration_drain_task`, `_zoho_poll_task`, `_notification_drain_task`)
but never awaited them before immediately disposing the DB engine — a task could still be
mid-flight against that engine, and cancelled-but-never-awaited tasks produce "Task was
destroyed but it is pending" warnings on interpreter exit.

Fix: extracted `_cancel_scheduler_tasks()` in `backend/app/main.py` — cancels every non-None
task, then `await asyncio.gather(*tasks, return_exceptions=True)` so shutdown genuinely waits
for them (CancelledError is expected and swallowed via `return_exceptions=True`). Lifespan
teardown now calls `await _cancel_scheduler_tasks()` instead of four separate `.cancel()` calls.

Test: `test_cancel_scheduler_tasks_awaits_all_and_swallows_cancellation` in
`test_notification_scheduler.py` — spins up 4 real infinite-loop asyncio tasks, monkeypatches
them onto `app.main`'s module globals, calls `_cancel_scheduler_tasks()`, and asserts every
task is `.done()` and `.cancelled()` with nothing raised — directly reproduces/guards the bug.

## Tests added/extended (all passing, SQLite, scratch DB deleted after)

- `test_notification_scheduler.py`: +`test_successful_drain_updates_metrics`,
  +`test_cancel_scheduler_tasks_awaits_all_and_swallows_cancellation`, extended
  `test_notification_drainer_survives_a_failed_drain` with metric assertions.
- `test_health_auth.py`: +`test_detailed_health_reports_notification_queue_depth`.
- `test_bom_scale.py` (new): +`test_deep_wide_bom_explosion_and_rollup_totals_correct`.

Ran: `test_notification_scheduler.py test_health_auth.py test_monitoring.py test_bom_scale.py`
→ 14 passed. Also reran `test_bom_closure.py` (untouched) → 9 passed, confirming no regression
from the `bom_service.py` read-only reuse.

## Files touched

- backend/app/main.py
- backend/app/monitoring/metrics.py
- backend/app/monitoring/health.py
- backend/app/tests/test_notification_scheduler.py
- backend/app/tests/test_health_auth.py
- backend/app/tests/test_bom_scale.py (new)

`bom_service.py` was NOT modified (read-only), per instructions.
No `frontend/api.js` changes — this job was backend-only observability/tests.
No UI work was touched or needed.
