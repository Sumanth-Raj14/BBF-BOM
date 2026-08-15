# JOB: requirements-and-supplier

## JOB A — requirements coverage pagination

`GET /requirements/coverage` previously returned an unbounded `uncovered` list.
Reused the existing `paginate()` helper (`app/core/pagination.py`, already used
by `list_requirements`) instead of inventing a new pagination shape.

- `backend/app/api/endpoints/requirements_api.py`: `coverage()` now takes
  `page: PageParams = Depends(get_page_params)`, runs the uncovered query
  through `paginate()`, and merges in `total_requirements` (all requirements,
  via `COUNT(*)`) and `covered_count`. Response now: `items`, `uncovered`
  (alias of `items`, kept for a smaller frontend diff), `page`, `per_page`,
  `total_pages`, `has_next`, `has_prev`, `total` (TRUE uncovered count, not
  `len(this page)`), `total_requirements`, `covered_count`.
- `frontend/api.js`: `requirementAPI.coverage` now takes `params` and builds a
  query string (`?page=&per_page=`), matching the `list` wrapper's pattern.
- `frontend/src/components/screens/RequirementsScreen.jsx`: `loadCoverage`
  takes `(pageNum, append)`; coverage modal shows "Showing {shown} of {total}
  uncovered" using the true total, and a "Load more" button appears whenever
  `has_next` is true, appending pages instead of replacing (so a partial page
  is never presented as exhaustive). Coverage summary line switched from
  `coverage.total` to `coverage.total_requirements` to keep meaning "X of Y
  requirements covered" correct.

## JOB B — /supplier-portal 403 for admin

**By design, not a bug.** `get_current_supplier_user` (backend/app/api/
endpoints/supplier_portal.py) requires a JWT whose `sub` claim starts with
`supplier_` — a separate token realm issued only by `POST /supplier-portal/
login`. A regular admin session never holds that token, so `GET /price-
updates` correctly 403s for an admin. The 403 (not 401) is deliberate too, per
the comment already in the code: 401 would make the app's shared API client
treat it as an expired session and log the admin out.

This had already been fixed in the frontend in an earlier session — verified,
not re-implemented: `SupplierPortalScreen` (`frontend/src/root/
integration-screens.jsx`) tracks `priceUpdatesForbidden` from a 403 on
`listPriceUpdates()` and renders an honest `EmptyState` ("Not available for
your role" / "Price update submissions are visible from a supplier login, not
an admin session...") instead of a failed/empty table. A frontend test
(`frontend/src/root/__tests__/SupplierPortalScreen.test.jsx`) already covered
this and passes.

## Tests added (both pass)

Ran from `backend/`, `TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_job_ab.db
python -m pytest app/tests/test_requirements.py app/tests/test_supplier_portal.py -q`
— **23 passed** (2 new + 21 pre-existing). Scratch DB deleted after.

- `backend/app/tests/test_requirements.py::test_coverage_paginates_with_a_true_total`
  — creates 3 uncovered requirements, pages with `per_page=2`: page 1 has 2
  items but `total==3` and `has_next==True`; page 2 has 1 item, `total==3`,
  `has_next==False`. Proves the true total is never `len(this page)`.
- `backend/app/tests/test_supplier_portal.py::test_admin_session_gets_403_not_401_on_price_updates`
  — hits `GET /supplier-portal/price-updates` with a normal admin
  `auth_headers` token, asserts 403. Locks the by-design contract in so it
  can't silently regress to a 401 (which would log admins out) or an
  accidental 200.

Frontend: `frontend/src/__tests__/RequirementsScreen.test.jsx` updated (2
tests: single-page coverage view + a paging test that accumulates pages and
updates the "Showing N of total" text) and
`frontend/src/root/__tests__/SupplierPortalScreen.test.jsx` (pre-existing,
unchanged) — both green: `npx vitest run
src/__tests__/RequirementsScreen.test.jsx
src/root/__tests__/SupplierPortalScreen.test.jsx` -> 8 passed.

## Note: legacy `backend/tests/` dir is broken, unrelated to this job

`backend/tests/` (top-level, distinct from the authoritative `backend/
app/tests/`) has a stale `AsyncClient(base_url="http://test")` that
`TrustedHostMiddleware` rejects with 400 ("Invalid host header") — confirmed
this breaks even pre-existing tests there (`test_api.py`, `test_rbac.py`),
unrelated to this change. `backend/app/tests/` is the real, CI-authoritative
suite (per `TEST_FAILURES_TRIAGE.md` — "634 passed" gate) and is what these
new tests were added to and run against.
