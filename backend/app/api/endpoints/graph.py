"""Where-used knowledge graph + simple part analytics (Track D)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import graph_service

router = APIRouter()


@router.get("/where-used/{part_id}")
async def where_used_graph(
    part_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Nodes+edges graph of where `part_id` is used (parent BOMs/assemblies,
    recursively) plus its own components (if it is itself used as a
    sub-assembly somewhere)."""
    return await graph_service.build_where_used_graph(db, current_user.tenantId, part_id)


@router.get("/analytics")
async def graph_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Simple part counts broken down by category and by status."""
    return await graph_service.get_part_analytics(db, current_user.tenantId)
