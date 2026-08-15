# Backend API audit — backend/app/api (FastAPI routes)

Scope: `backend/app/api/api_v1.py` + all of `backend/app/api/endpoints/*.py` (74 files, ~17,822 lines).
Files fully read: 51 (line-by-line). Remaining ~23 files (capa.py, fai.py, deviation.py,
traceability.py, make_vs_buy.py, should_cost.py, supplier_scorecard.py, kanban.py, work_queue.py,
budgets.py, dashboards_api.py, search.py, cad.py, ocr.py, scraping.py, calendar_events.py,
formulas.py, derivatives.py, planning.py, solidworks_contract.py, esignature_api.py, and the tail
of solidworks_integration.py) were grep-scanned for the same bug signatures (raw `text()` SQL,
bulk `delete()/update()` without tenant filter, router-level auth deps) but not read in full — see
Notes.

Key architectural fact discovered and used to avoid false positives: `app/core/tenant_events.py`
registers a SQLAlchemy `do_orm_execute` listener that auto-appends `WHERE tenantId = :tid` to every
**ORM** `select()` against a `TenantAwareMixin` model, and a `before_flush` listener that blocks
cross-tenant `session.dirty`/`session.deleted` objects. This means a plain `select(Model).where(Model.id==x)`
followed by `setattr`/`db.delete()` is safe even with no explicit tenant filter in the endpoint —
so that pattern (used everywhere) is NOT a bug. The two things this safety net does **not** cover,
confirmed by the listener's own code/comments, are (a) raw/textual SQL (`text(...)`) and (b) bulk
Core-style `update()`/`delete()` statements executed via `db.execute()`. Every real finding below
is one of those two bypasses, or an authorization-logic bug unrelated to tenancy.

---

## 1. CRITICAL — `compliance_api.py`: full CRUD + part lookup with zero tenant isolation

File: `backend/app/api/endpoints/compliance_api.py`

The `compliance` table has a `tenantId` column (proven by the INSERT at line 76:
`INSERT INTO compliance (name, description, "tenantId") VALUES (...)`), so the data model intends
per-tenant compliance standards. But every other operation uses raw `text()` SQL with **no**
`tenantId` predicate at all, and the router applies no role restriction beyond `get_current_user`:

- `list_compliance` (lines 56-65): `SELECT id, name, ... FROM compliance ORDER BY name` — returns
  every tenant's compliance standards to any logged-in user of any tenant.
- `get_compliance` (84-99): `SELECT ... FROM compliance WHERE id = :id` — any authenticated user
  can fetch another tenant's compliance standard by guessing/incrementing `id`.
- `update_compliance` (102-139) and `delete_compliance` (152-165): same unscoped `WHERE id = :id`
  lookup, then `UPDATE .../DELETE ...` — **any authenticated user of any tenant can rename or
  permanently delete another tenant's compliance standard.**
- `compliance_dashboard` (352-396): aggregate counts (`total_standards`, `certified_parts`,
  `expiring_soon`, `expired`, `by_standard`) are computed with no tenant filter — leaks other
  tenants' compliance posture/volume.
- `get_part_compliance` (272-301) and `certify_part` (304-346): `SELECT id, pn, name FROM parts
  WHERE id = :pid` and the certify-insert both use raw SQL with no tenant check — any authenticated
  user can view or write a compliance certification against another tenant's part by ID.

Evidence (representative):
```python
@router.put("/compliance/{compliance_id:int}")
async def update_compliance(..., user: User = Depends(get_current_user)):
    existing = await db.execute(text("SELECT id FROM compliance WHERE id = :id"), {"id": compliance_id})
    ...
    r = await db.execute(text('UPDATE compliance SET {} WHERE id = :id RETURNING ...'.format(...)), params)
```
No `tenantId` predicate anywhere in this file's SQL strings; no `require_admin`/`require_engineering` guard either.

Contrast with `substance_compliance_api.py` in the same directory, which explicitly documents
"Part composition + compliance are tenant-scoped ... every service call is scoped by the ambient
tenant context" and delegates to a service layer that does so — proving the intended design, which
`compliance_api.py` fails to implement.

