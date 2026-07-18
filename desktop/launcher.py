"""Blackbox BOM desktop launcher.

Single-click entry point for the local-first Windows deployment. On every
run it:

  1. Resolves INSTALL_DIR (read-only app bundle) and DATA_DIR (persistent
     state), both overridable via environment variables for dev testing.
  2. First run only: initializes a portable PostgreSQL cluster into
     DATA_DIR\\pgdata, applies crash-safety settings, and creates the
     ``bom_user`` role + ``bom_db`` database. Generates and persists strong
     random secrets into DATA_DIR\\.env.
  3. Every run: starts the bundled Postgres cluster (pg_ctl start, wait for
     ready), points the backend at it via env vars, runs
     ``python -m scripts.init_db`` to build/migrate the schema, then starts
     uvicorn (app.main:app) on 127.0.0.1:8756 and opens the default browser.
  4. Runs a small foreground loop (system tray icon if pystray/Pillow are
     available, otherwise a plain console loop) until asked to quit.
  5. On exit (Ctrl+C, tray Quit, SIGTERM, or an unexpected backend crash)
     shuts down gracefully: stop uvicorn, then ``pg_ctl stop -m fast``.

Single-instance guard: an OS-level exclusive lock on
DATA_DIR\\launcher.lock (released automatically by the OS if the process
dies, so it can never be left stuck).

Environment overrides (all optional; defaults match the shared contract)
--------------------------------------------------------------------------
  BLACKBOX_INSTALL_DIR   Default: %ProgramFiles%\\BlackboxBOM
  BLACKBOX_DATA_DIR      Default: %ProgramData%\\BlackboxBOM
  BLACKBOX_BACKEND_DIR   Default: <INSTALL_DIR>\\backend
  BLACKBOX_PGSQL_DIR     Default: <INSTALL_DIR>\\pgsql  (expects bin\\ with
                         initdb/pg_ctl/postgres/pg_isready/psql, i.e. a
                         standard portable PostgreSQL distribution)
  BLACKBOX_PYTHON        Python interpreter used to run the backend module
                         (`-m scripts.init_db`, `-m uvicorn ...`). Default
                         resolution: <backend>\\venv\\Scripts\\python.exe,
                         then <backend>\\.venv\\Scripts\\python.exe, then
                         <backend>\\python.exe, then sys.executable.
  BLACKBOX_PG_PORT       Bundled Postgres port. Default: 55432.
  BLACKBOX_BACKEND_PORT  uvicorn port. Default: 8756 (per shared contract).
  BLACKBOX_ENVIRONMENT   If set, exported as ENVIRONMENT for the backend
                         process (e.g. "production"). Left unset by default
                         because the app is served over plain http on
                         127.0.0.1 and several backend security checks
                         (secure cookies, CSRF, HSTS) tighten under
                         ENVIRONMENT=production in ways that assume TLS.
  BLACKBOX_SKIP_PG       If "1"/"true": skip managing the bundled Postgres
                         cluster entirely (use an already-running Postgres
                         via the normal POSTGRES_*/DATABASE_URL env vars you
                         set yourself before launching). Handy for dev-run.
  BLACKBOX_NO_BROWSER    If "1"/"true": don't auto-open the browser.

Dev-run instructions (fastest path, using this repo's existing Postgres)
--------------------------------------------------------------------------
    cd "bom-tool"
    $env:BLACKBOX_DATA_DIR = "$PWD\\.devdata"
    $env:BLACKBOX_BACKEND_DIR = "$PWD\\backend"
    $env:BLACKBOX_SKIP_PG = "1"          # reuse your existing dev Postgres
    $env:POSTGRES_USER = "bom_user"       # whatever your backend/.env has
    $env:POSTGRES_PASSWORD = "..."
    $env:POSTGRES_SERVER = "127.0.0.1"
    $env:POSTGRES_PORT = "5432"
    $env:POSTGRES_DB = "bom_db"
    python desktop\\launcher.py

Full path (exercising the bundled-Postgres flow) additionally requires a
portable PostgreSQL distribution on disk:
    $env:BLACKBOX_PGSQL_DIR = "C:\\path\\to\\portable-postgres"   # has bin\\initdb.exe etc.
    Remove-Item Env:\\BLACKBOX_SKIP_PG -ErrorAction SilentlyContinue
    python desktop\\launcher.py
The first run will initdb into BLACKBOX_DATA_DIR\\pgdata and print progress
to both the console and BLACKBOX_DATA_DIR\\logs\\launcher.log.

To build the standalone executable: see launcher.spec (PyInstaller,
windowed, onefile) or desktop/build.py for the full packaging pipeline.
"""
from __future__ import annotations

