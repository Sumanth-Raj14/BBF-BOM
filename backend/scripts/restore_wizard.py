"""Enterprise Restore Wizard — interactive PostgreSQL restore from backup history.

Usage:
    python -m scripts.restore_wizard                    # Interactive mode
    python -m scripts.restore_wizard --backup-id=5      # Restore specific backup
    python -m scripts.restore_wizard --latest            # Restore latest backup
    python -m scripts.restore_wizard --list              # List available backups
    python -m scripts.restore_wizard --dry-run --latest  # Verify without restoring
"""

import asyncio
import gzip
import os
import re
import shutil
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Optional

_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_$]*$")


def _validate_db_identifier(name: str) -> str:
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid database identifier: {name!r}")
    return name


def _get_pg_env() -> dict:
    """Return isolated env dict for subprocess calls (avoids PGPASSWORD leak to /proc/PID/environ)."""
    env = {
        "PGHOST": os.environ.get("PGHOST", "127.0.0.1"),
        "PGPORT": os.environ.get("PGPORT", "5432"),
        "PGUSER": os.environ.get("PGUSER", "postgres"),
        "PGDATABASE": "postgres",
        "PGPASSWORD": os.environ.get("PGPASSWORD", ""),
    }
    if "PATH" in os.environ:
        env["PATH"] = os.environ["PATH"]
    return env


async def get_db_session():
    from app.db.session import get_session_maker

    maker = await get_session_maker()
    return maker()


async def list_backups(status: str = "verified") -> list[dict]:
    from sqlalchemy import text

    async with await get_db_session() as db:
        if status == "all":
            result = await db.execute(
                text("""
                    SELECT id, backup_type, status, started_at, completed_at,
                           size_bytes, storage_path, storage_type, verification_status
                    FROM backup_history
                    ORDER BY started_at DESC LIMIT 50
                """)
            )
        else:
            result = await db.execute(
                text("""
                    SELECT id, backup_type, status, started_at, completed_at,
                           size_bytes, storage_path, storage_type, verification_status
                    FROM backup_history
                    WHERE status = :status
                    ORDER BY started_at DESC LIMIT 50
                """),
                {"status": status},
            )
        rows = result.fetchall()
        return [
            {
                "id": r[0],
                "type": r[1],
                "status": r[2],
                "started_at": r[3],
                "completed_at": r[4],
                "size_bytes": r[5],
                "path": r[6],
                "storage_type": r[7],
                "verified": r[8],
            }
            for r in rows
        ]


async def verify_backup_file(backup_path: str) -> dict:
    from app.core.backup import verify_backup

    return await verify_backup(backup_path)


async def _download_s3_backup(s3_key: str) -> str:
    """Download a backup from S3 to a local temp file and return the local path."""
    from app.core.s3_storage import s3_storage

    local_path = os.path.join(tempfile.gettempdir(), os.path.basename(s3_key))
    result = await s3_storage.download_file(s3_key, local_path)
    if not result.get("success"):
        raise RuntimeError(f"S3 download failed: {result.get('error', 'unknown')}")
    return local_path


