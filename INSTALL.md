# Blackbox BOM — Install & Quickstart (Windows)

This guide is written for a non-expert setting the app up on a Windows PC for
the first time, moving it to a new PC, or backing up its data. Everything
here runs **entirely on your own PC / server (local-first)** — there is no
cloud service involved and no internet connection required after the
one-time Docker image download.

---

## 1. Prerequisites

- **Windows 10/11**
- **Docker Desktop** — this is the only thing you need to install by hand.
  It packages Python, Node.js, PostgreSQL, and Redis for you, so you don't
  install any of those separately.
  - Download: https://www.docker.com/products/docker-desktop/
  - During setup, accept the default "use WSL 2" option if asked.
  - After installing, **start Docker Desktop once** and wait for the whale
    icon in the system tray (bottom-right) to stop animating — that means
    the Docker engine is ready.

That's it. Everything else is handled by the install script.

---

## 2. First-time install

1. Get the code onto the PC (via `git clone`, or by copying/extracting the
   project folder).
2. Open the project folder in File Explorer.
3. Double-click **`install.bat`**.
   - A window opens and:
     1. Checks Docker Desktop is installed and running (offers to install it
        via `winget` if it's missing, or tells you where to download it).
     2. Creates a `.env` file with unique, randomly generated secret keys
        (only on the very first run — it never overwrites an existing
        `.env`).
     3. Builds and starts the app (`docker compose up -d --build`). The
        first run downloads a few hundred MB of base images and can take
        several minutes; every run after that is much faster.
     4. Waits for the app to report healthy.
     5. Opens the app in your browser automatically.
4. When the browser opens to `http://localhost`, click **Register / Sign
   up** and create your own account — there's no default username/password.
   The first account you create is the one you'll use as your admin login.

Prefer the command line? Open PowerShell in the project folder and run:

```powershell
.\install.ps1
```

### Re-running the install script

`install.ps1` / `install.bat` are **safe to run again any time** — e.g.
after `git pull` to pick up an update. It will:
- Leave your existing `.env` and all your data completely alone.
- Rebuild only what changed, then restart the stack.
- Re-apply any new database migrations automatically.

---

## 3. Everyday use

| I want to...                              | Do this                              |
|--------------------------------------------|---------------------------------------|
| Start the app                              | Double-click `install.bat` (or `.\install.ps1`) |
| Stop the app (keep all data)               | Double-click `stop.bat` (or `.\stop.ps1`) |
| See what's running                         | `docker compose ps`                  |
| View live logs (e.g. to debug a problem)   | `docker compose logs -f`             |
| Restart just the backend                   | `docker compose restart backend`     |

The app lives at **http://localhost** while it's running. If port 80 is
already used by something else on your PC, edit `.env` and change
`FRONTEND_PORT=80` to another port (e.g. `8080`), then re-run
`.\install.ps1` — you'd then browse to `http://localhost:8080`.

---

## 4. Moving to a new PC

There are two scenarios:

### A. Fresh install on the new PC (no existing data to bring)

Just repeat [section 2](#2-first-time-install) on the new PC. A brand-new,
empty, fully migrated database is created automatically.

### B. Bringing your existing data to the new PC

Your data (database, uploaded files/attachments, and RSA signing keys) lives
in Docker volumes on the OLD machine. To carry it to a NEW one:

**On the OLD machine**, with the app running:

```powershell
.\scripts\backup-data.ps1
```

This writes everything into a single timestamped folder, e.g.
`backups\20260718-120000\`, containing:
- `db.dump` — full PostgreSQL database dump
- `uploads.tar.gz` — uploaded documents/attachments
- `rsa_keys.tar.gz` — signing keys (needed so existing login sessions/tokens
  keep working)

Copy to the NEW machine:
- The whole project folder (or `git clone` fresh)
- Your `.env` file (it is *not* checked into git — copy it by hand, e.g. via
  a USB drive or secure file transfer; never email or upload it anywhere
  public, since it contains your secret keys)
- The `backups\<timestamp>\` folder produced above

**On the NEW machine:**

```powershell
.\install.ps1                                   # creates a fresh, empty stack
.\scripts\restore-data.ps1 backups\<timestamp>   # loads your data into it
```

`restore-data.ps1` replaces the new stack's (still-empty) database, uploads,
and RSA keys with the ones from the old machine — after it finishes, sign in
with the same account(s) you had before.

> **Warning:** `restore-data.ps1` overwrites whatever is currently in the
> target stack. Only run it right after a fresh install you intend to
> populate from the backup, not against a stack you already have real data
> in.

Bash/Git-Bash/WSL users can use the `.sh` equivalents instead:
`scripts/backup-data.sh` and `scripts/restore-data.sh`.

---

## 5. Backing up regularly (not just when moving PCs)

Run `.\scripts\backup-data.ps1` any time you want a point-in-time snapshot —
it's the same script used for PC migration. Keep a few recent snapshots
somewhere other than the PC itself (external drive, network share) in case
of hardware failure.

---

## 6. Updating to a new version

```powershell
git pull                # get the latest code
.\install.ps1            # rebuilds and restarts, applying any new migrations
```

Your data is untouched by an update.

---

## 7. Uninstalling

- **Stop but keep everything** (most common): double-click `stop.bat`, or
  `.\stop.ps1`.
- **Remove the app but keep your data** (e.g. reinstalling, freeing disk
  space): `.\uninstall.ps1` — removes containers and built images; your
  database/uploads/keys stay in their Docker volumes and come back the next
  time you run `.\install.ps1`.
- **Remove everything, including all data, permanently**:
  `.\uninstall.ps1 -Purge` — asks for a typed confirmation first. Only do
  this after you've confirmed a backup (section 4/5) if you might need the
  data again.

---

## 8. Troubleshooting

**"Docker was not found" / install.ps1 stops immediately**
Docker Desktop isn't installed. Install it from
https://www.docker.com/products/docker-desktop/, start it once, then re-run
`.\install.ps1`.

**Install script says Docker isn't running / hangs waiting for it**
Open Docker Desktop from the Start Menu and wait for the whale icon in the
system tray to stop animating (that means the engine has finished starting),
then re-run `.\install.ps1`.

**Browser shows "can't connect" / "This site can't be reached"**
The app may still be finishing its first-time build or database migration.
Check progress with:
```powershell
docker compose logs -f backend
```
Wait for a line like `Application startup complete`, then refresh the page.

**Port 80 (or 8000/5432/6379) is already in use**
Something else on your PC (e.g. IIS, Skype, another Postgres) is using that
port. Edit `.env` and change `FRONTEND_PORT` (and/or `BACKEND_PORT`,
`POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`) to a free port, then re-run
`.\install.ps1`.

**Forgot your password / locked out**
There's no built-in password reset via this script — use the app's own
password reset flow if SMTP is configured (see `backend/.env.example`), or
have another admin account reset it. As a last resort with database access,
an administrator can update the record directly, but that's outside the
scope of this guide.

**I want to start completely fresh (wipe all data) on THIS machine**
```powershell
.\uninstall.ps1 -Purge
.\install.ps1
```

**Something looks broken after `git pull` + `.\install.ps1`**
Check the backend logs first — most issues show up there:
```powershell
docker compose logs -f backend
```
If a database migration failed partway, do NOT run `-Purge` unless you have
a backup — ask for help / open an issue with the log output instead.

---

## 9. What's actually running (for the curious)

`docker compose up -d --build` starts four containers, all on this one PC:

| Service    | What it is                                         |
|------------|-----------------------------------------------------|
| `db`       | PostgreSQL 15 — the database                        |
| `redis`    | Redis 7 — cache / rate-limiting (optional, app still works if disabled) |
| `backend`  | FastAPI app — runs migrations automatically on start, then serves the API |
| `frontend` | nginx serving the built React app, proxying `/api` and `/ws` to `backend` |

All persistent data (database, uploaded files, RSA keys, WAL archive) lives
in named Docker volumes (`pgdata`, `backend_uploads`, `rsa_keys`,
`wal_archive`, `backend_backups`), which survive `docker compose down` and
`.\install.ps1` re-runs. Only `.\uninstall.ps1 -Purge` deletes them.

See also: `README.md` (developer-oriented quickstart) and
`DISASTER_RECOVERY_RUNBOOK.md` (deeper backup/DR procedures for the
application's built-in enterprise backup engine).
