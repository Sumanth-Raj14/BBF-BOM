# Audit: core-changed area

Files read in full:
- backend/app/db/session.py
- backend/app/core/deps.py
- backend/app/core/config.py
- backend/app/main.py
- backend/app/services/bom_service.py (2253 lines)

## Summary

session.py, deps.py, config.py, main.py are heavily hardened already (extensive
inline comments referencing prior incidents/audits: "INCIDENT 2026-08-09",
"A13", "bom-integrity finding", P0-architectural design brief). No new defects
found in these four files matching the hunted failure classes. Specifically
checked and clean:
- session.py: resolve_database_url() precedence (TEST_DATABASE_URL > DATABASE_URL
  > settings.DATABASE_URI) is correct and matches the documented incident fix;
  redact_url regex is fine; get_db/get_session_maker close sessions in finally.
- deps.py: API-key scope enforcement (_required_api_key_scope defaults to
  "write" for unknown methods -> default-deny, correct), RLS bootstrap
  open/close paired on every return path, rate limits configurable via
  settings, MFA-for-superuser gate present on both API-key and bearer-token
  paths.
- main.py: each background scheduler (backup/integration-drainer/zoho-poll/
  notification-drainer) is a single while-loop that awaits completion before
  sleeping (no overlap) and wraps its body in try/except so a failure can't
  kill the loop or startup; lifespan awaits init_engine() before scheduling
  tasks; shutdown cancels all four tasks and disposes the engine.
- config.py: SECRET_KEY / POSTGRES_PASSWORD / ENCRYPTION_KEY / S3_SECRET_KEY
  entropy + known-weak-value checks, production requires env-supplied
  SECRET_KEY (no auto-generation), Vault loading is best-effort.

## Findings in bom_service.py

### 1. [HIGH] Cross-tenant Part leak via BOM variant items
File: backend/app/services/bom_service.py
- add_variant_item, line 2052: `part = await db.execute(select(Part).where(Part.id == part_id))`
  has NO tenant filter, unlike every other part_id-accepting write in this file
  (create_bom_item line 531, update_bom_item line 579 both filter
  `Part.tenantId == tid`). Any authenticated tenant user can call
  add_variant_item with an arbitrary/guessed part_id belonging to ANOTHER
  tenant; the existence check passes and a BomVariantItem row is persisted
  referencing that foreign part_id under the caller's own (correctly-scoped)
  variant.
- get_variant, line 2005: `pr = await db.execute(select(Part).where(Part.id.in_(part_ids)))`
  also has NO tenant filter. When the caller then views their own variant
  (itself correctly tenant-scoped), this query resolves the foreign part_id
  from step 1 and returns `part_number`/`part_name` (line 2016) — i.e. tenant A
  can read tenant B's part number/name by guessing/enumerating part IDs.
- Concrete failure: tenant A creates a variant (create_variant, tenant-scoped
  OK), then POSTs add_variant_item with part_id=<tenant B's part id>. Call
  succeeds (no 404, since the query finds the row regardless of tenant).
  Tenant A then GETs the variant and receives tenant B's real part_number and
  part_name in the response body — a cross-tenant data leak of the exact kind
  called out in the task brief (P0 leak class), caused by a raw unscoped
  select() rather than by tenant_events (which only auto-filters ORM select()
  used directly on request-scoped queries with a tenant filter already
  present — here the filter itself is simply missing from the call site).
- Fix: add `.where(Part.tenantId == tid)` (guarded by `if tid is not None`,
  matching every other Part lookup in this file) to both call sites.

