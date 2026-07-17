"""System-level backup cron script.

Run this via system cron (Linux) or Task Scheduler (Windows) to ensure
backups happen even when the main app is not running.

Usage:
    python scripts/backup_cron.py                    # Full backup
    python scripts/backup_cron.py --physical          # Include physical backup
    python scripts/backup_cron.py --dual-storage      # Local + S3
    python scripts/backup_cron.py --schema-only       # Schema-only backup
    python scripts/backup_cron.py --cleanup-only      # Only clean old backups
    python scripts/backup_cron.py --dry-run           # Preview without changes

Recommended cron schedule: 0 */6 * * *  (every 6 hours)
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

from app.core.backup import (
    BackupType,
    cleanup_old_backups,
    create_backup,
    run_backup_pipeline,
)
from app.db.session import init_engine

load_dotenv()


async def main():
    parser = argparse.ArgumentParser(description="System-level backup script")
    parser.add_argument("--physical", action="store_true", help="Include physical backup")
    parser.add_argument("--dual-storage", action="store_true", help="Store to local and S3")
    parser.add_argument("--schema-only", action="store_true", help="Schema-only backup")
    parser.add_argument("--cleanup-only", action="store_true", help="Only clean old backups")
    parser.add_argument("--dry-run", action="store_true", help="Preview without changes")
    args = parser.parse_args()

    await init_engine()

    if args.cleanup_only:
        if args.dry_run:
            print("[DRY RUN] Would clean up old backups")
        else:
            removed = await cleanup_old_backups(dry_run=args.dry_run)
            print(f"Cleaned up {len(removed)} old backups")
        return

    if args.schema_only:
        result = await create_backup(BackupType.SCHEMA_ONLY)
        status = "ok" if result.status == "completed" else f"FAILED: {result.error_message}"
        print(f"Schema backup: {status}")
        return

    result = await run_backup_pipeline(
        include_physical=args.physical, dual_storage=args.dual_storage
    )
    status = "ok" if result.get("verified") else "unverified"
    size = result.get("full", {}).get("size", 0)
    print(f"Backup pipeline complete: status={status}, size={size} bytes")

    if result.get("full", {}).get("status") == "failed":
        print(f"ERROR: {result['full'].get('error')}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
