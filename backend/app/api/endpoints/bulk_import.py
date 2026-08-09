from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
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
    BulkImportUploadResponse,
    CommitResponse,
    CommitRowError,
    MappingRequest,
    MappingRowError,
    MappingValidationResponse,
)
from app.services import import_service

router = APIRouter(dependencies=[Depends(get_current_user)])


async def _get_job_or_404(db: AsyncSession, job_id: int, tenant_id: int) -> BulkImportJob:
    result = await db.execute(
        select(BulkImportJob).where(
            BulkImportJob.id == job_id, BulkImportJob.tenantId == tenant_id
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/upload", response_model=BulkImportUploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    entity: str = Form("parts"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if entity not in import_service.SUPPORTED_ENTITIES:
        raise HTTPException(
            status_code=400,
            detail=f"entity '{entity}' is not supported yet (supported: "
            f"{sorted(import_service.SUPPORTED_ENTITIES)})",
        )

    content = await file.read()
    try:
        rows = import_service.parse_file(file.filename, content)
    except import_service.ImportValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job = BulkImportJob(
        filename=file.filename,
        status="uploaded",
        totalRows=len(rows),
        mappingConfig={"entity": entity},
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

    detected_columns = list(rows[0].keys()) if rows else []
    return BulkImportUploadResponse(
        id=job.id,
        job_id=job.id,
        filename=job.filename,
        status=job.status,
        totalRows=job.totalRows,
        processedRows=job.processedRows,
        errorRows=job.errorRows,
        mappingConfig=job.mappingConfig,
        createdAt=str(job.createdAt) if job.createdAt else None,
        completedAt=str(job.completedAt) if job.completedAt else None,
        detected_columns=detected_columns,
        sample_rows=[dict(r) for r in rows[:5]],
        row_count=len(rows),
    )


@router.post("/{job_id}/mapping", response_model=MappingValidationResponse)
async def validate_mapping(
    job_id: int,
    data: MappingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Validate a file-column -> entity-field mapping WITHOUT writing anything.

    Persists the mapping on the job (in the existing mappingConfig JSON column,
    no schema change) so /commit can re-run the identical mapping.
    """
    job = await _get_job_or_404(db, job_id, current_user.tenantId)
    entity = (job.mappingConfig or {}).get("entity", "parts")

    try:
        import_service.validate_mapping_targets(entity, data.mapping)
    except import_service.ImportValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    rows_result = await db.execute(
        select(BulkImportRow)
        .where(BulkImportRow.jobId == job_id, BulkImportRow.tenantId == current_user.tenantId)
        .order_by(BulkImportRow.id)
    )
    import_rows = rows_result.scalars().all()

    spec = import_service.ENTITY_SPECS[entity]
    natural_key = spec["natural_key"]

    errors: list[MappingRowError] = []
    will_create = 0
    will_update = 0
    seen_keys: set[str] = set()

    keys_in_file = []
    for idx, row in enumerate(import_rows, start=1):
        mapped = import_service.map_row(row.rowData or {}, data.mapping)
        cleaned, row_errors = import_service.validate_row(entity, mapped)
        if row_errors:
            for msg in row_errors:
                field = msg.split(":", 1)[0]
                errors.append(MappingRowError(row=idx, column=field, message=msg))
            row.status = "error"
            row.errors = "; ".join(row_errors)
            continue
        key_val = cleaned.get(natural_key)
        if key_val in seen_keys:
            errors.append(
                MappingRowError(
                    row=idx,
                    column=natural_key,
                    message=f"{natural_key}: duplicate '{key_val}' within this file",
                )
            )
            row.status = "error"
            row.errors = f"duplicate {natural_key} within file"
            continue
        seen_keys.add(key_val)
        keys_in_file.append(key_val)
        row.status = "pending"
        row.errors = None

    existing_keys: set[str] = set()
    if keys_in_file:
        model = spec["model"]
        key_col = getattr(model, natural_key)
        existing_result = await db.execute(
            select(key_col).where(
                key_col.in_(keys_in_file), model.tenantId == current_user.tenantId
            )
        )
        existing_keys = {row[0] for row in existing_result.all()}

    will_update = len(existing_keys)
    will_create = len(keys_in_file) - will_update

    job.mappingConfig = {"entity": entity, "mapping": data.mapping}
    # "processing" is the closest existing status (ck_bulk_import_jobs_status
    # only allows pending/processing/completed/failed/cancelled/uploaded) --
    # no migration for a new "validated" value, per the no-schema-change rule.
    job.status = "processing"
    await db.commit()

    return MappingValidationResponse(
        valid=len(errors) == 0,
        errors=errors,
        will_create=will_create,
        will_update=will_update,
    )


@router.post("/{job_id}/commit", response_model=CommitResponse)
async def commit_import(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Actually create/update records. Tenant-scoped.

    Transaction model: each row gets its own SAVEPOINT (db.begin_nested()).
    A bad row is rolled back to that savepoint, counted as failed, and the
    rest of the file keeps going — one broken row does not sink the whole
    import. The successful rows are committed together at the end.
    """
    job = await _get_job_or_404(db, job_id, current_user.tenantId)
    mapping_config = job.mappingConfig or {}
    mapping = mapping_config.get("mapping")
    entity = mapping_config.get("entity", "parts")
    if not mapping:
        raise HTTPException(
            status_code=400, detail="Call /mapping before /commit to supply a column mapping"
        )

    spec = import_service.ENTITY_SPECS[entity]
    model = spec["model"]
    natural_key = spec["natural_key"]

    rows_result = await db.execute(
        select(BulkImportRow)
        .where(BulkImportRow.jobId == job_id, BulkImportRow.tenantId == current_user.tenantId)
        .order_by(BulkImportRow.id)
    )
    import_rows = rows_result.scalars().all()

    created = 0
    updated = 0
    failed = 0
    errors: list[CommitRowError] = []

    for idx, row in enumerate(import_rows, start=1):
        mapped = import_service.map_row(row.rowData or {}, mapping)
        cleaned, row_errors = import_service.validate_row(entity, mapped)
        if row_errors:
            failed += 1
            errors.append(CommitRowError(row=idx, message="; ".join(row_errors)))
            row.status = "error"
            row.errors = "; ".join(row_errors)
            continue

        key_val = cleaned.get(natural_key)
        try:
            async with db.begin_nested():
                existing_result = await db.execute(
                    select(model).where(
                        getattr(model, natural_key) == key_val,
                        model.tenantId == current_user.tenantId,
                    )
                )
                existing = existing_result.scalar_one_or_none()
                if existing:
                    for field, value in cleaned.items():
                        setattr(existing, field, value)
                    updated += 1
                else:
                    db.add(model(tenantId=current_user.tenantId, **cleaned))
                    created += 1
                await db.flush()
            row.status = "processed"
            row.errors = None
        except IntegrityError as exc:
            failed += 1
            message = f"{natural_key} '{key_val}': {exc.orig}"
            errors.append(CommitRowError(row=idx, message=message))
            row.status = "error"
            row.errors = message

    job.processedRows = created + updated
    job.errorRows = failed
    # ck_bulk_import_jobs_status only allows pending/processing/completed/
    # failed/cancelled/uploaded -- there is no "completed_with_errors" value
    # (no migration for one, per the no-schema-change rule), so a commit with
    # some skipped rows is still "completed"; errorRows/failed conveys the
    # partial-failure detail.
    job.status = "completed"
    job.completedAt = datetime.now(UTC)
    await db.commit()

    return CommitResponse(created=created, updated=updated, failed=failed, errors=errors)


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


@router.get("/jobs", response_model=list[BulkImportJobResponse])
async def list_import_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tenant-scoped import job history (used by the Bulk Import screen).

    Distinct from /all/status above, which is not tenant-scoped and returns
    every tenant's jobs — kept as-is for backward compatibility, but not
    safe for a tenant-facing UI to call.
    """
    result = await db.execute(
        select(BulkImportJob)
        .where(BulkImportJob.tenantId == current_user.tenantId)
        .order_by(BulkImportJob.createdAt.desc())
    )
    jobs = result.scalars().all()
    return [
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
