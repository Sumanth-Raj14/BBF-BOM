from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.db.session import get_db
from app.models.notification import Notification
from app.models.user import User

router = APIRouter()


class NotificationBase(BaseModel):
    title: str
    message: str
    type: Optional[str] = "info"
    status: Optional[str] = "unread"
    entityType: Optional[str] = None
    entityId: Optional[int] = None
    userId: int


class NotificationCreate(NotificationBase):
    pass


class NotificationUpdate(BaseModel):
    status: Optional[str] = None


class NotificationResponse(NotificationBase):
    id: int
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("/")
async def get_notifications(
    page: PageParams = Depends(get_page_params),
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Notification).where(Notification.userId == current_user.id)

    if status:
        query = query.where(Notification.status == status)

    query = query.order_by(Notification.createdAt.desc())
    return await paginate(db, query, page)


@router.post("/", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
async def create_notification(
    notification: NotificationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new notification
    """
    db_notification = Notification(**notification.model_dump(), tenantId=current_user.tenantId)
    db.add(db_notification)
    await db.commit()
    await db.refresh(db_notification)
    return db_notification


@router.put("/{notification_id}", response_model=NotificationResponse)
async def update_notification(
    notification_id: int,
    notification_update: NotificationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update a notification (mark as read, etc.)
    """
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id, Notification.userId == current_user.id
        )
    )
    db_notification = result.scalar_one_or_none()
    if not db_notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification with ID {notification_id} not found",
        )

    update_data = notification_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_notification, field, value)

    await db.commit()
    await db.refresh(db_notification)
    return db_notification


@router.patch("/{notification_id}", response_model=NotificationResponse)
async def patch_notification(
    notification_id: int,
    notification_update: NotificationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await update_notification(notification_id, notification_update, db, current_user)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a notification
    """
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id, Notification.userId == current_user.id
        )
    )
    db_notification = result.scalar_one_or_none()
    if not db_notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification with ID {notification_id} not found",
        )

    await db.delete(db_notification)
    await db.commit()
    return None


class BulkDeleteRequest(BaseModel):
    ids: list[int]


@router.post("/bulk-delete")
async def bulk_delete_notifications(
    req: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        delete(Notification).where(
            Notification.id.in_(req.ids),
            Notification.userId == current_user.id,
        )
    )
    await db.commit()
    return {"deleted": result.rowcount}
