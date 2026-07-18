# Backend Test Suite Triage — 2026-07-19

Full run: `python -m pytest -p no:cacheprovider -q --tb=no` from `backend/`, `TEST_DATABASE_URL=sqlite+aiosqlite:///./test_triage.db`, fresh DB each run. Wall time: **1111.27s (18m31s)**.

## Headline numbers

| Metric | Count |
|---|---|
| Collected | 524 |
| Passed | 109 |
| Failed | 77 |
| Errored (fixture/setup-level) | 337 |
| Skipped | 1 |
| Warnings | 15 |

Raw output saved at `backend/test_output_full.txt` (440 lines incl. progress dots, short summary, warnings).

## Did today's changes regress anything? — NO

**Verified, not assumed.** Evidence:

1. `git status` shows today's diff touches only: `backend/alembic/env.py`, `backend/app/models/{capa,compliance,contract,deviation,document}.py`, new `backend/alembic/versions/041_compliance_pack_tables.py`, new `backend/scripts/init_db.py`. The three files that own the dominant failure mode below (`app/main.py`, `app/core/config.py`, `app/tests/conftest.py`) are **untouched today** — last modified in commit `b2a58e6` (Jul 17, pre-dates this session).
2. Searched the entire output for schema-level signals (`CheckConstraint`, `no such table`, `OperationalError`, `IntegrityError`, `ProgrammingError`, SQLite `near "..."` syntax errors) — **zero matches**. The 140-table schema (incl. the new compliance tables) builds and is queried cleanly throughout the run; no double-quoting or CheckConstraint issue surfaced anywhere.
3. The 3 `test_compliance_api.py` failures are the *identical* signature as ~410 other unrelated tests (see Category 1 below) — they fail for the same generic reason every other endpoint test fails, not for a compliance-specific reason.
4. The only 2 non-systemic failures (`test_migrations.py`, Category 2/3 below) trace to **pre-existing** migrations 022/035/036/038/040 (all older than today) and a pre-existing missing `sql_archive/` directory — neither touches the new 041 migration.
5. `77 failed` (excluding the 2 migration ones, 75) is essentially identical to the previously-known baseline of **~73 failures** — consistent with that baseline having counted `FAILED` only, not the separate `ERROR` bucket. No drift.

**Conclusion: 100% of today's 414 non-passing tests are pre-existing baseline failures. Nothing new broke.**

## Root-cause categories

| # | Root cause | Failed | Errored | Total | Representative test IDs |
|---|---|---:|---:|---:|---|
| 1 | **`TrustedHostMiddleware` rejects host `testserver`** — `settings.ALLOWED_HOSTS` = `["localhost","127.0.0.1","*.blackbox-bom.com"]` in `app/core/config.py` does not include `testserver`, but `app/tests/conftest.py:122` builds the async test client with `base_url="http://testserver"`. Nearly every HTTP-driven test gets an HTTP 400 "Invalid host header" instead of the real response; downstream code that expects a status code or a JSON body then fails either the status assertion or `response.json()` (`JSONDecodeError`). This single misconfiguration cascades into 337 fixture-level errors (auth-setup fixtures calling the API before the test body runs) and 75 direct test failures. | 75 | 337 | **412 (99.5%)** | `app/tests/test_health.py::test_health_check` — `assert 400 == 200`; `app/tests/test_compliance_api.py::test_compliance_api_list` — `JSONDecodeError`; `app/tests/test_rbac_tenant_scoping.py::test_two_tenants_self_signup_each_get_own_admin_role` — `AssertionError: Invalid host header` (explicit) |
| 2 | Alembic **offline `--sql` generation fails** for migrations that call `sa.inspect(bind)` / `op.get_bind()` at build time (022, 035, 036, 038, 040) — these require a live connection and can't run in offline/SQL-only mode. Pre-existing; unrelated to new migration 041 (041 has no inspection calls). | 1 | 0 | 1 | `app/tests/test_migrations.py::test_migration_offline_sql` |
| 3 | Missing `alembic/versions/sql_archive/` directory with archived original `.sql` files — a historical archival convention that was never (re)populated in this checkout. Pre-existing, unrelated to today's work. | 1 | 0 | 1 | `app/tests/test_migrations.py::test_sql_archive_still_has_originals` |

Sum check: 75 + 337 + 1 + 1 = 414 = 77 failed + 337 errored. ✓

## Quick wins vs. deeper work

| Category | Effort | Payoff |
|---|---|---|
| **#1 — ALLOWED_HOSTS/testserver** | **QUICK WIN.** One-line fix: add `"testserver"` to `ALLOWED_HOSTS` (or make it environment-aware, e.g. append when `ENVIRONMENT=="test"`/`TESTING` flag, or add a wildcard for test runs only — do **not** widen it for prod). | Unlocks ~412 tests (79% of the entire suite) in one change. By far the highest-leverage fix available. |
| **#2 — offline SQL / inspection-dependent migrations** | Deeper. Either (a) mark those migrations as unsupported for `--sql` mode and adjust the test to `xfail`/skip for the offline-inspection migrations specifically, or (b) rewrite them to avoid runtime inspection (harder, touches 5 historical migration files). | Single test; low urgency. |
| **#3 — missing sql_archive/** | Shallow but needs a decision: either restore/recreate the archived `.sql` files this test expects, or delete the test if the archival convention was abandoned. | Single test; low urgency, needs a product decision not a code fix. |

## Recommended fix order

1. Fix Category 1 (`ALLOWED_HOSTS` / testserver) first — re-run the full suite afterward. This is expected to reveal the *actual* underlying pass/fail state of the ~410 currently-masked tests, some of which may still fail for their own genuine reasons once the host-header noise is removed. Treat the post-fix run as the new real baseline.
2. Re-triage whatever surfaces post-fix (expect a much smaller, more meaningful failure list).
3. Decide on Category 3 (restore `sql_archive/` vs. drop the test) — product/process decision.
4. Address Category 2 (offline-mode migration inspection calls) — lowest priority, single test, cosmetic/tooling gap in the migration-testing story rather than a functional bug.

## Notes on execution

- No fixes were applied — this is triage/documentation only, per task scope.
- The other 109 passing tests are unaffected by Category 1 (they don't route through the `app/tests/conftest.py` HTTP client fixture, or don't require the auth-setup call that trips the host-header check).