import logging
import os
import re
import secrets
import signal
import subprocess
import sys
import threading
import time
import webbrowser
from logging.handlers import RotatingFileHandler
from pathlib import Path

DEFAULT_PG_PORT = 55432
DEFAULT_BACKEND_PORT = 8756

REQUIRED_SECRET_KEYS = ("SECRET_KEY", "ENCRYPTION_KEY", "S3_SECRET_KEY", "POSTGRES_PASSWORD")

_CONF_BLOCK_BEGIN = "# ===== Blackbox BOM managed block: begin (do not edit by hand) ====="
_CONF_BLOCK_END = "# ===== Blackbox BOM managed block: end ====="

_lock_handle = None  # keeps the OS-level single-instance lock alive for process lifetime


# ---------------------------------------------------------------------------
# Paths & logging
# ---------------------------------------------------------------------------

def resolve_paths() -> dict:
    install_dir = Path(
        os.environ.get("BLACKBOX_INSTALL_DIR")
        or os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "BlackboxBOM")
    )
    data_dir = Path(
        os.environ.get("BLACKBOX_DATA_DIR")
        or os.path.join(os.environ.get("ProgramData", r"C:\ProgramData"), "BlackboxBOM")
    )
    backend_dir = Path(os.environ.get("BLACKBOX_BACKEND_DIR") or (install_dir / "backend"))
    pgsql_dir = Path(os.environ.get("BLACKBOX_PGSQL_DIR") or (install_dir / "pgsql"))

    pgdata = data_dir / "pgdata"
    logs_dir = data_dir / "logs"
    backups_dir = data_dir / "backups"
    wal_archive_dir = data_dir / "wal_archive"

    for d in (data_dir, logs_dir, backups_dir, wal_archive_dir):
        d.mkdir(parents=True, exist_ok=True)

    return {
        "install_dir": install_dir,
        "data_dir": data_dir,
        "backend_dir": backend_dir,
        "pgsql_dir": pgsql_dir,
        "pgsql_bin": pgsql_dir / "bin",
        "pgdata": pgdata,
        "logs_dir": logs_dir,
        "backups_dir": backups_dir,
        "wal_archive_dir": wal_archive_dir,
    }


