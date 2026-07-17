from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params
from app.db.session import get_db
from app.integrations.events import emit_integration_event
from app.models.user import User
from app.services import approval_service

router = APIRouter()


async def _emit_approval_event(db, user, approval):
    """Mirror an approval lifecycle change (request/approve/reject) to integrations."""
    await emit_integration_event(
        db, user.tenantId, "approval", approval.id, "approval",
        {
            "ref": approval.title,
            "status": str(approval.status),
            "type": str(approval.type),
        },
    )
    await db.commit()


class ApprovalBase(BaseModel):
    type: str
    title: str
    description: Optional[str] = None
    entityType: str
    entityId: int
    status: Optional[str] = "pending"


class ApprovalCreate(ApprovalBase):
    pass


class ApprovalUpdate(BaseModel):
    status: Optional[str] = None
    comments: Optional[str] = None


class ApprovalResponse(ApprovalBase):
    id: int
    requestedById: int
    approvedById: Optional[int] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


@router.get("/")
async def get_approvals(
    page: PageParams = Depends(get_page_params),
    type: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await approval_service.list_approvals(db, page, type, status)


@router.post("/", response_model=ApprovalResponse, status_code=201)
async def create_approval(
    approval: ApprovalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    created = await approval_service.create_approval(db, approval.model_dump(), current_user)
    await _emit_approval_event(db, current_user, created)
    return created


@router.put("/{approval_id}", response_model=ApprovalResponse)
async def update_approval(
    approval_id: int,
    approval_update: ApprovalUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updated = await approval_service.update_approval(
        db, approval_id, approval_update.model_dump(exclude_unset=True), current_user
    )
    await _emit_approval_event(db, current_user, updated)
    return updated


@router.patch("/{approval_id}", response_model=ApprovalResponse)
async def patch_approval(
    approval_id: int,
    approval_update: ApprovalUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await update_approval(approval_id, approval_update, db, current_user)
