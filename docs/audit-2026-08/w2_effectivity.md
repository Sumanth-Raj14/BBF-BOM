# BOM line effectivity — writeup

## Which BOM table this landed on, and why

The codebase has two parallel "BOM item" concepts:

- `bom_items` (`app/models/bom_item.py`, `BomItem`, linked via `bomTemplateId`
  to `bom_templates`) — CRUD lives entirely in `app/api/endpoints/bom_items.py`,
  self-contained, no dependency on `bom_service.py`.
- `bom_items_master` (`app/models/bom.py`, `BOMItem`, linked via `bom_id` to
  `boms`) — this is the table the live BOM editor (`bom-editor.jsx` via
  `api.bomEnterprise.items`) actually writes to, but every read/write for it
  routes through `app/services/bom_service.py`, which this wave's assignment
  explicitly forbids me from touching.

I built effectivity on `bom_items` / `bom_item.py`, per the assigned file list,
and deliberately did **not** touch `bom.py`/`bom_items_master`. Adding the
columns there without also wiring `bom_service.py`'s create/update (off
limits) and `bom_enterprise.py`'s request schemas (not in my file list) would
mean data nobody could ever set through the live editor — dead columns, not a
feature. The task's own escape valve ("bom.py if truly needed... design
around it") is exactly this case: not needed, because it can't be finished
without the forbidden file.

**Hook needed in bom_service.py** (for whoever owns it next): if effectivity
should extend to `bom_items_master`, that table needs the same 5 nullable
columns (a trivial follow-up migration) and `bom_service.py`'s
`create_bom_item`/`update_bom_item` need to call
`bom_effectivity_service.validate_effectivity_fields` +
`find_overlapping_sibling` (already written, generic enough to take any
ORM row with the 5 column names) before commit, plus a resolve path in
`get_bom_explosion`/`list_bom_items`. I did not do this myself — out of scope
this wave.

A real, independent consequence of this split: `bom_items` rows are also
presently orphaned from the frontend's "BOM Templates" save/load flow, which
persists a raw `bomData` JSON blob (see `BomTemplate.bomData`,
`BOMTemplatesModal.jsx`'s `saveTemplate`/`loadTemplate`) and never creates
`BomItem` rows at all. So before this change, `bom_items` had **zero** UI
surface. I added one (see below) rather than ship a backend-only feature.

## Data model

Five nullable columns on `bom_items` (migration `053_bom_effectivity`,
`down_revision = "052_bom_types"`):

```
effectiveFrom          Date
effectiveTo            Date
effectiveSerialFrom    String
effectiveSerialTo      String
effectiveLot           String   -- comma-separated lot codes
```

All-null (the default, and every pre-existing row) = always effective —
backward compatible, no backfill.

**No explicit "effectivity type" column.** A line's axis (date / serial /
lot) is inferred from which fields are non-null, and
`bom_effectivity_service.validate_effectivity_fields` rejects a line that
sets fields on more than one axis. This is 3 fewer columns than a `type`
enum + the fields, at the cost of the axis being implicit — a fair trade
given the exclusivity is enforced anyway.

## Query support (`GET /api/v1/bom-items/resolved`)

New endpoint (registered ahead of `/{item_id}` so it isn't swallowed by the
int path param): `?bomTemplateId=&asOfDate=&asOfSerial=&asOfLot=`.

- No as-of param at all -> defaults `asOfDate` to today.
- A line restricted on an axis the caller didn't supply a value for is
  **excluded** (conservative: can't prove a serial/lot-gated line applies
  without that context). This means a plain "as of today" call only ever
  resolves the date axis + unrestricted lines; serial/lot resolution must be
  requested explicitly with `asOfSerial`/`asOfLot`.
- Filtering happens in Python (`bom_effectivity_service.resolve_effective_items`)
  over the full unpaginated set for that template — fine at line-item scale,
  not pushed into SQL because the axis logic (date compare vs. numeric-aware
  serial compare vs. lot-set membership) doesn't translate cleanly to one
  WHERE clause.

## Validation (reject, not warn)

`bom_effectivity_service.validate_effectivity_fields` (pure) rejects
`effectiveFrom > effectiveTo`, `effectiveSerialFrom > effectiveSerialTo`
(numeric-aware — see below), and more-than-one-axis-set. Wired into create,
update, and per-item in bulk-create in `bom_items.py`, returning 400.

