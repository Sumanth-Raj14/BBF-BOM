"""Startup health check — verifies database connectivity, integrity, and recovery readiness.

Run this on application startup to ensure the system is in a known good state.
"""

import asyncio
import logging
import os
import subprocess
import sys
from datetime import datetime

logger = logging.getLogger(__name__)


async def check_database() -> dict:
    from sqlalchemy import text

    from app.db.session import get_session_maker, init_engine

    result = {"status": "unknown", "checks": []}

    try:
        engine = await init_engine()
        async with (await get_session_maker())() as db:
            r = await db.execute(text("SELECT version()"))
            version = r.scalar()
            result["checks"].append({"check": "connectivity", "status": "ok"})

            r = await db.execute(
                text(
                    "SELECT current_database(), current_user, inet_server_addr(), inet_server_port()"
                )
            )
            db_info = r.fetchone()
            result["database"] = {
                "name": db_info[0],
                "user": db_info[1],
                "host": str(db_info[2]) if db_info[2] else "localhost",
                "port": db_info[3],
            }
            result["version"] = version[:50]

            r = await db.execute(
                text("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
            )
            table_count = r.scalar() or 0
            result["checks"].append(
                {
                    "check": "tables",
                    "count": table_count,
                    "status": "ok" if table_count > 0 else "warn",
                }
            )

            r = await db.execute(
                text(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
                )
            )
            r.scalar() or 0

            r = await db.execute(
                text("""
                SELECT COUNT(*) FROM information_schema.table_constraints
                WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'
            """)
            )
            fk_count = r.scalar() or 0
            result["checks"].append({"check": "foreign_keys", "count": fk_count, "status": "ok"})

            r = await db.execute(
                text("""
                SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'
                AND table_name NOT IN (SELECT table_name FROM information_schema.table_constraints WHERE constraint_type = 'PRIMARY KEY')
            """)
            )
            tables_without_pk = r.scalar() or 0
            if tables_without_pk > 0:
                result["checks"].append(
                    {"check": "tables_without_pk", "count": tables_without_pk, "status": "warn"}
                )

            r = await db.execute(
                text("""
                SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE '%_fts%' OR indexname LIKE '%idx_%'
            """)
            )
            index_count = r.scalar() or 0
            result["checks"].append({"check": "indexes", "count": index_count, "status": "ok"})

            r = await db.execute(text("SHOW wal_level"))
            wal_level = r.scalar()
            result["checks"].append(
                {
                    "check": "wal_level",
                    "value": wal_level,
                    "status": "ok" if wal_level in ("replica", "logical") else "warn",
                }
            )

            r = await db.execute(text("SHOW archive_mode"))
            archive_mode = r.scalar()
            result["checks"].append(
                {
                    "check": "archive_mode",
                    "value": archive_mode,
                    "status": "ok" if archive_mode == "on" else "warn",
                }
            )

            try:
                pg_isready = subprocess.run(
                    [
                        "pg_isready",
                        "-h",
                        db_info[2] if db_info[2] else "localhost",
                        "-p",
                        str(db_info[3]),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                isready_status = "ok" if pg_isready.returncode == 0 else "error"
                result["checks"].append(
                    {
                        "check": "pg_isready",
                        "output": pg_isready.stdout.strip(),
                        "returncode": pg_isready.returncode,
                        "status": isready_status,
                    }
                )
                if isready_status == "ok":
                    logger.info("pg_isready: %s", pg_isready.stdout.strip())
                else:
                    logger.warning("pg_isready failed: %s", pg_isready.stderr.strip())
            except FileNotFoundError:
                result["checks"].append(
                    {
                        "check": "pg_isready",
                        "status": "warn",
                        "message": "pg_isready not found on this host",
                    }
                )
                logger.warning("pg_isready binary not found")
            except Exception as e:
                result["checks"].append(
                    {
                        "check": "pg_isready",
                        "status": "error",
                        "message": str(e)[:200],
                    }
                )
                logger.error("pg_isready check failed: %s", e)

            r = await db.execute(text("SELECT count(*) FROM pg_class"))
            pg_class_count = r.scalar() or 0
            result["checks"].append(
                {
                    "check": "pg_class_integrity",
                    "count": pg_class_count,
                    "status": "ok" if pg_class_count > 0 else "error",
                }
            )
            logger.info("pg_class integrity: %d system catalog entries", pg_class_count)

            r = await db.execute(text("SELECT pg_is_in_recovery()"))
            in_recovery = r.scalar()
            result["checks"].append(
                {"check": "in_recovery", "value": in_recovery, "status": "info"}
            )

        await engine.dispose()

        all_ok = all(c.get("status") == "ok" for c in result["checks"])
        result["status"] = "healthy" if all_ok else "degraded"

    except Exception as e:
        result["status"] = "unhealthy"
        result["error"] = str(e)[:200]

    return result


async def check_backup_system() -> dict:
    result = {"status": "unknown", "checks": []}

    from app.core.config import settings

    backup_dir = os.environ.get("BACKUP_DIR", "./backups")
    exists = os.path.isdir(backup_dir)
    files = os.listdir(backup_dir) if exists else []

    result["checks"].append(
        {
            "check": "backup_directory",
            "path": backup_dir,
            "exists": exists,
            "file_count": len(files),
            "status": "ok" if exists else "error",
        }
    )

    wal_dir = os.environ.get("WAL_ARCHIVE_DIR", "/var/lib/postgresql/wal_archive")
    wal_exists = os.path.isdir(wal_dir) if os.name != "nt" else False
    result["checks"].append(
        {
            "check": "wal_archive",
            "path": wal_dir,
            "exists": wal_exists,
            "pitr_ready": wal_exists,
            "status": "ok" if wal_exists else "warn",
            "message": "WAL archiving configured but archive dir not found on this host"
            if not wal_exists
            else None,
        }
    )

    has_backups = exists and len(files) > 0
    if has_backups:
        result["checks"].append(
            {
                "check": "existing_backups",
                "count": len(files),
                "status": "ok",
            }
        )
    else:
        is_production = getattr(settings, "IS_PRODUCTION", False)
        backup_status = "error" if is_production else "warn"
        backup_message = (
            "CRITICAL: No backups found — system will not start in production without backups"
            if is_production
            else "No backups found — first backup will be created on schedule"
        )
        result["checks"].append(
            {
                "check": "existing_backups",
                "count": 0,
                "status": backup_status,
                "message": backup_message,
            }
        )

    pitr_ready = wal_exists
    result["checks"].append(
        {
            "check": "pitr_readiness",
            "ready": pitr_ready,
            "status": "ok" if pitr_ready else "warn",
            "message": "PITR is available if WAL archive directory exists and backup pipeline is active",
        }
    )

    if not has_backups and getattr(settings, "IS_PRODUCTION", False):
        result["status"] = "unhealthy"
    else:
        result["status"] = "ok" if exists else "degraded"
    return result


async def main():
    print("\n" + "=" * 60)
    print("  BLACKBOX BOM — STARTUP HEALTH CHECK")
    print(f"  {datetime.now().isoformat()}")
    print("=" * 60)

    print("\n--- Database ---")
    db_result = await check_database()
    for c in db_result.get("checks", []):
        status_symbol = (
            "✅" if c.get("status") == "ok" else "⚠️" if c.get("status") == "warn" else "❌"
        )
        extra = c.get("value") or c.get("count") or ""
        msg = c.get("message", "")
        print(f"  {status_symbol} {c['check']}: {extra} {msg}")
    print(f"  Database status: {db_result.get('status', 'unknown').upper()}")
    if db_result.get("database"):
        db = db_result["database"]
        print(f"  Connected to {db['name']}@{db['host']}:{db['port']} as {db['user']}")
    if db_result.get("version"):
        print(f"  PostgreSQL {db_result['version']}")

    print("\n--- Backup System ---")
    backup_result = await check_backup_system()
    for c in backup_result.get("checks", []):
        status_symbol = (
            "✅" if c.get("status") == "ok" else "⚠️" if c.get("status") == "warn" else "❌"
        )
        print(f"  {status_symbol} {c['check']}")
    print(f"  Backup system: {backup_result.get('status', 'unknown').upper()}")

    overall = db_result.get("status") == "healthy" and backup_result.get("status") == "ok"
    overall_status = (
        "HEALTHY ✅"
        if overall
        else "DEGRADED ⚠️"
        if db_result.get("status") != "unhealthy"
        else "UNHEALTHY ❌"
    )

    print("\n" + "=" * 60)
    print(f"  OVERALL STATUS: {overall_status}")
    print("=" * 60 + "\n")

    return 0 if overall else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
