import csv
import io
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.bulk_import import BulkImportJob, BulkImportRow
from app.models.user import User
from app.schemas.bulk_import import (
    BulkImportErrorResponse,
    BulkImportJobResponse,
    BulkImportProcessRequest,
    BulkImportRowResponse,
    BulkImportStatusResponse,
)

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.post("/upload", response_model=BulkImportJobResponse)
async def upload_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)

    job = BulkImportJob(
        filename=file.filename,
        status="uploaded",
        totalRows=len(rows),
        mappingConfig={},
        tenantId=current_user.tenantId,
    )
    db.add(job)
    await db.flush()

    for row in rows:
        import_row = BulkImportRow(
            jobId=job.id, rowData=dict(row), status="pending", tenantId=current_user.tenantId
        )
        db.add(import_row)

    await db.commit()
    await db.refresh(job)

    return BulkImportJobResponse(
        id=job.id,
        filename=job.filename,
        status=job.status,
        totalRows=job.totalRows,
        processedRows=job.processedRows,
        errorRows=job.errorRows,
        mappingConfig=job.mappingConfig,
        createdAt=str(job.createdAt) if job.createdAt else None,
        completedAt=str(job.completedAt) if job.completedAt else None,
    )


@router.post("/{job_id}/process", response_model=BulkImportJobResponse)
async def process_import(
    job_id: int, data: BulkImportProcessRequest, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(BulkImportJob).where(BulkImportJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.mappingConfig = data.mappingConfig
    job.status = "processing"
    await db.flush()

    rows_result = await db.execute(
        select(BulkImportRow).where(
            BulkImportRow.jobId == job_id, BulkImportRow.status == "pending"
        )
    )
    pending_rows = rows_result.scalars().all()

    processed = 0
    errors = 0
    for row in pending_rows:
        try:
            mapped = {}
            for target_field, source_field in data.mappingConfig.items():
                mapped[target_field] = row.rowData.get(source_field, "")
            row.rowData = mapped
            row.status = "processed"
            processed += 1
        except Exception as e:
            row.status = "error"
            row.errors = str(e)
            errors += 1

    job.processedRows = processed
    job.errorRows = errors
    job.status = "completed" if errors == 0 else "completed_with_errors"
    job.completedAt = datetime.now(UTC)
    await db.commit()
    await db.refresh(job)

    return BulkImportJobResponse(
        id=job.id,
        filename=job.filename,
        status=job.status,
        totalRows=job.totalRows,
        processedRows=job.processedRows,
        errorRows=job.errorRows,
        mappingConfig=job.mappingConfig,
        createdAt=str(job.createdAt) if job.createdAt else None,
        completedAt=str(job.completedAt) if job.completedAt else None,
    )


@router.get("/all/status")
async def get_all_import_status(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BulkImportJob).order_by(BulkImportJob.createdAt.desc()))
    jobs = result.scalars().all()
    return {
        "jobs": [
            BulkImportJobResponse(
                id=j.id,
                filename=j.filename,
                status=j.status,
                totalRows=j.totalRows,
                processedRows=j.processedRows,
                errorRows=j.errorRows,
                mappingConfig=j.mappingConfig,
                createdAt=str(j.createdAt) if j.createdAt else None,
                completedAt=str(j.completedAt) if j.completedAt else None,
            )
            for j in jobs
        ]
    }


@router.get("/{job_id}/status", response_model=BulkImportStatusResponse)
async def get_import_status(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BulkImportJob).where(BulkImportJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    rows_result = await db.execute(select(BulkImportRow).where(BulkImportRow.jobId == job_id))
    rows = rows_result.scalars().all()

    return BulkImportStatusResponse(
        job=BulkImportJobResponse(
            id=job.id,
            filename=job.filename,
            status=job.status,
            totalRows=job.totalRows,
            processedRows=job.processedRows,
            errorRows=job.errorRows,
            mappingConfig=job.mappingConfig,
            createdAt=str(job.createdAt) if job.createdAt else None,
            completedAt=str(job.completedAt) if job.completedAt else None,
        ),
        rows=[
            BulkImportRowResponse(
                id=r.id,
                jobId=r.jobId,
                rowData=r.rowData,
                status=r.status,
                errors=r.errors,
            )
            for r in rows
        ],
    )


@router.get("/{job_id}/errors", response_model=BulkImportErrorResponse)
async def get_import_errors(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BulkImportJob).where(BulkImportJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    rows_result = await db.execute(
        select(BulkImportRow).where(BulkImportRow.jobId == job_id, BulkImportRow.status == "error")
    )
    error_rows = rows_result.scalars().all()

    return BulkImportErrorResponse(
        total=len(error_rows),
        errors=[
            BulkImportRowResponse(
                id=r.id,
                jobId=r.jobId,
                rowData=r.rowData,
                status=r.status,
                errors=r.errors,
            )
            for r in error_rows
        ],
    )
