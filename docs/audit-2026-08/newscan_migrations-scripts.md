# Audit: migrations-scripts (050-056 chain + scripts)

Files read in full (14):
- backend/alembic/versions/050_rfq_headers_created_by_nullable.py
- backend/alembic/versions/051_export_templates.py
- backend/alembic/versions/052_bom_types.py
- backend/alembic/versions/053_bom_effectivity.py
- backend/alembic/versions/054_uom_conversion.py
- backend/alembic/versions/055_requirements.py
- backend/alembic/versions/056_cad_connections.py
- backend/alembic/env.py
- backend/scripts/_db_guard.py
- backend/scripts/init_db.py
- backend/scripts/seed_e2e_fixture.py
- backend/seed_po.py
- backend/fix_columns.py
- backend/seed_rbac.py

Also read for context (not counted as "assigned", read-only, to verify claims): app/db/session.py (resolve_database_url), app/core/config.py (DATABASE_URI default), app/models/mixins.py (TenantAwareMixin), app/core/tenant_events.py (auto-filter listeners), app/core/tenant_context.py (get_tenant_id default), app/models/po_models.py (POHeader/POLineItem), and a repo-wide grep of `down_revision` across alembic/versions to confirm the 050-056 chain does not branch.

## Chain verification (050-056)

049_restore_check_constraints -> 050 -> 051 -> 052 -> 053 -> 054 -> 055 -> 056. No branching, no duplicate revision ids in this range (grep of all `down_revision` assignments in the versions dir confirms exactly one migration claims each of 050..056 as its down_revision). Pre-existing branch anomaly at revision "041" (three files: 041_compliance_pack_tables, 041_zoho_books_sync_tables, 041_part11_esignatures) is OUTSIDE the 050-056 chain and predates today's work — out of scope per task, not reported.

Postgres-only DDL guarding: 050 and 052 guard raw `ALTER TABLE ... ALTER COLUMN` / `ADD CONSTRAINT ... CHECK` behind `bind.dialect.name != "postgresql": return`. 051/054/055/056's `_enable_rls()` helper guards RLS DDL behind both dialect==postgresql AND `settings.ENABLE_RLS`. All correctly guarded.

NOT NULL column additions: only 052 (`boms.bom_type`) adds a NOT NULL column, and it carries `server_default="EBOM"`, which Postgres applies to existing rows as part of the same ALTER (confirmed correct — this is standard Postgres behavior for a constant DEFAULT). No unguarded NOT NULL-without-default found in this batch.

`_db_guard.py`: fails closed correctly — default branch is `raise RuntimeError(...)`; only three explicit allow-paths (sqlite URL, name matches word-bounded test/e2e/scratch/sweep marker, or explicit `ALLOW_SEED_ON_LIVE_DB` truthy override). The marker regex `(?<![a-z0-9])(test|e2e|scratch|sweep)(?![a-z0-9])` correctly rejects substring false-positives like "bomtest_prod" or "attestation_prod" (verified by hand-tracing "attest": the embedded "test" is preceded by an alnum char so the lookbehind fails, no match) while still matching legitimate word-bounded names like "bom_test_db". Production default db name from `app/core/config.py` is `bom_db` (Postgres), which contains no marker substring at all — correctly refused by default. No bypass found.

## Findings

### 1. backend/seed_po.py:147-154 — every PO insert this script attempts fails (NOT NULL violation on tenantId); script cannot succeed as written

`POHeader(...)` and `POLineItem(...)` are constructed with no `tenantId` field set, and the script never calls `TenantContext.set()` / never establishes any tenant context (no import of `app.core.tenant_context` anywhere in the file). `TenantAwareMixin.tenantId` (`app/models/mixins.py:6-10`) is `nullable=False`. The only mechanism that back-fills `tenantId` on insert is the `before_insert` listener in `app/core/tenant_events.py:34-40`, which does `tid = get_tenant_id(); if tid is not None: target.tenantId = tid` — i.e. it only populates the column when a tenant context is already active. `get_tenant_id()` defaults to `None` (`app/core/tenant_context.py:10-20`) and nothing in seed_po.py ever sets it. Net effect: `target.tenantId` stays `None`, and the flush at `header = POHeader(...); session.add(header); await session.flush()` (line 147-156) raises an IntegrityError / NOT NULL constraint violation on the very first row, on both Postgres and SQLite (SQLite enforces NOT NULL too). The script cannot insert a single PO as currently written — this is a "script that cannot work" defect, not a hypothetical.

