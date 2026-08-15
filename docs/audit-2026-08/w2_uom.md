# WS2 — Multi-UOM conversion

## What shipped

- `backend/app/models/uom.py` — `UomUnit` (code, name, dimension, is_base) and
  `UomConversion` (from_uom -> to_uom, factor), both `TenantAwareMixin`,
  modeled directly on `Currency`/`ExchangeRate` in
  `app/models/enterprise_extensions.py` per the task brief.
- `backend/app/services/uom_service.py` — the conversion service:
  - `convert(db, qty, from_uom, to_uom)` — refuses cross-dimension and
    unknown-unit conversions with `UomConversionError` (`.code` =
    `"cross_dimension"` | `"unknown_unit"`); `from_uom == to_uom` is always a
    no-op identity, even for an unregistered string (that's not a
    conversion, it's the same label).
  - `try_convert(...)` — non-raising variant returning `(value, error)` for
    callers that must not crash on one bad line.
  - `rollup_quantities(db, lines)` — sums a list of `{quantity, uom}` into
    one total per physical dimension (in that dimension's base unit) plus
    an `unconverted` bucket for unrecognised uoms. This is the mixed-M/CM
    BOM total the brief asks for.
  - `extended_cost(db, qty, line_uom, unit_cost, cost_uom)` — converts qty
    into the cost's unit before multiplying; falls back to the naive
    `qty * unit_cost` **with a warning string**, never a crash, when the
    units can't be reconciled.
  - `STANDARD_UNITS` / `STANDARD_CONVERSIONS` — the single source of truth
    for the seed data, imported by both the migration and (available for)
    future runtime seeding.
- `backend/app/api/endpoints/uom_api.py` — `GET /uom/units`,
  `GET /uom/convert`, `POST /uom/rollup-quantities`; registered in
  `api_v1.py` under `/uom` and in `app/api/endpoints/__init__.py`.
- `backend/alembic/versions/054_uom_conversion.py` — creates `uom_units` +
  `uom_conversions` (tenant-scoped, RLS-guarded like migration 051), seeds
  the standard 12-unit set (EA, M, CM, MM, FT, IN, KG, G, LB, OZ, L, ML) and
  8 base-anchored conversion factors **for every tenant that exists at
  migration time**.
- `backend/app/models/__init__.py` — one import line so the new models are
  part of `Base.metadata` (required for both the test schema and any
  future autogenerate diff).
- Frontend: `frontend/api.js` — `uomAPI` (units/convert/rollupQuantities);
  `frontend/src/components/modals/UomConverterModal.jsx` — new modal;
  wired into `BomEditorScreen.jsx`'s existing "Tools" dropdown as a new
  "Unit Converter" item, next to Duplicate/Rollback.

## Design decision: tenant-scoped, not global

The brief explicitly says "model UOM conversion the same way [as
exchange_rates]" and the hard rules say every new table is tenant-scoped —
so `uom_units`/`uom_conversions` carry `tenantId` and are seeded per-tenant,
exactly like `currencies`/`exchange_rates`. (I considered making these
global reference tables instead, like `substance_groups` in migration 042 —
a metre is a metre for every tenant — which would have been simpler to seed.
Went with the explicit instruction instead of my own judgment call; flagging
it in case the four-agent chain wants to revisit later.)

## Where the two rollup hooks go (bom_service.py is out of scope for me)

`app/services/bom_service.py` has **two** BOM item models in play:
`app.models.bom.BOMItem` (table `bom_items_master`) is the one the rollups
actually use, and it already has a per-line `unit` column
(`default="EA"`) — separate from `Part.uom`. That's the exact "BOM line's
own unit, possibly different from the part's costing unit" the brief
describes.

**Quantity roll-up** — `get_quantity_rollup` (line ~1224). Right before its
final `return {...}` (line ~1265), add a cross-part, cross-unit total:

```python
from app.services import uom_service  # add to imports

dim_rollup = await uom_service.rollup_quantities(
    db, [{"quantity": effective_qty[item.id], "uom": item.unit} for item in items]
)
return {
    "bom_id": bom_id,
    "total_items": len(items),
    "unique_parts": len(part_ids),
    "rollup": rollup,
    "by_dimension": dim_rollup["by_dimension"],
    "unconverted_uoms": dim_rollup["unconverted"],
}
```

Today `total_quantity_map` sums quantity **per part number**, never across
different parts/units — there is currently no single combined total to fix;
`by_dimension` is the new figure (e.g. one line at 2 M + another at 150 CM
-> `{"dimension": "length", "base_unit": "M", "total": 3.5}`), additive and
non-breaking.

**Cost roll-up** — `get_cost_rollup` (line ~1276), inside the `for item in
items:` loop (line ~1306-1311), the current code is:

```python
unit_cost = float(item.unit_cost_snapshot or (part.cost or 0))
extended = unit_cost * effective_qty[item.id]
```

which silently assumes `unit_cost` is already priced per `item.unit` — no
conversion happens today even though the schema allows the line unit and
the part's unit to differ. Replace with:

```python
extended_dec, warning = await uom_service.extended_cost(
    db, effective_qty[item.id], item.unit, unit_cost, part.uom
)
extended = float(extended_dec)
if warning:
    cost_warnings.append({"item_id": item.id, "part_number": part.pn, "warning": warning})
```

(`cost_warnings: list = []` initialized before the loop, returned as a new
`"warnings"` key.) This degrades gracefully — an unresolvable uom keeps
today's exact behaviour plus a visible warning, it never 500s.

## Tenant-creation seeding gap (also out of scope — file list didn't include it)

`app/api/endpoints/tenants.py::create_tenant` (line ~151) is where a tenant
created *after* this migration should get the standard 12-unit set too.
Since `STANDARD_UNITS`/`STANDARD_CONVERSIONS` already live in
`uom_service.py`, the fix is a small loop there (same shape as the
migration's data step) — not written here since `tenants.py` wasn't in my
file list and touching a shared, frequently-edited file wasn't worth the
collision risk for an addition this small. Until that lands, a tenant
created after 054 has no units at all — `convert()`'s "unknown unit" error
covers that case honestly (nothing breaks, conversions on that tenant just
all report unknown-unit until units exist).

## How a user reaches this

BOM Editor -> **Tools** dropdown -> **Unit Converter**. Pick a quantity and
two units; Convert shows the number or the backend's exact refusal message
verbatim (e.g. "Cannot convert 'M' (length) to 'KG' (mass) — different
physical dimensions."). Each BOM line's own unit was already visible in the
grid before this feature (`row.uom`, `bom-editor.jsx` line 1181) — nothing
to add there.

## Proof

- `backend/app/tests/test_uom_service.py` (14 tests) and
  `backend/app/tests/test_uom_api.py` (4 tests) — **18/18 passed** against
  `sqlite+aiosqlite:///./scratch_uom_*.db` (deleted after each run):
  - `test_metre_to_centimetre`: 1 M -> 100 CM.
  - `test_chained_non_base_pair`: 5 CM -> 50 MM (neither is the base unit —
    proves the base-chain, not just direct lookups).
  - `test_cross_dimension_refused`: M -> KG raises `UomConversionError`
    with `.code == "cross_dimension"`.
  - `test_unknown_unit_refused_not_silently_1to1`: `EA -> sprockets` raises
    `.code == "unknown_unit"` (never returns a guessed value).
  - `test_unknown_unit_same_on_both_sides_is_identity`: `widgets ->
    WIDGETS` (case-insens., same label) returns unchanged — not a
    conversion, no error.
  - `test_mixed_m_and_cm_rolls_up_correctly`: 2 M + 150 CM -> 3.5 M total.
  - `test_unresolvable_units_fall_back_with_warning_not_crash`: EA/KG cost
    rollup falls back to naive multiply + returns a warning, doesn't raise.
  - API tests hit `/api/v1/uom/convert` and `/api/v1/uom/rollup-quantities`
    through the real FastAPI app + auth, including a 422 with the human
    message on cross-dimension.
- `backend/alembic/versions/054_uom_conversion.py` — dry-ran `upgrade()`
  then `downgrade()` directly (via `alembic.operations.Operations.context`,
  bypassing the full 052/053 chain those files don't exist in this tree
  yet) against a scratch sqlite db with 2 fake tenants: confirmed 24 unit
  rows (12 x 2 tenants) and 16 conversion rows (8 x 2 tenants) inserted,
  then a clean `downgrade()` dropping both tables. Caught and fixed a real
  bug in the process: the seed insert bound `decimal.Decimal` through an
  untyped `sa.column()`, which `sqlite3` rejects outright — fixed by typing
  that column `sa.Numeric(24, 12)` so SQLAlchemy adapts it correctly on
  either dialect. Scratch db removed after.
- `frontend/src/components/modals/__tests__/UomConverterModal.test.jsx` (2
  tests, vitest) — converts and shows the result; on failure shows the
  backend's exact error text and never fabricates a number alongside it.
  Also ran `context-identity.test.jsx` (imports `BomEditorScreen`
  transitively) to confirm the Tools-dropdown edit didn't break parsing.

## Not done / explicitly out of scope

- Did not touch `bom_service.py` or `bom_items.py` (owned elsewhere) — see
  hook points above.
- Did not touch `tenants.py` — see seeding-gap note above.
- Did not add a UI to create custom units/conversions per tenant (task
  asked for the seeded standard set + conversion + rollup wiring + minimal
  UI, not a full admin CRUD screen); `GET /uom/units` exists for read.
