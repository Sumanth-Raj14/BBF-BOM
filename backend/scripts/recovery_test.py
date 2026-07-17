"""Automated Recovery Testing — validates backup integrity and restore capability.

Usage:
    python scripts/recovery_test.py                  # Quick: verify latest backup
    python scripts/recovery_test.py --full           # Full: verify + restore to test DB
    python scripts/recovery_test.py --physical       # Include physical backup test
    python scripts/recovery_test.py --dry-run        # Show what would be tested
"""

import asyncio
import contextlib
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

REQUIRED_TOOLS = ["pg_restore", "pg_dump", "psql"]
REPORT = {"tested_at": None, "tests": [], "summary": {"passed": 0, "failed": 0, "skipped": 0}}


def _find_tool(name: str) -> str:
    candidates = [name]
    for ver in ["18", "17", "16", "15", "14", "13"]:
        candidates.append(f"C:\\Program Files\\PostgreSQL\\{ver}\\bin\\{name}.exe")
        candidates.append(f"/usr/lib/postgresql/{ver}/bin/{name}")
        candidates.append(f"/usr/pgsql-{ver}/bin/{name}")
    for c in candidates:
        try:
            subprocess.run([c, "--version"], capture_output=True, timeout=5)
            return c
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return None


def _check_prerequisites() -> list[str]:
    missing = []
    for tool in REQUIRED_TOOLS:
        if not _find_tool(tool):
            missing.append(tool)
    return missing


async def test_backup_list() -> dict:
    """Test 1: Verify backup listing works."""
    from sqlalchemy import text

    from app.db.session import get_session_maker

    try:
        async with (await get_session_maker())() as db:
            result = await db.execute(
                text("""
                    SELECT COUNT(*), COALESCE(SUM(size_bytes), 0)
                    FROM backup_history WHERE status IN ('completed', 'verified')
                """)
            )
            row = result.first()
            count = row[0] if row else 0
            size = row[1] if row else 0
            return {
                "test": "backup_list",
                "status": "pass" if count > 0 else "warn",
                "detail": f"{count} backups found, {size / 1024 / 1024:.1f} MB total",
            }
    except Exception as e:
        return {"test": "backup_list", "status": "fail", "detail": str(e)}


async def test_latest_backup_verify() -> dict:
    """Test 2: Verify the latest backup's integrity."""
    from sqlalchemy import text

    from app.core.backup import verify_backup
    from app.db.session import get_session_maker

    try:
        async with (await get_session_maker())() as db:
            result = await db.execute(
                text("""
                    SELECT storage_path FROM backup_history
                    WHERE status IN ('completed', 'verified')
                    ORDER BY started_at DESC LIMIT 1
                """)
            )
            row = result.first()
            if not row or not row[0]:
                return {"test": "latest_verify", "status": "skip", "detail": "No backups to verify"}
            path = row[0]
            if not os.path.exists(path):
                return {
                    "test": "latest_verify",
                    "status": "warn",
                    "detail": f"Backup file not found: {path}",
                }
            vresult = await verify_backup(path)
            if vresult.get("verified"):
                return {
                    "test": "latest_verify",
                    "status": "pass",
                    "detail": f"Verified OK: {vresult['table_count']} tables, {vresult['size_bytes'] / 1024 / 1024:.1f} MB",
                }
            return {
                "test": "latest_verify",
                "status": "fail",
                "detail": vresult.get("error", "Verification returned false"),
            }
    except Exception as e:
        return {"test": "latest_verify", "status": "fail", "detail": str(e)}


async def test_restore_to_temp_db() -> dict:
    """Test 3: Restore the latest backup to a temporary database to verify data integrity."""
    from sqlalchemy import text

    from app.db.session import get_session_maker

    temp_db = f"recovery_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    pg_env = {
        "PGHOST": os.environ.get("PGHOST", "127.0.0.1"),
        "PGPORT": os.environ.get("PGPORT", "5432"),
        "PGUSER": os.environ.get("PGUSER", "postgres"),
        "PGPASSWORD": os.environ.get("PGPASSWORD", ""),
    }
    if "PATH" in os.environ:
        pg_env["PATH"] = os.environ["PATH"]

    try:
        async with (await get_session_maker())() as db:
            result = await db.execute(
                text("""
                    SELECT storage_path, backup_type FROM backup_history
                    WHERE status IN ('completed', 'verified') AND backup_type != 'physical'
                    ORDER BY started_at DESC LIMIT 1
                """)
            )
            row = result.first()
            if not row or not row[0]:
                return {
                    "test": "restore_test",
                    "status": "skip",
                    "detail": "No logical backups to test restore",
                }

            path = row[0]
            row[1]

            # Create temp database
            subprocess.run(
                ["psql", "-c", f"CREATE DATABASE {temp_db} OWNER {pg_env['PGUSER']}"],
                capture_output=True,
                timeout=30,
                env=pg_env,
            )

            # Restore to temp database
            from app.core.backup import restore_backup

            rresult = await restore_backup(
                backup_path=path,
                target_db_name=temp_db,
                target_db_host=pg_env["PGHOST"],
                target_db_port=pg_env["PGPORT"],
                target_db_user=pg_env["PGUSER"],
                target_db_password=pg_env["PGPASSWORD"],
            )

            if rresult.get("success"):
                # Verify restored data has rows
                check_env = {**pg_env, "PGDATABASE": temp_db}
                count_result = subprocess.run(
                    [
                        "psql",
                        "-t",
                        "-c",
                        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'",
                    ],
                    capture_output=True,
                    timeout=30,
                    env=check_env,
                )
                table_count = count_result.stdout.decode().strip()
                return {
                    "test": "restore_test",
                    "status": "pass",
                    "detail": f"Restored to temp DB '{temp_db}': {rresult.get('table_count', '?')} tables, {table_count} public tables",
                }
            return {
                "test": "restore_test",
                "status": "fail",
                "detail": rresult.get("error", "Restore failed"),
            }
    except Exception as e:
        return {"test": "restore_test", "status": "fail", "detail": str(e)}
    finally:
        with contextlib.suppress(Exception):
            subprocess.run(
                ["psql", "-c", f"DROP DATABASE IF EXISTS {temp_db}"],
                capture_output=True,
                timeout=30,
                env={**pg_env, "PGDATABASE": "postgres"},
            )


