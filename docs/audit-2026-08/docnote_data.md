# DATA_HANDLING.md refresh — changelog

Verified against current code (not just prior doc text) before editing: `app/models/*.py`,
`app/core/tenant_events.py`, `app/core/backup.py`, `app/api/endpoints/documents.py`,
`app/api/endpoints/bulk_import.py`, `app/services/bom_service.py` (import_bom, apply_template),
`app/api/endpoints/compliance_api.py`, `app/api/endpoints/inventory_api.py`,
`app/api/endpoints/api_keys.py` / `auth.py`, `app/api/api_v1.py`, `backend/scripts/pitr_restore.py`,
`alembic/versions/048/049/050`, `.github/workflows/postgres-ci.yml`,
`docs/audit-2026-08/FIX_COVERAGE.md` + `fix2_*.md` writeups, `frontend/src/root/final-polish.jsx`.

## Corrections made (old doc → now accurate)

1. **Migration head 047 → 050.** Doc said "47 migrations, head 047" everywhere (intro
   flowchart, §5.1, numbering-trap chain). Actual chain now runs 047→048→049→050; 050 is
   head. Updated chain listing, table counts, and the CI `EXPECTED_HEAD` note.
2. **Tenant SELECT auto-filter — was "DEAD CODE critical", now FIXED.** `tenant_events.py`
   was rewritten to read `execute_state.bind_mapper` (not the nonexistent `mapper_`), and
   the try/except was deliberately removed so a future break fails loudly. Flipped §7.1's
   table status and rewrote the "critical finding" paragraph; also fixed the misleading
   "raw SQL blocked" log message (it now honestly says "bypasses... ensure it is scoped
   manually").
3. **Five previously-unmounted routers are now mounted.** `derivatives`, `formulas`,
   `graph`, `planning`, `solidworks_contract` are all registered in `app/api/api_v1.py`
   (with comments in that file explicitly noting they were "defined but never registered"
   before). Updated §8.1 and the §19 register; corrected the `solidworks_contract.py` "dead
   code" claim in §2.4.
4. **All four documented backup defects are fixed**, not open: encrypted physical-backup
   restore now uses the chunk-aware `_stream_decrypt` (was single-shot `fernet.decrypt`,
   always `InvalidToken`); `Settings.APP_NAME` now exists (email alerts no longer silently
   AttributeError); `tarfile.extractall(..., filter="data")` closes the tar-slip; webhook
   signatures now use real HMAC-SHA256. Rewrote §13.4 accordingly, keeping the two genuinely
   still-open low-severity items (raw error strings, SQL-key f-string in
   `update_backup_status`, non-unique `storage_path` lookup).
5. **PITR restore is now Windows-aware.** `pitr_restore.py` reads `WAL_ARCHIVE_DIR` from
   settings and branches `restore_command` on `os.name` (`copy` vs `cp`); same fix in
   `backup.py::restore_physical_backup`. Updated §14.2 (was "not yet a working recovery
   path on desktop").
6. **`part_certifications` cross-tenant leak — fixed.** `compliance_api.py`'s
   `get_part_compliance`/`certify_part` now validate `part_id`/`compliance_id` against the
   caller's tenant via `tenant_sql_clause()` before touching the global table. Updated §7.3,
   §16.2 item 8, §19. Also corrected: there is no `compliance.py` module in the current
   tree, only `compliance_api.py` — old doc cited both.
7. **`get_stock_valuation` no longer multiplies by a hardcoded 1.0.** Now uses
   `Inventory.unit_cost` falling back to `Part.cost`, returns `priced_items`. Added to §9.
8. **API key security: prefix-collision + scope-bypass, both fixed.** Every key used to get
   the literal prefix `"bkb"` (second active key → `MultipleResultsFound` 500 for everyone);
   raw key is now `bkb{6 random hex}_...` so the prefix is unique. `plugin_login` used to
   mint a full-scope bearer JWT from a read-only API key; it now requires `"write"` scope.
   Added a new note block to §15.3 (this wasn't covered in the old doc at all).
9. **`/health/detailed` was unauthenticated, leaking internal detail — now auth-gated.**
   Added to §18.3 (old doc listed the endpoint but didn't flag the prior vulnerability or
   its fix).
10. **`apply_template` bug — fixed.** It used to build `BOMItem` rows without producing
    matching `BomClosure` rows (and without a `bom_number`, which made every call fail
    outright). Now reuses `create_bom()` and calls `_closure_add_item()` per item. Updated
    §16.2 item 9.
11. **Migration 049 restores 82 missing `CHECK` constraints.** Discovered this migration
    while auditing 048-050; it wasn't in the old doc at all. A migrated database had only 3
    of 85 model-declared CHECK constraints vs. a fresh `create_all()` install having all 85
    — a real, consequential schema-drift bug now closed (`NOT VALID`, not retroactively
    enforced). Added to §5.1 and §16.1.
12. **Bulk CSV import (`/import`) does not create `Part` records — corrected from "✅ REAL"
    to "PARTIAL — stages rows, never creates records."** Read `bulk_import.py`: `process`
    only remaps JSON keys on `BulkImportRow`; no `Part`/`part_service` call anywhere in the
    file. Rewrote §2.2 and the §10.1 table row; cross-referenced
    RECOMMENDED_MAJOR_IMPROVEMENTS.md per the task brief. Also flagged that `GET /all/status`
    is not tenant-scoped (returns every tenant's jobs) while `GET /jobs` is.
13. **`import_bom` — corrected from "✅ REAL" to "explicit stub."** Confirmed in
    `bom_service.py`: creates an empty draft BOM, `file_url` is never fetched/parsed,
    returns `import_status: "not_implemented"` (previously fabricated `"success"` for the
    same empty result — that fabrication was also fixed this pass). Rewrote the §10.1 table
    row.
14. **`documents.py` file-handling section rewritten** to match the current 328-line file
    (was described from an older/shorter version): added the ClamAV/basic malware scan gate
    on upload, the content-hash-derived safe filename (never trusts the client filename),
    the `storage_type` mislabeling bug (documents used to always claim `'s3'` regardless of
    where bytes actually landed) and its fix, and the new `/download` endpoint (previously
    the vault could accept/list files but never serve bytes back) including its S3→local
    fallback and path-traversal containment check.
15. **Frontend `printPO()` GST 18% mismatch — noted as fixed.** Tax was computed at 8% while
    the printed label said "Tax (GST 18%)"; now computed at 18% to match the label. Added a
    short note in §10.2 (this is a frontend/print concern, flagged as out of the backend
    data-layer proper but relevant to "the document handed to a vendor doesn't match the
    system").
16. **Fabricated-data inventory updated** (§2.10, §9.3): several previously-cited MOCK
    behaviors were fixed this patch round (NCRScreen, WorkOrdersScreen fake substitution,
    ApprovalsScreen, fake SSO identities, fake forgot-password, permanently-seeded fake
    comments/approvals in AppCtx.jsx) — flagged as fixed with commit ref (`dbcab0d`). What
    remains fabricated is now largely dead-layer (not mounted from `src/main.jsx`).
17. **Cross-references updated** to name the 8 sibling docs by filename where relevant:
    added PROJECT_FEATURES_DOCUMENTATION.md (feature REAL/PARTIAL/MOCK status, replacing
    reliance on FEATURE_CATALOG.md alone), RECOMMENDED_MAJOR_IMPROVEMENTS.md (import gaps),
    PATCHES_APPLIED.md (fix commit trail), DEPLOYMENT_GUIDE.md/FIRST_TIME_SETUP.md, and
    `docs/audit-2026-08/FIX_COVERAGE.md`/`FINDINGS_FULL_SCAN.md` as the primary evidence
    source for every fixed/open call in the doc.

## Confirmed unchanged (verified still true in current code, left as-is)

- `parts.primary_vendor_id` still `ON DELETE CASCADE` (should be `SET NULL`).
- `boms.created_by`, `bom_templates.createdById`, `inventory_transactions.performed_by`
  still CASCADE on user delete.
- Inventory `reference_type` app-vs-DB CHECK mismatch still present (`receipt`/`issue`
  allowed in app, not in DB CHECK; `sales_order` reverse); `InventoryReservation` still has
  no DB CHECK at all.
- `uq_inventory_part_location_lot` NULLS-DISTINCT hole still present.
- `Numeric(10,4)` money columns on `bom_items_master`/inventory still present (overflow
  risk unchanged).
- Inverted BOM adjacency-list relationships (`bom.py:88`, `bom_item.py`) unchanged.
- Desktop `backend.exe` still never stamps/migrates Alembic (schema drift risk unchanged).
- `update_backup_status` SQL f-string on kwargs keys, and `run_backup_pipeline`'s
  non-unique `storage_path` lookup — both still present, correctly still flagged as open.
- `routing_api.py` list/get reads still tenant-unscoped (only the raw INSERTs were fixed
  this pass, per `fix2_tenant-insert-valuation.md`) — called out explicitly as still open.

## Structure

No sections added/removed — all 19 numbered sections + ToC were already present and
complete; both required Mermaid diagrams (lifecycle flowchart, ER diagram) were already
present and untouched structurally (only a label inside the flowchart changed: migration
count/head). Edits were surgical (Edit tool, not full rewrite) to preserve everything that
was already accurate.
