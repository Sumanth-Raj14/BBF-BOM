# Durability: what protects your data, and what doesn't (yet)

Blackbox BOM is local-first: PostgreSQL, the backend, and the frontend all
run on the same Windows machine, so the interesting durability question is
"what happens if the power dies or the process is killed mid-operation?" and
"what happens if I lose the machine entirely?" This document answers both,
in plain terms, and then names the one gap that is **not** solved by the
database layer: unsaved edits sitting in the browser UI.

## 1. Power-outage / crash safety (ACID + WAL)

Every write the backend makes goes through PostgreSQL inside a transaction.
PostgreSQL's crash safety comes from **write-ahead logging (WAL)**: before
any change is applied to the actual data files, the change is first written
and `fsync`'d to the WAL. If the machine loses power or the postgres process
is killed at any point, the next startup replays the WAL to reconstruct
exactly the set of transactions that were durably committed -- nothing more,
nothing less. This is what "ACID" (specifically the D, Durability) means in
practice.

The bundled cluster's `postgresql.conf` (seeded from
[`postgresql.conf.template`](postgresql.conf.template) on first run) sets the
three settings that make this guarantee hold on real hardware:

| Setting | Value | Why |
|---|---|---|
| `fsync` | `on` | Forces the OS to actually flush WAL writes to the physical disk instead of leaving them in a volatile OS cache. Without this, a power loss can lose "committed" data that was never really on disk. |
| `synchronous_commit` | `on` | The client (our backend) is not told "commit succeeded" until the WAL fsync above has completed. Without this, the app could believe a save succeeded when it hadn't hit disk yet. |
| `full_page_writes` | `on` | Protects against **torn pages**: if power is lost mid-write to a data file, the first change to a page after each checkpoint is fully re-logged in WAL so it can be perfectly reconstructed, rather than left half-written. |

Net effect: once the API has returned a `200`/`201` for a save (BOM edit,
part creation, PO, etc.), that data will survive a hard power-off of the
machine. This requires no user action -- it's the database engine doing its
job.

`wal_level = replica` is also set (required for archiving, see below) and is
compatible with `synchronous_commit`/`fsync` -- it does not weaken crash
safety, it only controls how much extra information is written to WAL for
archiving/replication purposes.

## 2. Scheduled backups + retention

`backend/scripts/db_backup.py` runs `pg_dump` in custom (`-F c`) format
against the running cluster and writes timestamped dumps to
`backups/bom_tool_backup_<YYYYMMDD_HHMMSS>.dump`. Each run also enforces
**retention**: after a successful dump, only the newest **30** dump files are
kept (`backups.sort(key=os.path.getmtime)[:-30]` are deleted). This is a
logical backup -- it can be restored into any compatible PostgreSQL instance
with `pg_restore`, independent of the desktop machine's filesystem.

This is intentionally simple and self-contained (no external services, in
keeping with local-first). In a full deployment you would invoke it on a
schedule (Windows Task Scheduler calling
`python -m scripts.db_backup`, or the more elaborate
`backend/scripts/backup_scheduler.py` daemon, which adds daily/weekly/
monthly/yearly buckets and an APScheduler-driven cron plus an in-app alert
row on failure). Either way, backups land under `DATA_DIR\backups\` per the
shared contract so they persist across app updates and uninstall/reinstall.

**Restore path**: `pg_restore --dbname <url> <dump file>` against a freshly
`initdb`'d cluster, then run `python -m scripts.init_db` to reconcile the
Alembic version stamp if needed. See `backend/scripts/restore_wizard.py` for
a guided restore and `backend/scripts/recovery_test.py` for periodically
verifying that a given dump actually restores cleanly (a backup you have
never test-restored is not a verified backup).

## 3. Point-in-time recovery (PITR)

`db_backup.py` dumps give you hourly/daily granularity at best. For
finer-grained recovery (e.g. "restore to 11:47am, one minute before someone
fat-fingered a delete"), the cluster also archives every WAL segment as it's
produced:

```
archive_mode    = on
archive_command = copy "%p" "DATA_DIR\wal_archive\%f"
```

Combined with a base backup, this lets `backend/scripts/pitr_restore.py`
replay WAL up to an arbitrary `--target-time` or `--target-xid`:

```
python pitr_restore.py --target-time "2026-07-11 11:47:00 UTC"
python pitr_restore.py --cleanup-wal --keep-days 7   # prune old WAL segments
```

It writes a dedicated `blackbox_recovery.conf` (referenced via
`include_if_exists` in `postgresql.conf`, never appended into
`postgresql.auto.conf`) plus a `recovery.signal`, so a normal restart of the
cluster performs the replay. WAL segments accumulate over time and must be
pruned (`--cleanup-wal`) or you will slowly fill the disk -- this is a
housekeeping task the same schedule that runs `db_backup.py` should also
run.

## 4. Known gap: unsaved in-UI edits are not autosaved

Everything above protects data **once the backend has written it**. It does
**not** protect a user's in-progress edits that are still sitting in the
browser and have not yet been submitted to the API -- if Windows crashes, the
browser tab is closed, or the process is killed while someone is mid-edit,
that unsaved work is lost exactly as it would be in any other webapp. This
is a real, currently-unaddressed gap and needs an app-level autosave/draft
mechanism (e.g. periodic `PATCH` of a draft, or a `localStorage`-backed
recovery buffer with a "restore your unsaved changes?" prompt on reload) as
a follow-up, not something PostgreSQL's durability guarantees can fix.

A rough inventory of screens by draft risk, based on the current frontend
(`frontend/src`), to scope that follow-up:

**Highest risk -- large, session-long editing surfaces with an explicit
Save action and no draft persistence in between:**
- `root/bom-editor.jsx` / `BomEditorScreen.jsx` -- the primary BOM line-item
  editor; the biggest single surface for lost work if it crashes mid-edit.
- `root/detail-drawer.jsx` -- part/item detail editing drawer.
- `root/parts-screen.jsx` -- inline parts table editing.
- `components/screens/ProcurementScreen.jsx`, `components/screens/OCRScreen.jsx`
  -- PO/procurement and OCR-assisted data entry forms.
- `components/modals/VendorDetailModal.jsx`, `components/modals/QuoteHistoryModal.jsx`
  -- multi-field modal forms with no intermediate persistence.

**Partially mitigated -- persisted to browser `localStorage`
(`frontend/src/utils/storage.js`), so they survive a crash/reload of the
same browser profile, but are *not* part of the Postgres backup/PITR story
above and are lost if the browser's site data is cleared:**
- `components/advanced/ECRScreen.jsx` (Engineering Change Requests --
  `storage.ecrs`)
- calendar/collaboration events (`storage.calendarEvents`)
- saved views, saved searches, and templates (`storage.savedViews`,
  `storage.savedSearches`, `storage.templates`)
- documents metadata cache (`storage.docs`)

**Low risk -- read-mostly or single-field/immediate-save interactions:**
- `components/screens/AnalyticsScreen.jsx`, `AuditTrailScreen.jsx`,
  `ActivityScreen.jsx`, `DiffScreen.jsx`, `WorkQueueScreen.jsx` -- primarily
  display/reporting screens with little or no free-form draft input.

This list is a starting point, not an exhaustive audit -- treat the
"highest risk" screens as the priority for adding autosave, and do a proper
per-screen sweep (grep for form state that is only flushed to the API on an
explicit "Save"/"Submit" click) before considering this gap closed.
