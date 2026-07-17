from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_write
from app.db.session import get_db
from app.models.part import Part
from app.models.revision import Revision
from app.models.user import User

router = APIRouter()


class RevisionBase(BaseModel):
    entityType: Optional[str] = None
    entityId: int
    revisionNumber: str
    revisionLabel: Optional[str] = None
    description: Optional[str] = None
    bomSnapshot: Optional[dict] = None


class RevisionCreate(RevisionBase):
    pass


class RevisionResponse(RevisionBase):
    id: int
    createdById: int
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("/")
async def get_revisions(
    page: PageParams = Depends(get_page_params),
    partId: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Revision)
    if partId:
        query = query.where(Revision.entityId == partId)
    query = query.order_by(Revision.id)
    return await paginate(db, query, page)


@router.post("/", response_model=RevisionResponse, status_code=status.HTTP_201_CREATED)
async def create_revision(
    revision: RevisionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    db_revision = Revision(
        **revision.model_dump(), createdById=current_user.id, tenantId=current_user.tenantId
    )
    db.add(db_revision)
    await db.commit()
    await db.refresh(db_revision)
    return db_revision


@router.get("/{revision_id}", response_model=RevisionResponse)
async def get_revision(
    revision_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Revision).where(Revision.id == revision_id))
    revision = result.scalar_one_or_none()
    if not revision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Revision with ID {revision_id} not found",
        )
    return revision


@router.post("/{revision_id}/rollback", response_model=RevisionResponse)
async def rollback_to_revision(
    revision_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    """Rollback a part to a previous revision by restoring its snapshot."""
    result = await db.execute(select(Revision).where(Revision.id == revision_id))
    revision = result.scalar_one_or_none()
    if not revision:
        raise HTTPException(status_code=404, detail=f"Revision {revision_id} not found")

    if revision.entityId:
        result = await db.execute(select(Part).where(Part.id == revision.entityId))
        part = result.scalar_one_or_none()
        if not part:
            raise HTTPException(status_code=404, detail="Part not found")

        # Restore from normalized snapshot items first, fall back to legacy JSON column
        if revision.snapshot_items:
            snapshot_data = revision.bomSnapshotComputed
            if snapshot_data:
                part.description = f"Rolled back to revision {revision.revisionNumber}"
        elif revision.bomSnapshot:
            for field, value in revision.bomSnapshot.items():
                if hasattr(part, field) and field not in ("id", "createdAt"):
                    setattr(part, field, value)

        # Auto-create new revision for the rollback
        current_rev_num = part.rev or "A"
        next_rev = chr(ord(current_rev_num.upper()) + 1) if current_rev_num.isalpha() else "A"
        part.rev = next_rev

        new_revision = Revision(
            entityType="part",
            entityId=part.id,
            revisionNumber=next_rev,
            revisionLabel=f"Rollback to revision {revision.revisionNumber}",
            description=f"Rolled back to revision {revision.revisionNumber} ({revision.description or 'no description'})",
            bomSnapshot={
                field: getattr(part, field) for field in part.__table__.columns if field != "id"
            },
            createdById=current_user.id,
            tenantId=current_user.tenantId,
        )
        db.add(new_revision)
        await db.commit()
        await db.refresh(new_revision)
        return new_revision

    raise HTTPException(status_code=400, detail="Revision has no associated part")
