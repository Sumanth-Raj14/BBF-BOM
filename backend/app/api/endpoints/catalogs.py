"""Catalog endpoints (OpenBOM-parity): tenant-scoped part catalogs.

CRUD for Catalog, add/list parts within a catalog (part_catalogs
association), and "create catalog from folder/zip" which walks a directory
of part files, extracts CAD metadata via app.api.endpoints.cad for
recognized CAD formats, and creates a Part + catalog link per file.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params
from app.core.rbac import require_parts_read, require_parts_write
from app.db.session import get_db
from app.models.user import User
from app.services import catalog_service

router = APIRouter()


class CatalogBase(BaseModel):
    catalog_code: str = Field(..., json_schema_extra={"example": "CAT-ELEC-001"})
    catalog_name: str = Field(..., json_schema_extra={"example": "Electrical Components"})
    description: Optional[str] = None


class CatalogCreate(CatalogBase):
    pass


class CatalogUpdate(BaseModel):
    catalog_code: Optional[str] = None
    catalog_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class CatalogResponse(CatalogBase):
    id: int
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PartCatalogLinkCreate(BaseModel):
    partId: int


class PartCatalogLinkResponse(BaseModel):
    id: int
    partId: int
    catalogId: int
    created: bool = True


class CatalogPartItem(BaseModel):
    linkId: int
    partId: int
    pn: str
    name: str
    rev: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    cost: Optional[float] = None
    vendor: Optional[str] = None
    manufacturer: Optional[str] = None


class CatalogImportResponse(BaseModel):
    catalog: CatalogResponse
    filesScanned: int
    partsCreated: int
    partsReused: int
    partsLinked: int
    errors: list[str] = []


@router.get("/")
async def get_catalogs(
    page: PageParams = Depends(get_page_params),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    return await catalog_service.list_catalogs(db, page, search, is_active)


@router.post("/", response_model=CatalogResponse, status_code=status.HTTP_201_CREATED)
async def create_catalog(
    catalog: CatalogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await catalog_service.create_catalog(db, catalog.model_dump(), current_user.tenantId)


@router.post("/from-folder", response_model=CatalogImportResponse)
async def create_catalog_from_folder(
    catalog_code: str = Form(...),
    catalog_name: str = Form(...),
    description: Optional[str] = Form(None),
    folder_path: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    """Create a new catalog populated from a folder of part files.

    Accepts EITHER a server-side ``folder_path`` (form field) OR an uploaded
    zip ``file`` — exactly one is required. CAD files (.step/.stp/.igs/
    .iges/.sldprt) have their metadata extracted via the existing
    app.api.endpoints.cad.cad_extract_attributes logic; every other file
    becomes a basic Part named after the filename. Missing/unparseable
    metadata never aborts the import — it just falls back to the filename.
    """
    if not folder_path and not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either folder_path or an uploaded zip file",
        )
    if folder_path and file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide only one of folder_path or an uploaded zip file, not both",
        )

    zip_bytes = await file.read() if file else None

    result = await catalog_service.create_catalog_from_folder(
        db,
        current_user,
        catalog_code=catalog_code,
        catalog_name=catalog_name,
        description=description,
        folder_path=folder_path,
        zip_bytes=zip_bytes,
    )
    return result


@router.get("/{catalog_id}", response_model=CatalogResponse)
async def get_catalog(
    catalog_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    return await catalog_service.get_catalog(db, catalog_id)


@router.put("/{catalog_id}", response_model=CatalogResponse)
async def update_catalog(
    catalog_id: int,
    catalog_update: CatalogUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await catalog_service.update_catalog(
        db, catalog_id, catalog_update.model_dump(exclude_unset=True)
    )


@router.patch("/{catalog_id}", response_model=CatalogResponse)
async def patch_catalog(
    catalog_id: int,
    catalog_update: CatalogUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await catalog_service.update_catalog(
        db, catalog_id, catalog_update.model_dump(exclude_unset=True)
    )


@router.post("/{catalog_id}/deactivate", response_model=CatalogResponse)
async def deactivate_catalog(
    catalog_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await catalog_service.deactivate_catalog(db, catalog_id)


@router.get("/{catalog_id}/parts")
async def get_catalog_parts(
    catalog_id: int,
    page: PageParams = Depends(get_page_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    return await catalog_service.list_parts_in_catalog(db, catalog_id, page)


@router.post(
    "/{catalog_id}/parts",
    response_model=PartCatalogLinkResponse,
)
async def add_part_to_catalog(
    catalog_id: int,
    link: PartCatalogLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    """Add-or-update: idempotent link of a part into a catalog. Returns the
    existing link (created=False) if the part is already in the catalog.
    """
    db_link, created = await catalog_service.add_or_update_part_in_catalog(
        db, catalog_id, link.partId, current_user.tenantId
    )
    return PartCatalogLinkResponse(
        id=db_link.id,
        partId=db_link.part_id,
        catalogId=db_link.catalog_id,
        created=created,
    )


@router.delete("/{catalog_id}/parts/{part_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_part_from_catalog(
    catalog_id: int,
    part_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    await catalog_service.remove_part_from_catalog(db, catalog_id, part_id)
    return None
