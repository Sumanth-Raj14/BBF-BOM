# Requirements management — writeup

## What shipped

Backend:
- `backend/app/models/requirement.py` — `Requirement` (key/title/description/type/status/priority/
  parent_id/version, tenant-scoped), `RequirementPartLink`, `RequirementBomLink` (both tenant-scoped
  link tables, unique per tenant+pair).
- `backend/app/schemas/requirement.py` — Create/Update/Response + link schemas.
- `backend/app/api/endpoints/requirements_api.py` — CRUD (`GET/POST /requirements`,
  `GET/PUT/PATCH/DELETE /requirements/{id}`), traceability (`GET/POST/DELETE
  /requirements/{id}/parts[/{part_id}]`, same for `/boms`), reverse lookup
  (`GET /requirements/by-part/{part_id}`), and coverage (`GET /requirements/coverage`).
  Registered in `api_v1.py` (prefix `/requirements`) and `endpoints/__init__.py`.
- `backend/alembic/versions/055_requirements.py` — creates `requirements`,
  `requirement_part_links`, `requirement_bom_links`, revision `055_requirements`,
  down_revision `054_uom_conversion`. RLS-guarded the same way migration 051 is.
- Model/schema registered in `app/models/__init__.py` / `app/schemas/__init__.py` (required for
  `register_tenant_listeners()` and for the aggregate schema imports to see the new types —
  same plumbing every other feature router needs).

Frontend:
- `frontend/api.js` — added `requirementAPI` (list/get/create/update/delete/coverage/byPart/
  linkedParts/linkPart/unlinkPart/linkedBoms/linkBom), registered as `api.requirement`.
- `frontend/src/components/screens/RequirementsScreen.jsx` — list + filters (status/type), create
  modal, detail panel with description + linked-parts panel (link/unlink by part ID, shows an
  honest "uncovered" message when empty), and a Coverage modal driven by the real
  `/requirements/coverage` response. Honest empty/error states, no fabricated rows.
- Registered in the three registry files (my exclusive files this wave):
  `LazyScreens.jsx` (lazy import), `NavRail.jsx` (Quality section, id `requirements`),
  `screens/App.jsx` (import + `<Route path="/requirements">`).

## How a user reaches it

Nav rail → Quality section → "Requirements" → `/requirements`. Same `GenericScreen` +
lazy-screen wiring as Deviations/Traceability.

## Scope cut (said out loud)

BOM-linking (`/requirements/{id}/boms`) exists on the backend and in `api.js` but has no UI
panel — parts are the traceability link that matters for v1 (Arena/Teamcenter differentiator
is part-level coverage). Add a BOM-link panel to the screen if that becomes a real ask.

## Tests / proof

Backend — `backend/app/tests/test_requirements.py`, run against an isolated scratch SQLite DB
(`TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_req_<pid>.db`, deleted after each run — never
touched bom_db/sweep.db). 8 tests, all passing:
- CRUD (create/get/update/delete, 404 on missing).
- Hierarchy: `parent_id` set on create, `parentId` filter on list.
- **Both traceability directions in one test**: link a requirement to a part, confirm it shows
  up via `GET /requirements/{id}/parts` (forward) AND `GET /requirements/by-part/{part_id}`
  (reverse); duplicate link returns 409; unlink removes it from both directions.
- BOM link (create + list).
- Coverage: a covered and an uncovered requirement created side by side; asserts the uncovered
  one appears in `/requirements/coverage` and the covered one does not.
- Tenant isolation: two real (non-superuser, permission-granted) scoped users in different
  tenants; tenant 2 cannot see tenant 1's requirement in its list nor fetch it by ID (404);
  tenant 1 still sees its own. Uncovered two pre-existing test-infra footguns along the way
  (documented in the test's docstrings, not fixed outside my files): `get_current_user` prefers
  the `access_token` cookie over an explicit `Authorization` header, so a shared test client
  logging in as two users needs the stale cookie stripped between logins; and login's
  by-email lookup runs under whatever ambient tenant context the previous request left set, so
  a second scoped login right after a first needs `no_tenant_filter()`.

Frontend — `frontend/src/__tests__/RequirementsScreen.test.jsx`, `npx vitest run`, 6 tests, all
passing: renders real rows from a mocked `/requirements` list, opens the detail panel and shows
a real linked part, shows the honest "uncovered" message when a requirement has no linked
parts, explicit empty state, explicit error state (no fallback to sample data), and the
Coverage modal rendering a real uncovered requirement from a mocked `/requirements/coverage`
response.

Did not run `vite build` (per instructions — controller runs the authoritative build) or touch
`bom_db`/`sweep.db`.
