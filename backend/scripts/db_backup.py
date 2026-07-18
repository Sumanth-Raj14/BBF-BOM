"""PostgreSQL logical backup via pg_dump (custom format).

Builds the connection from the app's POSTGRES_* settings (or an explicit
DATABASE_URL), stripping any SQLAlchemy async driver suffix (e.g.
``postgresql+asyncpg://`` -> ``postgresql://``) that pg_dump cannot parse.
Locates pg_dump via the PG_DUMP env var, then PATH, then the standard Windows
install location. Keeps the most recent 30 backups.

    python -m scripts.db_backup
"""
import datetime
import os
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv

_ENV = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=_ENV)

BACKUP_DIR = Path(__file__).parent.parent.parent / "backups"


def _libpq_url() -> str:
    """Return a pg_dump-compatible postgresql:// URL from env."""
    raw = os.getenv("DATABASE_URL") or os.getenv("DATABASE_URI")
    if raw:
        # pg_dump understands postgresql:// but not the +driver suffix.
        return re.sub(r"^postgresql\+\w+://", "postgresql://", raw)
    user = os.getenv("POSTGRES_USER", "bom_user")
    pwd = quote(os.getenv("POSTGRES_PASSWORD", ""), safe="")
    host = os.getenv("POSTGRES_SERVER", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "bom_db")
    return f"postgresql://{user}:{pwd}@{host}:{port}/{db}"


def _pg_dump_bin() -> str:
    override = os.getenv("PG_DUMP")
    if override and Path(override).exists():
        return override
    found = shutil.which("pg_dump")
    if found:
        return found
    # Common Windows install location fallback (pick the highest version).
    for base in (Path(r"C:\Program Files\PostgreSQL"), Path(r"C:\Program Files (x86)\PostgreSQL")):
        if base.exists():
            for ver in sorted(base.iterdir(), reverse=True):
                cand = ver / "bin" / "pg_dump.exe"
                if cand.exists():
                    return str(cand)
    return "pg_dump"  # last resort; will raise FileNotFoundError if truly absent


def backup_db() -> Path | None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"bom_tool_backup_{timestamp}.dump"

    url = _libpq_url()
    if "postgresql://" not in url:
        print("No PostgreSQL connection configured (POSTGRES_* / DATABASE_URL). Skipping backup.")
        return None

    pg_dump = _pg_dump_bin()
    print(f"Starting backup to {backup_file} ...")
    try:
        subprocess.run(
            [pg_dump, "--dbname", url, "-F", "c", "-f", str(backup_file)],
            check=True,
        )
        print("Backup completed successfully!")
    except FileNotFoundError:
        print("pg_dump not found. Set PG_DUMP or install PostgreSQL client tools.")
        return None
    except subprocess.CalledProcessError as e:
        print(f"Backup failed: {e}")
        return None

    # Retention: keep the newest 30 dumps.
    backups = sorted(BACKUP_DIR.glob("bom_tool_backup_*.dump"), key=os.path.getmtime)
    for old in backups[:-30]:
        print(f"Removing old backup: {old}")
        old.unlink()
    return backup_file


if __name__ == "__main__":
    backup_db()
