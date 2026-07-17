"""
Dashboard API - Engineering, Manufacturing, Procurement, Executive
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import dashboard_service

router = APIRouter()


@router.get("/engineering")
async def engineering_dashboard(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    return await dashboard_service.engineering_dashboard(db, user)


@router.get("/manufacturing")
async def manufacturing_dashboard(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    return await dashboard_service.manufacturing_dashboard(db, user)


@router.get("/procurement")
async def procurement_dashboard(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    return await dashboard_service.procurement_dashboard(db, user)


@router.get("/executive")
async def executive_dashboard(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    return await dashboard_service.executive_dashboard(db, user)