`find_overlapping_sibling` (async, DB) rejects two lines for the **same
part in the same parent** (`bomTemplateId` + `parentItemId` + `partId`) whose
windows overlap on the *same* axis. Decision: **reject**, not warn — "which
revision applies right now" must have one answer, so an ambiguous pair never
gets persisted in the first place. Lines on different axes, or one
unrestricted + one restricted, are **not** compared — a baseline
always-effective line plus a dated override is a supported pattern, not a
conflict.

Known gap (documented, not fixed): bulk-create checks each item against
already-committed DB siblings, not against other items in the same batch —
two overlapping lines submitted in one `/bulk` call would both be accepted.
Not covered by the "PROVE IT" list; flagged rather than silently shipped.

Serial comparison (`_serial_key`) parses numerically when possible, else
falls back to lexicographic string order — fine for the common `"1000"`..`"2000"`
case; a `ponytail:` comment in the service marks the ceiling (mixed
alpha+numeric serial schemes needing real natural-sort) and the upgrade path.

## Minimal UI

`BOMTemplatesModal.jsx` gained a third tab, "Effectivity" (plain hardcoded
English strings, no i18n keys added — a deliberate scope cut for a bounded
feature slice; the rest of the file follows the `__t(key) || "fallback"`
pattern and would need the same 5 locale files touched to match fully).

Flow: pick a server-saved template -> its `bom_items` lines list with
editable From/To (native `<input type=date>`), Serial-from/to, Lot text
inputs, and a per-row Save button that PUTs to `/bom-items/{id}` (backend
400s — e.g. "effectiveFrom must not be after effectiveTo" or "Effectivity
overlaps existing line N..." — surface as a toast, verbatim from the
response body). An "As of" date input + Resolve button calls
`/bom-items/resolved` and badges each row effective/not-effective. A small
add-line form (Part ID + qty) creates a new line via `POST /bom-items`.

`frontend/api.js`: added `bomItemsAPI.resolved(bomTemplateId, {asOfDate,
asOfSerial, asOfLot})`.

**Reachable in UI**: BOM Templates modal (opened from the BOM editor's
"BOM Templates" menu item, `BomEditorScreen.jsx` -> `openModal("bom-templates")`)
-> "Effectivity" tab -> pick a template saved via the "Save current BOM" tab
(must be server-saved, i.e. online; local/offline-cache templates have
non-numeric ids and are filtered out of the picker, since they have no real
`bom_items` rows to edit).

## Proof (all in `backend/app/tests/test_bom_effectivity.py`, 16 tests, all green)

- `test_future_date_line_excluded_today_included_future` — a line dated in
  the future is excluded from today's resolve, included from a future as-of.
- `test_serial_range_inside_and_outside` — serial-range line resolves
  correctly inside and outside the range.
- `test_unrestricted_line_always_effective` — a line with no effectivity
  always appears, any as-of context (or none).
- `test_api_rejects_from_after_to` — invalid from>to rejected (400) at the
  API layer.
- `test_api_rejects_overlapping_date_ranges` /
  `test_api_allows_non_overlapping_sequential_windows` — overlap
  reject-on-write, and that non-overlapping sequential windows for the same
  part+parent are allowed.
- `test_resolved_endpoint_excludes_future_by_default_includes_asof_future` /
  `test_resolved_endpoint_serial_axis` — the actual `/resolved` HTTP endpoint,
  end to end.
- `test_plain_list_endpoint_serializes_items_with_effectivity` — regression
  guard for the frontend grid's read path (`GET /bom-items/` has no
  `response_model`, so confirmed it actually serializes real rows with the
  new columns rather than choking on SQLAlchemy instance state).

Run: from `backend/`,
`TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_X.db python -m pytest app/tests/test_bom_effectivity.py app/tests/test_bom_items.py app/tests/test_bom_templates.py -q`
-> 25 passed. Scratch db deleted after each run.

## Files touched

- `backend/app/models/bom_item.py` — 5 new columns
- `backend/alembic/versions/053_bom_effectivity.py` — new migration
- `backend/app/schemas/bom_item.py` — effectivity fields on Base + Update
- `backend/app/services/bom_effectivity_service.py` — new, standalone
- `backend/app/api/endpoints/bom_items.py` — validation wiring + `/resolved`
- `backend/app/tests/test_bom_effectivity.py` — new
- `frontend/api.js` — `bomItemsAPI.resolved`
- `frontend/src/components/modals/BOMTemplatesModal.jsx` — Effectivity tab

Not touched: `backend/app/models/bom.py`, `backend/app/services/bom_service.py`,
`backend/app/api/endpoints/bom_enterprise.py` — see "hook needed" above.
