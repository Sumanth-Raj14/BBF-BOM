"""Enterprise pagination utility for all list endpoints.

Usage:
    from app.core.pagination import paginate, Page

    @router.get("/parts")
    async def list_parts(
        db: AsyncSession = Depends(get_db),
        page: Page = Depends(),
    ):
        query = select(Part).order_by(Part.id)
        return await paginate(db, query, page)
"""

from collections.abc import Sequence
from math import ceil
from typing import Generic, Optional, TypeVar

from fastapi import Query
from pydantic import BaseModel, Field, create_model
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


ALLOWED_SORT_COLUMNS: dict[str, set[str]] = {
    "parts": {"id", "pn", "rev", "name", "status", "createdAt", "updatedAt", "category"},
    "vendors": {"id", "name", "country", "status", "createdAt"},
    "projects": {"id", "name", "status", "createdAt"},
    "documents": {"id", "originalName", "fileType", "createdAt"},
    "users": {"id", "email", "username", "isActive", "createdAt"},
}

DEFAULT_SORT_COLUMNS: set[str] = {"id", "createdAt", "updatedAt", "name", "status"}


class PageParams(BaseModel):
    page: int = Field(default=1, ge=1, description="Page number (1-indexed)")
    per_page: int = Field(default=50, ge=1, le=500, description="Items per page")
    sort_by: Optional[str] = Field(default=None, description="Column to sort by")
    sort_dir: str = Field(default="asc", pattern="^(asc|desc)$", description="Sort direction")

    def validate_sort_column(self, table: str | None = None) -> Optional[str]:
        if self.sort_by is None:
            return None
        allowed = (
            ALLOWED_SORT_COLUMNS.get(table, DEFAULT_SORT_COLUMNS) if table else DEFAULT_SORT_COLUMNS
        )
        if self.sort_by not in allowed:
            return None
        return self.sort_by


async def get_page_params(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=500, description="Items per page"),
    sort_by: Optional[str] = Query(None, description="Column to sort by"),
    sort_dir: str = Query("asc", pattern="^(asc|desc)$", description="Sort direction"),
) -> PageParams:
    return PageParams(page=page, per_page=per_page, sort_by=sort_by, sort_dir=sort_dir)


class PaginatedResponse(BaseModel, Generic[T]):
    items: Sequence[T]
    total: int
    page: int
    per_page: int
    total_pages: int
    has_next: bool
    has_prev: bool


def create_paginated_response(item_model: type) -> type:
    return create_model(
        f"Paginated{item_model.__name__}List",
        items=(list[item_model], ...),
        total=(int, ...),
        page=(int, ...),
        per_page=(int, ...),
        total_pages=(int, ...),
        has_next=(bool, ...),
        has_prev=(bool, ...),
        __base__=BaseModel,
    )


async def paginate(
    db: AsyncSession,
    query: Select,
    page_params: PageParams,
) -> dict:
    offset = (page_params.page - 1) * page_params.per_page

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    result = await db.execute(query.offset(offset).limit(page_params.per_page))
    items = result.scalars().all()

    total_pages = max(1, ceil(total / page_params.per_page))

    return {
        "items": items,
        "total": total,
        "page": page_params.page,
        "per_page": page_params.per_page,
        "total_pages": total_pages,
        "has_next": page_params.page < total_pages,
        "has_prev": page_params.page > 1,
    }
