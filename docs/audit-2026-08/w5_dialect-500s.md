# Job: dialect-500s

Four remaining 500s reproduced against the running sweep backend (SQLite,
`backend/sweep.db`), tracebacks pulled from `backend/sweep_final.log`.

## Classification (all four: (a) Postgres-only SQL, no genuine bugs found)

| Endpoint | Owning code | Offending SQL | Why it's Postgres-only |
|---|---|---|---|
| `GET /api/v1/analytics/dashboard` | `app/api/endpoints/analytics.py::analytics_dashboard` (line 70, `monthly_spend` query) | `SELECT TO_CHAR("poDate"::date, 'YYYY-MM') as month, ...` | `::date` is Postgres's cast operator (SQLite has no `::` token at all — `unrecognized token: ":"`); `TO_CHAR` is a Postgres-only formatting function SQLite doesn't have either. |
| `GET /api/v1/budgets/workspace?period=fy` | `app/api/endpoints/budgets.py::_compute_workspace_budget` (two raw queries) | `"poDate"::date BETWEEN :start AND :end` and `EXTRACT(MONTH FROM "poDate"::date)::int` / `EXTRACT(YEAR FROM "poDate"::date)` | Same `::date` cast issue, plus `EXTRACT(... FROM ...)` is a Postgres-only date part accessor. |
| `GET /api/v1/dashboards/executive` | routes to `app/services/dashboard_service.py::executive_dashboard` (`r_spend` query) — **not** `dashboards_api.py`, which just delegates to the service | `SELECT TO_CHAR("poDate"::date, 'YYYY-MM') as month, ...` | Identical pattern to analytics_dashboard. |
| `GET /api/v1/order-tracking/stats` | `app/api/endpoints/order_tracking.py::tracking_stats` (line 166, `overdue` query) | `WHERE "estimatedDelivery" < NOW()::text` | `::text` cast operator, same SQLite incompatibility. Confirmed the recent tenant-scoping change (`tenant_sql_clause()` / `tc`/`tp`) is **not** the cause — the first tenant-scoped query in the same function (`by_stage`, using the same `tc`/`tp`) executes fine; only the pre-existing `NOW()::text` line fails. |

No genuine (b)-class bugs found in these four — every failure traces to a
`::cast` / `TO_CHAR` / `EXTRACT` token SQLite's parser rejects outright
(`sqlite3.OperationalError: unrecognized token: ":"`), which is exactly the
documented Postgres-only-SQL failure class described in the task brief.

`FILTER (WHERE ...)` aggregate clauses (used in budgets.py and analytics.py's
`project_breakdown` query, unaffected by this job) were checked and DO work
on the SQLite bundled here (3.50.4) — left untouched.

## Fixes applied (all portable — all `poDate`/`estimatedDelivery` columns are
plain `String` columns storing ISO `YYYY-MM-DD` strings, so date-bucketing
can be pushed into Python over a portable `SELECT` instead of relying on any
dialect's date functions)

1. **`app/api/endpoints/order_tracking.py::tracking_stats`** — replaced
   `NOW()::text` with a bound Python `datetime.now(timezone.utc).isoformat()`
   parameter; comparison stays a plain text comparison on both dialects.
2. **`app/api/endpoints/analytics.py::analytics_dashboard`** — replaced the
   `TO_CHAR(...::date, 'YYYY-MM') GROUP BY` query with a plain
   `SELECT "poDate", "poTotal" ...` and Python-side bucketing by
   `str(poDate)[:7]`.
3. **`app/services/dashboard_service.py::executive_dashboard`** — same
   transform as #2 (identical query pattern, this is the code that actually
   backs `/dashboards/executive`; `dashboards_api.py` itself only has a
   thin `@router.get("/executive")` that calls into the service).
4. **`app/api/endpoints/budgets.py::_compute_workspace_budget`** — two
   changes:
   - `"poDate"::date BETWEEN :start AND :end` → `"poDate" BETWEEN :start AND :end`
     with `start`/`end` bound as `.isoformat()` strings instead of `date`
     objects (avoids the cast Postgres needed only because it was comparing
     a text column to real `date`-typed bind params).
   - `EXTRACT(MONTH FROM "poDate"::date)` / `EXTRACT(YEAR FROM ...)` GROUP BY
     replaced with a plain `SELECT "poDate", "poTotal"` and Python-side
     year/month bucketing off the ISO string's own digits.

No numbers are fabricated anywhere — all four endpoints now compute the same
aggregates, just via a portable query + Python reduction instead of
dialect-specific SQL functions. This also means the endpoints now behave
identically on Postgres and SQLite (same code path either way), rather than
degrading — full portability was achievable here since the underlying data
(ISO date strings) sorts and buckets correctly with plain string ops.

## Verification

New test file `backend/tests/test_dialect_500s.py` — seeds a tenant/user
directly (bypassing the rate-limited `/auth/register` endpoint) and two
`po_headers` rows, then hits all four endpoints and asserts `200` plus
correct aggregation (no fabricated data — checks actual seeded totals and
month buckets).

Ran against an isolated scratch SQLite DB (deleted after the run, never
`sweep.db`):

```
TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_dialect500s.db \
ALLOWED_HOSTS='["localhost","127.0.0.1","testserver","test"]' \
python -m pytest tests/test_dialect_500s.py -q
# 4 passed
```

(`ALLOWED_HOSTS` had to be widened for the test run only — the shared
`tests/conftest.py`'s `AsyncClient(base_url="http://test")` sends a `Host:
test` header that `TrustedHostMiddleware`'s default allow-list doesn't cover
in this repo state; this is a pre-existing gap unrelated to this job, worked
around at invocation time rather than edited, since `app/core/config.py` and
`tests/conftest.py` are outside this job's file list. `tests/test_auth.py`
fails the same way today even without any of my changes.)

Did **not** re-verify against the live sweep backend on :8000 — it's running
without `--reload` (per instructions, not restarted), so the fix is not live
there; confirmed via `py_compile` on all four touched files and the passing
pytest run instead.

## Files touched
- `backend/app/api/endpoints/analytics.py`
- `backend/app/api/endpoints/budgets.py`
- `backend/app/api/endpoints/order_tracking.py`
- `backend/app/services/dashboard_service.py`
- `backend/tests/test_dialect_500s.py` (new)

No compliance files touched. No git actions taken.
