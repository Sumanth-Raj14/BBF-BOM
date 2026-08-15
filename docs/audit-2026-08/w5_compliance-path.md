# compliance-path — doubled `/compliance/compliance` segment + 500s

## Root cause of the doubling

`backend/app/api/api_v1.py` mounts the compliance router with
`prefix="/compliance"` (line 350) — that part was always correct and was
**not** touched. The bug was on the router side:
`backend/app/api/endpoints/compliance_api.py` declared every route with the
prefix baked in again, e.g. `@router.get("/compliance/packs")`. Combined
with the router-mount prefix, the effective path became
`/api/v1/compliance` + `/compliance/packs` = `/api/v1/compliance/compliance/packs`.

`frontend/api.js` was not the bug — it had been *deliberately* written to
call the doubled path, with a comment saying so explicitly ("Backend mounts
the compliance router under the /compliance prefix and its routes are
themselves /compliance/..., so the effective base is doubled"). That is, a
previous change worked around the backend bug in the client instead of
fixing the router. `substance_compliance_api.py` (the other compliance
module, mounted at `/substance-compliance`) never had this problem — its
routes are correctly relative (`/substances`, `/parts/{id}/composition`,
etc.), and `substanceComplianceAPI` in `api.js` was already correct.

## Fix

- `compliance_api.py`: stripped the redundant `/compliance` prefix from
  all 12 routes (`""`, `"/{compliance_id:int}"`, `"/packs"`,
  `"/packs/{pack_id}"`, `"/parts/{part_id}"`,
  `"/parts/{part_id}/certify"`, `"/dashboard"`).
- `api.js`: `complianceAPI` now calls the corrected single-prefixed paths
  (`/compliance`, `/compliance/packs`, `/compliance/parts/{id}`, etc.) and
  the stale comment was removed.
- `api_v1.py`: unchanged (the mount was already correct).

### Route enumeration (compliance_api.py, mounted under `/api/v1/compliance`)

| Method | Before (broken)                                  | After (fixed)                     |
|--------|---------------------------------------------------|------------------------------------|
| GET    | `/api/v1/compliance/compliance`                    | `/api/v1/compliance`               |
| POST   | `/api/v1/compliance/compliance`                    | `/api/v1/compliance`               |
| GET    | `/api/v1/compliance/compliance/{id}`               | `/api/v1/compliance/{id}`          |
| PUT    | `/api/v1/compliance/compliance/{id}`               | `/api/v1/compliance/{id}`          |
| PATCH  | `/api/v1/compliance/compliance/{id}`               | `/api/v1/compliance/{id}`          |
| DELETE | `/api/v1/compliance/compliance/{id}`               | `/api/v1/compliance/{id}`          |
| GET    | `/api/v1/compliance/compliance/packs`              | `/api/v1/compliance/packs`         |
| POST   | `/api/v1/compliance/compliance/packs`              | `/api/v1/compliance/packs`         |
| GET    | `/api/v1/compliance/compliance/packs/{pack_id}`    | `/api/v1/compliance/packs/{pack_id}` |
| GET    | `/api/v1/compliance/compliance/parts/{part_id}`    | `/api/v1/compliance/parts/{part_id}` |
| POST   | `/api/v1/compliance/compliance/parts/{id}/certify` | `/api/v1/compliance/parts/{id}/certify` |
| GET    | `/api/v1/compliance/compliance/dashboard`          | `/api/v1/compliance/dashboard`     |

`substance_compliance_api.py`'s 11 routes are unchanged before and after (they were never doubled). No route collisions: `packs`/`dashboard` are literal
segments and `{compliance_id:int}` only matches integers, so declaration
order was never ambiguous.

## Why they still 500'd even at the right path — reproduced against the live SQLite backend

Logged into `127.0.0.1:8000` (admin@blackbox.com), curled the (then-live,
unfixed) doubled paths, got 500s, and matched the request tracebacks in
`backend/sweep_final.log`. Two distinct Postgres-only SQL problems, both
dialect-independent bugs, not test-suite artifacts of the documented ~6
Postgres-only exceptions (those are elsewhere — analytics/budgets/dashboards
handled by other jobs):

1. **`GET /compliance/packs` (and `/packs/{id}`, and the pack-create fetch)**
   — `json_agg(json_build_object(...) ORDER BY ... ) FILTER (WHERE ...)`
   plus a `'[]'::json` cast. `json_agg`/`json_build_object`/`FILTER` don't
   exist as SQLite functions, and `::json` isn't valid SQLite cast syntax.
   SQLite error: `unrecognized token: ":"`.
   **Fix**: dropped the raw-SQL JSON aggregation entirely. Added
   `_fetch_packs()` which does a plain pack query + a plain
   `compliance_pack_items` query and assembles the checklist in Python.
   Portable to both dialects, no per-dialect branching needed, and it's a
   *shorter* diff than trying to hand-write a SQLite-flavored
   `json_group_array`/`json_object` equivalent.

2. **`GET /compliance/parts/{id}` and `POST /compliance/parts/{id}/certify`**
   — `pc.certification_date::text, pc.expiry_date::text` (and same in the
   `RETURNING` clause). `::text` is Postgres-only cast syntax; SQLite's
   parser chokes on the bare `:` the same way (`unrecognized token: ":"`) —
   this is exactly the reported x9 traceback in `sweep_final.log`.
   **Fix**: replaced `::text` with ANSI `CAST(... AS TEXT)`, with explicit
   `AS <original_name>` aliases (SQLite, unlike Postgres, doesn't preserve
   the source column name through a `CAST` expression).

3. **Bonus, same file/same bug class, found while reading the module** (not
   in the sweep's reported list, since the crawler evidently never hit this
   one via the doubled path, but it is reachable through the exact same
   frontend call and would have re-surfaced the moment the doubled-path bug
   was fixed):
   - `compliance_dashboard`: `CURRENT_DATE + INTERVAL '90 days'` is
     Postgres-only interval arithmetic. Fixed by computing the cutoff date
     in Python (`date.today() + timedelta(days=90)`) and binding it as a
     parameter — portable, and skips SQL date-arithmetic dialect
     differences entirely.
   - `update_compliance`: `"updatedAt" = NOW()` is Postgres-only; replaced
     with ANSI `CURRENT_TIMESTAMP`, which both dialects support.

None of these needed "degrade honestly" fallbacks — every one had a
straightforward portable SQL/Python fix, so no endpoint takes a shortcut
that would return a lesser payload on SQLite vs. Postgres.

## Verification

- Reproduced all three failure modes live against `127.0.0.1:8000` /
  `backend/sweep_final.log` before fixing (confirmed exact tracebacks).
- `backend/app/tests/test_compliance_api.py`: rewrote the two tests that
  baked in the doubled path, added a regression test asserting the doubled
  path now 404s, and added coverage for packs (list/create/get, including
  checklist round-trip), part certification status + certify (date
  casts), the dashboard, and the `updatedAt` update path — all exercised
  end-to-end through the FastAPI test client. Ran against a fresh SQLite
  scratch DB:
  `TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_compliance_path.db python -m pytest app/tests/test_compliance_api.py -q`
  → **11 passed**. Scratch DB deleted after.
- Ran `app/tests/test_substance_compliance.py` (the other compliance
  module, untouched) to confirm no regression: **17 passed**. Scratch DB
  deleted after.

## Files touched

- `backend/app/api/endpoints/compliance_api.py` — de-duplicated route
  prefixes; portable SQL fixes (json_agg rewrite, `CAST AS TEXT`,
  `CURRENT_TIMESTAMP`, Python-computed interval cutoff).
- `frontend/api.js` — `complianceAPI` wrappers now call the corrected
  single-prefixed paths.
- `backend/app/tests/test_compliance_api.py` — fixed paths, added
  regression + portability coverage.
- `backend/app/api/api_v1.py` — read only, no changes needed (the mount
  prefix was already correct).
- `backend/app/api/endpoints/substance_compliance_api.py` — read only, no
  changes needed (never had the doubling bug).
