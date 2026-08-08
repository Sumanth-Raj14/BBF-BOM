# Audit: backend/app/tests + backend/tests

## Finding 1 (HIGH): CI's blocking "Test Backend" job runs the legacy/superseded 5-file test suite, not the real 140-file suite

- `.github/workflows/ci.yml:111` — `python -m pytest tests/ -v --tb=short --asyncio-mode=auto --cov=app --cov-report=xml --cov-report=term` with `working-directory: backend` (line 20-21). This resolves to `backend/tests/` (5 files: test_api.py, test_auth.py, test_crud.py, test_rbac.py, test_search.py — roughly 30 tests total).
- `backend/pytest.ini:1-7` explicitly documents this directory as legacy and superseded:
  ```
  # Only app/tests (the canonical suite). The legacy top-level tests/ dir has its
  # own conftest that mutates the shared app (dependency_overrides) + global
  # session maker at import time, leaking into app/tests and flaking cross-dir
  # tests (e.g. webhook delivery). Its coverage is superseded by app/tests. Run
  # `pytest tests/` explicitly if you need the legacy suite.
  testpaths = app/tests
  ```
- Because `ci.yml` passes the explicit path `tests/` to pytest, it overrides `testpaths` and always collects the legacy suite, never `app/tests/` (the ~140-file suite containing essentially all the real regression coverage: RLS/tenant-isolation fixes (A6), tar-slip fix (A7), ERP-honesty (R10), Part-11 e-signatures, money/qty precision, RBAC scoping, etc.).
- Effect: the "Test Backend" job's green checkmark, coverage upload (`--cov=app --cov-report=xml`), and JUnit test-reporter annotation on every PR represent coverage of ~30 superficial tests, not the ~140-file suite the project actually relies on for regression safety. Anyone reading the PR check ("Test Backend: passed", coverage %) is misled about how much of the backend was actually verified. (The real gate is `postgres-ci.yml`, a separate workflow, which correctly omits a path argument and lets `testpaths = app/tests` take effect — but `ci.yml` still runs and reports as if it were the authoritative backend test job.)
- Fix hint: either point `ci.yml`'s test-backend job at `app/tests/` (or drop the explicit path so `pytest.ini`'s `testpaths` applies), or delete/rename the job so it's not the one labeled "Test Backend".

## Finding 2 (LOW/informational): legacy `backend/tests/` uses a real Postgres db literally named `bom_db`

- `.github/workflows/ci.yml:65` sets the Postgres service container's `POSTGRES_DB: bom_db` and `.github/workflows/ci.yml:100` sets `POSTGRES_DB: bom_db` for the test env, whereas every other test path in this repo (backend/app/tests/conftest.py:55, backend/tests/conftest.py:41) defaults to `bom_test_db`. Within GitHub Actions this is an ephemeral, freshly-created service container so it is not the real production database, but the naming is inconsistent with the rest of the codebase's "always use a test-suffixed db name" convention, and is exactly the pattern the audit brief calls out to watch for ("tests pointing at live bom_db"). Flagging as low since in this specific file it's provably an isolated CI container, not prod — but the inconsistent naming is a latent footgun if this env block is ever copied into a non-ephemeral context.

## Reviewed and found clean (no issues)

- `backend/app/tests/conftest.py` — sound: session-scoped engine with per-test rollback + explicit TRUNCATE-based `clean_db` for Postgres (with a documented fix for a former PRAGMA-on-Postgres bug), rate-limit cache resets, tenant-context fixtures. Defaults to a distinct `bom_test_db`/port 5433 unless `TEST_DATABASE_URL` or `CI` is set.
- `backend/app/tests/test_migrations.py` — `xfail`/`skip` markers are legitimate and well-justified in comments (offline SQL generation genuinely unsupported by design; up/down cycle genuinely needs a live Postgres). Not hiding a real failure.
- `backend/app/tests/test_erp_honesty.py`, `test_rls_flag.py`, `test_tenant_select_isolation.py`, `test_backup_tar_slip.py` — all real regression tests with meaningful, specific assertions (not vacuous), each documenting the exact bug they pin.
- `backend/tests/{test_api,test_auth,test_crud,test_search,test_rbac}.py` — individually correct/non-vacuous tests (real endpoint calls, specific status codes and payload assertions); the problem is not their content but that they are the *only* thing `ci.yml`'s gating job runs (Finding 1).
- Sampled ~40 of the 119 "status_code in (...)" grep hits across app/tests/*.py; the ones inspected (test_rls_flag.py, test_crud.py's `test_create_user_admin`) use narrow, justified multi-code assertions (e.g. `(201, 403)` for a permission-dependent creation, or `(200, 307, 404)` explicitly to check "no 500" while tolerating routing variance) — not blanket catch-alls that would mask a real failure.

## Coverage note

Given the scope size (140 files under backend/app/tests + 7 under backend/tests), I read conftest.py files in full for both directories, read the full legacy suite (backend/tests/*.py, 5 files) in full, and read several targeted app/tests files in full (test_migrations.py, test_erp_honesty.py, test_rls_flag.py, test_tenant_select_isolation.py, test_backup_tar_slip.py). For the remaining ~130 files in backend/app/tests I ran targeted greps across the full set for vacuous-assertion patterns (`assert True`, bare `pass`, `skip`/`xfail` markers, TODO/FIXME, catch-all status-code lists, live-DB connection strings) and found no additional hits beyond what's covered above — but I did not read every one of those ~130 files line-by-line, so subtler issues (e.g. an assertion checking the wrong field, wrong fixture reuse) inside files not enumerated above could exist undetected.
