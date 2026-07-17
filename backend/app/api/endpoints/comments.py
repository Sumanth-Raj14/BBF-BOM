import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.db.session import get_db
from app.models.comment import Comment
from app.models.user import User

router = APIRouter()


class CommentBase(BaseModel):
    content: str
    entityType: str
    entityId: int
    mentions: Optional[list[int]] = None


class CommentCreate(CommentBase):
    pass


class CommentUpdate(BaseModel):
    content: Optional[str] = None


class CommentResponse(CommentBase):
    id: int
    userId: int
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def parse_mentions(cls, data):
        if isinstance(data, dict):
            mentions = data.get("mentions")
            if isinstance(mentions, str):
                data["mentions"] = json.loads(mentions)
            return data
        if hasattr(data, "mentions"):
            mentions = getattr(data, "mentions", None)
            result = {}
            for col in data.__table__.columns:
                val = getattr(data, col.name)
                if col.name == "mentions" and isinstance(val, str):
                    val = json.loads(val)
                result[col.name] = val
            return result
        return data


@router.get("/")
async def get_comments(
    page: PageParams = Depends(get_page_params),
    entityType: Optional[str] = None,
    entityId: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Comment)

    if entityType:
        query = query.where(Comment.entityType == entityType)
    if entityId:
        query = query.where(Comment.entityId == entityId)

    query = query.order_by(Comment.createdAt.desc())
    return await paginate(db, query, page)


@router.post("/", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    comment: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new comment
    """
    comment_data = comment.model_dump()
    if comment_data.get("mentions") is not None:
        comment_data["mentions"] = json.dumps(comment_data["mentions"])
    db_comment = Comment(**comment_data, userId=current_user.id, tenantId=current_user.tenantId)
    db.add(db_comment)
    await db.commit()
    await db.refresh(db_comment)
    return db_comment


@router.put("/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: int,
    comment_update: CommentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update a comment (only by author)
    """
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    db_comment = result.scalar_one_or_none()
    if not db_comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Comment with ID {comment_id} not found",
        )

    if db_comment.userId != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this comment",
        )

    update_data = comment_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_comment, field, value)

    await db.commit()
    await db.refresh(db_comment)
    return db_comment


@router.patch("/{comment_id}", response_model=CommentResponse)
async def patch_comment(
    comment_id: int,
    comment_update: CommentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await update_comment(comment_id, comment_update, db, current_user)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a comment (only by author or superuser)
    """
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    db_comment = result.scalar_one_or_none()
    if not db_comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Comment with ID {comment_id} not found",
        )

    if db_comment.userId != current_user.id and not current_user.isSuperuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this comment",
        )

    await db.delete(db_comment)
    await db.commit()
    return None
