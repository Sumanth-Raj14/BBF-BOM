"""Requirements management — CRUD + requirement<->part / requirement<->BOM
traceability links + an uncovered-requirements coverage view.

The linkage IS the feature: a requirement with no linked part is just a
to-do list item. See RequirementPartLink / RequirementBomLink.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_read, require_parts_write
from app.db.session import get_db
from app.models.bom import BOM
from app.models.part import Part
from app.models.requirement import Requirement, RequirementBomLink, RequirementPartLink
from app.models.user import User
from app.schemas.requirement import (
    RequirementBomLinkCreate,
    RequirementCreate,
    RequirementPartLinkCreate,
    RequirementResponse,
    RequirementUpdate,
)

router = APIRouter(
    dependencies=[Depends(get_current_user)],
)


async def _get_or_404(db: AsyncSession, requirement_id: int) -> Requirement:
    result = await db.execute(select(Requirement).where(Requirement.id == requirement_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return obj


@router.get("/")
async def list_requirements(
    page: PageParams = Depends(get_page_params),
    status: Optional[str] = None,
    type: Optional[str] = None,
    priority: Optional[str] = None,
    parentId: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(Requirement)
    if status:
        stmt = stmt.where(Requirement.status == status)
    if type:
        stmt = stmt.where(Requirement.type == type)
    if priority:
        stmt = stmt.where(Requirement.priority == priority)
    if parentId is not None:
        stmt = stmt.where(Requirement.parent_id == parentId)
    stmt = stmt.order_by(Requirement.id)
    return await paginate(db, stmt, page)


@router.get("/coverage")
async def coverage(
    page: PageParams = Depends(get_page_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    """Requirements with zero linked parts — the question a quality/
    regulatory user actually asks: what's uncovered?

    Paginated: the item list is bounded per page, but `total`/`has_next`
    always reflect the TRUE uncovered count (a plain COUNT(*), never just
    len(this page)) so the UI can say "showing 20 of 137 uncovered" and can
    never mistake a partial page for the whole list."""
    linked_ids = select(RequirementPartLink.requirement_id).distinct()
    uncovered_stmt = (
        select(Requirement).where(Requirement.id.not_in(linked_ids)).order_by(Requirement.id)
    )
    result = await paginate(db, uncovered_stmt, page)

    total_requirements = (
        await db.execute(select(func.count()).select_from(Requirement))
    ).scalar_one()

    return {
        **result,
        "uncovered": result["items"],
        "total_requirements": total_requirements,
        "covered_count": total_requirements - result["total"],
    }


@router.get("/by-part/{part_id}")
async def requirements_for_part(
    part_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    """Reverse traceability: which requirements does this part serve?"""
    result = await db.execute(
        select(Requirement)
        .join(RequirementPartLink, RequirementPartLink.requirement_id == Requirement.id)
        .where(RequirementPartLink.part_id == part_id)
        .order_by(Requirement.id)
    )
    return result.scalars().all()


@router.post("/", response_model=RequirementResponse, status_code=201)
async def create_requirement(
    payload: RequirementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = Requirement(
        **payload.model_dump(), createdBy=current_user.id, tenantId=current_user.tenantId
    )
    db.add(obj)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409, detail=f"Requirement key '{payload.key}' already exists"
        )
    await db.refresh(obj)
    return obj


@router.get("/{requirement_id}", response_model=RequirementResponse)
async def get_requirement(
    requirement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    return await _get_or_404(db, requirement_id)


@router.put("/{requirement_id}", response_model=RequirementResponse)
async def update_requirement(
    requirement_id: int,
    payload: RequirementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = await _get_or_404(db, requirement_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409, detail=f"Requirement key '{payload.key}' already exists"
        )
    await db.refresh(obj)
    return obj


@router.patch("/{requirement_id}", response_model=RequirementResponse)
async def patch_requirement(
    requirement_id: int,
    payload: RequirementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_requirement(requirement_id, payload, db, current_user)


@router.delete("/{requirement_id}")
async def delete_requirement(
    requirement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = await _get_or_404(db, requirement_id)
    await db.delete(obj)
    await db.commit()
    return {"detail": "Requirement deleted"}


@router.get("/{requirement_id}/parts")
async def list_linked_parts(
    requirement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    """Traceability: which parts satisfy this requirement?"""
    await _get_or_404(db, requirement_id)
    result = await db.execute(
        select(RequirementPartLink).where(RequirementPartLink.requirement_id == requirement_id)
    )
    return result.scalars().all()


@router.post("/{requirement_id}/parts", status_code=201)
async def link_part(
    requirement_id: int,
    payload: RequirementPartLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    await _get_or_404(db, requirement_id)
    part_stmt = select(Part).where(Part.id == payload.partId)
    if current_user.tenantId is not None:
        part_stmt = part_stmt.where(Part.tenantId == current_user.tenantId)
    if not (await db.execute(part_stmt)).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Part not found")
    existing = await db.execute(
        select(RequirementPartLink).where(
            RequirementPartLink.requirement_id == requirement_id,
            RequirementPartLink.part_id == payload.partId,
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="Part already linked to this requirement")
    link = RequirementPartLink(
        requirement_id=requirement_id,
        part_id=payload.partId,
        createdBy=current_user.id,
        tenantId=current_user.tenantId,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


@router.delete("/{requirement_id}/parts/{part_id}")
async def unlink_part(
    requirement_id: int,
    part_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(
        select(RequirementPartLink).where(
            RequirementPartLink.requirement_id == requirement_id,
            RequirementPartLink.part_id == part_id,
        )
    )
    link = result.scalars().first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.delete(link)
    await db.commit()
    return {"detail": "Link removed"}


@router.get("/{requirement_id}/boms")
async def list_linked_boms(
    requirement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    await _get_or_404(db, requirement_id)
    result = await db.execute(
        select(RequirementBomLink).where(RequirementBomLink.requirement_id == requirement_id)
    )
    return result.scalars().all()


@router.post("/{requirement_id}/boms", status_code=201)
async def link_bom(
    requirement_id: int,
    payload: RequirementBomLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    await _get_or_404(db, requirement_id)
    bom_stmt = select(BOM).where(BOM.id == payload.bomId)
    if current_user.tenantId is not None:
        bom_stmt = bom_stmt.where(BOM.tenantId == current_user.tenantId)
    if not (await db.execute(bom_stmt)).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="BOM not found")
    existing = await db.execute(
        select(RequirementBomLink).where(
            RequirementBomLink.requirement_id == requirement_id,
            RequirementBomLink.bom_id == payload.bomId,
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="BOM already linked to this requirement")
    link = RequirementBomLink(
        requirement_id=requirement_id,
        bom_id=payload.bomId,
        createdBy=current_user.id,
        tenantId=current_user.tenantId,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


@router.delete("/{requirement_id}/boms/{bom_id}")
async def unlink_bom(
    requirement_id: int,
    bom_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(
        select(RequirementBomLink).where(
            RequirementBomLink.requirement_id == requirement_id,
            RequirementBomLink.bom_id == bom_id,
        )
    )
    link = result.scalars().first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.delete(link)
    await db.commit()
    return {"detail": "Link removed"}
