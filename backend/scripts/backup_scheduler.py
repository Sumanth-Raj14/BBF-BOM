"""APScheduler-based automated backup scheduler.

Runs daily backup pipeline with retention, verification, and alerting.
Usage:
    python -m scripts.backup_scheduler          # Run once
    python -m scripts.backup_scheduler --daemon  # Run as daemon (APScheduler loop)
"""

import asyncio
import logging
import os
import sys
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("logs/backup_scheduler.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("backup_scheduler")

try:
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from app.core.config import settings

    _backup_base = settings.BACKUP_DIR
except Exception as exc:
    logger.warning("Failed to load settings, using default backup dir: %s", exc)
    _backup_base = "./backups"

BACKUP_DIRS = [
    os.path.join(_backup_base, "daily"),
    os.path.join(_backup_base, "weekly"),
    os.path.join(_backup_base, "monthly"),
    os.path.join(_backup_base, "yearly"),
]

SCHEDULE_HOUR = 2
SCHEDULE_MINUTE = 0


async def run_scheduled_backup():
    logger.info("Starting scheduled backup pipeline")
    try:
        sys.path.insert(0, ".")
        from app.core.backup import run_backup_pipeline

        result = await run_backup_pipeline()
        full = result.get("full", {})
        status = full.get("status", "unknown")
        verified = result.get("verified", False)
        cleanup = result.get("cleanup_count", 0)

        logger.info(f"Backup: {status}, Verified: {verified}, Cleanup: {cleanup} files removed")
        if full.get("error"):
            logger.error(f"Backup error: {full['error']}")

        if status != "completed" or not verified:
            logger.warning("BACKUP FAILED OR UNVERIFIED - check immediately")

    except Exception as e:
        logger.exception(f"Scheduled backup failed: {e}")
        await send_alert(f"Backup failed: {e}")

    return result


async def send_alert(message: str):
    """Send alert via configured notification channel."""
    logger.warning(f"ALERT: {message}")
    try:
        from sqlalchemy import text

        from app.db.session import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            await db.execute(
                text("""
                    INSERT INTO notifications_queue (user_id, notification_type, subject, body, channel, priority)
                    VALUES (NULL, 'system_alert', 'Backup Alert', :body, 'admin', 'high')
                """),
                {"body": message},
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to queue alert: {e}")


async def _check_and_run():
    """Check if scheduled time has arrived and run if so."""
    now = datetime.now()
    if now.hour == SCHEDULE_HOUR and now.minute == SCHEDULE_MINUTE:
        logger.info("Scheduled time reached, running backup")
        await run_scheduled_backup()
        await asyncio.sleep(61)


def run_daemon():
    """Run scheduler as a background daemon using APScheduler."""
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger

        scheduler = AsyncIOScheduler()
        trigger = CronTrigger(hour=SCHEDULE_HOUR, minute=SCHEDULE_MINUTE)
        scheduler.add_job(
            lambda: asyncio.create_task(run_scheduled_backup()),
            trigger=trigger,
            id="daily_backup",
            name="Daily PostgreSQL backup",
            misfire_grace_time=3600,
        )

        logger.info(
            f"Backup scheduler daemon started via APScheduler. "
            f"Will run daily at {SCHEDULE_HOUR:02d}:{SCHEDULE_MINUTE:02d}"
        )
        scheduler.start()

        try:
            asyncio.get_event_loop().run_forever()
        except (KeyboardInterrupt, SystemExit):
            scheduler.shutdown()
    except ImportError:
        logger.warning("APScheduler not installed, falling back to sleep-loop daemon")
        _legacy_daemon()


def _legacy_daemon():
    """Fallback daemon using sleep loop (when APScheduler is unavailable)."""
    import time

    logger.info(
        f"Backup scheduler daemon started (legacy mode). "
        f"Will run daily at {SCHEDULE_HOUR:02d}:{SCHEDULE_MINUTE:02d}"
    )
    while True:
        now = datetime.now()
        if now.hour == SCHEDULE_HOUR and now.minute == SCHEDULE_MINUTE:
            logger.info("Scheduled time reached, running backup")
            asyncio.run(run_scheduled_backup())
            time.sleep(61)
        time.sleep(30)


if __name__ == "__main__":
    os.makedirs("logs", exist_ok=True)
    os.makedirs(_backup_base, exist_ok=True)
    for d in BACKUP_DIRS:
        os.makedirs(d, exist_ok=True)

    if "--daemon" in sys.argv:
        run_daemon()
    else:
        logger.info("Running single backup pass")
        result = asyncio.run(run_scheduled_backup())
        print(f"Result: {result}")