### 2. backend/seed_po.py:120-133 — "clear existing data" delete/select is not tenant-scoped (latent cross-tenant data-loss)

The re-run-safety delete only scopes by PO number:
```
existing_header_ids = (await session.execute(select(POHeader.id).where(POHeader.poNumber.in_(po_numbers)))).scalars().all()
...
await session.execute(delete(POLineItem).where(POLineItem.headerId.in_(existing_header_ids)))
await session.execute(delete(POHeader).where(POHeader.id.in_(existing_header_ids))))
```
`poNumber` is only unique **per tenant** (`uq_po_headers_tenant_poNumber` on `(tenantId, poNumber)` — `app/models/po_models.py:52`), so the same PO number string can legitimately exist for two different tenants. Per the tenant-isolation contract this audit was told to check: `app/core/tenant_events.py`'s automatic filtering covers only ORM `select()` (via `do_orm_execute`, gated on `execute_state.is_select`, `app/core/tenant_events.py:49-50`) and ORM-tracked `session.dirty`/`session.deleted` objects at flush (`_register_update_delete_filter`, lines 82-105). Neither of those covers a Core-style `delete(...)` statement executed via `session.execute()`, which is exactly what this script issues — so even in a build where the tenant-context bug above (#1) were fixed, this delete would still remove another tenant's `po_headers`/`po_line_items` rows whenever that tenant happens to already have a PO with a matching number. Concretely: tenant A has PO "PO-1001"; this script (run for tenant B, seeding from an Excel file that also contains "PO-1001") selects and deletes tenant A's header and line items with no `tenantId` predicate anywhere in the query. (In the code's *current* state this delete's effect is masked because the whole operation runs inside one `session.begin()` block and the later NOT NULL crash from finding #1 rolls the transaction back before commit — but the defect is real and would start actively deleting cross-tenant data the moment someone "fixes" #1 by passing an explicit `tenantId=` to the constructors without also touching this query, which is the most natural-looking fix.)

## Not flagged / considered and rejected

- `backend/seed_po.py:39` hardcoded absolute path `C:\Users\tsuma\Downloads\bom tool\Cleaned_Purchase_Orders.xlsx` — a real portability wart (fails with FileNotFoundError for anyone but this exact machine) but not one of the hunted failure classes and low-impact (one-off manual import script); omitted in favor of the two substantive defects above.
- `_db_guard.py` allowing "any sqlite URL" unconditionally — considered whether this could let a SQLite *production* DB (plausible given this project's "local-first"/on-prem/desktop-installer direction per project memory) get wiped by a seed script. Checked `app/core/config.py`: the configured production default is Postgres (`bom_db`), not SQLite, and I found no evidence in the read files that any shipped deployment path treats SQLite as the primary production store rather than a test/dev convenience. Not reported — would need confirmation from the desktop-packaging code (out of scope for this file set) to promote to a real finding.
- `alembic/env.py`'s own `TEST_DATABASE_URL > DATABASE_URL > DATABASE_URI` precedence duplicates `app.db.session.resolve_database_url()`'s precedence instead of calling it. Cosmetic/maintenance risk (drift if one is ever changed without the other) but functionally correct today; not reported as a defect.
- 052's `CHECK ... NOT VALID` constraint: deliberately skips validating existing rows to avoid a full-table scan/lock, but every existing row was already backfilled to `'EBOM'` by the same migration's `server_default`, so there's nothing that could violate it. Not a bug.
- seed_rbac.py and seed_e2e_fixture.py were checked against the same tenant-isolation pattern as seed_po.py and are clean: seed_rbac.py sets `tenantId=tenant_id` explicitly on every constructed `Role`/`Permission` and scopes every delete with `.where(Role.tenantId == tenant_id)` / `.where(Permission.tenantId == tenant_id)`; seed_e2e_fixture.py explicitly calls `TenantContext.set(tenant_id=tid)` before any ORM work and resets it in a `finally`.
