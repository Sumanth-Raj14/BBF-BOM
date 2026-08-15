"""Manufacturing BOM (MBOM) API.

`app/models/mbom.py` (MbomHeader/MbomItem/MbomOperation) existed with zero
routes and zero UI (xBOM parity gap). This gives the three tables list/get/
create/update, tenant-scoped, plus the actual point of xBOM: deriving an
MBOM from an existing EBOM so a manufacturing view can diverge from
engineering without ever touching it. Mirrors bom_enterprise.py's style
(inline request models, hand-built response dicts, explicit tenant filters)
since that's the sibling BOM router.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.rbac import require_engineering, require_viewer
from app.core.tenant_context import get_tenant_id
from app.db.session import get_db
from app.models.mbom import MbomHeader, MbomItem, MbomOperation
from app.models.part import Part
from app.models.user import User
from app.services import bom_service

router = APIRouter(
    tags=["mbom"], dependencies=[Depends(get_current_user), Depends(require_viewer)]
)


def _header_dict(h: MbomHeader) -> dict:
    return {
        "id": h.id,
        "mbom_number": h.mbom_number,
        "ebom_id": h.ebom_id,
        "name": h.name,
        "description": h.description,
        "status": h.status,
        "version": h.version,
        "revision": h.revision,
        "work_center": h.work_center,
    }


def _item_dict(i: MbomItem) -> dict:
    return {
        "id": i.id,
        "mbom_id": i.mbom_id,
        "part_id": i.part_id,
        "quantity": i.quantity,
        "unit": i.unit,
        "operation_number": i.operation_number,
        "work_center": i.work_center,
        "scrap_factor": i.scrap_factor,
        "notes": i.notes,
        "parent_item_id": i.parent_item_id,
    }


def _operation_dict(o: MbomOperation) -> dict:
    return {
        "id": o.id,
        "mbom_id": o.mbom_id,
        "operation_number": o.operation_number,
        "operation_name": o.operation_name,
        "description": o.description,
        "work_center": o.work_center,
        "instructions": o.instructions,
    }


async def _get_header_or_404(db: AsyncSession, mbom_id: int) -> MbomHeader:
    tid = get_tenant_id()
    stmt = select(MbomHeader).where(MbomHeader.id == mbom_id)
    if tid is not None:
        stmt = stmt.where(MbomHeader.tenantId == tid)
    header = (await db.execute(stmt)).scalar_one_or_none()
    if not header:
        raise HTTPException(status_code=404, detail="MBOM not found")
    return header


async def _require_part(db: AsyncSession, part_id: int, tid: Optional[int]) -> None:
    """MbomItem.part_id is a NOT NULL FK to parts.id with no ORM relationship,
    so an invalid or cross-tenant id would otherwise either 500 on commit
    (IntegrityError) or silently attach another tenant's part. Match the
    existence+tenant check bom_service.create_bom_item already does."""
    stmt = select(Part).where(Part.id == part_id)
    if tid is not None:
        stmt = stmt.where(Part.tenantId == tid)
    if not (await db.execute(stmt)).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Part not found")


async def _require_parent(
    db: AsyncSession,
    mbom_id: int,
    parent_item_id: Optional[int],
    tid: Optional[int],
    self_id: Optional[int] = None,
) -> None:
    """Mirrors bom_service._validate_parent for MbomItem: the parent must be a
    line within the SAME mbom_id and tenant, or a crafted parent_item_id could
    graft another MBOM's (or tenant's) subtree into this one's tree."""
    if parent_item_id is None:
        return
    if self_id is not None and parent_item_id == self_id:
        raise HTTPException(status_code=400, detail="An MBOM line cannot be its own parent")
    stmt = select(MbomItem).where(MbomItem.id == parent_item_id, MbomItem.mbom_id == mbom_id)
    if tid is not None:
        stmt = stmt.where(MbomItem.tenantId == tid)
    if not (await db.execute(stmt)).scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="parent_item_id must reference a line within the same MBOM",
        )


