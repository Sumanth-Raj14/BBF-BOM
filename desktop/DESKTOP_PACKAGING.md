# Desktop Packaging Runbook

How to build, sign, and release the Blackbox BOM Windows desktop installer,
and how the auto-update flow works once it's installed. This is a single-
machine, local-first app: one installer bundles PostgreSQL, the FastAPI
backend, and the built frontend into one process tree. Network access is
only ever used, best-effort, to check for updates -- the app always runs
fully offline.

## 1. Prerequisites (build machine)

Install these once on whatever Windows machine cuts releases:

| Tool | Why | Check |
|---|---|---|
| Python 3.11+ | runs `build.py`, backend, and PyInstaller | `python --version` |
| Node.js (LTS) + npm | builds the frontend | `node --version` / `npm --version` |
| PyInstaller | freezes the backend + launcher into .exe bundles | `pip install pyinstaller` then `pyinstaller --version` |
| Inno Setup 6 (`iscc.exe`) | compiles `installer.iss` into the setup .exe | https://jrsoftware.org/isinfo.php -- default install adds `ISCC.exe` under `C:\Program Files (x86)\Inno Setup 6\` |
| PowerShell (5.1 or 7/`pwsh`) | runs `build_frontend.ps1` / `fetch_postgres.ps1` | built into Windows / `pwsh --version` |
| Portable PostgreSQL binaries | bundled into the installer so end users need nothing pre-installed | fetched automatically by `fetch_postgres.ps1` into `desktop/build/pgsql` |
| (Optional) Code-signing certificate | avoids SmartScreen warnings on end-user machines | a `.pfx` file + password |
| (Optional) Windows SDK `signtool.exe` | only needed if you set a signing cert | included with Visual Studio / Windows SDK |

Everything below assumes commands are run from
`desktop/` inside the repo:
`C:\Users\tsuma\Downloads\bom tool\bom tool v1\bom-tool\desktop`.

## 2. One-command build

```powershell
cd "C:\Users\tsuma\Downloads\bom tool\bom tool v1\bom-tool\desktop"
python build.py
```

This runs the full pipeline end to end and fails fast with a clear message
naming the missing tool/file if any prerequisite above is absent:

1. **Frontend** -- `build_frontend.ps1` runs `npm ci && npm run build` in
   `../frontend`, producing `frontend/dist`.
2. **Backend bundle** -- PyInstaller builds `backend.spec` (the FastAPI app
   at `app.main:app` served by uvicorn) into a onedir bundle.
3. **Launcher bundle** -- PyInstaller builds `launcher.spec` into
   `launcher.exe`, the single entry point end users double-click.
