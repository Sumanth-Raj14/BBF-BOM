# Scan: backend/alembic + backend/scripts

Files read in full: 51 (alembic: env.py, script.py.mako, 001-049 version files) + 17 (scripts: add_repr_to_models.py, audit_check_constraints.py, backup_cron.py, backup_crontab, backup_scheduler.py, benchmark_bom.py, consolidate_po.py, db_backup.py, docker-entrypoint.sh, init_db.py, initialize_backup.py, pitr_restore.py, recovery_test.py, restore_wizard.py, seed_e2e_fixture.py, startup_health_check.py, __init__.py) = 68 files total.

## Chain integrity check
Alembic revision graph (001 -> 049) is a single linear chain despite three files
sharing the literal revision id prefix "041" (041_compliance_pack_tables,
041_part11_esignatures, 041_zoho_books_sync_tables). Verified by tracing
down_revision pointers: 040 -> 041_compliance_pack_tables -> 041_part11_esignatures
-> 042 -> 043 -> 044_compliance_evaluations -> 041_zoho_books_sync_tables -> 045 ->
046 -> 047 -> 048 -> 049. No actual multiple-heads defect; the numeric filename
collisions are cosmetic (two feature branches both cut from 040, explicitly
"relinked" per their docstrings) and every down_revision is used exactly once.
Not reported as a finding.

## Findings

### 1. HIGH — Invalid PostgreSQL syntax: `ADD CONSTRAINT IF NOT EXISTS`
File: backend/alembic/versions/009_backup_and_schema_fixes.py:60
```python
op.execute(
    "ALTER TABLE po_headers ADD CONSTRAINT IF NOT EXISTS fk_po_headers_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id)"
)
```
PostgreSQL's `ALTER TABLE ... ADD CONSTRAINT` grammar has no `IF NOT EXISTS`
clause (only `ADD COLUMN IF NOT EXISTS` / `DROP ... IF EXISTS` are supported).
Running this migration against a real Postgres database raises a syntax error
and aborts the whole revision transaction, so nothing else in 009 upgrade()
(the backup_history table, all its indexes, the documents/parts column adds)
gets applied either — a single bad statement takes down the rest of the
migration. Every later migration in this codebase that needed the same
"add FK/constraint only if missing" behavior correctly uses the
`DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` pattern
(see 013, 016, 022) — 009 predates that convention and was never fixed.

### 2. HIGH — `contextlib.suppress(Exception)` around per-column DDL inside a single transaction silently no-ops the whole migration on first failure
Files:
- backend/alembic/versions/027_datetime_timezone_standardization.py:101-111
- backend/alembic/versions/033_money_columns_numeric.py:77-86
- backend/alembic/versions/034_qty_columns_numeric.py:49-58

