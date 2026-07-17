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
