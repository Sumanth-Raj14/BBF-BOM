# tenant-security cluster — writeup

## Root cause (confirmed)

`app/core/tenant_events.py` auto-filters ORM `select()` and blocks cross-tenant
ORM update/delete at `before_flush`, but it explicitly does **not** touch raw
`text()` SQL or bulk Core `delete()`/`update()` statements (the code even logs
a warning that it can't safely filter non-ORM statements). Every endpoint
below issued exactly that kind of unscoped statement, so a caller from tenant A
could read or delete tenant B's rows by id.

Fix pattern used throughout: `app/core/tenant_context.get_tenant_id()` /
`tenant_sql_clause()` (an existing helper already used by
`app/core/encryption.py`) — when a tenant is set, constrain the query/delete to
it; when `None` (superuser/no-context), behavior is unchanged. This mirrors the
`_tenant_filter_params` idea in `budgets.py` without duplicating it, since a
ready-made SQL-clause helper already existed.

## Files changed

### app/services/part_service.py
`bulk_delete_parts` ran `delete(Part).where(Part.id.in_(part_ids))` — a Core
statement, so the ORM flush guard never saw it. Added
`Part.tenantId == tenant_id` to the `WHERE` when `get_tenant_id()` is not
`None`. `Part` has `tenantId` (via `TenantAwareMixin` — confirmed in
`app/models/part.py`).

### app/api/endpoints/bom_items.py
Same bug, same fix, for `bulk_delete_bom_items`'s
`delete(BomItem).where(BomItem.id.in_(req.ids))`. `BomItem` has `tenantId`
(confirmed in `app/models/bom_item.py`).

### app/api/endpoints/compliance_api.py
`compliance` table has `tenantId` (`TenantAwareMixin`, confirmed in
`app/models/compliance.py`). Scoped the raw SQL in `list_compliance`,
`get_compliance`, `update_compliance` (existence check + the `UPDATE`),
`delete_compliance` (existence check + the `DELETE`), `get_part_compliance`
(the `parts` lookup and the `compliance` join), and `certify_part` (the
`parts` and `compliance` FK-validation lookups) — all via `tenant_sql_clause()`.

**Left untouched by design, with evidence:** `compliance_packs`,
`compliance_pack_items`, and `part_certifications` use plain `Base`, not
`TenantAwareMixin` — confirmed no `tenantId` column exists on any of them
(`app/models/compliance.py` line 36-41 explicitly documents "NOT tenant-scoped
in the live schema"). Per the task's own instruction ("if one genuinely does
not [have tenantId], say so and leave it") I did not add a predicate to
`list_packs`, `create_pack`, `get_pack`, or the `part_certifications`
existence/insert queries in `certify_part` — there is no column to filter by.
`compliance_dashboard` (aggregate counts) was likewise left alone: it wasn't
named in the task's enumerated list ("list/get/update/delete + part-compliance/
certify") and touches the same non-tenant-scoped pack/certification tables.

### app/api/endpoints/routing_api.py
`routing_tables` has `tenantId` (confirmed in `app/models/routing.py`). Scoped
the two raw reads named in the task ("raw text() reads of routing_tables"):
`list_routings` and the header lookup in `get_routing`.

Note: `process_plans`/`process_plan_steps` also have `tenantId` and
`create_process_plan` doesn't even set it on insert — a real gap, but it's an
insert path, not a read, and wasn't in the task's named scope
("routing_tables" reads only), so left untouched per the "touch only what's
asked" rule. Flagging it here rather than scope-creeping the fix.

### app/api/endpoints/resource_api.py
`work_centers`, `resource_schedules`, `labor_rates`, `timesheet_entries` all
have `tenantId` (confirmed in `app/models/resource_scheduling.py` and
`app/models/labor.py`). Scoped every raw read: `list_work_centers`,
`capacity_overview`, `list_schedules`, `list_labor_rates`, `list_timesheets`,
`labor_cost_summary`.

### app/api/endpoints/service_bom.py
`service_bom_headers`, `service_bom_items`, and `bom_items` (via `BomItem`) all
have `tenantId`. Scoped `list_service_boms`, `get_service_bom`, and the
`bom_items` read inside `merge_boms`.

### app/api/endpoints/order_tracking.py
`order_tracking` has `tenantId` (confirmed in `app/models/order_tracking.py`).
Scoped the two raw text() queries in `tracking_stats` (the only raw SQL in the
file — everything else already goes through the ORM, which is auto-filtered).

## Test

`app/tests/test_tenant_isolation_bulk.py` — 3 tests, using the same pattern as
the existing `test_tenant_select_isolation.py` (direct `db_session` + the
autouse `setup_tenant_context` fixture pinning the "current" tenant, plus a
manually-created second `Tenant` row for "the other tenant"; `no_tenant_filter()`
from conftest to verify the other tenant's row still exists without the SELECT
filter hiding it):

1. `test_bulk_delete_parts_does_not_delete_other_tenants_rows` — calls
   `part_service.bulk_delete_parts` with ids from both tenants.
2. `test_bulk_delete_bom_items_does_not_delete_other_tenants_rows` — calls the
   `bulk_delete_bom_items` endpoint function directly with ids from both
   tenants (needed a `BomTemplate` + shared `Part` per FK constraints).
3. `test_compliance_raw_sql_does_not_leak_other_tenants_rows` — calls
   `list_compliance` and `get_compliance` directly against `Compliance` rows
   from both tenants.

### RED confirmed against pre-fix code (each fix reverted one at a time, test
re-run, then fix restored):

- part_service: `deleted == 1` assertion failed with `deleted=2` (both tenants'
  rows deleted).
- bom_items: `result["deleted"] == 1` failed with `{'deleted': 2}`.
- compliance_api: `"Their Standard" not in names` failed —
  `{'Their Standard', 'Mine Standard'}` both returned by `list_compliance`.

### GREEN after fix
```
TEST_DATABASE_URL="sqlite+aiosqlite:///./test_tenant_iso.db" python -m pytest \
  app/tests/test_tenant_isolation_bulk.py -q
Pytest: 3 passed
```

### No regressions
Ran the full set of existing suites for every touched endpoint file plus the
existing tenant-isolation regression test, all green, no test pointed at live
`bom_db` (isolated SQLite via `TEST_DATABASE_URL`, own throwaway file, deleted
after):
```
TEST_DATABASE_URL="sqlite+aiosqlite:///./test_tenant_iso.db" python -m pytest \
  app/tests/test_tenant_isolation_bulk.py app/tests/test_bom_items.py \
  app/tests/test_compliance_api.py app/tests/test_routing_api.py \
  app/tests/test_resource_api.py app/tests/test_service_bom.py \
  app/tests/test_order_tracking.py app/tests/test_tenant_select_isolation.py \
  app/tests/test_parts.py -q
Pytest: 33 passed
```

## Not touched

No git commands run, no other files edited. Only the files listed in scope
were changed: `app/services/part_service.py`,
`app/api/endpoints/{bom_items,compliance_api,routing_api,resource_api,
service_bom,order_tracking}.py`, and the new
`app/tests/test_tenant_isolation_bulk.py`.
