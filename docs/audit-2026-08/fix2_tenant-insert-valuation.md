# fix2_tenant-insert-valuation

## Finding 1 — raw INSERTs in routing_api.py missing tenantId (REAL, partially already fixed)

Checked how each write happens: **all writes in this file are raw `text()` INSERTs**, not
ORM `db.add(...)`. There is no `db.add(ProcessPlan(...))` anywhere in the file, so the
"maybe the ORM listener already handles it" branch of the finding does not apply here —
every INSERT needed a manual check.

Status per statement, before this fix:
- `routing_tables` insert (create_routing, ~L90-101): **already correct** — sets
  `"tenantId": user.tenantId` explicitly. Not a bug.
- `routing_operations` insert (add_routing_operation, ~L141-155): **bug** — no tenantId
  column/param at all.
- `process_plans` insert (create_process_plan, ~L196-207): **bug** — no tenantId
  column/param at all.
- `process_plan_steps` insert (add_process_plan_step, ~L240-253): **bug** — no tenantId
  column/param at all.

All four target tables (`RoutingTable`, `RoutingOperation`, `ProcessPlan`, `ProcessPlanStep`
in `app/models/routing.py`) inherit `TenantAwareMixin`, which defines `tenantId` as
`nullable=False`. The ORM `before_insert` listener (`app/core/tenant_events.py`) that
normally stamps `tenantId` only fires for ORM-mapped inserts — raw `text()` INSERTs bypass
it entirely, so `routing_operations`, `process_plans`, and `process_plan_steps` rows were
being inserted with tenantId omitted (would violate the NOT NULL constraint on Postgres, or
silently insert NULL if the column allowed it — either way, broken/invisible to the
tenant-scoped reads other endpoints in this file already apply, e.g. `list_routings`,
`get_routing`).

**Fix**: added `"tenantId"` to the three raw INSERT statements and their param dicts.

**Which tenant source to use** — tried `get_tenant_id()` (the request-context tenant used
by `tenant_sql_clause()` for read-side filtering) first, since that's what the read-side
tenant-security pass in this same file uses. A test caught that this is wrong for inserts:
`effective_tenant_id` (what `set_tenant_id()` is seeded with) is deliberately `None` for
superusers, and the ORM `before_insert` listener itself skips stamping tenantId when
`get_tenant_id()` is `None` — so a superuser action would insert `tenantId = NULL` and hit
the NOT NULL constraint (confirmed via a failing IntegrityError in the test run). The
already-correct `routing_tables` insert avoids this by using `user.tenantId` (the user's own
assigned tenant column, never None) rather than the context value. Matched that pattern for
the other three inserts: `"tid": user.tenantId`.

Left untouched (out of scope for this finding, but noted): `list_process_plans` and
`get_process_plan` raw SELECTs are not tenant-scoped at all (no `tenant_sql_clause()` call),
unlike the routing reads in the same file. That's a separate read-side finding, not part of
"raw INSERT" — not touched here since the task scoped this cluster to inserts/valuation.

## Finding 2 — inventory_api.py get_stock_valuation multiplies by hardcoded 1.0 (REAL)

Confirmed at (originally) line 334: `total_value += float(item.quantity_on_hand or 0) * 1.0`
— the query only selected `part_id, quantity_on_hand`, no cost field at all, so the
"valuation" was just a sum of on-hand quantities mislabeled as dollars.

Searched for the real cost source. Two candidates exist:
- `Part.cost` (`app/models/part.py`) — a catalog/standard cost per part.
- `Inventory.unit_cost` (`app/models/inventory.py`) — a per-lot/per-warehouse actual cost.

Found `backend/alembic/versions/025_materialized_views_and_indexes.py` already computes a
stock-value materialized view as `SUM(i.on_hand_qty * i.unit_cost)`, confirming
`Inventory.unit_cost` is the codebase's established source of truth for stock valuation
(it's the actual cost recorded against that specific lot, more precise than a generic
catalog price).

**Fix**: query now joins `Part` and selects `Inventory.unit_cost` and `Part.cost`. For each
inventory row: use `Inventory.unit_cost` if present, else fall back to `Part.cost` (catalog
price) if the lot itself has no cost recorded, else exclude the item from the total (no more
silently pricing at 1.0). Response now also returns `priced_items` alongside `total_items` so
callers can see how many rows actually contributed to the total.

## Files touched
- `backend/app/api/endpoints/routing_api.py`
- `backend/app/api/endpoints/inventory_api.py`
- `backend/app/tests/test_routing_api.py` (new test: `test_raw_inserts_set_tenant_id`)
- `backend/app/tests/test_inventory_api.py` (new test:
  `test_stock_valuation_uses_real_cost_not_hardcoded_one`)

## Verification
Ran, with `TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_<rand>.db` (never live `bom_db`):
```
python -m pytest app/tests/test_inventory_api.py app/tests/test_routing_api.py -q
-> 10 passed
```
- `test_raw_inserts_set_tenant_id`: creates a routing, an operation, a process plan, and a
  step through the real endpoints, then reads each row back with raw SQL and asserts
  `tenantId` matches the test tenant. Failed with an `IntegrityError` against the first
  attempted fix (`get_tenant_id()`), which is what surfaced the superuser/context-vs-owner
  distinction above; passes now with `user.tenantId`.
- `test_stock_valuation_uses_real_cost_not_hardcoded_one`: seeds one part (catalog cost
  12.50) with two inventory lots — one with its own `unit_cost=5.0` (qty 10), one with no
  `unit_cost` (qty 2, should fall back to the 12.50 catalog cost). Asserts
  `estimated_total_value == 75.0` (10*5.0 + 2*12.50) and `priced_items == 2`. Old code would
  have produced `12.0` (10*1.0 + 2*1.0, i.e. just the quantity sum) — this test fails against
  the pre-fix code and passes against the fix.