class MbomHeaderCreateRequest(BaseModel):
    ebom_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    status: Optional[str] = None
    version: Optional[str] = None
    work_center: Optional[str] = None


class MbomHeaderUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    version: Optional[str] = None
    work_center: Optional[str] = None


class MbomItemCreateRequest(BaseModel):
    part_id: int
    quantity: float = 1
    unit: Optional[str] = "EA"
    operation_number: Optional[int] = None
    work_center: Optional[str] = None
    scrap_factor: Optional[float] = None
    notes: Optional[str] = None
    parent_item_id: Optional[int] = None


class MbomItemUpdateRequest(BaseModel):
    part_id: Optional[int] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    operation_number: Optional[int] = None
    work_center: Optional[str] = None
    scrap_factor: Optional[float] = None
    notes: Optional[str] = None
    parent_item_id: Optional[int] = None


class MbomOperationCreateRequest(BaseModel):
    operation_number: int
    operation_name: str
    description: Optional[str] = None
    work_center: Optional[str] = None
    instructions: Optional[str] = None


class MbomOperationUpdateRequest(BaseModel):
    operation_number: Optional[int] = None
    operation_name: Optional[str] = None
    description: Optional[str] = None
    work_center: Optional[str] = None
    instructions: Optional[str] = None


class MbomDeriveRequest(BaseModel):
    ebom_id: int
    name: Optional[str] = None


# ============ Headers ============


