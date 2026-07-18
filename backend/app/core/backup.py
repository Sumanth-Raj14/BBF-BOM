"""Automated PostgreSQL backup system with retention, verification, encryption, and alerting."""

import asyncio
import base64
import gzip
import hashlib
import json
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from pathlib import Path
from typing import Any, Optional

from cryptography.fernet import Fernet
from sqlalchemy import select, text

# Streamed encryption: process files in fixed-size chunks to avoid OOM with large DB dumps
_ENCRYPTION_CHUNK_SIZE = 64 * 1024 * 1024  # 64 MB per chunk

from app.core.config import settings
from app.core.s3_storage import s3_storage
from app.db.session import get_session_maker
from app.monitoring.metrics import metrics

logger = logging.getLogger(__name__)


def _find_tool(name: str) -> str:
    candidates = [name]
    # Windows paths
    for ver in ["18", "17", "16", "15", "14", "13"]:
        candidates.append(f"C:\\Program Files\\PostgreSQL\\{ver}\\bin\\{name}.exe")
    # Linux paths
    for ver in ["18", "17", "16", "15", "14", "13"]:
        candidates.append(f"/usr/lib/postgresql/{ver}/bin/{name}")
        candidates.append(f"/usr/pgsql-{ver}/bin/{name}")
    for c in candidates:
        try:
            subprocess.run([c, "--version"], capture_output=True, timeout=5)
            return c
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    raise RuntimeError(f"{name} not found. Install PostgreSQL tools or add it to PATH.")


_PG_DUMP_PATH: Optional[str] = None
_PG_BASEBACKUP_PATH: Optional[str] = None


def _find_pg_dump() -> str:
    global _PG_DUMP_PATH
    if _PG_DUMP_PATH:
        return _PG_DUMP_PATH
    try:
        _PG_DUMP_PATH = _find_tool("pg_dump")
    except RuntimeError:
        raise RuntimeError("pg_dump not found. Install PostgreSQL tools or add it to PATH.")
    return _PG_DUMP_PATH


def _find_pg_basebackup() -> str:
    global _PG_BASEBACKUP_PATH
    if _PG_BASEBACKUP_PATH:
        return _PG_BASEBACKUP_PATH
    try:
        _PG_BASEBACKUP_PATH = _find_tool("pg_basebackup")
    except RuntimeError:
        raise RuntimeError("pg_basebackup not found. Install PostgreSQL tools or add it to PATH.")
    return _PG_BASEBACKUP_PATH


class BackupType(StrEnum):
    FULL = "full"
    SCHEMA_ONLY = "schema_only"
    TABLE = "table"
    PHYSICAL = "physical"  # pg_basebackup for PITR readiness