```python
def upgrade() -> None:
    for table, columns in _MONEY_COLUMNS.items():
        for col in columns:
            with contextlib.suppress(Exception):
                op.alter_column(table, col, existing_type=OLD_TYPE, type_=NEW_TYPE)
```
Alembic runs an entire revision inside one DB transaction (see
backend/alembic/env.py: `with context.begin_transaction(): context.run_migrations()`).
On PostgreSQL, once any statement inside a transaction errors (e.g. a column
that doesn't exist, or is a different type than `existing_type` expects), the
connection enters "current transaction is aborted" state — every subsequent
statement on that same connection fails too, even ones that would otherwise
succeed. Because the loop wraps *each* `alter_column` call in its own
`contextlib.suppress(Exception)`, the first failure is swallowed, and then
every remaining `alter_column` in the loop also raises
(`InFailedSqlTransaction`/similar) and is also swallowed. Alembic reports the
migration as applied (no exception propagates, revision gets stamped), but at
COMMIT time Postgres rolls back the aborted transaction — so *none* of the
column type changes in that revision are actually persisted, silently. This
is a real risk of a "successful" migration that changes nothing: e.g. if one
Float→Numeric column in 033 doesn't exist on a given deployment's schema
(entirely plausible given how many tables in this codebase were formalized
piecemeal across migrations), the whole money-column precision fix silently
never lands and drifts further from the ORM models, with no error surfaced
anywhere.

### 3. MEDIUM — `restore_wizard.py --backup-id=<id>` (as documented) never matches the argv parser; falls through to interactive prompt
File: backend/scripts/restore_wizard.py:5, 385-390
Docstring (line 5): `python -m scripts.restore_wizard --backup-id=5`
Parser:
```python
if "--backup-id" in sys.argv:
    idx = sys.argv.index("--backup-id") + 1
    backup_id = int(sys.argv[idx]) if idx < len(sys.argv) else None
```
`sys.argv` contains the literal token `"--backup-id=5"` (one argument), not
`"--backup-id"`, so `"--backup-id" in sys.argv` is False when invoked exactly
as the module's own usage string instructs. Execution falls through to
`interactive_mode()`, which calls `input()` — this hangs (or raises
`EOFError`/immediately cancels) in any non-interactive context such as a cron
job, CI step, or ops runbook that follows the documented `--backup-id=<id>`
syntax, instead of restoring the requested backup. The only working form is
space-separated (`--backup-id 5`), which is never shown anywhere in the file.

### 4. LOW — `backup_cron.py --cleanup-only --dry-run` never previews anything real
File: backend/scripts/backup_cron.py:48-54
```python
if args.cleanup_only:
    if args.dry_run:
        print("[DRY RUN] Would clean up old backups")
    else:
        removed = await cleanup_old_backups(dry_run=args.dry_run)
        print(f"Cleaned up {len(removed)} old backups")
    return
```
When `--dry-run` is set, `cleanup_old_backups()` is never called at all (the
branch just prints a static string), even though the function itself accepts
a `dry_run` flag (used correctly elsewhere, e.g. `backup_scheduler.py`'s
retention logic and the module's own top-level `--dry-run` help text: "Preview
without changes"). A caller who runs `--cleanup-only --dry-run` expecting to
see which backups/files would be removed gets no information at all — the
"preview" is fake.

### 5. LOW — `benchmark_bom.py` prints a fabricated backend name in its own output
File: backend/scripts/benchmark_bom.py:14, 64
```python
engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
...
print("Bulk inserting items into PostgreSQL...")
```
The benchmark exclusively uses an in-memory SQLite engine (line 14) but its
own progress output claims it is inserting "into PostgreSQL" (line 64) and is
titled a "Performance Benchmark for BOM API." SQLite in-memory has
fundamentally different write/index/lock characteristics than the Postgres
the app actually runs on, so both the printed claim and the benchmark's
practical value as a Postgres performance signal are misleading — anyone
reading the script's own output would believe it exercised the production
database engine.

## Not findings (verified correct / already-documented, listed to avoid re-flagging)
- `po_headers`/`po_line_items`/`tenants`/~73 other tables have no
  `op.create_table` anywhere in the chain before they're referenced (004, 009,
  010, 020, 021...). This is intentional and explicitly documented in
  backend/scripts/init_db.py's module docstring: a raw `alembic upgrade head`
  on a bare Postgres DB cannot build these tables, so `init_db.py` bootstraps
  greenfield databases via `Base.metadata.create_all()` + `alembic stamp head`
  instead of replaying the full chain. `docker-entrypoint.sh` always goes
  through `init_db.py`, never raw `alembic upgrade head`.
- Multiple files literally named/revisioned "041_*" — verified to form a
  single linear chain (see "Chain integrity check" above), not a real
  multiple-heads bug.
- 038_drop_legacy_purchase_orders.py's `DROP TABLE purchase_orders` is
  carefully preceded by FK retargeting and is well-reasoned/guarded
  (`IF EXISTS`); not flagged as an unguarded destructive op.
- 049_restore_check_constraints.py adds 85 CHECK constraints as `NOT VALID`
  specifically so it cannot abort on pre-existing non-conforming rows —
  deliberate and documented.