**Fix direction**: add `AND "tenantId" = :tid` to every `compliance`/`compliance_packs` query and
bind `user.tenantId`; scope the `parts`/`part_certifications` lookups the same way; consider gating
mutating endpoints behind `require_admin`/`require_engineering` for consistency with the rest of the
compliance surface.

---

## 2. HIGH — Systemic tenant-isolation bypass in raw-SQL (`text()`) endpoint modules

The same root cause as #1 (raw SQL sits outside the ORM tenant listener) recurs in several other
"raw SQL first" modules, mostly as read-side leaks rather than full CRUD:

- `backend/app/api/endpoints/routing_api.py`:
  - line 61 `list_routings`: `SELECT rt.* FROM routing_tables ...` — no tenant filter, even though
    `create_routing` (line 87) explicitly sets `"tenantId"` on insert, proving the column exists
    and is meant to scope this table.
  - line 109 `get_routing`: `SELECT * FROM routing_tables WHERE id = :id` — cross-tenant read by ID.
  - lines 157/182/208: `process_plans`/`process_plan_steps` — same pattern, and `process_plans`
    insert (186) doesn't even set a tenant id, so the table is entirely unscoped end-to-end.
- `backend/app/api/endpoints/resource_api.py`: `work_centers` (68, 79), `resource_schedules`
  (102-130, 140), `labor_rates` (165, 177), `timesheet_entries` (199, 210) — every list/get/create
  is global, no tenant column referenced anywhere in the file.
- `backend/app/api/endpoints/service_bom.py`: `service_bom_headers`/`service_bom_items` list/get
  (80-88, 130-138) are unscoped reads (create at 106-109 does set `"tenantId"`, so — like
  routing_tables — the column exists but reads ignore it).
- `backend/app/api/endpoints/po_order.py::po_stats` (100-127) and
  `backend/app/api/endpoints/order_tracking.py::tracking_stats` (151-163): aggregate "stats"
  endpoints built with raw SQL `GROUP BY` queries with no tenant predicate, while the *other*
  endpoints in the very same file correctly rely on the ORM auto-filter (e.g. `po_stats`'s own
  `select(func.count(POHeader.id))` two lines above IS filtered) — the inconsistency inside a
  single function confirms this is an oversight, not an intentional global report.

Net effect: any authenticated user of tenant A can read tenant B's routing tables/process plans,
work centers, resource schedules, labor rates, timesheets, service-BOM headers, and PO/order-tracking
aggregate stats (counts, sums, top vendors) simply by being logged in — no tenant or role check
is applied on these paths.

**Fix direction**: either move these modules onto the ORM (`select(Model)...`) so the existing
tenant listener applies automatically, or add an explicit `WHERE "tenantId" = :tid` (bound to
`current_user.tenantId`) to every raw query, mirroring what `export_report.py` and
`enterprise_ext_api.py`'s `currencies` table (intentionally global) already do correctly elsewhere.

---

## 3. HIGH — `bom_items.py` bulk-delete bypasses tenant isolation (Core-style delete)

File: `backend/app/api/endpoints/bom_items.py`, line 166:

```python
@router.post("/bulk-delete")
async def bulk_delete_bom_items(
    req: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(delete(BomItem).where(BomItem.id.in_(req.ids)))
```

This is a bulk Core `delete()` statement executed directly via `db.execute()`, which — per
`app/core/tenant_events.py`'s own `_add_tenant_select_filter` (only handles `is_select`) and
`_check_update_delete_tenant` (only inspects `session.dirty`/`session.deleted`, i.e. ORM
unit-of-work objects) — is **not** auto-scoped by tenant. Any user holding `require_parts_write`
in tenant A can delete BOM item rows belonging to tenant B simply by supplying their numeric IDs.

This is a real regression relative to sibling endpoints in the same codebase that got this right:
- `vendors.py:198` — `delete(Vendor).where(Vendor.id.in_(req.ids), Vendor.tenantId == current_user.tenantId)`
- `notifications.py:153` — `delete(Notification).where(Notification.id.in_(req.ids), Notification.userId == current_user.id)`

`bom_items.py`'s bulk-delete is missing the equivalent `BomItem.tenantId == current_user.tenantId`
predicate.

**Fix**: add `, BomItem.tenantId == current_user.tenantId` to the `where(...)` clause.

---

## 4. MEDIUM — `eco_api.py`: `create_ecn`/`create_ecr` skip the engineering-role gate and allow requester spoofing