### 2. [MEDIUM] Cross-tenant BOM item-count leak via create_template
File: backend/app/services/bom_service.py, lines 2156-2161
```
if source_bom_id:
    src = await db.execute(select(BOM).where(BOM.id == source_bom_id))
    if src.scalar_one_or_none():
        items = await db.execute(select(BOMItem).where(BOMItem.bom_id == source_bom_id))
        ptc = len(items.scalars().all())
```
Neither the BOM nor the BOMItem query is scoped by tenantId (contrast with
apply_template a few lines later, which does scope its BomTemplate lookup by
tid). A tenant user can pass any `source_bom_id`, including one owned by
another tenant, and the resulting BomTemplate row's `partCount` will reflect
that foreign BOM's real item count — a cross-tenant information leak (existence
+ item count of another tenant's BOM), reachable by brute-forcing small
sequential integer IDs.
Fix: add `.where(BOM.tenantId == tid)` / `.where(BOMItem.tenantId == tid)`
(tid = get_tenant_id(), already computed later in the function — move it up).

### 3. [LOW] Unscoped Part lookups used only for pre-tenant-scoped part_ids (no
actual leak, flagged for completeness/consistency)
Lines 1739 (create_snapshot), 1836 (compare_boms), 1905 (create_baseline),
2085 (export_bom): `select(Part).where(Part.id.in_(...))` without a tenant
filter. In every one of these the `part_ids` come from BOMItem rows that were
themselves fetched with a tenantId filter, and BOMItem.part_id is validated
against the same tenant at write time (create_bom_item, update_bom_item), so
under normal operation these can't resolve to a foreign tenant's Part. Listed
as low/defense-in-depth only because finding #1 above shows that assumption
("part_id is always tenant-validated at write time") is not actually enforced
everywhere in this same file — apply_template (line ~2220) also inserts
BOMItem rows with `part_id=ti.partId` taken from a BomTemplate item with no
Part-tenant check at all. Recommend adding the tenant filter defensively to
these read paths as well, but not raising severity without confirming a
concrete unscoped write path reaches them (haven't fully traced
TemplateBomItem creation, out of scope for this file).

### 4. [LOW] N+1 per-item refresh/webhook emission in apply_template
File: backend/app/services/bom_service.py, lines 2237-2250
After creating N BOMItem rows for a template with N lines, the function loops
once per item to call `_closure_add_item` (fine, no extra query when
parent_item_id is None, which it always is here), then after commit loops
again per item calling `await db.refresh(item)` (one SELECT per item) and
`await webhook_service.emit_event(...)` (one additional round-trip, plus
whatever emit_event itself does per call — not traced, out of scope file) per
item. For a large template (hundreds of lines) this is O(N) round trips where
O(1) or O(log N) would do (e.g. skip refresh() and read known attributes
already on the in-memory objects; batch the webhook emission). Not a
correctness bug, flagged as a performance/scalability concern only.

## Not flagged (verified correct, worth recording so it isn't re-litigated)
- get_quantity_rollup / get_cost_rollup: UOM mismatches are converted via
  uom_service.try_convert/extended_cost; on conversion failure the line is
  NOT silently folded in as 1:1 — it's excluded from the total and surfaced in
  `uom_warnings` in the returned dict (both callers propagate it). Matches the
  "silent wrongness" hunt criterion — this code does NOT do that.
- _drop_excluded_subtrees / _compute_levels_and_effective_qty: exclude_from_bom
  cascade-drop and effective-quantity multiplication (qty * ancestor qty down
  to root) are correctly recursive and consistent between
  get_bom_explosion/get_bom_explosion_via_closure and the three rollups. Cycle
  protection (`item_id in visiting`) prevents infinite recursion on malformed
  cyclic data; the exact numeric result for such (invalid) cyclic input is not
  well-defined, but it terminates rather than crashing or hanging.
- import_bom: correctly reports `import_status: "not_implemented"` rather than
  fabricating success — file_url is genuinely never parsed, and this is stated
  in both the returned warnings and an inline comment referencing a prior
  audit finding ("bom-integrity finding 2").
- derive_mbom_from_ebom: read-only against the source EBOM, tenant-scoped
  throughout, correctly skips lines with no part_id rather than fabricating one.
