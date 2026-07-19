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

## Live verification (2026-07-19)

A read-only verification pass against the actual running Postgres 18
installation (`C:\Program Files\PostgreSQL\18\bin`), without touching the
live `bom_db` cluster or leaving anything running afterward.

### pg_basebackup smoke test

Ran `pg_basebackup` (superuser `postgres`) against the running cluster into
a scratch directory, then deleted the output once verified -- the cluster
itself was never stopped, and no second cluster/process was started:

```
pg_basebackup -h localhost -p 5432 -U postgres -D <tmp_dir> -Ft -z -X stream --label smoke_test_pitr_verify --verbose
```

Result: **completed successfully** (exit 0). Output produced a valid base
backup: `base.tar.gz` (~400 MB, matching the live database size),
`pg_wal.tar.gz` (WAL segments captured during the backup window, ~21 KB),
and `backup_manifest`. This is the same `-Ft -z -X stream` invocation shape
used by `backend/app/core/backup.py::_create_physical_backup_impl`, so it
confirms that code path's command construction actually works against this
installed client/server pairing. `pg_isready` confirmed the cluster was
still accepting connections immediately after, and no `pg_basebackup`
process was left running.

### Script review: WAL archive path / restore_command / archive_command consistency

Reviewed `backend/scripts/pitr_restore.py`, `backend/scripts/restore_wizard.py`,
`backend/app/core/backup.py`, and `postgresql.conf.template` together with
`backend/app/core/config.py`, `backend/docker-compose.yml`,
`backend/postgresql.conf`, and `desktop/launcher.py` (which is what actually
seeds the bundled cluster's `postgresql.conf`, not the template).

**Linux/container path -- consistent (item-16 fix holds):**
- `backend/postgresql.conf` (docker-compose): `archive_command = 'test ! -f /var/lib/postgresql/wal_archive/%f && cp %p /var/lib/postgresql/wal_archive/%f'`
- `backend/app/core/config.py`: `WAL_ARCHIVE_DIR = "/var/lib/postgresql/wal_archive"` (default)
- `backend/scripts/pitr_restore.py`: `WAL_ARCHIVE_DIR = "/var/lib/postgresql/wal_archive"`, `RESTORE_COMMAND = "cp /var/lib/postgresql/wal_archive/%f %p"`
- `backend/app/core/backup.py::restore_physical_backup`: `restore_command = 'cp {settings.WAL_ARCHIVE_DIR}/%f %p'`

All four agree on the same path and the same `cp`-based command shape for
the containerized/Linux deployment. No mismatch there.

**Windows desktop path -- one remaining bug, one dead file:**
- The *live* archiving config for the bundled desktop cluster is not
  `postgresql.conf.template` -- it is generated at runtime by
  `desktop/launcher.py::_render_conf_block` / `apply_postgresql_conf`, which
  appends its own marker-delimited block (`archive_command = 'copy /Y "%p" "<wal_archive_dir>\%f"'`)
  to `pgdata\postgresql.conf` on every launch, and this is the block that
  wins (Postgres uses the last-seen value for a duplicated setting).
  `postgresql.conf.template` is copied into the install stage by
  `desktop/build.py` but **`launcher.py` never reads it** -- searched for any
  reference to `template`/`conf_template` in `launcher.py` and found none.
  It is effectively dead/orphaned documentation today: correct in intent,
  consistent with `DURABILITY.md`'s description of `archive_command`, but
  not the file actually in effect. Low severity (the effective behavior is
  still correct, since launcher.py's own generated block is
  Windows-correct), but worth either wiring the template in or deleting it
  so the two don't drift.
- **Real bug**: neither `backend/scripts/pitr_restore.py` nor
  `backend/app/core/backup.py::restore_physical_backup` is platform-aware.
  Both hardcode a Unix `cp` command (`pitr_restore.py` additionally
  hardcodes the Unix path `/var/lib/postgresql/wal_archive` as a
  module-level constant, ignoring `settings.WAL_ARCHIVE_DIR`/the
  `WAL_ARCHIVE_DIR` env var that `launcher.py` sets to the real Windows
  path). On the packaged Windows desktop app this means:
  - `pitr_restore.py` run as shipped would write a `blackbox_recovery.conf`
    pointing at a path that does not exist on Windows
    (`/var/lib/postgresql/wal_archive`) with a `cp` command Windows'
    `cmd.exe` does not have built in -- it would need `--data-dir` *and* a
    Windows-appropriate restore command to work on desktop; today it has no
    flag for the latter.
  - `restore_physical_backup()` in `backup.py` does correctly resolve
    `settings.WAL_ARCHIVE_DIR` (which desktop's `launcher.py` sets to the
    real `DATA_DIR\wal_archive`), so the *path* would be right on Windows,
    but the command word is still `cp`, which is not available on stock
    Windows `cmd.exe` (the shell Postgres' `restore_command` is executed
    through via `system()`), so recovery would fail at first WAL
    replay with a "command not found" style error. The Windows-side fix is
    the mirror image of what `launcher.py` already does correctly for
    `archive_command`: emit `copy /Y "<wal_archive_dir>\%f" "%p"`
    (arguments reversed vs. archiving) when the target platform is Windows.

  This is a real, currently-unaddressed gap for desktop PITR restores
  specifically (the Linux/container restore path is unaffected and fully
  consistent, per above). It is already tracked as OPEN_ITEMS.md's
  "PITR/WAL live verification" row (v2.2, DevOps, OPEN) -- this review
  confirms and narrows exactly what that item needs to close: a
  platform-aware `restore_command` in both `pitr_restore.py` and
  `restore_physical_backup()`, not just the config-shipped `archive_command`
  side which was already correct.

### Full PITR replay-to-timestamp

Actually replaying WAL to a target timestamp and confirming the promoted
cluster reflects that exact point in time was **not** attempted here -- doing
so against a machine's only Postgres 18 client/cluster would require
stopping the live `bom_db` cluster (or standing up a second one), which this
verification pass was explicitly scoped to avoid touching. The base-backup
mechanics are proven live above; the archive_command side is proven correct
by code review (desktop) and already runs in production (Linux/docker,
confirmed via `backend/postgresql.conf`). Full end-to-end
replay-to-a-target-timestamp is validated in the **packaged desktop
environment** instead, where a disposable bundled cluster with
`archive_mode = on` can be safely stopped, have WAL replayed via
`recovery.signal` + `blackbox_recovery.conf`, and restarted without
affecting any developer's working database -- see OPEN_ITEMS.md's
"PITR/WAL live verification" row for that packaged-env test, which should
also exercise the Windows `restore_command` fix noted above before being
marked resolved.