File: `backend/app/api/endpoints/eco_api.py`

The router requires only viewer-level access by default (`dependencies=[Depends(get_current_user),
Depends(require_viewer)]`, line 36), and every ECO-mutating endpoint explicitly upgrades to
`Depends(require_engineering)` — **except** two:

- `create_ecn` (lines 288-319): `current_user: User = Depends(get_current_user)` only. Any
  viewer-level user can issue an Engineering Change Notice.
- `create_ecr` (lines 322-349): also just `get_current_user`, and takes `requested_by: int` as a
  raw request parameter that is stored verbatim as the ECR's `requested_by` — it is never checked
  against `current_user.id`. Any logged-in viewer can create an "ECR" that appears to have been
  requested by an arbitrary other user id.

```python
@router.post("/ecr")
async def create_ecr(
    title: str, description: str, requested_by: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),   # not require_engineering
):
    ...
    ecr = EcoHeader(..., requested_by=requested_by)     # caller-supplied, unverified
```

Compare `eco_api.py`'s own `/approve` endpoint (lines 172-197), which was hardened specifically
against this class of bug ("R8 guardrail: approver_id must match the authenticated acting user")
— the same guardrail was never applied to `requested_by` here.

**Fix**: require `require_engineering` on both endpoints (or whatever the intended minimum role
is), and either drop the `requested_by` parameter in favor of `current_user.id`, or verify
`requested_by == current_user.id` the same way `/approve` does for `approver_id`.

---

## 5. MEDIUM — `inventory_api.py::get_stock_valuation` returns a fabricated dollar value

File: `backend/app/api/endpoints/inventory_api.py`, lines 320-335:

```python
@router.get("/reports/stock-valuation")
async def get_stock_valuation(...):
    result = await db.execute(select(Inventory.part_id, Inventory.quantity_on_hand).order_by(...))
    items = result.all()
    total_value = 0.0
    for item in items:
        total_value += float(item.quantity_on_hand or 0) * 1.0
    return {"total_items": len(items), "estimated_total_value": total_value, "currency": "USD"}
```

`* 1.0` is a no-op — no unit cost (e.g. `Part.cost`) is ever looked up or joined in. The response
is literally `estimated_total_value == sum(quantity_on_hand)`, i.e. a unitless part count relabeled
as a USD valuation. Any caller (dashboard, report) that trusts `estimated_total_value` /
`currency: "USD"` is shown fabricated financial data.

**Fix**: join `Inventory.part_id` to `Part.cost` (or a proper costing table) and multiply by that,
not by a constant.

---

## 6. LOW/MEDIUM — `sessions.py::revoke_all_sessions` doc/code mismatch — logs the caller out too

File: `backend/app/api/endpoints/sessions.py`, lines 113-127:

```python
@router.post("/sessions/revoke-all")
async def revoke_all_sessions(...):
    """Revoke all sessions for the current user (except current)."""
    await db.execute(
        update(UserSession).where(UserSession.userId == current_user.id).where(UserSession.isActive)
        .values(isActive=False)
    )
```
The docstring promises the current session survives ("except current"), but no session id is
excluded from the `UPDATE` — every active session row for the user, including the one issuing this
very request, is deactivated. A user calling "log out other devices" is unexpectedly logged out
themselves too.

**Fix**: exclude the session tied to the current request's token/cookie from the `WHERE`, or update
the docstring if revoking the current session is actually intended.

---

## 7. LOW — `audit_logs.py::create_audit_log` lets any user forge audit entries under another identity

File: `backend/app/api/endpoints/audit_logs.py`, lines 70-83:

```python
class AuditLogBase(BaseModel):
    action: str
    entityType: str
    entityId: Optional[int] = None
    changes: Optional[dict] = None
    userId: int          # <-- client-supplied, not validated

@router.post("/", response_model=AuditLogResponse, status_code=status.HTTP_201_CREATED)
async def create_audit_log(log: AuditLogCreate, db=..., current_user: User = Depends(get_current_user)):
    db_log = AuditLog(**log.model_dump())   # userId taken as-is from the request body
```
Any authenticated user (no elevated role required) can POST an audit-log row with an arbitrary
`userId`, `action`, `entityType`/`entityId`, effectively fabricating history attributed to someone
else. This undermines the audit trail's evidentiary value — the one place in the app whose whole
purpose is "who did what" accepts an unverified "who".