class BackupStatus(StrEnum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    VERIFIED = "verified"


class RetentionTier(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


BACKUP_DIR = Path(settings.BACKUP_DIR)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

RETENTION_DAYS = {
    RetentionTier.DAILY: 7,
    RetentionTier.WEEKLY: 30,
    RetentionTier.MONTHLY: 365,
    RetentionTier.YEARLY: 365 * 7,
}

DB_NAME = settings.POSTGRES_DB
DB_USER = settings.POSTGRES_USER
DB_PASSWORD = settings.POSTGRES_PASSWORD
DB_HOST = settings.POSTGRES_SERVER
DB_PORT = settings.POSTGRES_PORT


def _pg_env() -> dict:
    """Return environment dict with PG variables + minimal system PATH (for pg_dump/pg_restore library lookup)."""
    env = {
        "PGPASSWORD": DB_PASSWORD,
        "PGHOST": DB_HOST,
        "PGPORT": str(DB_PORT),
        "PGUSER": DB_USER,
        "PGDATABASE": DB_NAME,
    }
    # Include PATH so pg_dump can find shared libraries (e.g., on Windows)
    if "PATH" in os.environ:
        env["PATH"] = os.environ["PATH"]
    return env


_ENCRYPTION_SUFFIX = ".enc"


def _stream_encrypt(input_path: Path, output_path: Path, fernet: Fernet) -> None:
    with open(input_path, "rb") as f_in, open(output_path, "wb") as f_out:
        while True:
            chunk = f_in.read(_ENCRYPTION_CHUNK_SIZE)
            if not chunk:
                break
            encrypted_chunk = fernet.encrypt(chunk)
            f_out.write(len(encrypted_chunk).to_bytes(4, "big"))
            f_out.write(encrypted_chunk)


def _stream_decrypt(input_path: Path, output_path: Path, fernet: Fernet) -> None:
    with open(input_path, "rb") as f_in, open(output_path, "wb") as f_out:
        while True:
            size_bytes = f_in.read(4)
            if not size_bytes:
                break
            chunk_size = int.from_bytes(size_bytes, "big")
            encrypted_chunk = f_in.read(chunk_size)
            if not encrypted_chunk:
                break
            decrypted_chunk = fernet.decrypt(encrypted_chunk)
            f_out.write(decrypted_chunk)


def _get_fernet() -> Fernet:
    raw_key = settings.ENCRYPTION_KEY
    if not raw_key:
        raise ValueError(
            "ENCRYPTION_KEY is not configured. Set it in .env or via VAULT. "
            "Without it, backup encryption would use a predictable key."
        )
    raw = hashlib.sha256(raw_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


@dataclass
class BackupResult:
    backup_type: str = ""
    status: str = ""
    started_at: str = ""
    completed_at: Optional[str] = None
    size_bytes: Optional[int] = None
    storage_path: Optional[str] = None
    storage_type: str = "local"
    error_message: Optional[str] = None
    retention_tier: Optional[str] = None
    metadata: Optional[dict] = None


def _parse_dt(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(val)
    except (ValueError, TypeError):
        return None


async def record_backup(db, result: BackupResult) -> int:
    params = asdict(result)
    params["started_at"] = _parse_dt(params["started_at"])
    params["completed_at"] = _parse_dt(params["completed_at"])
    stmt = text("""
        INSERT INTO backup_history
            (backup_type, status, started_at, completed_at, size_bytes,
             storage_path, storage_type, error_message, retention_tier, backup_metadata)
        VALUES
            (:backup_type, :status, :started_at, :completed_at, :size_bytes,
             :storage_path, :storage_type, :error_message, :retention_tier, :metadata)
        RETURNING id
    """)
    r = await db.execute(stmt, params)
    await db.commit()
    return r.scalar()


_DT_FIELDS = frozenset({"completed_at", "verified_at"})


async def update_backup_status(db, backup_id: int, status: str, **kwargs):
    sets = ["status = :status"]
    params = {"id": backup_id, "status": status}
    for k, v in kwargs.items():
        sets.append(f"{k} = :{k}")
        params[k] = _parse_dt(v) if k in _DT_FIELDS else v
    stmt = text(f"UPDATE backup_history SET {', '.join(sets)} WHERE id = :id")
    await db.execute(stmt, params)
    await db.commit()


def determine_retention_tier() -> RetentionTier:
    now = datetime.now()
    if now.hour < 4:
        return RetentionTier.DAILY
    if now.month == 1 and now.day == 1:
        return RetentionTier.YEARLY
    if now.day == 1:
        return RetentionTier.MONTHLY
    if now.weekday() == 6:
        return RetentionTier.WEEKLY
    return RetentionTier.DAILY


BACKUP_LOCK_KEY = "bom:backup:lock"
BACKUP_LOCK_TIMEOUT = 7200  # 2 hours


async def _acquire_backup_lock() -> Optional[str]:
    lock_id = str(uuid.uuid4())
    try:
        from app.core.cache import get_redis

        r = await get_redis()
        if r is not None:
            set_ok = await r.set(BACKUP_LOCK_KEY, lock_id, nx=True, ex=BACKUP_LOCK_TIMEOUT)
            if not set_ok:
                existing = await r.get(BACKUP_LOCK_KEY)
                logger.warning("Backup already in progress (lock held by %s)", existing)
                return None
            logger.info("Acquired backup lock: %s", lock_id)
            return lock_id
    except Exception as e:
        logger.warning("Failed to acquire Redis backup lock, proceeding anyway: %s", e)
    return lock_id  # No Redis, allow but warn


async def _release_backup_lock(lock_id: Optional[str]) -> None:
    if not lock_id:
        return
    try:
        from app.core.cache import get_redis

        r = await get_redis()
        if r is not None:
            current = await r.get(BACKUP_LOCK_KEY)
            if current == lock_id:
                await r.delete(BACKUP_LOCK_KEY)
                logger.info("Released backup lock: %s", lock_id)
    except Exception as e:
        logger.warning("Failed to release backup lock: %s", e)


async def create_backup(
    backup_type: BackupType = BackupType.FULL,
    table_name: Optional[str] = None,
    storage_type: str = "local",
) -> BackupResult:
    lock_id = await _acquire_backup_lock()
    if lock_id is None:
        return BackupResult(
            backup_type=backup_type.value,
            status="failed",
            started_at=datetime.now(UTC).isoformat(),
            error_message="Another backup is already in progress",
        )
    try:
        return await _create_backup_impl(backup_type, table_name, storage_type)
    finally:
        await _release_backup_lock(lock_id)


async def _create_backup_impl(
    backup_type: BackupType = BackupType.FULL,
    table_name: Optional[str] = None,
    storage_type: str = "local",
) -> BackupResult:
    tier = determine_retention_tier()
    now = datetime.now(UTC)
    started_at = now.isoformat()
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    result = BackupResult(
        backup_type=backup_type.value,
        status="running",
        started_at=started_at,
        retention_tier=tier.value,
        storage_type=storage_type,
    )
    async with (await get_session_maker())() as db:
        backup_id = await record_backup(db, result)

    start_time = now

    try:
        pg_dump = _find_pg_dump()

        # Check disk space before proceeding
        try:
            usage = shutil.disk_usage(BACKUP_DIR)
            free_gb = usage.free / (1024**3)
            if free_gb < settings.BACKUP_MIN_DISK_GB:
                raise RuntimeError(
                    f"Insufficient disk space: {free_gb:.1f} GB free, "
                    f"need at least {settings.BACKUP_MIN_DISK_GB} GB"
                )
        except OSError as e:
            logger.warning("Could not check disk space: %s", e)

        if backup_type == BackupType.SCHEMA_ONLY:
            filename = f"bom_db_schema_{timestamp}.dump"
            cmd = [
                pg_dump,
                "-U",
                DB_USER,
                "-h",
                DB_HOST,
                "-p",
                str(DB_PORT),
                "-s",
                "-Fc",
                "-f",
                str(BACKUP_DIR / filename),
                DB_NAME,
            ]
        elif backup_type == BackupType.TABLE:
            if not table_name:
                raise ValueError("table_name required for table backup")
            fn = f"bom_db_{table_name}_{timestamp}.dump"
            cmd = [
                pg_dump,
                "-U",
                DB_USER,
                "-h",
                DB_HOST,
                "-p",
                str(DB_PORT),
                "-t",
                table_name,
                "-Fc",
                "-f",
                str(BACKUP_DIR / fn),
                DB_NAME,
            ]
            filename = fn
        else:
            filename = f"bom_db_full_{timestamp}.dump"
            cmd = [
                pg_dump,
                "-U",
                DB_USER,
                "-h",
                DB_HOST,
                "-p",
                str(DB_PORT),
                "-Fc",
                "-f",
                str(BACKUP_DIR / filename),
                DB_NAME,
            ]

        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=_pg_env()
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            # Log the tool stderr (may contain internal paths/versions) server-side;
            # surface only a generic message to callers.
            logger.error(
                "pg_dump failed (exit %s): %s",
                proc.returncode,
                stderr.decode(errors="ignore").strip(),
            )
            raise RuntimeError(f"pg_dump failed (exit {proc.returncode})")

        file_path = BACKUP_DIR / filename
        size_bytes = file_path.stat().st_size
        compressed = file_path.with_suffix(file_path.suffix + ".gz")
        with open(file_path, "rb") as f_in, gzip.open(compressed, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        file_path.unlink()

        fernet = _get_fernet()
        encrypted = compressed.with_suffix(compressed.suffix + _ENCRYPTION_SUFFIX)
        _stream_encrypt(compressed, encrypted, fernet)
        compressed.unlink()
        result.metadata = {"encrypted": True, "algo": "Fernet(AES-128-CBC+HMAC-SHA256)"}

        if storage_type == "s3":
            s3_key = f"backups/{encrypted.name}"
            with open(encrypted, "rb") as f:
                s3_result = await s3_storage.upload_file(
                    f.read(), s3_key, content_type="application/octet-stream"
                )
            if s3_result.get("success"):
                encrypted.unlink()
                result.storage_path = s3_result.get("url", s3_key)
                result.storage_type = "s3"
            else:
                result.storage_path = str(encrypted)

        result.status = "completed"
        result.completed_at = datetime.now(UTC).isoformat()
        result.size_bytes = size_bytes
        if not result.storage_path:
            result.storage_path = str(encrypted)
        async with (await get_session_maker())() as db:
            await update_backup_status(
                db,
                backup_id,
                "completed",
                completed_at=result.completed_at,
                size_bytes=size_bytes,
                storage_path=result.storage_path,
                storage_type=result.storage_type,
            )
    except Exception as e:
        duration = (datetime.now(UTC) - start_time).total_seconds()
        metrics.record_backup("failed", backup_type.value, duration_seconds=duration)
        # Log full detail server-side; keep the stored/returned message generic so
        # internal paths / tool output are not leaked to API clients.
        logger.error("Backup %s failed: %s", backup_id, e, exc_info=True)
        result.status = "failed"
        result.error_message = "Backup failed. See server logs for details."
        async with (await get_session_maker())() as db:
            await update_backup_status(
                db, backup_id, "failed", error_message=result.error_message
            )
    else:
        duration = (datetime.now(UTC) - start_time).total_seconds()
        metrics.record_backup(
            result.status,
            backup_type.value,
            size_bytes=result.size_bytes or 0,
            duration_seconds=duration,
        )
    return result


async def create_physical_backup(storage_type: str = "local") -> BackupResult:
    """Create a physical base backup using pg_basebackup for PITR readiness.

    Physical backups are required for Point-in-Time Recovery (WAL replay).
    Unlike logical pg_dump backups, pg_basebackup copies the entire cluster
    including transaction state, which allows rolling forward through WAL archives.
    """
    lock_id = await _acquire_backup_lock()
    if lock_id is None:
        return BackupResult(
            backup_type="physical",
            status="failed",
            started_at=datetime.now(UTC).isoformat(),
            error_message="Another backup is already in progress",
        )
    try:
        return await _create_physical_backup_impl(storage_type)
    finally:
        await _release_backup_lock(lock_id)


async def _create_physical_backup_impl(storage_type: str = "local") -> BackupResult:
    tier = determine_retention_tier()
    now = datetime.now(UTC)
    started_at = now.isoformat()
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    result = BackupResult(
        backup_type="physical",
        status="running",
        started_at=started_at,
        retention_tier=tier.value,
        storage_type=storage_type,
    )
    async with (await get_session_maker())() as db:
        backup_id = await record_backup(db, result)

    start_time = now

    try:
        pg_basebackup = _find_pg_basebackup()
        backup_dir = BACKUP_DIR / f"basebackup_{timestamp}"
        backup_dir.mkdir(parents=True, exist_ok=True)

        cmd = [
            pg_basebackup,
            "-U",
            DB_USER,
            "-h",
            DB_HOST,
            "-p",
            str(DB_PORT),
            "-D",
            str(backup_dir),
            "-Ft",
            "-z",
            "-X",
            "stream",
            "--label",
            f"blackbox_bom_basebackup_{timestamp}",
            "--verbose",
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=_pg_env()
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(stderr.decode().strip() or f"pg_basebackup exit {proc.returncode}")

        # pg_basebackup -Ft -z creates base.tar.gz in the output directory
        base_tar = backup_dir / "base.tar.gz"
        if not base_tar.exists():
            raise RuntimeError(f"pg_basebackup did not create base.tar.gz in {backup_dir}")

        size_bytes = base_tar.stat().st_size

        # Encrypt the base backup
        fernet = _get_fernet()
        encrypted_path = base_tar.with_suffix(base_tar.suffix + _ENCRYPTION_SUFFIX)
        _stream_encrypt(base_tar, encrypted_path, fernet)
        base_tar.unlink()

        # Clean up backup dir
        try:
            backup_dir.rmdir()
        except OSError:
            pass  # Not empty, leave it

        result.metadata = {
            "encrypted": True,
            "algo": "Fernet(AES-128-CBC+HMAC-SHA256)",
            "backup_type": "physical",
            "wal_included": True,
            "format": "pg_basebackup -Ft -z -X stream",
        }

        if storage_type == "s3":
            s3_key = f"basebackups/{encrypted_path.name}"
            with open(encrypted_path, "rb") as f:
                s3_result = await s3_storage.upload_file(
                    f.read(), s3_key, content_type="application/octet-stream"
                )
            if s3_result.get("success"):
                encrypted_path.unlink()
                result.storage_path = s3_result.get("url", s3_key)
                result.storage_type = "s3"
            else:
                result.storage_path = str(encrypted_path)
        else:
            result.storage_path = str(encrypted_path)

        result.status = "completed"
        result.completed_at = datetime.now(UTC).isoformat()
        result.size_bytes = size_bytes

        async with (await get_session_maker())() as db:
            await update_backup_status(
                db,
                backup_id,
                "completed",
                completed_at=result.completed_at,
                size_bytes=size_bytes,
                storage_path=result.storage_path,
                storage_type=result.storage_type,
            )
    except Exception as e:
        duration = (datetime.now(UTC) - start_time).total_seconds()
        metrics.record_backup("failed", "physical", duration_seconds=duration)
        result.status = "failed"
        result.error_message = str(e)
        async with (await get_session_maker())() as db:
            await update_backup_status(db, backup_id, "failed", error_message=str(e))
    else:
        duration = (datetime.now(UTC) - start_time).total_seconds()
        metrics.record_backup(
            result.status,
            "physical",
            size_bytes=result.size_bytes or 0,
            duration_seconds=duration,
        )
    return result


async def verify_backup(backup_path: str) -> dict[str, Any]:
    result = {"verified": False, "error": None, "table_count": 0, "size_bytes": 0}
    try:
        path = Path(backup_path)
        decrypt_tmp = None
        decompress_tmp = None
        try:
            if path.suffix == _ENCRYPTION_SUFFIX:
                fernet = _get_fernet()
                decrypt_tmp = tempfile.NamedTemporaryFile(suffix=".gz", delete=False)
                decrypt_tmp.close()
                _stream_decrypt(path, Path(decrypt_tmp.name), fernet)
                work_path = Path(decrypt_tmp.name)
            else:
                work_path = path

            if work_path.suffix == ".gz":
                decompress_tmp = tempfile.NamedTemporaryFile(suffix=".dump", delete=False)
                with gzip.open(work_path, "rb") as f_in:
                    shutil.copyfileobj(f_in, decompress_tmp)
                decompress_tmp.close()
                restore_path = decompress_tmp.name
            else:
                restore_path = str(work_path)

            cmd = [_find_tool("pg_restore"), "--list", restore_path]
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=_pg_env()
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode == 0:
                output = stdout.decode()
                table_count = sum(
                    1 for line in output.split("\n") if "TABLE DATA" in line or "TABLE" in line
                )
                result["verified"] = True
                result["table_count"] = table_count
                result["size_bytes"] = path.stat().st_size
            else:
                result["error"] = stderr.decode().strip()
        finally:
            if decrypt_tmp and os.path.exists(decrypt_tmp.name):
                os.unlink(decrypt_tmp.name)
            if decompress_tmp and os.path.exists(decompress_tmp.name):
                os.unlink(decompress_tmp.name)
    except Exception as e:
        result["error"] = str(e)
    return result


async def restore_backup(
    backup_path: str,
    target_db_host: Optional[str] = None,
    target_db_port: Optional[str] = None,
    target_db_name: Optional[str] = None,
    target_db_user: Optional[str] = None,
    target_db_password: Optional[str] = None,
) -> dict[str, Any]:
    """Restore a backup file (handles encrypted and/or compressed backups)."""
    result = {"success": False, "error": None, "table_count": 0}
    restore_path = backup_path
    cleanup_files = []
    try:
        path = Path(backup_path)
        if path.suffix == _ENCRYPTION_SUFFIX:
            fernet = _get_fernet()
            decrypt_path = path.with_suffix("")  # remove .enc
            _stream_decrypt(path, decrypt_path, fernet)
            cleanup_files.append(str(decrypt_path))
            restore_path = str(decrypt_path)
            path = decrypt_path

        if path.suffix == ".gz":
            decompress_path = path.with_suffix("")
            with gzip.open(str(path), "rb") as f_in:
                with open(decompress_path, "wb") as f_out:
                    shutil.copyfileobj(f_in, f_out)
            cleanup_files.append(str(decompress_path))
            restore_path = str(decompress_path)
            path = decompress_path

        host = target_db_host or DB_HOST
        port = target_db_port or str(DB_PORT)
        db = target_db_name or DB_NAME
        user = target_db_user or DB_USER
        password = target_db_password or DB_PASSWORD

        pg_restore = _find_tool("pg_restore")
        cmd = [
            pg_restore,
            "-U",
            user,
            "-h",
            host,
            "-p",
            port,
            "-d",
            db,
            "--clean",
            "--if-exists",
            "--no-owner",
            restore_path,
        ]

        restore_env = {
            "PGPASSWORD": password,
            "PGHOST": host,
            "PGPORT": port,
            "PGUSER": user,
            "PGDATABASE": db,
        }
        if "PATH" in os.environ:
            restore_env["PATH"] = os.environ["PATH"]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=restore_env
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode == 0:
            result["success"] = True
            output = stdout.decode()
            result["table_count"] = sum(1 for line in output.split("\n") if "TABLE" in line)
        else:
            result["error"] = stderr.decode().strip() or f"pg_restore exit {proc.returncode}"
    except Exception as e:
        result["error"] = str(e)
    finally:
        for f in cleanup_files:
            if os.path.exists(f):
                os.unlink(f)
    return result


async def restore_physical_backup(
    backup_path: str,
    data_dir: str = "/var/lib/postgresql/data",
    target_db_host: Optional[str] = None,
    target_db_port: Optional[str] = None,
    target_db_user: Optional[str] = None,
    target_db_password: Optional[str] = None,
) -> dict[str, Any]:
    """Restore a physical pg_basebackup to a data directory.

    This stops PostgreSQL, extracts the backup, configures recovery,
    and restarts. For PITR, WAL archives must be available in the
    configured archive directory.

    Returns:
        Dict with success status, error message, and recovery config path.
    """
    result = {"success": False, "error": None, "recovery_conf_path": None}
    import tarfile

    try:
        path = Path(backup_path)
        # Handle encrypted backups
        if path.suffix == _ENCRYPTION_SUFFIX:
            fernet = _get_fernet()
            with open(path, "rb") as f:
                decrypted_data = fernet.decrypt(f.read())
            decrypt_path = path.with_suffix("")
            with open(decrypt_path, "wb") as f:
                f.write(decrypted_data)
            path = decrypt_path
            result["decrypted_path"] = str(path)

        if not path.exists():
            result["error"] = f"Backup file not found: {path}"
            return result

        # Ensure data directory exists
        data_path = Path(data_dir)
        data_path.mkdir(parents=True, exist_ok=True)

        # Extract base backup
        logger.info("Extracting physical backup %s to %s", path, data_dir)
        with tarfile.open(str(path), "r:gz") as tar:
            tar.extractall(path=data_dir)

        # Write recovery signal and config for PITR
        recovery_signal = data_path / "recovery.signal"
        recovery_signal.touch()

        recovery_conf = data_path / "blackbox_recovery.conf"
        recovery_conf.write_text(
            "# Blackbox BOM PITR recovery configuration\n"
            "# Generated by restore_physical_backup\n"
            f"restore_command = 'cp {settings.WAL_ARCHIVE_DIR}/%f %p'\n"
            "recovery_target_action = 'promote'\n"
        )
        result["recovery_conf_path"] = str(recovery_conf)

        result["success"] = True
        result["message"] = (
            f"Physical backup restored to {data_dir}. "
            f"Ensure 'include_if_exists = blackbox_recovery.conf' is in postgresql.conf, "
            f"then restart PostgreSQL for PITR recovery."
        )
    except Exception as e:
        result["error"] = str(e)
        logger.error("Physical restore failed: %s", e)
    return result


async def cleanup_old_backups(dry_run: bool = False) -> list[str]:
    removed = []
    all_tier_rows = []
    for tier, days in RETENTION_DAYS.items():
        cutoff = datetime.now() - timedelta(days=days)
        async with (await get_session_maker())() as db:
            rows = (
                await db.execute(
                    text("""
                SELECT id, storage_path, storage_type FROM backup_history
                WHERE retention_tier = :tier AND status IN ('completed', 'verified', 'failed')
                  AND started_at < :cutoff
            """),
                    {"tier": tier.value, "cutoff": cutoff},
                )
            ).all()
            all_tier_rows.extend((tier, row) for row in rows)
    if not all_tier_rows:
        return removed

    s3_delete_tasks = []
    local_paths = []
    expired_ids = []
    for _, row in all_tier_rows:
        expired_ids.append(row.id)
        if not row.storage_path:
            continue
        if row.storage_type == "s3":
            s3_key = row.storage_path
            if "amazonaws.com/" in s3_key or s3_key.startswith("s3://"):
                s3_key = "/".join(s3_key.split("/")[-2:])
            s3_delete_tasks.append(s3_key)
            removed.append(f"s3://{s3_key}")
        elif os.path.exists(row.storage_path):
            local_paths.append(row.storage_path)
            removed.append(row.storage_path)

    if not dry_run:
        if s3_delete_tasks:
            s3_results = await asyncio.gather(
                *(s3_storage.delete_file(k) for k in s3_delete_tasks),
                return_exceptions=True,
            )
            for key, result in zip(s3_delete_tasks, s3_results, strict=False):
                if isinstance(result, Exception):
                    logger.warning("S3 cleanup failed for %s: %s", key, result)
        for path in local_paths:
            try:
                os.unlink(path)
            except OSError as e:
                logger.warning("Local file cleanup failed for %s: %s", path, e)
        if expired_ids:
            async with (await get_session_maker())() as db:
                placeholders = ",".join(f":id_{i}" for i in range(len(expired_ids)))
                params = {f"id_{i}": id_ for i, id_ in enumerate(expired_ids)}
                await db.execute(
                    text(
                        f"UPDATE backup_history SET status = 'expired' WHERE id IN ({placeholders})"
                    ),
                    params,
                )
                await db.commit()
    return removed


async def run_backup_pipeline(
    include_physical: bool = False, dual_storage: bool = False
) -> dict[str, Any]:
    """Run the backup pipeline with dual-storage support.

    Args:
        include_physical: If True, also creates a pg_basebackup for PITR readiness.
        dual_storage: If True, stores backups to both local and S3.
    """
    results = {"full": None, "physical": None, "verified": False, "cleanup_count": 0}

    full_result = await create_backup(BackupType.FULL, storage_type="local")
    if dual_storage and full_result.status == "completed":
        # Also store to S3 for off-site redundancy
        s3_result = await create_backup(BackupType.FULL, storage_type="s3")
        results["full_s3"] = {
            "status": s3_result.status,
            "path": s3_result.storage_path,
            "size": s3_result.size_bytes,
            "error": s3_result.error_message,
        }

    results["full"] = {
        "status": full_result.status,
        "path": full_result.storage_path,
        "size": full_result.size_bytes,
        "error": full_result.error_message,
    }
    if full_result.status == "completed" and full_result.storage_path:
        verification = await verify_backup(full_result.storage_path)
        results["verified"] = verification["verified"]
        async with (await get_session_maker())() as db:
            row = (
                await db.execute(
                    text("SELECT id FROM backup_history WHERE storage_path = :path"),
                    {"path": full_result.storage_path},
                )
            ).first()
            if row:
                await update_backup_status(
                    db,
                    row.id,
                    "verified" if verification["verified"] else "completed",
                    verification_status="passed" if verification["verified"] else "failed",
                    verified_at=datetime.now(UTC).isoformat(),
                )
    if full_result.status == "failed":
        await _send_backup_alert(full_result)

    if include_physical:
        physical_result = await create_physical_backup(storage_type="local")
        if dual_storage and physical_result.status == "completed":
            await create_physical_backup(storage_type="s3")
        results["physical"] = {
            "status": physical_result.status,
            "path": physical_result.storage_path,
            "size": physical_result.size_bytes,
            "error": physical_result.error_message,
        }
        if physical_result.status == "failed":
            await _send_backup_alert(physical_result)

    results["cleanup_count"] = len(await cleanup_old_backups())
    return results


async def _send_backup_alert(result: BackupResult) -> None:
    try:
        await _send_webhook_alerts(result)
        await _send_email_alert(result)
        logger.error(
            "BACKUP FAILED: type=%s error=%s",
            result.backup_type,
            result.error_message,
        )
    except Exception as e:
        logger.warning("Failed to send backup alerts: %s", e)


async def _send_webhook_alerts(result: BackupResult) -> None:
    from app.models.webhook import WebhookSubscription

    async with (await get_session_maker())() as db:
        result_set = await db.execute(
            select(WebhookSubscription).where(
                WebhookSubscription.events.like('%"backup.failed"%'),
                WebhookSubscription.active,
            )
        )
        webhooks = result_set.scalars().all()
        if not webhooks:
            return
        payload = json.dumps(
            {
                "event": "backup.failed",
                "backup_type": result.backup_type,
                "error": result.error_message,
                "started_at": result.started_at,
                "server": os.uname().nodename if hasattr(os, "uname") else "unknown",
            },
            default=str,
        )
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            for webhook in webhooks:
                try:
                    signature = hashlib.sha256(
                        (payload + (webhook.secret or "")).encode()
                    ).hexdigest()
                    await client.post(
                        webhook.url,
                        json=json.loads(payload),
                        headers={
                            "X-Webhook-Signature": signature,
                            "Content-Type": "application/json",
                        },
                    )
                except Exception as wh_err:
                    logger.warning("Backup alert webhook failed: %s", wh_err)


async def cleanup_wal_archive(keep_days: int = 7, dry_run: bool = False) -> dict:
    """Clean up old WAL archive files beyond the retention period.

    Args:
        keep_days: Number of days of WAL files to retain (default 7).
        dry_run: If True, only report what would be deleted.

    Returns:
        Dict with deleted count, freed bytes, and any errors.
    """
    wal_dir = Path(settings.WAL_ARCHIVE_DIR)
    if not wal_dir.exists():
        return {
            "deleted": 0,
            "freed_bytes": 0,
            "errors": [],
            "message": "No WAL archive directory found",
        }

    cutoff = datetime.now() - timedelta(days=keep_days)
    deleted = 0
    freed_bytes = 0
    errors = []

    for f in wal_dir.iterdir():
        if not f.is_file():
            continue
        try:
            mtime = datetime.fromtimestamp(f.stat().st_mtime)
            if mtime < cutoff:
                if not dry_run:
                    size = f.stat().st_size
                    f.unlink()
                    freed_bytes += size
                deleted += 1
        except Exception as e:
            errors.append({"file": str(f), "error": str(e)})

    logger.info(
        "WAL cleanup: deleted=%d, freed=%.2fMB, dry_run=%s",
        deleted,
        freed_bytes / (1024 * 1024),
        dry_run,
    )
    return {
        "deleted": deleted,
        "freed_bytes": freed_bytes,
        "freed_mb": round(freed_bytes / (1024 * 1024), 2),
        "errors": errors,
        "dry_run": dry_run,
    }


async def _send_email_alert(result: BackupResult) -> None:
    try:
        from app.services.email_service import send_email

        subject = f"[CRITICAL] Backup Failed - {result.backup_type} - {settings.APP_NAME or 'Blackbox BOM'}"
        body = f"""
Backup job failed.

Type: {result.backup_type}
Status: {result.status}
Started: {result.started_at}
Error: {result.error_message}

This is an automated alert from the backup system.
        """.strip()
        if settings.ADMIN_EMAIL:
            await send_email(
                to=settings.ADMIN_EMAIL,
                subject=subject,
                body=body,
            )
    except ImportError:
        logger.warning("email_service not available, skipping email alert")
    except Exception as e:
        logger.warning("Failed to send backup email alert: %s", e)
