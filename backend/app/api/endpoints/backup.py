"""Backup management API endpoints."""

import logging
from datetime import datetime
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.backup import (
    BackupType,
    cleanup_old_backups,
    create_backup,
    create_physical_backup,
    restore_backup,
    run_backup_pipeline,
    verify_backup,
)
from app.core.deps import get_current_superuser
from app.core.pagination import PageParams, get_page_params
from app.db.session import get_db
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()


class BackupRecord(BaseModel):
    id: int
    backup_type: str
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    size_bytes: Optional[int] = None
    storage_path: Optional[str] = None
    storage_type: str = "local"
    error_message: Optional[str] = None
    retention_tier: Optional[str] = None
    verification_status: Optional[str] = None
    verified_at: Optional[datetime] = None


class BackupResponse(BaseModel):
    status: str
    backup_id: Optional[int] = None
    message: str
    error: Optional[str] = None


class VerifyResponse(BaseModel):
    verified: bool
    table_count: int = 0
    size_bytes: int = 0
    error: Optional[str] = None


@router.get("/history")
async def get_backup_history(
    page: PageParams = Depends(get_page_params),
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    count_query = "SELECT COUNT(*) FROM backup_history"
    count_params = {}
    if status:
        count_query += " WHERE status = :status"
        count_params["status"] = status
    count_result = await db.execute(text(count_query), count_params)
    total = count_result.scalar() or 0

    data_query = "SELECT * FROM backup_history"
    data_params = {}
    if status:
        data_query += " WHERE status = :status"
        data_params["status"] = status
    offset = (page.page - 1) * page.per_page
    data_query += " ORDER BY started_at DESC LIMIT :limit OFFSET :offset"
    data_params["limit"] = page.per_page
    data_params["offset"] = offset
    result = await db.execute(text(data_query), data_params)
    rows = result.fetchall()

    total_pages = max(1, ceil(total / page.per_page))
    return {
        "items": [dict(row._mapping) for row in rows],
        "total": total,
        "page": page.page,
        "per_page": page.per_page,
        "total_pages": total_pages,
        "has_next": page.page < total_pages,
        "has_prev": page.page > 1,
    }


@router.post("/create", response_model=BackupResponse)
async def trigger_backup(
    backup_type: str = "full",
    table_name: Optional[str] = None,
    current_user: User = Depends(get_current_superuser),
):
    try:
        btype = BackupType(backup_type)
        result = await create_backup(btype, table_name)
        return BackupResponse(
            status=result.status,
            message=f"Backup {result.status}",
            error=result.error_message,
        )
    except Exception as e:
        logger.error("Backup trigger failed: %s", e, exc_info=True)
        return BackupResponse(
            status="failed", message="Backup failed", error="Backup failed. See server logs."
        )


@router.post("/physical", response_model=BackupResponse)
async def trigger_physical_backup(
    current_user: User = Depends(get_current_superuser),
):
    """Create a physical base backup using pg_basebackup for PITR readiness."""
    try:
        result = await create_physical_backup()
        return BackupResponse(
            status=result.status,
            message=f"Physical backup {result.status}",
            error=result.error_message,
        )
    except Exception as e:
        logger.error("Physical backup trigger failed: %s", e, exc_info=True)
        return BackupResponse(
            status="failed",
            message="Physical backup failed",
            error="Physical backup failed. See server logs.",
        )


@router.post("/verify/{backup_id}", response_model=VerifyResponse)
async def verify_backup_endpoint(
    backup_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    result = await db.execute(
        text("SELECT storage_path FROM backup_history WHERE id = :id"),
        {"id": backup_id},
    )
    row = result.first()
    if not row or not row.storage_path:
        raise HTTPException(status_code=404, detail="Backup not found")
    verification = await verify_backup(row.storage_path)
    await db.execute(
        text(
            "UPDATE backup_history SET verification_status = :vs, verified_at = NOW() WHERE id = :id"
        ),
        {"vs": "passed" if verification["verified"] else "failed", "id": backup_id},
    )
    await db.commit()
    return VerifyResponse(**verification)


@router.post("/pipeline", response_model=dict)
async def trigger_pipeline(
    include_physical: bool = False,
    current_user: User = Depends(get_current_superuser),
):
    """Run full backup pipeline. Optionally includes pg_basebackup for PITR."""
    return await run_backup_pipeline(include_physical=include_physical)


@router.post("/cleanup", response_model=dict)
async def trigger_cleanup(
    dry_run: bool = True,
    current_user: User = Depends(get_current_superuser),
):
    removed = await cleanup_old_backups(dry_run=dry_run)
    return {"removed": removed, "count": len(removed), "dry_run": dry_run}


class PitrRestoreRequest(BaseModel):
    target_time: Optional[str] = None
    target_xid: Optional[str] = None
    dry_run: bool = True


class PitrRestoreResponse(BaseModel):
    status: str
    message: str
    recovery_conf: Optional[str] = None
    recovery_signal_path: Optional[str] = None
    wal_archive: Optional[str] = None
    wal_file_count: Optional[int] = None
    target_time: Optional[str] = None
    target_xid: Optional[str] = None
    error: Optional[str] = None


@router.post("/pitr-restore", response_model=PitrRestoreResponse)
async def pitr_restore(
    request: PitrRestoreRequest,
    current_user: User = Depends(get_current_superuser),
):
    if not request.target_time and not request.target_xid:
        raise HTTPException(status_code=422, detail="Specify target_time or target_xid")

    try:
        from scripts.pitr_restore import write_restore_files

        result = write_restore_files(
            target_time=request.target_time,
            target_xid=request.target_xid,
            dry_run=request.dry_run,
        )
        return PitrRestoreResponse(
            status=result.get("status", "error"),
            message=result.get("message", ""),
            recovery_conf=result.get("recovery_conf"),
            recovery_signal_path=result.get("recovery_signal_path"),
            wal_archive=result.get("wal_archive"),
            wal_file_count=result.get("wal_file_count"),
            target_time=result.get("target_time"),
            target_xid=result.get("target_xid"),
            error=result.get("message") if result.get("status") == "error" else None,
        )
    except ImportError as e:
        logger.error("PITR module not available: %s", e)
        raise HTTPException(status_code=500, detail="PITR module not available")
    except Exception as e:
        logger.error("PITR restore failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="PITR restore failed. See server logs.")


class RestoreRequest(BaseModel):
    backup_id: int
    target_db_host: Optional[str] = None
    target_db_port: Optional[str] = None
    target_db_name: Optional[str] = None
    target_db_user: Optional[str] = None
    target_db_password: Optional[str] = None


class RestoreResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    table_count: int = 0


@router.post("/restore/{backup_id}", response_model=RestoreResponse)
async def restore_backup_endpoint(
    backup_id: int,
    body: Optional[RestoreRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    """Restore a backup by ID. Superuser only. Dangerous operation."""
    result = await db.execute(
        text("SELECT storage_path, storage_type FROM backup_history WHERE id = :id"),
        {"id": backup_id},
    )
    row = result.first()
    if not row or not row.storage_path:
        raise HTTPException(status_code=404, detail="Backup not found")

    file_path = row.storage_path
    if row.storage_type == "s3":
        from app.core.s3_storage import s3_storage

        local_path = f"/tmp/restore_{backup_id}.dump"
        s3_data = await s3_storage.download_file(file_path)
        if not s3_data:
            raise HTTPException(status_code=500, detail="Failed to download backup from S3")
        with open(local_path, "wb") as f:
            f.write(s3_data)
        file_path = local_path

    req = body or RestoreRequest(backup_id=backup_id)
    try:
        restore_result = await restore_backup(
            backup_path=file_path,
            target_db_host=req.target_db_host,
            target_db_port=req.target_db_port,
            target_db_name=req.target_db_name,
            target_db_user=req.target_db_user,
            target_db_password=req.target_db_password,
        )
        return RestoreResponse(**restore_result)
    except Exception as e:
        logger.error("Backup restore failed: %s", e, exc_info=True)
        return RestoreResponse(success=False, error="Restore failed. See server logs.")


@router.get("/latest", response_model=Optional[BackupRecord])
async def get_latest_backup(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    result = await db.execute(
        text(
            "SELECT * FROM backup_history WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1"
        )
    )
    row = result.first()
    return dict(row._mapping) if row else None
