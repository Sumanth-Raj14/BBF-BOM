"""Initialize the backup system by creating the first manual backup.

Run this after the database is running:
    python -m scripts.initialize_backup

This creates:
1. The backup directory structure
2. Encrypts a test payload to verify encryption keys
3. Creates a full database backup
4. Verifies the backup
"""

import asyncio
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def initialize():
    from app.core.backup import BackupType, create_backup, verify_backup
    from app.core.config import settings

    backup_dir = Path(settings.BACKUP_DIR)
    backup_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Backup directory: %s", backup_dir.absolute())

    if not settings.ENCRYPTION_KEY:
        logger.warning("ENCRYPTION_KEY not set. Backups will not be encrypted.")
    else:
        import base64
        import hashlib

        from cryptography.fernet import Fernet

        key = base64.urlsafe_b64encode(hashlib.sha256(settings.ENCRYPTION_KEY.encode()).digest())
        f = Fernet(key)
        test = f.encrypt(b"test")
        f.decrypt(test)
        logger.info("Encryption key valid")

    logger.info("Creating initial full backup...")
    result = await create_backup(BackupType.FULL)
    if result.status == "completed":
        logger.info("Backup created: %s (%d bytes)", result.storage_path, result.size_bytes)
        logger.info("Verifying backup...")
        verification = await verify_backup(result.storage_path)
        if verification["verified"]:
            logger.info("Backup verified: %d tables", verification["table_count"])
        else:
            logger.warning("Backup verification failed: %s", verification.get("error"))
    else:
        logger.error("Backup failed: %s", result.error_message)


if __name__ == "__main__":
    asyncio.run(initialize())