async def _create_restore_point(db_name: str, pg_env: dict) -> str:
    """Create a savepoint/backup before restoring, for rollback capability."""
    import subprocess

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dump_file = os.path.join(tempfile.gettempdir(), f"pre_restore_savepoint_{timestamp}.dump")
    result = subprocess.run(
        [
            "pg_dump",
            "-Fc",
            "-f",
            dump_file,
            db_name,
        ],
        capture_output=True,
        timeout=300,
        env=pg_env,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to create restore point: {result.stderr.decode()[:200]}")
    return dump_file


async def restore_backup(
    backup_id: int,
    target_db: Optional[str] = None,
    dry_run: bool = False,
    create_savepoint: bool = True,
) -> dict:
    import subprocess

    from sqlalchemy import text

    result = {
        "success": False,
        "error": None,
        "backup_id": backup_id,
        "tables_restored": 0,
        "size_bytes": 0,
        "duration_seconds": 0,
        "savepoint_path": None,
    }

    async with await get_db_session() as db:
        row = await db.execute(
            text("""
                SELECT storage_path, backup_type, size_bytes, storage_type
                FROM backup_history WHERE id = :id
            """),
            {"id": backup_id},
        )
        backup = row.first()
        if not backup:
            result["error"] = f"Backup #{backup_id} not found"
            return result

        storage_path = backup[0]
        backup_type = backup[1]
        storage_type = backup[3]
        result["size_bytes"] = backup[2] or 0

        # Handle S3 backups — download locally first
        is_s3 = storage_type == "s3" or (
            storage_path and (storage_path.startswith("s3://") or "amazonaws.com/" in storage_path)
        )
        needs_cleanup = False
        if is_s3 and storage_path:
            if not storage_path.startswith("s3://"):
                s3_key = f"backups/{os.path.basename(storage_path)}"
            else:
                s3_key = storage_path.replace("s3://", "")
            try:
                storage_path = await _download_s3_backup(s3_key)
                needs_cleanup = True
            except Exception as e:
                result["error"] = f"S3 download failed: {e}"
                return result

        if not storage_path or not os.path.exists(storage_path):
            result["error"] = f"Backup file not found: {storage_path}"
            return result

        # Handle physical (pg_basebackup) backups — programmatic restore
        if backup_type == "physical":
            if dry_run:
                result["success"] = True
                result["message"] = f"DRY RUN: Would restore physical backup from {storage_path}"
                return result
            try:
                from app.core.backup import restore_physical_backup

                physical_result = await restore_physical_backup(
                    backup_path=storage_path,
                    data_dir=os.environ.get("PGDATA", "/var/lib/postgresql/data"),
                )
                if physical_result["success"]:
                    result["success"] = True
                    result["message"] = physical_result.get("message", "Physical backup restored")
                    result["recovery_conf_path"] = physical_result.get("recovery_conf_path")
                else:
                    result["error"] = physical_result.get("error", "Physical restore failed")
            except Exception as e:
                result["error"] = f"Physical restore failed: {e}"
            return result

        if dry_run:
            result["success"] = True
            result["message"] = f"DRY RUN: Would restore {backup_type} backup from {storage_path}"
            return result

        start = datetime.now(UTC)

        try:
            path = Path(storage_path)
            decompressed = path.with_suffix("") if path.suffix == ".gz" else path

            if path.suffix == ".gz":
                with gzip.open(path, "rb") as f_in:
                    with open(decompressed, "wb") as f_out:
                        shutil.copyfileobj(f_in, f_out)

            db_name = target_db or os.environ.get("PGDATABASE", "bom_db")
            pg_env = _get_pg_env()
            pg_env["PGDATABASE"] = "postgres"  # admin db for drop/create

            # Danger zone: this will DROP and recreate the target database
            print(f"\n*** WARNING: About to restore to database '{db_name}' ***")
            print(f"*** Source: {storage_path} ***")
            print("*** This will OVERWRITE the target database! ***")
            confirm = input("Type 'YES' to confirm: ")
            if confirm != "YES":
                result["error"] = "Cancelled by user"
                return result

            # Create savepoint for rollback
            if create_savepoint:
                print("Creating pre-restore savepoint for rollback capability...")
                savepoint = await _create_restore_point(db_name, pg_env)
                result["savepoint_path"] = savepoint
                print(f"Savepoint created: {savepoint}")

            # Terminate connections and drop/create database
            safe_db = _validate_db_identifier(db_name)
            safe_user = _validate_db_identifier(pg_env["PGUSER"])
            subprocess.run(
                [
                    "psql",
                    "-c",
                    f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{safe_db}' AND pid <> pg_backend_pid()",
                ],
                capture_output=True,
                timeout=30,
                env=pg_env,
            )
            subprocess.run(
                ["psql", "-c", f"DROP DATABASE IF EXISTS {safe_db}"],
                capture_output=True,
                timeout=30,
                env=pg_env,
            )
            subprocess.run(
                ["psql", "-c", f"CREATE DATABASE {safe_db} OWNER {safe_user}"],
                capture_output=True,
                timeout=30,
                env=pg_env,
            )

            # Restore
            restore_env = _get_pg_env()
            restore_env["PGDATABASE"] = db_name
            restore_cmd = [
                "pg_restore",
                "--verbose",
                "--no-owner",
                "--no-acl",
                str(decompressed),
            ]

            proc = await asyncio.create_subprocess_exec(
                *restore_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=restore_env,
            )
            stdout, stderr = await proc.communicate()

            if decompressed != path:
                decompressed.unlink(missing_ok=True)

            if proc.returncode != 0:
                result["error"] = (
                    f"pg_restore failed (exit {proc.returncode}): {stderr.decode()[:500]}"
                )
                return result

            duration = (datetime.now(UTC) - start).total_seconds()
            result["success"] = True
            result["duration_seconds"] = round(duration, 2)
            result["tables_restored"] = stdout.decode().count("TABLE ")

            # Record restore in backup_history
            await db.execute(
                text("""
                    UPDATE backup_history
                    SET verification_status = 'restored',
                        verified_at = CURRENT_TIMESTAMP
                    WHERE id = :id
                """),
                {"id": backup_id},
            )
            await db.commit()

        except Exception as e:
            result["error"] = str(e)
        finally:
            if needs_cleanup and storage_path and os.path.exists(storage_path):
                os.unlink(storage_path)

    return result


async def interactive_mode():
    print("\n" + "=" * 60)
    print("  ENTERPRISE RESTORE WIZARD")
    print("=" * 60)

    backups = await list_backups("all")
    if not backups:
        print("\nNo backups found in database.")
        return

    print(f"\n{'ID':>4} {'TYPE':15s} {'STATUS':12s} {'SIZE':10s} {'VERIFIED':10s} {'DATE':20s}")
    print("-" * 75)
    for b in backups:
        size = f"{b['size_bytes'] / 1024 / 1024:.1f}MB" if b["size_bytes"] else "N/A"
        verified = b["verified"] or "N/A"
        date = b["started_at"].strftime("%Y-%m-%d %H:%M") if b["started_at"] else "N/A"
        print(
            f"{b['id']:>4} {b['type']:15s} {b['status']:12s} {size:10s} {verified:10s} {date:20s}"
        )

    try:
        choice = input("\nEnter backup ID to restore (or 'q' to quit): ").strip()
        if choice.lower() == "q":
            return

        backup_id = int(choice)
        dry = input("Dry run only? (y/N): ").strip().lower() == "y"

        result = await restore_backup(backup_id, dry_run=dry)

        print("\n" + "=" * 60)
        print("  RESTORE RESULT")
        print("=" * 60)
        for k, v in result.items():
            print(f"  {k}: {v}")

    except (ValueError, KeyboardInterrupt):
        print("Cancelled.")


async def main():
    if "--list" in sys.argv:
        status = "all" if "--all" in sys.argv else "verified"
        backups = await list_backups(status)
        if not backups:
            print("No backups found.")
            return
        for b in backups:
            size = f"{b['size_bytes'] / 1024 / 1024:.1f}MB" if b["size_bytes"] else "N/A"
            print(
                f"#{b['id']:>4}  {b['type']:15s}  {b['status']:12s}  {size:>10s}  {b['started_at']}"
            )
        return

    if "--backup-id" in sys.argv:
        idx = sys.argv.index("--backup-id") + 1
        backup_id = int(sys.argv[idx]) if idx < len(sys.argv) else None
        if not backup_id:
            print("Usage: --backup-id=<id>")
            return
        dry_run = "--dry-run" in sys.argv
        result = await restore_backup(backup_id, dry_run=dry_run)
        print(result)
        return

    if "--latest" in sys.argv:
        backups = await list_backups("completed")
        if not backups:
            print("No completed backups found.")
            return
        dry_run = "--dry-run" in sys.argv
        result = await restore_backup(backups[0]["id"], dry_run=dry_run)
        print(result)
        return

    await interactive_mode()


if __name__ == "__main__":
    asyncio.run(main())
