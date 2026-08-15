# Parity-backend audit — detailed notes

Files read in full:
- backend/app/services/uom_service.py
- backend/app/services/bom_effectivity_service.py
- backend/app/api/endpoints/uom_api.py
- backend/app/api/endpoints/mbom_api.py
- backend/app/api/endpoints/requirements_api.py
- backend/app/models/uom.py
- backend/app/models/requirement.py
- backend/app/schemas/requirement.py
- backend/app/schemas/bom.py
Plus supporting reads to confirm/refute suspicions (read-only, not part of the assigned scope but needed to verify):
- backend/app/core/tenant_events.py (confirms ORM select()/flush auto-tenant-filter mechanism)
- backend/app/services/bom_service.py (derive_mbom_from_ebom — confirms it does NOT mutate the EBOM; add_bom_item — confirms the established convention of validating Part tenant-ownership before FK insert, which mbom_api/requirements_api do NOT follow)
- backend/app/models/mbom.py (confirms MbomItem.part_id is a NOT NULL FK to parts.id)
- backend/app/main.py (confirms there is a catch-all `Exception` handler that turns any unhandled exception, including IntegrityError, into a generic 500 — no per-route handling of FK/unique violations)
- backend/app/api/api_v1.py (router prefixes: /requirements, /mbom, /uom — no doubled-prefix issue)
- backend/app/core/rbac.py (confirms require_parts_read/write, require_engineering/viewer are real PermissionChecker/RoleChecker instances, not stubs)

