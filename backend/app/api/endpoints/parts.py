from typing import Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params
from app.core.rbac import require_parts_delete, require_parts_write
from app.db.session import get_db
from app.integrations.events import emit_integration_event
from app.integrations.zoho_snapshots import part_snapshot
from app.models.user import User
from app.schemas.part import PartCreate, PartListResponse, PartResponse, PartUpdate
from app.services import part_service

router = APIRouter()


class DuplicateCheckRequest(BaseModel):
    pn: Optional[str] = None
    mpn: Optional[str] = None
    name: Optional[str] = None
    vendor: Optional[str] = None


class DuplicateResult(BaseModel):
    partId: int
    pn: str
    name: str
    matchType: str
    matchScore: float


@router.get("/", response_model=PartListResponse)
async def get_parts(
    db: AsyncSession = Depends(get_db),
    page: PageParams = Depends(get_page_params),
    current_user: User = Depends(get_current_user),
    search: Optional[str] = None,
    category: Optional[str] = None,
    vendor: Optional[str] = None,
    manufacturer: Optional[str] = None,
    status: Optional[str] = None,
):
    return await part_service.list_parts(
        db, page, current_user.tenantId, search, category, vendor, manufacturer, status
    )


@router.post("/", response_model=PartResponse, status_code=status.HTTP_201_CREATED)
async def create_part(
    part: PartCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = await part_service.create_part(db, part.model_dump(), current_user.tenantId)
    # Outbound integration event (no-op unless an enabled connector opts into
    # 'part' via config.enabled_entity_types — local-first preserved).
    await emit_integration_event(
        db, current_user.tenantId, "part", obj.id, "created", part_snapshot(obj))
    await db.commit()
    return obj


@router.get("/{part_id}", response_model=PartResponse)
async def get_part(
    part_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await part_service.get_part(db, part_id)


@router.put("/{part_id}", response_model=PartResponse)
async def update_part(
    part_id: int,
    part_update: PartUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = await part_service.update_part(db, part_id, part_update.model_dump(exclude_unset=True))
    await emit_integration_event(
        db, current_user.tenantId, "part", obj.id, "updated", part_snapshot(obj))
    await db.commit()
    return obj


@router.patch("/{part_id}", response_model=PartResponse)
async def patch_part(
    part_id: int,
    part_update: PartUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = await part_service.update_part(db, part_id, part_update.model_dump(exclude_unset=True))
    await emit_integration_event(
        db, current_user.tenantId, "part", obj.id, "updated", part_snapshot(obj))
    await db.commit()
    return obj


@router.delete("/{part_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_part(
    part_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_delete),
):
    await part_service.delete_part(db, part_id)
    return None


class BulkDeleteRequest(BaseModel):
    ids: list[int]


@router.post("/bulk-delete")
async def bulk_delete_parts(
    req: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_delete),
):
    deleted = await part_service.bulk_delete_parts(db, req.ids)
    return {"deleted": deleted}


@router.post("/check-duplicates", response_model=list[DuplicateResult])
async def check_duplicates(
    req: DuplicateCheckRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = await part_service.check_duplicates(db, req.pn, req.mpn, req.name, req.vendor)
    return [DuplicateResult(**r) for r in results]