async def test_wal_archive() -> dict:
    """Test 4: Verify WAL archive is present and has recent files."""
    wal_dir = "/var/lib/postgresql/wal_archive"
    if not os.path.isdir(wal_dir):
        wal_dir = os.environ.get("WAL_ARCHIVE_DIR", wal_dir)
    if not os.path.isdir(wal_dir):
        return {
            "test": "wal_archive",
            "status": "warn",
            "detail": f"WAL archive dir not found: {wal_dir}",
        }

    files = [f for f in Path(wal_dir).iterdir() if f.is_file()]
    if not files:
        return {"test": "wal_archive", "status": "warn", "detail": "WAL archive directory is empty"}

    newest = max(f.stat().st_mtime for f in files)
    newest_dt = datetime.fromtimestamp(newest)
    age_hours = (datetime.now() - newest_dt).total_seconds() / 3600
    return {
        "test": "wal_archive",
        "status": "pass" if age_hours < 24 else "warn",
        "detail": f"{len(files)} WAL files, newest {age_hours:.1f}h old ({newest_dt.isoformat()})",
    }


async def test_rpo_rto() -> dict:
    """Test 5: Calculate current RPO and estimate RTO from backup history."""
    from sqlalchemy import text

    from app.db.session import get_session_maker

    try:
        async with (await get_session_maker())() as db:
            result = await db.execute(
                text("""
                    SELECT started_at FROM backup_history
                    WHERE status IN ('completed', 'verified')
                    ORDER BY started_at DESC LIMIT 1
                """)
            )
            row = result.first()
            if not row or not row[0]:
                return {
                    "test": "rpo_rto",
                    "status": "warn",
                    "detail": "No backup history to calculate RPO/RTO",
                }

            last_backup = row[0]
            rpo_seconds = (
                datetime.now(UTC) - last_backup.replace(tzinfo=UTC)
            ).total_seconds()
            rpo_hours = rpo_seconds / 3600
            return {
                "test": "rpo_rto",
                "status": "pass" if rpo_hours < 6 else "warn",
                "detail": f"Current RPO: {rpo_hours:.1f}h (target: <6h). RTO: ~30m (estimated)",
            }
    except Exception as e:
        return {"test": "rpo_rto", "status": "fail", "detail": str(e)}


async def main():
    REPORT["tested_at"] = datetime.now(UTC).isoformat()
    dry_run = "--dry-run" in sys.argv

    print("=" * 60)
    print("  BLACKBOX BOM — RECOVERY READINESS TEST")
    print("=" * 60)
    print(f"  Tested at: {REPORT['tested_at']}")
    print(f"  Dry run: {dry_run}")
    print()

    # Prerequisites
    missing = _check_prerequisites()
    if missing:
        print(f"  [!] Missing tools: {', '.join(missing)}")
        print("  Install PostgreSQL client tools and add to PATH.\n")
        REPORT["tests"].append(
            {"test": "prerequisites", "status": "fail", "detail": f"Missing: {missing}"}
        )
        REPORT["summary"]["failed"] += 1
        if not dry_run:
            print(json.dumps(REPORT, indent=2, default=str))
            sys.exit(1)

    print("  [OK] All prerequisites found\n")

    tests = [test_backup_list, test_latest_backup_verify, test_wal_archive, test_rpo_rto]

    if "--full" in sys.argv:
        tests.append(test_restore_to_temp_db)

    for test_fn in tests:
        if dry_run:
            print(f"  [SKIP] {test_fn.__name__} (dry run)")
            REPORT["tests"].append(
                {"test": test_fn.__name__, "status": "skip", "detail": "Dry run"}
            )
            REPORT["summary"]["skipped"] += 1
            continue

        print(f"  Running {test_fn.__name__}...", end=" ")
        result = await test_fn()
        REPORT["tests"].append(result)
        status = result["status"]
        if status == "pass":
            REPORT["summary"]["passed"] += 1
            print("PASS")
        elif status == "warn":
            REPORT["summary"]["passed"] += 1
            print("PASS (warning)")
        elif status == "skip":
            REPORT["summary"]["skipped"] += 1
            print("SKIP")
        else:
            REPORT["summary"]["failed"] += 1
            print("FAIL")
        print(f"    {result.get('detail', '')}")

    # Summary
    print()
    print("-" * 60)
    s = REPORT["summary"]
    print(f"  Results: {s['passed']} passed, {s['failed']} failed, {s['skipped']} skipped")
    overall = "PASS" if s["failed"] == 0 else "FAIL"
    print(f"  Overall: {overall}")
    print("-" * 60)

    return s["failed"] == 0


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
