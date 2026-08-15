from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class BulkImportJobResponse(BaseModel):
    id: int
    filename: str
    status: str
    totalRows: int = 0
    processedRows: int = 0
    errorRows: int = 0
    mappingConfig: Optional[dict] = None
    createdAt: Optional[str] = None
    completedAt: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class BulkImportRowResponse(BaseModel):
    id: int
    jobId: int
    rowData: Optional[dict] = None
    status: str
    errors: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class BulkImportProcessRequest(BaseModel):
    mappingConfig: dict[str, Any]


class BulkImportStatusResponse(BaseModel):
    job: BulkImportJobResponse
    rows: list[BulkImportRowResponse]


class BulkImportErrorResponse(BaseModel):
    total: int
    errors: list[BulkImportRowResponse]


# --- Shared import contract (upload / mapping / commit) ---


class BulkImportUploadResponse(BulkImportJobResponse):
    """Superset of BulkImportJobResponse: adds the contract's upload fields
    (job_id/detected_columns/sample_rows/row_count) without breaking the
    pre-existing id/filename/status/totalRows callers."""

    job_id: int
    detected_columns: list[str] = []
    sample_rows: list[dict[str, Any]] = []
    row_count: int = 0


class MappingRequest(BaseModel):
    mapping: dict[str, str]


class MappingRowError(BaseModel):
    row: int
    column: Optional[str] = None
    message: str


class MappingValidationResponse(BaseModel):
    valid: bool
    errors: list[MappingRowError] = []
    will_create: int = 0
    will_update: int = 0


class CommitRowError(BaseModel):
    row: int
    message: str


class CommitResponse(BaseModel):
    created: int = 0
    updated: int = 0
    failed: int = 0
    errors: list[CommitRowError] = []
