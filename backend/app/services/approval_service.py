"""Approval service layer — business logic for approval workflows."""

from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams, paginate
from app.core.tenant_context import get_tenant_id
from app.models.approval import Approval
from app.models.user import User


async def list_approvals(
    db: AsyncSession,
    page: PageParams,
    type: Optional[str] = None,
    status_filter: Optional[str] = None,
):
    query = select(Approval)
    tid = get_tenant_id()
    if tid is not None:
        query = query.where(Approval.tenantId == tid)
    if type:
        query = query.where(Approval.type == type)
    if status_filter:
        query = query.where(Approval.status == status_filter)
    query = query.order_by(Approval.id)
    return await paginate(db, query, page)


async def get_approval(db: AsyncSession, approval_id: int) -> Approval:
    tid = get_tenant_id()
    stmt = select(Approval).where(Approval.id == approval_id)
    if tid is not None:
        stmt = stmt.where(Approval.tenantId == tid)
    result = await db.execute(stmt)
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Approval with ID {approval_id} not found",
        )
    return approval


async def create_approval(db: AsyncSession, data: dict, user: User) -> Approval:
    approval = Approval(**data, requestedById=user.id, tenantId=user.tenantId)
    db.add(approval)
    await db.commit()
    await db.refresh(approval)
    return approval


async def update_approval(db: AsyncSession, approval_id: int, data: dict, user: User) -> Approval:
    tid = get_tenant_id()
    stmt = select(Approval).where(Approval.id == approval_id)
    if tid is not None:
        stmt = stmt.where(Approval.tenantId == tid)
    result = await db.execute(stmt)
    db_approval = result.scalar_one_or_none()
    if not db_approval:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Approval with ID {approval_id} not found",
        )
    for field, value in data.items():
        if hasattr(db_approval, field):
            setattr(db_approval, field, value)
    db_approval.approvedById = user.id
    await db.commit()
    await db.refresh(db_approval)
    return db_approval