def setup_logging(data_dir: Path) -> logging.Logger:
    logs_dir = data_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    log = logging.getLogger("blackbox_launcher")
    log.setLevel(logging.INFO)
    if log.handlers:
        return log
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh = RotatingFileHandler(logs_dir / "launcher.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
    fh.setFormatter(fmt)
    log.addHandler(fh)
    # A windowed (no-console) PyInstaller build has sys.stdout is None; guard it.
    if sys.stdout is not None:
        try:
            sh = logging.StreamHandler(sys.stdout)
            sh.setFormatter(fmt)
            log.addHandler(sh)
        except Exception:
            pass
    return log


# ---------------------------------------------------------------------------
# Single-instance guard
# ---------------------------------------------------------------------------

def acquire_single_instance_lock(data_dir: Path):
    """Return an open file handle holding an exclusive OS lock, or None if
    another instance already holds it. The OS releases the lock automatically
    if this process dies/crashes, so it can never be left stuck."""
    global _lock_handle
    lock_path = data_dir / "launcher.lock"
    f = open(lock_path, "a+")
    try:
        if os.name == "nt":
            import msvcrt

            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:  # pragma: no cover - dev convenience only, this app targets Windows
            import fcntl

            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return None
    try:
        f.seek(0)
        f.truncate()
        f.write(str(os.getpid()))
        f.flush()
    except OSError:
        pass
    _lock_handle = f
    return f


def _release_lock(lock) -> None:
    if lock is None:
        return
    try:
        lock.close()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Secrets / .env persistence
# ---------------------------------------------------------------------------

def _parse_env_file(path: Path) -> dict:
    values: dict = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        values[key.strip()] = val.strip()
    return values


def ensure_env_secrets(data_dir: Path, log: logging.Logger) -> dict:
    """Idempotently ensure DATA_DIR\\.env holds strong persistent secrets.

    Existing values are preserved across runs (so JWTs and the DB password
    stay stable); anything missing is generated with ``secrets.token_urlsafe``
    (well above the backend's 80-bit minimum entropy threshold).
    """
    env_path = data_dir / ".env"
    values = _parse_env_file(env_path)
    changed = False
    for key in REQUIRED_SECRET_KEYS:
        if not values.get(key):
            values[key] = secrets.token_urlsafe(32)
            changed = True

    if changed or not env_path.exists():
        lines = [
            "# Blackbox BOM - generated by launcher.py. Do not commit or share.",
            *(f"{k}={v}" for k, v in sorted(values.items())),
            "",
        ]
        env_path.write_text("\n".join(lines), encoding="utf-8")
        log.info("Generated/updated persistent secrets at %s", env_path)
    return values


# ---------------------------------------------------------------------------
# Bundled PostgreSQL lifecycle
# ---------------------------------------------------------------------------

def _render_conf_block(port: int, wal_archive_dir: Path) -> str:
    lines = [
        _CONF_BLOCK_BEGIN,
        "listen_addresses = '127.0.0.1'",
        f"port = {port}",
        "fsync = on",
        "synchronous_commit = on",
        "wal_level = replica",
        "archive_mode = on",
        f"archive_command = 'copy /Y \"%p\" \"{wal_archive_dir}\\%f\"'",
        "archive_timeout = 60",
        _CONF_BLOCK_END,
        "",
    ]
    return "\n".join(lines)


def apply_postgresql_conf(pgdata: Path, port: int, wal_archive_dir: Path) -> None:
    """Idempotently (re)write the crash-safety + networking block in
    pgdata\\postgresql.conf. Safe to call on every run: any previously
    written block is replaced rather than duplicated, so a changed
    BLACKBOX_PG_PORT across runs is picked up correctly."""
    conf_path = pgdata / "postgresql.conf"
    text = conf_path.read_text(encoding="utf-8") if conf_path.exists() else ""
    pattern = re.compile(re.escape(_CONF_BLOCK_BEGIN) + r".*?" + re.escape(_CONF_BLOCK_END) + r"\n?", re.DOTALL)
    text = pattern.sub("", text)
    text = text.rstrip("\n") + "\n\n" + _render_conf_block(port, wal_archive_dir)
    conf_path.write_text(text, encoding="utf-8")


def tighten_pg_hba(pgdata: Path) -> None:
    """After first-run bootstrap (which requires --auth=trust to create the
    initial role), tighten host auth to scram-sha-256 now that bom_user has
    a password. The loopback-only listen_addresses means trust was only ever
    reachable from this same machine during the bootstrap window."""
    hba_path = pgdata / "pg_hba.conf"
    if not hba_path.exists():
        return
    text = hba_path.read_text(encoding="utf-8")
    new_text = re.sub(r"(?m)^(host\s+\S+\s+\S+\s+\S+\s+)trust\s*$", r"\1scram-sha-256", text)
    if new_text != text:
        hba_path.write_text(new_text, encoding="utf-8")


def run_initdb(pgsql_bin: Path, pgdata: Path, log: logging.Logger) -> None:
    initdb_exe = pgsql_bin / "initdb.exe"
    cmd = [str(initdb_exe), "-D", str(pgdata), "-U", "postgres", "--auth=trust", "-E", "UTF8"]
    log.info("Running initdb: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        log.error("initdb failed (exit %s): %s", result.returncode, result.stderr.strip())
        raise RuntimeError(f"initdb failed with exit code {result.returncode}")
    log.info("initdb completed successfully")


def pg_ctl_start(pgsql_bin: Path, pgdata: Path, log_file: Path, log: logging.Logger) -> None:
    pg_ctl_exe = pgsql_bin / "pg_ctl.exe"
    cmd = [str(pg_ctl_exe), "start", "-D", str(pgdata), "-l", str(log_file), "-w", "-t", "60"]
    log.info("Starting Postgres: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        log.error("pg_ctl start failed (exit %s): %s", result.returncode, result.stderr.strip())
        raise RuntimeError(f"pg_ctl start failed with exit code {result.returncode}")


def pg_ctl_reload(pgsql_bin: Path, pgdata: Path, log: logging.Logger) -> None:
    pg_ctl_exe = pgsql_bin / "pg_ctl.exe"
    subprocess.run([str(pg_ctl_exe), "reload", "-D", str(pgdata)], capture_output=True, text=True)


def pg_ctl_stop(pgsql_bin: Path, pgdata: Path, log: logging.Logger) -> None:
    if not pgdata.exists():
        return
    pg_ctl_exe = pgsql_bin / "pg_ctl.exe"
    cmd = [str(pg_ctl_exe), "stop", "-D", str(pgdata), "-m", "fast", "-w", "-t", "60"]
    log.info("Stopping Postgres: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        log.warning("pg_ctl stop returned exit %s: %s", result.returncode, result.stderr.strip())


def wait_for_postgres_ready(pgsql_bin: Path, host: str, port: int, log: logging.Logger, timeout: float = 30.0) -> bool:
    pg_isready_exe = pgsql_bin / "pg_isready.exe"
    use_isready = pg_isready_exe.exists()
    deadline = time.time() + timeout
    while time.time() < deadline:
        if use_isready:
            result = subprocess.run(
                [str(pg_isready_exe), "-h", host, "-p", str(port)], capture_output=True, text=True
            )
            if result.returncode == 0:
                return True
        else:
            import socket

            try:
                with socket.create_connection((host, port), timeout=1):
                    return True
            except OSError:
                pass
        time.sleep(0.5)
    log.error("Postgres did not become ready on %s:%s within %.0fs", host, port, timeout)
    return False


def bootstrap_role_and_db(pgsql_bin: Path, host: str, port: int, password: str, log: logging.Logger) -> None:
    """Create the bom_user role and bom_db database (idempotent: safe to
    call again). Requires psql.exe from a standard PostgreSQL client+server
    distribution in pgsql\\bin."""
    psql_exe = pgsql_bin / "psql.exe"
    if not psql_exe.exists():
        raise RuntimeError(
            f"{psql_exe} not found; the bundled pgsql\\bin must include the standard "
            "PostgreSQL client tools (psql, pg_isready) alongside initdb/pg_ctl/postgres."
        )

    base = [str(psql_exe), "-h", host, "-p", str(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]

    # token_urlsafe only emits [A-Za-z0-9_-], so a plain single-quoted SQL
    # string literal is safe here with no embedded-quote escaping needed.
    role_sql = (
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bom_user') THEN "
        f"CREATE ROLE bom_user LOGIN PASSWORD '{password}' CREATEDB; "
        "ELSE "
        f"ALTER ROLE bom_user WITH PASSWORD '{password}'; "
        "END IF; END $$;"
    )
    result = subprocess.run(base + ["-c", role_sql], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"failed to create/update bom_user role: {result.stderr.strip()}")

    check = subprocess.run(
        base + ["-tAc", "SELECT 1 FROM pg_database WHERE datname='bom_db'"], capture_output=True, text=True
    )
    if check.stdout.strip() != "1":
        create = subprocess.run(base + ["-c", "CREATE DATABASE bom_db OWNER bom_user"], capture_output=True, text=True)
        if create.returncode != 0:
            raise RuntimeError(f"failed to create bom_db database: {create.stderr.strip()}")

    log.info("Bootstrapped role 'bom_user' and database 'bom_db'")


def ensure_postgres_ready(paths: dict, pg_port: int, pg_password: str, log: logging.Logger) -> None:
    pgsql_bin = paths["pgsql_bin"]
    pgdata = paths["pgdata"]
    first_run = not (pgdata / "PG_VERSION").exists()

    if first_run:
        pgdata.parent.mkdir(parents=True, exist_ok=True)
        run_initdb(pgsql_bin, pgdata, log)

    apply_postgresql_conf(pgdata, pg_port, paths["wal_archive_dir"])

    pg_log_file = paths["logs_dir"] / "postgres.log"
    pg_ctl_start(pgsql_bin, pgdata, pg_log_file, log)

    if not wait_for_postgres_ready(pgsql_bin, "127.0.0.1", pg_port, log, timeout=30):
        raise RuntimeError("Postgres did not become ready within timeout")

    if first_run:
        bootstrap_role_and_db(pgsql_bin, "127.0.0.1", pg_port, pg_password, log)
        tighten_pg_hba(pgdata)
        pg_ctl_reload(pgsql_bin, pgdata, log)
        log.info("First-run Postgres bootstrap complete")


# ---------------------------------------------------------------------------
# Backend (schema bootstrap + uvicorn)
# ---------------------------------------------------------------------------

def resolve_python(backend_dir: Path) -> str:
    override = os.environ.get("BLACKBOX_PYTHON")
    if override:
        return override
    candidates = [
        backend_dir / "venv" / "Scripts" / "python.exe",
        backend_dir / ".venv" / "Scripts" / "python.exe",
        backend_dir / "python.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return sys.executable


def build_child_env(cfg: dict) -> dict:
    env = dict(os.environ)
    password = cfg["POSTGRES_PASSWORD"]
    port = cfg["pg_port"]
    env.update(
        {
            "POSTGRES_USER": "bom_user",
            "POSTGRES_PASSWORD": password,
            "POSTGRES_SERVER": "127.0.0.1",
            "POSTGRES_PORT": str(port),
            "POSTGRES_DB": "bom_db",
            "DATABASE_URL": f"postgresql+asyncpg://bom_user:{password}@127.0.0.1:{port}/bom_db",
            "SECRET_KEY": cfg["SECRET_KEY"],
            "ENCRYPTION_KEY": cfg["ENCRYPTION_KEY"],
            "S3_SECRET_KEY": cfg["S3_SECRET_KEY"],
            "BACKUP_DIR": str(cfg["backups_dir"]),
            "WAL_ARCHIVE_DIR": str(cfg["wal_archive_dir"]),
        }
    )
    if cfg.get("environment_override"):
        env["ENVIRONMENT"] = cfg["environment_override"]
    return env


def run_schema_bootstrap(python_exe: str, backend_dir: Path, child_env: dict, log: logging.Logger) -> None:
    cmd = [python_exe, "-m", "scripts.init_db"]
    log.info("Running schema bootstrap in %s: %s", backend_dir, " ".join(cmd))
    result = subprocess.run(cmd, cwd=str(backend_dir), env=child_env, capture_output=True, text=True)
    if result.stdout.strip():
        log.info("init_db: %s", result.stdout.strip())
    if result.returncode != 0:
        log.error("init_db failed (exit %s): %s", result.returncode, result.stderr.strip())
        raise RuntimeError("Database schema bootstrap (scripts.init_db) failed; see launcher.log")


def start_uvicorn(python_exe: str, backend_dir: Path, backend_port: int, child_env: dict, log_path: Path, log: logging.Logger):
    cmd = [python_exe, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(backend_port)]
    log.info("Starting backend: %s", " ".join(cmd))
    log_fh = open(log_path, "a", encoding="utf-8")
    creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    proc = subprocess.Popen(
        cmd,
        cwd=str(backend_dir),
        env=child_env,
        stdout=log_fh,
        stderr=subprocess.STDOUT,
        creationflags=creationflags,
    )
    return proc


def stop_uvicorn(proc, log: logging.Logger) -> None:
    if proc is None or proc.poll() is not None:
        return
    log.info("Stopping backend (pid=%s)", proc.pid)
    try:
        if hasattr(signal, "CTRL_BREAK_EVENT"):
            proc.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            proc.terminate()
        proc.wait(timeout=15)
        return
    except Exception:
        log.warning("Graceful backend stop timed out; terminating")
    try:
        proc.terminate()
        proc.wait(timeout=5)
        return
    except Exception:
        pass
    try:
        proc.kill()
    except Exception:
        pass


def wait_for_backend_ready(url: str, log: logging.Logger, timeout: float = 30.0) -> bool:
    import urllib.request

    health_url = url.rstrip("/") + "/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=2) as resp:
                if resp.status < 500:
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    log.warning("Backend did not respond healthy at %s within %.0fs", health_url, timeout)
    return False


# ---------------------------------------------------------------------------
# Foreground loop: tray icon (if available) or console
# ---------------------------------------------------------------------------

class _TrayUnavailable(Exception):
    pass


def _tray_loop(stop_event: threading.Event, url: str, log: logging.Logger) -> None:
    try:
        import pystray
        from PIL import Image, ImageDraw
    except ImportError as exc:
        raise _TrayUnavailable from exc

    image = Image.new("RGB", (64, 64), color=(20, 90, 200))
    draw = ImageDraw.Draw(image)
    draw.rectangle((16, 16, 48, 48), fill=(255, 255, 255))

    def _open(icon, item):
        webbrowser.open(url)

    def _quit(icon, item):
        stop_event.set()
        icon.stop()

    menu = pystray.Menu(
        pystray.MenuItem("Open Blackbox BOM", _open, default=True),
        pystray.MenuItem("Quit", _quit),
    )
    icon = pystray.Icon("blackbox_bom", image, "Blackbox BOM", menu)

    def _watchdog():
        stop_event.wait()
        icon.stop()

    threading.Thread(target=_watchdog, daemon=True).start()
    log.info("Running with system tray icon")
    icon.run()


def _console_loop(stop_event: threading.Event, url: str, log: logging.Logger) -> None:
    print(f"Blackbox BOM is running at {url}")
    print("Press Ctrl+C to stop.")
    try:
        while not stop_event.wait(timeout=1):
            pass
    except KeyboardInterrupt:
        stop_event.set()


def run_foreground_loop(stop_event: threading.Event, url: str, log: logging.Logger) -> None:
    try:
        _tray_loop(stop_event, url, log)
    except _TrayUnavailable:
        log.info("pystray/Pillow not available; falling back to console loop")
        _console_loop(stop_event, url, log)


def _install_signal_handlers(stop_event: threading.Event, log: logging.Logger) -> None:
    def handler(signum, frame):
        log.info("Received signal %s; shutting down", signum)
        stop_event.set()

    for sig_name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        sig = getattr(signal, sig_name, None)
        if sig is not None:
            try:
                signal.signal(sig, handler)
            except (ValueError, OSError):
                pass


def _watch_backend_process(proc, stop_event: threading.Event, log: logging.Logger) -> None:
    def _watch():
        while not stop_event.is_set():
            if proc.poll() is not None:
                log.error("Backend process exited unexpectedly (code %s)", proc.returncode)
                stop_event.set()
                return
            time.sleep(2)

    threading.Thread(target=_watch, daemon=True).start()


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def _shutdown(uvicorn_proc, paths: dict, pg_port: int, skip_pg: bool, log: logging.Logger) -> None:
    log.info("Shutting down...")
    if uvicorn_proc is not None:
        stop_uvicorn(uvicorn_proc, log)
    if not skip_pg:
        try:
            pg_ctl_stop(paths["pgsql_bin"], paths["pgdata"], log)
        except Exception:
            log.exception("Error stopping Postgres")
    log.info("Shutdown complete.")


def main() -> int:
    paths = resolve_paths()
    log = setup_logging(paths["data_dir"])
    log.info("Blackbox BOM launcher starting (INSTALL_DIR=%s DATA_DIR=%s)", paths["install_dir"], paths["data_dir"])

    lock = acquire_single_instance_lock(paths["data_dir"])
    if lock is None:
        log.error("Another instance of Blackbox BOM is already running. Exiting.")
        print("Blackbox BOM is already running.")
        return 1

    pg_port = int(os.environ.get("BLACKBOX_PG_PORT", DEFAULT_PG_PORT))
    backend_port = int(os.environ.get("BLACKBOX_BACKEND_PORT", DEFAULT_BACKEND_PORT))
    skip_pg = os.environ.get("BLACKBOX_SKIP_PG", "").strip().lower() in ("1", "true", "yes")
    no_browser = os.environ.get("BLACKBOX_NO_BROWSER", "").strip().lower() in ("1", "true", "yes")

    cfg = ensure_env_secrets(paths["data_dir"], log)
    cfg["pg_port"] = pg_port
    cfg["backups_dir"] = paths["backups_dir"]
    cfg["wal_archive_dir"] = paths["wal_archive_dir"]
    env_override = os.environ.get("BLACKBOX_ENVIRONMENT")
    if env_override:
        cfg["environment_override"] = env_override

    uvicorn_proc = None
    exit_code = 0
    try:
        if not skip_pg:
            ensure_postgres_ready(paths, pg_port, cfg["POSTGRES_PASSWORD"], log)
        else:
            log.warning("BLACKBOX_SKIP_PG set: assuming an externally managed Postgres is already reachable")

        child_env = build_child_env(cfg)
        python_exe = resolve_python(paths["backend_dir"])

        run_schema_bootstrap(python_exe, paths["backend_dir"], child_env, log)

        backend_log_path = paths["logs_dir"] / "backend.log"
        uvicorn_proc = start_uvicorn(python_exe, paths["backend_dir"], backend_port, child_env, backend_log_path, log)

        url = f"http://127.0.0.1:{backend_port}/"
        wait_for_backend_ready(url, log)

        if not no_browser:
            try:
                webbrowser.open(url)
            except Exception:
                log.exception("Failed to open browser")

        stop_event = threading.Event()
        _install_signal_handlers(stop_event, log)
        _watch_backend_process(uvicorn_proc, stop_event, log)
        run_foreground_loop(stop_event, url, log)

    except Exception:
        log.exception("Fatal error during launcher startup")
        print(f"Blackbox BOM failed to start. See {paths['logs_dir'] / 'launcher.log'} for details.")
        exit_code = 1
    finally:
        _shutdown(uvicorn_proc, paths, pg_port, skip_pg, log)
        _release_lock(lock)

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
