"""Session Management endpoints."""

from datetime import UTC, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_admin
from app.db.session import get_db
from app.models.session import UserSession
from app.models.user import User

router = APIRouter()


class SessionResponse(BaseModel):
    id: int
    ipAddress: Optional[str]
    userAgent: Optional[str]
    lastActivity: Optional[str]
    expiresAt: Optional[str]
    isActive: bool
    createdAt: Optional[str]
    isCurrent: bool = False


@router.get("/sessions")
async def list_sessions(
    page: PageParams = Depends(get_page_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(UserSession)
        .where(
            UserSession.userId == current_user.id,
            UserSession.isActive,
        )
        .order_by(UserSession.id)
    )
    result = await paginate(db, query, page)
    result["items"] = [
        SessionResponse(
            id=s.id,
            ipAddress=s.ipAddress,
            userAgent=s.userAgent,
            lastActivity=str(s.lastActivity) if s.lastActivity else None,
            expiresAt=str(s.expiresAt) if s.expiresAt else None,
            isActive=s.isActive,
            createdAt=str(s.createdAt) if s.createdAt else None,
        )
        for s in result["items"]
    ]
    return result


@router.get("/sessions/all")
async def list_all_sessions(
    page: PageParams = Depends(get_page_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    query = select(UserSession).where(UserSession.isActive).order_by(UserSession.id)
    result = await paginate(db, query, page)
    result["items"] = [
        SessionResponse(
            id=s.id,
            ipAddress=s.ipAddress,
            userAgent=s.userAgent,
            lastActivity=str(s.lastActivity) if s.lastActivity else None,
            expiresAt=str(s.expiresAt) if s.expiresAt else None,
            isActive=s.isActive,
            createdAt=str(s.createdAt) if s.createdAt else None,
        )
        for s in result["items"]
    ]
    return result


@router.post("/sessions/revoke/{session_id}")
async def revoke_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke a specific session."""
    result = await db.execute(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.userId == current_user.id,
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        # Check if admin revoking another user's session
        admin_result = await db.execute(select(UserSession).where(UserSession.id == session_id))
        session = admin_result.scalar_one_or_none()
        if not session or not current_user.isSuperuser:
            raise HTTPException(status_code=404, detail="Session not found")

    session.isActive = False
    await db.commit()

    return {"message": "Session revoked successfully"}


@router.post("/sessions/revoke-all")
async def revoke_all_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke all sessions for the current user (except current)."""
    await db.execute(
        update(UserSession)
        .where(UserSession.userId == current_user.id)
        .where(UserSession.isActive)
        .values(isActive=False)
    )
    await db.commit()

    return {"message": "All sessions revoked successfully"}


@router.post("/sessions/revoke-all/{user_id}")
async def revoke_all_user_sessions(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Revoke all sessions for a specific user (admin only)."""
    await db.execute(
        update(UserSession)
        .where(UserSession.userId == user_id)
        .where(UserSession.isActive)
        .values(isActive=False)
    )
    await db.commit()

    return {"message": f"All sessions revoked for user {user_id}"}


@router.get("/sessions/stats")
async def session_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get session statistics (admin only)."""
    from sqlalchemy import func

    # Total active sessions
    result = await db.execute(select(func.count(UserSession.id)).where(UserSession.isActive))
    total_active = result.scalar() or 0

    # Sessions by user
    result = await db.execute(
        select(UserSession.userId, func.count(UserSession.id))
        .where(UserSession.isActive)
        .group_by(UserSession.userId)
    )
    by_user = {row[0]: row[1] for row in result.fetchall()}

    # Sessions expiring soon (next 24 hours)
    result = await db.execute(
        select(func.count(UserSession.id))
        .where(UserSession.isActive)
        .where(UserSession.expiresAt <= datetime.now(UTC) + timedelta(hours=24))
    )
    expiring_soon = result.scalar() or 0

    return {
        "totalActive": total_active,
        "byUser": by_user,
        "expiringSoon": expiring_soon,
    }