@router.get("/headers")
async def list_mbom_headers(
    ebom_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    tid = get_tenant_id()
    base = select(MbomHeader)
    count_base = select(func.count()).select_from(MbomHeader)
    if tid is not None:
        base = base.where(MbomHeader.tenantId == tid)
        count_base = count_base.where(MbomHeader.tenantId == tid)
    if ebom_id is not None:
        base = base.where(MbomHeader.ebom_id == ebom_id)
        count_base = count_base.where(MbomHeader.ebom_id == ebom_id)
    total = (await db.execute(count_base)).scalar() or 0
    result = await db.execute(base.order_by(MbomHeader.id).offset(skip).limit(limit))
    headers = result.scalars().all()
    return {
        "items": [_header_dict(h) for h in headers],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/headers", status_code=201)
async def create_mbom_header(
    request: MbomHeaderCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    tid = current_user.tenantId
    count = (
        await db.execute(
            select(func.count()).select_from(MbomHeader).where(MbomHeader.tenantId == tid)
        )
    ).scalar() or 0
    header = MbomHeader(
        mbom_number=f"MBOM-{count + 1:04d}",
        ebom_id=request.ebom_id,
        name=request.name,
        description=request.description,
        status=request.status or "draft",
        version=request.version or "1.0",
        work_center=request.work_center,
        created_by=current_user.id,
        tenantId=tid,
    )
    db.add(header)
    await db.commit()
    await db.refresh(header)
    return _header_dict(header)


@router.get("/headers/{mbom_id}")
async def get_mbom_header(mbom_id: int, db: AsyncSession = Depends(get_db)):
    header = await _get_header_or_404(db, mbom_id)
    tid = get_tenant_id()
    items_stmt = select(MbomItem).where(MbomItem.mbom_id == mbom_id)
    ops_stmt = select(MbomOperation).where(MbomOperation.mbom_id == mbom_id)
    if tid is not None:
        items_stmt = items_stmt.where(MbomItem.tenantId == tid)
        ops_stmt = ops_stmt.where(MbomOperation.tenantId == tid)
    items = (await db.execute(items_stmt.order_by(MbomItem.id))).scalars().all()
    ops = (await db.execute(ops_stmt.order_by(MbomOperation.operation_number))).scalars().all()
    return {
        **_header_dict(header),
        "items": [_item_dict(i) for i in items],
        "operations": [_operation_dict(o) for o in ops],
    }


@router.put("/headers/{mbom_id}")
async def update_mbom_header(
    mbom_id: int,
    request: MbomHeaderUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    header = await _get_header_or_404(db, mbom_id)
    for field, value in request.model_dump(exclude_unset=True).items():
        setattr(header, field, value)
    await db.commit()
    await db.refresh(header)
    return _header_dict(header)


# ============ Items ============


@router.get("/headers/{mbom_id}/items")
async def list_mbom_items(mbom_id: int, db: AsyncSession = Depends(get_db)):
    await _get_header_or_404(db, mbom_id)
    tid = get_tenant_id()
    stmt = select(MbomItem).where(MbomItem.mbom_id == mbom_id)
    if tid is not None:
        stmt = stmt.where(MbomItem.tenantId == tid)
    items = (await db.execute(stmt.order_by(MbomItem.id))).scalars().all()
    return [_item_dict(i) for i in items]


@router.post("/headers/{mbom_id}/items", status_code=201)
async def create_mbom_item(
    mbom_id: int,
    request: MbomItemCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    await _get_header_or_404(db, mbom_id)
    await _require_part(db, request.part_id, current_user.tenantId)
    await _require_parent(db, mbom_id, request.parent_item_id, current_user.tenantId)
    item = MbomItem(mbom_id=mbom_id, tenantId=current_user.tenantId, **request.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _item_dict(item)


@router.put("/headers/{mbom_id}/items/{item_id}")
async def update_mbom_item(
    mbom_id: int,
    item_id: int,
    request: MbomItemUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    await _get_header_or_404(db, mbom_id)
    tid = get_tenant_id()
    stmt = select(MbomItem).where(MbomItem.id == item_id, MbomItem.mbom_id == mbom_id)
    if tid is not None:
        stmt = stmt.where(MbomItem.tenantId == tid)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="MBOM item not found")
    payload = request.model_dump(exclude_unset=True)
    if "part_id" in payload:
        await _require_part(db, payload["part_id"], tid)
    if "parent_item_id" in payload:
        await _require_parent(db, mbom_id, payload["parent_item_id"], tid, self_id=item.id)
    for field, value in payload.items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return _item_dict(item)


# ============ Operations ============


@router.get("/headers/{mbom_id}/operations")
async def list_mbom_operations(mbom_id: int, db: AsyncSession = Depends(get_db)):
    await _get_header_or_404(db, mbom_id)
    tid = get_tenant_id()
    stmt = select(MbomOperation).where(MbomOperation.mbom_id == mbom_id)
    if tid is not None:
        stmt = stmt.where(MbomOperation.tenantId == tid)
    ops = (await db.execute(stmt.order_by(MbomOperation.operation_number))).scalars().all()
    return [_operation_dict(o) for o in ops]


@router.post("/headers/{mbom_id}/operations", status_code=201)
async def create_mbom_operation(
    mbom_id: int,
    request: MbomOperationCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    await _get_header_or_404(db, mbom_id)
    op = MbomOperation(mbom_id=mbom_id, tenantId=current_user.tenantId, **request.model_dump())
    db.add(op)
    await db.commit()
    await db.refresh(op)
    return _operation_dict(op)


@router.put("/headers/{mbom_id}/operations/{operation_id}")
async def update_mbom_operation(
    mbom_id: int,
    operation_id: int,
    request: MbomOperationUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    await _get_header_or_404(db, mbom_id)
    tid = get_tenant_id()
    stmt = select(MbomOperation).where(
        MbomOperation.id == operation_id, MbomOperation.mbom_id == mbom_id
    )
    if tid is not None:
        stmt = stmt.where(MbomOperation.tenantId == tid)
    op = (await db.execute(stmt)).scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=404, detail="MBOM operation not found")
    for field, value in request.model_dump(exclude_unset=True).items():
        setattr(op, field, value)
    await db.commit()
    await db.refresh(op)
    return _operation_dict(op)


# ============ xBOM: EBOM -> MBOM derivation ============


@router.post("/derive")
async def derive_mbom(
    request: MbomDeriveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    header = await bom_service.derive_mbom_from_ebom(
        db, request.ebom_id, tenant_id=current_user.tenantId, name=request.name
    )
    return await get_mbom_header(header.id, db)
