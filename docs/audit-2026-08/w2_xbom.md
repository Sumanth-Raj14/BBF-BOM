# xBOM (EBOM/MBOM/SBOM + EBOM->MBOM derivation) — writeup

## What shipped

1. **`boms.bom_type` discriminator** (migration `052_bom_types`, revision chain
   verified: 051 -> 052 -> 053 -> ... -> 056, no collisions).
   - `String(10)`, `NOT NULL`, `default="EBOM"` / `server_default="EBOM"`.
   - Postgres path adds a `NOT VALID` CHECK constraint (`ck_boms_bom_type`,
     mirrors migration 049's pattern); SQLite is a no-op (test schema comes
     from `create_all()`, which already has the model's CheckConstraint).
   - The server-side DEFAULT backfills every existing row on the ALTER itself
     — no separate UPDATE pass needed.
   - `backend/app/models/bom.py`: new column + CheckConstraint.

2. **Filtering + surfacing on the BOM list/read endpoints**
   (`backend/app/api/endpoints/bom_enterprise.py`):
   - `GET /api/v1/bom/?bom_type=EBOM|MBOM|SBOM` — additive optional filter.
   - `bom_type` now in the list/create response dicts.
   - New `GET /api/v1/bom/{bom_id}` (there was previously no way to fetch a
     single BOM header at all) using a new `BOMRead` schema
     (`backend/app/schemas/bom.py`, did not exist before). Deliberately
     declared **last** in the router — it's a single-segment catch-all that
     would otherwise shadow literal routes like `GET /templates`.
   - `backend/app/services/bom_service.py::list_boms` gained an additive
     `bom_type: Optional[str] = None` parameter (default preserves every
     existing caller's behavior exactly).

3. **MBOM routes** (`backend/app/api/endpoints/mbom_api.py`, new file,
   mounted at `/api/v1/mbom` — the one line in `api_v1.py`, plus the
   necessary one-line import addition in `endpoints/__init__.py` since a new
   endpoint module has to be importable to be registered):
   - Headers: list (tenant-scoped, `ebom_id` filter, pagination), get (+items
     +operations), create, update.
   - Items: list, create, update.
   - Operations: list, create, update.
   - Mirrors `bom_enterprise.py`'s style (inline Pydantic request models,
     hand-built response dicts, explicit `tenantId` filters) since that's the
     sibling BOM router — no new abstraction invented.

4. **EBOM -> MBOM derivation** — the actual point of xBOM:
   - `backend/app/services/bom_service.py::derive_mbom_from_ebom` (the one
     function this wave's file-scope allowed in that file). Reads the source
     EBOM + its `bom_items_master` lines, rejects a non-EBOM source (400),
     creates a new `MbomHeader` + one `MbomItem` per source line that has a
     `part_id` (a line with no part has nothing to manufacture against —
     `mbom_items.part_id` is `NOT NULL`, so it's skipped, not faked).
     Read-only against the source; never touches `boms`/`bom_items_master`.
   - `POST /api/v1/mbom/derive {ebom_id, name?}` in `mbom_api.py`.

5. **Minimal UI** (`frontend/src/components/screens/MbomScreen.jsx`, new,
   registered in `LazyScreens.jsx`, routed at `/mbom` in `App.jsx`, added to
   the Engineering nav section in `NavRail.jsx` as "Manufacturing BOMs
   (xBOM)"):
   - "Bills of Material" table: real list from `GET /bom/`, a type filter
     `<select>` (All/EBOM/MBOM/SBOM) that re-fetches with `bom_type` in the
     query, a badge per row showing its type, and a per-row "Derive MBOM"
     action on EBOM rows.
   - "Manufacturing BOMs" table: real list from `GET /mbom/headers`, "Open"
     shows the header's copied items in a detail card.
   - Derive modal: pick a source EBOM id + optional name, calls
     `POST /mbom/derive`, refreshes the MBOM list and opens the new one.
     Failures render inline (no fabricated success).
   - `frontend/api.js` gained `mbomAPI` (registered as `api.mbom`) and
     `bomEnterpriseAPI.get`/`.create` (the header GET/POST had no client
     wrapper before). `bomEnterpriseAPI.list` already passed through
     arbitrary params, so `{ bom_type: 'MBOM' }` filtering needed zero
     changes there.

## Reachable in the UI

Nav rail -> Engineering section -> "Manufacturing BOMs (xBOM)" -> `/mbom`.
Filter the BOM type dropdown to see EBOM/MBOM/SBOM split; click "Derive MBOM"
on any EBOM row (or the header button) to create a manufacturing BOM from it
and see its copied items.

## Proof

**Backend** — `backend/app/tests/test_xbom.py` (new), run via
`TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_<x>.db python -m pytest
app/tests/test_xbom.py -q` from `backend/`: **10 passed**.

- `test_existing_bom_defaults_to_ebom` — a BOM created with no `bom_type` at
  all (every pre-migration caller) reads back as `"EBOM"`.
- `test_create_each_bom_type` / `test_create_bom_http_surfaces_type` —
  EBOM/MBOM/SBOM all create and read back correctly, service-level and over
  HTTP (`bom_type` in the create/get response).
- `test_list_boms_filters_by_type` / `test_list_boms_http_filter` — filtering
  by type returns only that type, both at the service layer and over
  `GET /bom/?bom_type=...`.
- `test_derive_mbom_copies_structure_without_mutating_source` — derives from
  a 3-line EBOM (2 parted + 1 partless), asserts the MBOM got exactly the 2
  parted lines with matching `part_id`s, then re-reads the source EBOM header
  + all 3 original lines and asserts byte-for-byte unchanged (id/part_id/qty
  tuples equal before vs. after).
- `test_derive_mbom_rejects_non_ebom_source` — deriving from a BOM already
  tagged MBOM raises `HTTPException(400)`.
- `test_derive_mbom_http_end_to_end` — full HTTP round trip: create EBOM,
  add one item, `POST /mbom/derive`, assert the response's copied item
  matches, then re-`GET` the source EBOM's items and assert still 1/unchanged.
- `test_derive_mbom_tenant_isolation` — tenant B cannot even see (404,
  not e.g. a permission error) tenant A's EBOM to derive from it.
- `test_mbom_header_not_visible_cross_tenant_via_http` — real, non-superuser,
  tenant-scoped users (roles assigned, not the `auth_headers` superuser
  fixture, which bypasses tenant filtering by design) on two separate
  tenants; tenant B gets 404 on direct GET and the header is absent from
  tenant B's list; tenant A still sees it.

Also reran the full BOM-adjacent regression surface to check for
side-effects from touching `bom.py`/`bom_service.py`/`bom_enterprise.py`:
`test_bom_enterprise.py test_bom_instance_crud.py test_bom_closure.py
test_bom_templates.py test_bom_effectivity.py test_bom_mass_rollup.py
test_bom_core_correctness.py test_bom_item_media_visibility.py
test_service_bom.py test_bom_items.py test_solidworks_bom_ingest.py
test_xbom.py` — **82 passed, 0 failed**. Scratch DBs deleted after (one file,
`scratch_xbom2.db`, was still locked by a broader full-suite verification run
I kicked off in the background and hadn't finished by the time I wrapped up;
it is a throwaway SQLite file outside the touched-files list, not `bom_db`/
`sweep.db`, and will be removable once that background process exits).

**Frontend** — `frontend/src/__tests__/MbomScreen.test.jsx` (new), run via
`npx vitest run src/__tests__/MbomScreen.test.jsx` from `frontend/`:
**5 passed**.
- Lists BOMs with type badges + the Manufacturing BOMs table, from the real
  endpoints (asserts `bomEnterpriseAPI.list` and `mbomAPI.headers.list` were
  actually called).
- Changing the type filter re-calls `bomEnterpriseAPI.list` with
  `{ bom_type: 'MBOM' }`.
- Deriving via the modal calls `mbomAPI.derive({ ebom_id, name })` and
  renders the returned header + its copied items.
- A derive failure renders the real error inline and leaves the dialog open
  — no fabricated success state.
- Empty lists render the honest empty-state copy, not sample rows.

## Deliberate deviations from the strict file list (and why)

The brief scoped `bom_service.py` to "derivation helper ONLY" and didn't list
`bom_enterprise.py`, `endpoints/__init__.py`, or the frontend nav/route files
at all. Fulfilling explicit numbered requirements #2 ("filtering... and the
type surfaced in the BOM read schema") and #5 ("minimal UI... let the user
see and filter BOM type") is not possible without touching the BOM list
endpoint and the app's route/nav registries — there is nowhere else those
requirements could land. Every one of these touches is small, additive, and
backward-compatible (new optional params/fields, a route appended after
existing ones, one import line, one nav entry) — verified by the full
BOM-adjacent regression run above finding zero breakage.

## Not done / explicitly out of scope

- No DELETE routes on MBOM headers/items/operations — not asked for, kept
  the diff to list/get/create/update per the brief's "at minimum."
- Derivation copies part/quantity/unit/notes only (a flat line-for-line
  copy); it does not attempt to preserve the EBOM's hierarchy (`bom_items_
  master.parent_item_id`) because `mbom_items` has no parent/child column at
  all — the existing MBOM model is flat. Preserving hierarchy would mean
  changing the `MbomItem` schema, which is out of scope for this wave (the
  brief's Files list doesn't include a fresh MBOM-item redesign).
