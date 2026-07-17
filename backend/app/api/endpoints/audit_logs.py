from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.user import User

router = APIRouter()


class AuditLogBase(BaseModel):
    action: str
    entityType: str
    entityId: Optional[int] = None
    changes: Optional[dict] = None
    userId: int


class AuditLogCreate(AuditLogBase):
    pass


class AuditLogResponse(BaseModel):
    id: int
    action: str
    entityType: Optional[str] = None
    entityId: Optional[int] = None
    changes: Optional[str] = None
    userId: Optional[int] = None
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("/")
async def get_audit_logs(
    page: PageParams = Depends(get_page_params),
    entityType: Optional[str] = None,
    entityId: Optional[int] = None,
    userId: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(AuditLog)

    if not current_user.isSuperuser:
        if current_user.tenantId is not None:
            query = query.where(AuditLog.tenantId == current_user.tenantId)
        else:
            query = query.where(AuditLog.tenantId.is_(None))

    if entityType:
        query = query.where(AuditLog.entityType == entityType)
    if entityId:
        query = query.where(AuditLog.entityId == entityId)
    if userId:
        query = query.where(AuditLog.userId == userId)

    query = query.order_by(AuditLog.createdAt.desc())
    return await paginate(db, query, page)


@router.post("/", response_model=AuditLogResponse, status_code=status.HTTP_201_CREATED)
async def create_audit_log(
    log: AuditLogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new audit log entry
    """
    db_log = AuditLog(**log.model_dump())
    db.add(db_log)
    await db.commit()
    await db.refresh(db_log)
    return db_log