**Fix**: ignore/override `userId` from the payload and always set it to `current_user.id` (or
require an admin role for impersonated entries), and consider dropping the public POST entirely if
audit rows are meant to be written only by the server itself (`write_audit_entry`, used elsewhere
in the codebase, e.g. `tenants.py`).

---

## 8. LOW — `erp_connectors.py`: no role gate on managing integration credentials

File: `backend/app/api/endpoints/erp_connectors.py`

`router = APIRouter(dependencies=[Depends(get_current_user)])` (line 19) — every endpoint,
including `create_connector`, `update_connector`, `delete_connector`, and `sync_connector` (which
all touch `apiKey`/`baseUrl` for third-party ERP systems), is reachable by any authenticated tenant
user with no additional role check. Comparable sensitive-config surfaces in the same codebase are
locked down further: `tenants.py` requires `get_current_superuser`, `roles_permissions.py` requires
`require_admin`, and `integrations.py`'s connection upsert/delete/test also require
`get_current_superuser`. `erp_connectors.py` is the odd one out for functionally the same kind of
data (integration credentials).

Not exploitable cross-tenant (ERPConnector is `TenantAwareMixin`-scoped, confirmed in
`app/models/erp_connector.py`), but any low-privilege user in a tenant can create/rotate/delete that
tenant's ERP connectors and see the masked `apiKey` prefix, which is inconsistent with how the rest
of the app treats "who can touch integration secrets."

**Fix**: gate mutating endpoints behind `require_admin` (or `get_current_superuser`) to match
`integrations.py`/`zoho_books.py`.

---

## Notes / things checked and ruled out (to save re-investigation)

- `tenants.py::delete_tenant` line ~261 `if user_count.scalar() or 0 > 0:` looks like an operator-
  precedence bug (`or` binds looser than `>`), but it evaluates to `x or False` for any `x`, which
  has the same truthiness as `x` alone for all non-negative counts — behaves correctly despite the
  odd style; not filed as a bug.
- `api_v1.py` mounts `solidworks_integration.router` and `solidworks_contract.router` at the same
  prefix `/solidworks` (lines 205-216) — checked for path collisions; the two routers declare
  disjoint path sets (contract.py deals in `/part-number/*` and mapping CRUD), so no shadowing.
- Plain `select(Model).where(Model.id == x)` followed by mutate/delete, with no explicit
  `tenantId` filter, is safe everywhere it appears (confirmed via `app/core/tenant_events.py`) and
  was not flagged, even though it looks superficially unscoped in many files (parts.py,
  vendors.py-style CRUD, work_order_api.py, quality_api.py, etc.).
- `GET /metrics` (api_v1.py line 368) exposes Prometheus metrics to any authenticated user (not
  just superuser) — flagged mentally but judged too speculative/low-impact to include as a finding
  without knowing what `metrics.export_prometheus()` actually contains.
- `erp_connectors.py::test_connection`/`test_connection_by_id` and `sync_connector` were already
  hardened against the "fabricated success" pattern (explicit `"HONESTY (R10)"` comments returning
  `status="simulated"`/`"failed"` instead of a fake success) — good, not a bug.

## Coverage gap

Not read line-by-line (grep-scanned only for the same signatures, nothing suspicious surfaced):
`capa.py`, `fai.py`, `deviation.py`, `traceability.py`, `make_vs_buy.py`, `should_cost.py`,
`supplier_scorecard.py`, `kanban.py`, `work_queue.py`, `budgets.py` (partially — its `text()` PO
spend queries were spot-checked and correctly tenant-scoped via `_tenant_filter_params`),
`dashboards_api.py`, `search.py`, `cad.py`, `ocr.py`, `scraping.py`, `calendar_events.py`,
`formulas.py`, `derivatives.py`, `planning.py`, `solidworks_contract.py`, `esignature_api.py`, and
lines 1-149/300-750 of `solidworks_integration.py`. A follow-up pass should at minimum grep these
for the same two bypass patterns (`text(` without a `tenantId`/`tenant_id` bind, and
`delete(Model).where`/`update(Model).where` without a tenant predicate) confirmed here.
