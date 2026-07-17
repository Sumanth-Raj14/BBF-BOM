"""
Advanced Search API
Full-text search across parts, vendors, BOMs, POs, documents, and more.
Uses PostgreSQL FTS indexes with ILIKE fallback.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import search_service

router = APIRouter()


class SearchResult(BaseModel):
    entity_type: str
    entity_id: int
    title: str
    subtitle: Optional[str] = None
    relevance: float = 0.0
    url: Optional[str] = None


class SearchResponse(BaseModel):
    query: str
    total: int
    results: list[SearchResult]
    took_ms: float


@router.get("/", response_model=SearchResponse)
async def advanced_search(
    q: str = Query(..., min_length=1, description="Search query"),
    entity_types: Optional[str] = Query(
        None,
        description="Comma-separated: parts,vendors,boms,pos,documents,eco,work_orders,inventory,ncr",
    ),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await search_service.advanced_search(db, q, current_user, entity_types, limit)
    return SearchResponse(**result)


@router.get("/suggestions")
async def search_suggestions(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await search_service.search_suggestions(db, q, current_user, limit)
