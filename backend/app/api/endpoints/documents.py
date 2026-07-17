import hashlib
import logging
import os
from datetime import datetime
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clamav import combined_scan
from app.core.deps import get_current_user
from app.core.file_scanning import ALLOWED_EXTENSIONS, validate_upload
from app.core.pagination import PageParams, get_page_params
from app.core.rbac import require_documents_write
from app.core.s3_storage import s3_storage
from app.db.session import get_db
from app.models.document import Document
from app.models.user import User
from app.services import document_service

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "uploads",
)
os.makedirs(UPLOAD_DIR, exist_ok=True)


class DocumentResponse(BaseModel):
    id: int
    filename: str
    originalName: str
    fileType: Optional[str] = None
    fileSize: Optional[int] = None
    filePath: Optional[str] = None
    url: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    partId: Optional[int] = None
    projectId: Optional[int] = None
    version: int = 1
    isLatest: bool = True
    accessLevel: str = "private"
    uploadedBy: Optional[str] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class DocumentUpdate(BaseModel):
    category: Optional[str] = None
    tags: Optional[str] = None
    accessLevel: Optional[str] = None
    partId: Optional[int] = None
    projectId: Optional[int] = None


class FolderResponse(BaseModel):
    path: str
    label: str
    icon: str
    count: int


EXT_CATEGORY_MAP = {
    ".pdf": "Datasheet",
    ".dwg": "Drawing",
    ".dxf": "Drawing",
    ".step": "CAD",
    ".stp": "CAD",
    ".iges": "CAD",
    ".xlsx": "Quote",
    ".xls": "Quote",
    ".csv": "Test",
    ".png": "Drawing",
    ".jpg": "Drawing",
    ".jpeg": "Drawing",
}


@router.get("/folders", response_model=list[FolderResponse])
async def get_folders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await document_service.get_folders(db)


@router.get("/")
async def get_documents(
    page: PageParams = Depends(get_page_params),
    category: Optional[str] = None,
    folder: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await document_service.list_documents(db, page, category, folder, search)


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    category: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    partId: Optional[int] = Form(None),
    projectId: Optional[int] = Form(None),
    accessLevel: Optional[str] = Form("private"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_documents_write),
):
    validate_upload(file)
    content = await file.read()

    scan_result = await combined_scan(content, file.filename or "unknown")
    if not scan_result["clean"]:
        details = scan_result["scanners"].get("clamav", {}).get("details") or scan_result[
            "scanners"
        ].get("basic", {}).get("details")
        # Log the scanner detail server-side; return a generic message so scanner
        # internals (paths, tool versions, signature names) are not leaked.
        logger.warning("Upload rejected by security scan: %s", details)
        raise HTTPException(
            status_code=400,
            detail="File rejected by security scan.",
        )

    file_hash = hashlib.md5(content).hexdigest()[:12]

    # Never build a path from the client-supplied filename. Derive a safe name
    # from the content hash plus a sanitized, whitelisted extension only. The
    # original filename is preserved only as stored metadata (originalName).
    raw_ext = os.path.splitext(file.filename or "")[1].lower().lstrip(".")
    safe_ext = raw_ext if raw_ext.isalnum() and raw_ext in ALLOWED_EXTENSIONS else "bin"
    safe_filename = f"{file_hash}.{safe_ext}"
    ext = f".{safe_ext}"

    auto_category = category
    if not auto_category:
        auto_category = EXT_CATEGORY_MAP.get(ext.lower(), "Other")
    # Sanitize the category so it cannot introduce path separators into the key.
    safe_category = os.path.basename(str(auto_category)).replace("..", "").strip() or "Other"

    s3_key = f"documents/{safe_category}/{safe_filename}"
    content_type = file.content_type or "application/octet-stream"
    s3_result = await s3_storage.upload_file(content, s3_key, content_type)

    file_path = s3_result.get("localPath") or os.path.join(UPLOAD_DIR, safe_filename)
    if s3_result.get("storage") == "local_fallback":
        with open(file_path, "wb") as f:
            f.write(content)

    db_doc = Document(
        filename=safe_filename,
        originalName=file.filename or "upload",
        fileType=ext.lstrip("."),
        fileSize=len(content),
        filePath=file_path,
        url=s3_result.get("url") or f"/uploads/{safe_filename}",
        category=auto_category,
        tags=tags,
        partId=partId,
        projectId=projectId,
        accessLevel=accessLevel,
        uploadedBy=current_user.email,
        tenantId=current_user.tenantId,
    )
    db.add(db_doc)
    await db.commit()
    await db.refresh(db_doc)
    return db_doc


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await document_service.get_document(db, document_id)


@router.get("/{document_id}/versions", response_model=list[DocumentResponse])
async def get_document_versions(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await document_service.get_document_versions(db, document_id)


@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    document_update: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await document_service.update_document(
        db, document_id, document_update.model_dump(exclude_unset=True)
    )


@router.patch("/{document_id}", response_model=DocumentResponse)
async def patch_document(
    document_id: int,
    document_update: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await document_service.update_document(
        db, document_id, document_update.model_dump(exclude_unset=True)
    )


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await document_service.delete_document(db, document_id)
    return None