## Verified as CORRECT (no finding)
- uom_service.convert(): refuses cross-dimension conversion (checks `from_unit.dimension != to_unit.dimension` before ever touching factors) and refuses unknown units — never silently assumes 1:1. Same-string shortcut (`f == t`) is documented and intentional (lets an unregistered free-text uom pass through unconverted only when no conversion is actually being requested).
- uom_service.extended_cost(): the only "1:1-ish" fallback is `quantity * unit_cost` when reconciliation fails, but it is NOT silent — it returns an explicit warning string that the caller must surface. Matches the module's own stated contract.
- bom_effectivity_service: date-range and serial-range boundary checks are inclusive on both ends (`as_of_date < effectiveFrom` / `> effectiveTo`, `_serial_in_range` symmetric) — a line effective from 2024-01-01 to 2024-06-30 is correctly included when as_of == either boundary. Lot matching is case/whitespace-normalized. `is_effective` correctly treats an all-null line as always-effective.
- bom_service.derive_mbom_from_ebom (called by mbom_api's POST /mbom/derive): reads BOM/BOMItem, never writes to them; only creates new MbomHeader/MbomItem rows. Confirmed no source-EBOM mutation.
- Router mounting: /requirements, /mbom, /uom prefixes are each mounted once, no doubled prefix, no shadowing (literal routes like /coverage, /by-part/{id} are registered before /{requirement_id}).
- Tenant auto-filter (tenant_events.py) is a real, non-swallowed do_orm_execute listener; it filters TenantAwareMixin ORM selects by tenantId when a tenant context is set, and before_flush blocks cross-tenant UPDATE/DELETE of dirty/deleted ORM objects. This means most of the endpoints in scope that omit an *explicit* tenantId predicate (many reads in requirements_api.py) are still tenant-scoped in practice, matching the documented exception ("ORM select() and ORM flush auto-filter").

## Findings

### 1. requirements_api.py / mbom_api.py — no existence/tenant validation before inserting FK references → unhandled IntegrityError → generic 500
File: backend/app/api/endpoints/requirements_api.py, lines 178-203 (`link_part`) and 240-265 (`link_bom`); also lines 103-115 (`create_requirement`, duplicate `key`).
File: backend/app/api/endpoints/mbom_api.py, lines 247-259 (`create_mbom_item`) and 262-282 (`update_mbom_item`, when `part_id` is in the payload).

`link_part` only checks for an *existing identical link* (409), never that `payload.partId` refers to a real, same-tenant part:
```
existing = await db.execute(select(RequirementPartLink).where(... part_id == payload.partId))
if existing.scalars().first():
    raise HTTPException(409, ...)
link = RequirementPartLink(requirement_id=..., part_id=payload.partId, ...)
db.add(link); await db.commit()
```
`RequirementPartLink.part_id` is `ForeignKey("parts.id", ondelete="CASCADE"), nullable=False`. If `partId` does not exist, `db.commit()` raises `IntegrityError`, which is not caught anywhere in this handler; it propagates to `main.py`'s catch-all `@app.exception_handler(Exception)` and comes back as an opaque `500 {"detail": "Internal server error"}` instead of a 404/422. Same shape for `link_bom` (`bom_id` FK) and for `mbom_api.create_mbom_item`/`update_mbom_item` (`MbomItem.part_id` FK to `parts.id`).

Compare with the established convention in `bom_service.add_bom_item` (lines ~529-535 of bom_service.py), which explicitly does:
```
pr_stmt = select(Part).where(Part.id == part_id)
if tid is not None: pr_stmt = pr_stmt.where(Part.tenantId == tid)
if not (await db.execute(pr_stmt)).scalar_one_or_none():
    raise HTTPException(status_code=404, detail="Part not found")
```
Neither `requirements_api.py` nor `mbom_api.py` does this. Concrete failure: `POST /requirements/{id}/parts {"partId": 999999}` (nonexistent id) → 500 instead of 404. A *second*, less certain but real consequence of the same missing check: if `partId`/`bomId` happens to be a real id that belongs to a *different tenant*, the FK is satisfied and the link/item is silently created pointing at another tenant's row — the requesting tenant only ever gets back the numeric id they supplied (no name/data is echoed back in these responses), so this is a referential-integrity/cross-tenant-linkage defect rather than a direct information-disclosure leak, but it is still a functional bug: nothing in these two files stops it.

`create_requirement` has the same class of gap for its own uniqueness constraint: `uq_requirements_tenant_key` (tenantId, key) is enforced only in the DB. Posting a `key` that's already used for the tenant → unhandled `IntegrityError` → 500, whereas the *sibling* link endpoints in the very same file at least pre-check for duplicates and return a clean 409. `update_requirement` has the identical gap when `key` is changed to a colliding value.

Severity: medium — reproducible with ordinary bad/stale input (not just malicious), turns a foreseeable 4xx case into a raw 500, and is inconsistent with the pattern already established elsewhere in this codebase for exactly this scenario.

### 2. requirements_api.py `coverage()` — two unbounded, unpaginated queries
File: backend/app/api/endpoints/requirements_api.py, lines 64-84.
```
linked_ids = select(RequirementPartLink.requirement_id).distinct()
stmt = select(Requirement).where(Requirement.id.not_in(linked_ids)).order_by(Requirement.id)
uncovered = (await db.execute(stmt)).scalars().all()          # no limit
total_result = await db.execute(select(Requirement))          # no limit
total = len(total_result.scalars().all())                     # loads every row just to count
```
Every other list endpoint in this file (`list_requirements`) goes through `paginate()`; `coverage()` does not — it materializes the entire `requirements` table (all columns, all rows) twice (once for the uncovered set, once just to call `len()` for a count that a `SELECT count(*)` would give directly) on every call. For a tenant with a large requirements set this is an unbounded query and an avoidable full-table load, matching the "unbounded queries" resource-risk category called out for this audit.

Severity: medium (resource/perf, not correctness — the returned totals are accurate) — but the `not_in(subquery)` pattern on a large table with no cap can also be slow, and there's no `LIMIT`/pagination knob for a caller to ask for less.

### 3. uom_service — N+1 queries in `rollup_quantities` and (indirectly) `convert`/`extended_cost` when used per line
File: backend/app/services/uom_service.py, lines 196-244 (`rollup_quantities`).
```
for line in lines:
    ...
    unit = await _get_unit(db, uom, tid) if uom else None   # 1 query per line
    ...
    factor = await _factor_to_base(db, unit, tid)           # up to 1 more query per line
    ...
    if dim is None:
        base_unit = await _base_unit_for_dimension(db, unit.dimension, tid)  # 1 more, first-time-per-dimension
```
This issues 1-2 SQL round trips *per BOM line* inside a Python loop — a straightforward N+1. The module's own docstring says the per-part cost roll-up (`bom_service.get_quantity_rollup`) calls `try_convert()`/`extended_cost()` "directly per line" rather than through this batch function, which means the same per-line query pattern (each `convert()` call does 2 `_get_unit` queries + up to 2 `_factor_to_base` queries) repeats for every line of every BOM cost rollup. None of the units/conversions involved change during a single request, so this is trivially cacheable (e.g. pre-load all `UomUnit`/`UomConversion` rows for the tenant once per request/rollup instead of querying per line) — this is exactly the "N+1 in a loop over parts/BOM lines" failure mode called out for this audit.

Severity: medium (perf at scale; a BOM/rollup with hundreds of mixed-uom lines turns into hundreds of extra round trips) — not a correctness bug, values are still computed correctly.

### 4. uom_service._factor_to_base — conversion-row lookup ignores `to_uom`, trusts an unenforced invariant
File: backend/app/services/uom_service.py, lines 84-100; backend/app/models/uom.py, lines 50-68.
```
stmt = select(UomConversion).where(UomConversion.from_uom == unit.code)
...
row = (await db.execute(stmt)).scalars().first()
...
return Decimal(row.factor)
```
The function's job is "amount of the dimension's base unit equal to 1 of `unit`" — i.e. it needs the specific row where `to_uom` equals the dimension's base unit. It never checks `row.to_uom`; it just takes whichever row for that `from_uom` comes back first. The model's own docstring states the *intended* convention is "one row per non-base unit, straight to its dimension's base unit," but the actual DB constraint is `UniqueConstraint("tenantId", "from_uom", "to_uom")` — which permits multiple rows for the same `from_uom` pointing at *different* `to_uom` values (e.g. a hypothetical direct `CM -> IN` row coexisting with the seeded `CM -> M` row). If such a second row ever exists, `_factor_to_base` can silently pick the wrong one and return a wrong factor with no error — the exact "silent wrongness" failure mode this audit is hunting for, and it sits directly behind the "never assume 1:1, always error or use a real factor" guarantee the module's own docstring advertises.

Mitigating factor (why this is LOW, not medium/high): grepping the whole backend, the only places that construct `UomConversion(...)` rows are test files and (per the module docstring) the `054_uom_conversion` seed migration — there is no API endpoint in the current codebase (checked `uom_api.py` in full) that lets any user create or edit a `UomConversion`/`UomUnit` row. So today this can only be triggered by a future migration or a not-yet-built admin feature, not by any exposed request path. Flagging because the missing `to_uom` filter is a real gap in the query itself, and the moment a "manage my tenant's UOMs" endpoint is added (which the tenant-scoped `is_base`/`UomUnit` design clearly anticipates) this becomes live.

Severity: low (currently unreachable via any exposed endpoint; genuine latent bug in the query logic).

## Not flagged / considered and dismissed
- `mbom_api.py` header/item/operation `mbom_number`/count-based numbering race (count-then-insert, no lock) — real TOCTOU race under concurrent creates, but it's the same pattern already used throughout `bom_service.py` (`create_bom`'s `bom_number`, `derive_mbom_from_ebom`'s `mbom_number`) — a pre-existing, codebase-wide convention, not something newly introduced by this wave's code, so not reported as a fresh defect here.
- `bom_effectivity_service._serial_key`'s two-bucket numeric/lexicographic ordering is already self-documented with a `ponytail:` comment acknowledging the limitation and its upgrade path — not re-reported.
- `requirements_api.coverage()`'s `linked_ids` subquery is a column-only (non-entity) select and may or may not receive the ORM tenant auto-filter; even if it doesn't, IDs are globally unique across tenants (autoincrement PK), so cross-tenant rows in that subquery cannot cause a false "covered" result for another tenant's requirement — no information disclosure, not reported as a tenant-isolation bug.