4. **Portable PostgreSQL** -- `fetch_postgres.ps1` downloads/extracts the
   portable Postgres binaries into `desktop/build/pgsql` (binaries only, no
   data directory -- that's created at first run on the end-user machine).
5. **Assemble** -- everything is copied into
   `desktop/build/install/` mirroring the final `INSTALL_DIR` layout:
   `launcher.exe`, `backend\`, `frontend\dist\`, `pgsql\`, plus
   `postgresql.conf.template`.
6. **Compile installer** -- `iscc installer.iss` packages
   `desktop/build/install/` into
   `desktop/dist/BlackboxBOM-Setup-<version>.exe`.
7. **Sign (optional)** -- if `CODE_SIGN_PFX` (and optionally `CODE_SIGN_PW`)
   are set in the environment, `signtool` Authenticode-signs the installer.
   If unset, this step is silently skipped and the installer ships unsigned.
8. **Feed** -- writes `desktop/dist/feed.json` with the version, a
   placeholder download URL, and the installer's SHA-256, ready for you to
   fill in the real URL and publish (step 4 below).

Useful flags:

```powershell
python build.py --version 2.1.1                 # override desktop/version.json
python build.py --skip-frontend                  # reuse existing frontend/dist
python build.py --skip-postgres                   # reuse cached build/pgsql
python build.py --skip-sign                        # force an unsigned build
python build.py --skip-installer                    # stop after assembling INSTALL_DIR (no iscc/sign/feed)
python build.py --no-pgsql                          # assemble without bundled Postgres (implies --skip-installer);
                                                      # see section 6 for running the result against an
                                                      # already-installed/pointed Postgres via BLACKBOX_SKIP_PG
```

Signing environment variables (set before running `build.py`, never commit
them):

```powershell
$env:CODE_SIGN_PFX = "C:\secure\blackbox-bom-codesign.pfx"
$env:CODE_SIGN_PW  = "..."
```

## 3. Cutting a release

1. Bump the version in `desktop/version.json`:
   ```json
   { "version": "2.1.1", "feed_url": "https://<your-host>/blackbox-bom/feed.json" }
   ```
   `feed_url` is baked into the *installed app* (via the same file, shipped
   inside the frontend/backend bundle) so it knows where to check for
   updates -- it does **not** need to change between releases unless you
   move the feed's hosting location.
2. Run `python build.py` (see flags above). Confirm at the end:
   - `desktop/dist/BlackboxBOM-Setup-2.1.1.exe` exists
   - `desktop/dist/feed.json` exists and its `"latest"` matches the version
     you just built
3. Smoke-test the installer locally: run it in a scratch VM/user account,
   confirm the app launches, initializes Postgres, opens the browser, and
   the version shown in-app matches.
4. **Publish**: upload `BlackboxBOM-Setup-2.1.1.exe` to wherever `feed.json`'s
   `"url"` points (e.g. a GitHub Release asset, S3 bucket, static file host
   -- anything reachable over HTTPS), then upload/overwrite `feed.json` at
   the exact URL configured as `feed_url` in `desktop/version.json`. Order
   matters: publish the `.exe` first, the `feed.json` pointing at it second,
   so no client ever sees a feed advertising a not-yet-uploaded file.
5. Keep the previous release's `.exe` available at its old URL for a while
   (don't delete immediately) in case any in-flight downloads or slow
   rollouts reference it.

## 4. How auto-update works end to end

This app is local-first: it **never** requires network access to run. The
feed check is the one place it optionally reaches out, and it fails silently
if there's no connectivity.

1. On launch (or on a periodic timer while running), the app does a
   best-effort `GET` of the `feed_url` from `desktop/version.json`.
2. If the request fails (no internet, DNS, timeout, non-200) it is caught
   and ignored -- the app continues running normally with no user-facing
   error. Local-first means the absence of internet is never a failure
   state.
3. If the request succeeds, the feed JSON is parsed:
   ```json
   { "latest": "2.1.1", "url": "https://.../BlackboxBOM-Setup-2.1.1.exe", "sha256": "...", "notes": "..." }
   ```
4. `latest` is compared against the currently-installed `version.json`
   version. If it's newer, the user is shown an in-app "update available"
   notice (never a forced/silent install -- the user chooses when to
   update).
5. If the user accepts, the installer at `url` is downloaded, its SHA-256 is
   verified against the feed's `sha256` field before anything is executed
   (protects against a corrupted download or a tampered/misconfigured feed
   host), and only then is the downloaded `BlackboxBOM-Setup-<version>.exe`
   launched.
6. The new installer runs the same Inno Setup flow as a fresh install: it
   overwrites `INSTALL_DIR` (binaries only) and leaves `DATA_DIR` completely
   untouched, so the Postgres cluster, `.env` secrets, backups, logs, and
   WAL archive all persist across the update.
7. Next launch runs the new `launcher.exe`, which starts the (unchanged)
   Postgres cluster, runs `python -m scripts.init_db` (idempotent --
   applies any pending Alembic migrations against the existing data), and
   starts the new backend/frontend.

Because `DATA_DIR` is never touched by the installer, a failed or
interrupted update never risks data loss -- worst case the user re-runs the
installer or rolls back to the previous `.exe`.

## 5. Install / data-directory layout

Matches the shared contract exactly; every component of the app agrees on
these two paths:

```
%ProgramFiles%\BlackboxBOM\              INSTALL_DIR -- app binaries, read-only after install/update
    launcher.exe                          single entry point end users double-click
    backend\                              PyInstaller onedir bundle (app.main:app + uvicorn)
    frontend\dist\                        built React app, served by the backend (StaticFiles + SPA fallback)
    pgsql\bin\                            portable Postgres binaries (initdb, pg_ctl, postgres, pg_dump, ...)
    postgresql.conf.template              seed config, copied into pgdata on first run only

%ProgramData%\BlackboxBOM\               DATA_DIR -- persists across updates AND uninstall
    pgdata\                               the actual Postgres cluster (initdb'd on first run)
    .env                                   generated secrets: SECRET_KEY, ENCRYPTION_KEY, S3_SECRET_KEY,
                                           POSTGRES_PASSWORD, DATABASE_URL, etc. -- created once, never
                                           regenerated
    backups\                              db_backup.py dumps (30 most recent kept) + backup_scheduler
                                           daily/weekly/monthly/yearly buckets
    logs\                                 uvicorn + launcher + backup scheduler logs
    wal_archive\                          archived WAL segments for PITR (backend/scripts/pitr_restore.py)
```

First-run sequence (launcher.exe): `initdb` into `DATA_DIR\pgdata` with
`postgresql.conf.template` seeded in -> generate `.env` with strong random
secrets and create the `bom_user`/`bom_db` role+database -> `pg_ctl start` ->
wait for ready -> start the backend -> open the default browser to the app.

Every subsequent run: `pg_ctl start` -> wait for ready -> start the backend
-> open browser.

Starting the backend itself is one of two modes, chosen automatically by
whether `INSTALL_DIR\backend\backend.exe` exists (see launcher.py's
"Backend modes" docstring section for the full rationale):
- **Bundled exe** (the normal installed case): launcher.exe runs
  `backend.exe` directly; schema bootstrap happens in-process at backend
  startup via `app.main`'s FastAPI lifespan (`Base.metadata.create_all`,
  idempotent on every launch).
- **Python fallback** (no `backend.exe`, e.g. a plain dev checkout):
  launcher.py resolves a python interpreter and runs
  `python -m scripts.init_db` out-of-process first (greenfield:
  `create_all` + `alembic stamp head`; on an already-managed DB: an
  incremental `alembic upgrade head`), then `python -m uvicorn app.main:app`.

See section 6 below for how to assemble and run the bundled-exe path
locally on this machine without a full installer build.

Shutdown: stop uvicorn first, then `pg_ctl stop -m fast` -- always the
database last, so no client is ever mid-request when Postgres goes down,
and `-m fast` still performs a clean shutdown checkpoint (as opposed to
`-m immediate`, which would rely purely on WAL replay on next start).

See [`DURABILITY.md`](DURABILITY.md) for why this configuration is safe
across a hard power loss, the backup/PITR story, and the one known gap
(unsaved in-UI drafts) that this packaging/database layer does not solve.

## 6. Running the assembled dev bundle on this machine

You don't need Inno Setup, a code-signing cert, or the portable-Postgres
download just to smoke-test that `launcher.exe` + the bundled `backend.exe`
+ the built frontend actually compose correctly. This machine already has
its own Postgres (the one `backend/.env` / the dev workflow normally talks
to), so the fastest loop reuses that instead of fetching/bundling a second,
portable copy.

### 6.1 Assemble without installer or bundled Postgres

```powershell
cd "C:\Users\tsuma\Downloads\bom tool\bom tool v1\bom-tool\desktop"
python build.py --no-pgsql
```

`--no-pgsql` skips `fetch_postgres.ps1` and the `pgsql\` copy entirely (and
implies `--skip-installer`, since an installer without `pgsql\` isn't a
valid release artifact). This still runs the frontend build, both
PyInstaller bundles (`backend.spec` -> `backend.exe`, `launcher.spec` ->
`launcher.exe`), and assembles everything else into:

```
desktop\build\install\
    launcher.exe
    backend\backend.exe          <- launcher runs this directly (see launcher.py "Backend modes")
    backend\_internal\...
    frontend\dist\...
```

Add `--skip-frontend` too on repeat runs if you haven't touched the React
app, to skip re-running `npm run build`.

### 6.2 Point it at the already-installed Postgres

Set `BLACKBOX_SKIP_PG=1` so the launcher never tries to manage a bundled
`pgsql\bin` (which isn't there anyway with `--no-pgsql`) and instead treats
Postgres as already running, reachable via the same `POSTGRES_*` env vars
the normal dev backend uses:

```powershell
$env:BLACKBOX_INSTALL_DIR = "C:\Users\tsuma\Downloads\bom tool\bom tool v1\bom-tool\desktop\build\install"
$env:BLACKBOX_DATA_DIR    = "C:\Users\tsuma\Downloads\bom tool\bom tool v1\bom-tool\desktop\.devdata"
$env:BLACKBOX_SKIP_PG     = "1"
$env:POSTGRES_USER        = "bom_user"        # match whatever backend/.env / your local cluster has
$env:POSTGRES_PASSWORD    = "..."
$env:POSTGRES_SERVER      = "127.0.0.1"
$env:POSTGRES_PORT        = "5432"            # the already-installed cluster's port, not the bundled 55432
$env:POSTGRES_DB          = "bom_db"
& "$env:BLACKBOX_INSTALL_DIR\launcher.exe"
```

(To point at a *different* Postgres cluster instead of the default one --
e.g. a second instance dedicated to this smoke test -- just change
`POSTGRES_SERVER`/`POSTGRES_PORT`/`POSTGRES_DB` above to that cluster's
values; `bom_user`/`bom_db` must already exist there, same as the normal
backend dev setup.)

The launcher will:
1. Skip all Postgres lifecycle management (no `initdb`/`pg_ctl start`)
   because `BLACKBOX_SKIP_PG=1`.
2. Detect `backend\backend.exe` under `BLACKBOX_INSTALL_DIR` and run it
   directly, instead of resolving a python interpreter.
3. The backend process creates any missing tables in-process on startup
   (`app.main`'s FastAPI lifespan `Base.metadata.create_all`, since bundled
   `backend.exe` has no separate `scripts.init_db` subprocess step -- see
   launcher.py's "Backend modes" docstring section for the full rationale
   and the known `alembic_version` bookkeeping gap it trades off).
4. Open the browser to `http://127.0.0.1:8756/`.

Logs land in `BLACKBOX_DATA_DIR\logs\launcher.log` and `backend.log` if
anything doesn't come up as expected. Stop with Ctrl+C in the console (or
Quit from the tray icon if pystray/Pillow are installed).

### 6.3 Full bundled-Postgres dry run (optional)

To also exercise the bundled-Postgres path (no `--no-pgsql`, no
`BLACKBOX_SKIP_PG`) without building the full installer:

```powershell
python build.py --skip-installer
$env:BLACKBOX_INSTALL_DIR = "C:\Users\tsuma\Downloads\bom tool\bom tool v1\bom-tool\desktop\build\install"
$env:BLACKBOX_DATA_DIR    = "C:\Users\tsuma\Downloads\bom tool\bom tool v1\bom-tool\desktop\.devdata2"
Remove-Item Env:\BLACKBOX_SKIP_PG -ErrorAction SilentlyContinue
& "$env:BLACKBOX_INSTALL_DIR\launcher.exe"
```

This requires `fetch_postgres.ps1` to succeed (network access to download
the portable PostgreSQL distribution) and exercises the real first-run
`initdb` / role+DB bootstrap / crash-safety-conf flow described in section 5
above, still using the bundled `backend.exe`.
