"""Planning API — PO-from-BOM generation (#8) + planning summary (#15).

Business logic lives in app.services.planning_service; this file stays thin.
Mirrors bom_enterprise.py's router-level dependency pattern: viewer-level
read access for the summary, procurement:write for PO generation.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.rbac import require_procurement_write, require_viewer
from app.db.session import get_db
from app.models.user import User
from app.services import planning_service

router = APIRouter(
    tags=["planning"], dependencies=[Depends(get_current_user), Depends(require_viewer)]
)


@router.get("/{bom_id}/summary")
async def get_planning_summary(
    bom_id: int,
    purchased_as_leaf: bool = Query(
        True,
        description=(
            "Treat parts flagged part_kind == 'PURCHASED' as non-exploded "
            "leaves (their own line is kept, children are not aggregated)."
        ),
    ),
    db: AsyncSession = Depends(get_db),
):
    return await planning_service.get_planning_summary(db, bom_id, purchased_as_leaf)


@router.post("/{bom_id}/generate-po", status_code=201)
async def generate_po_from_bom(
    bom_id: int,
    purchased_as_leaf: bool = Query(
        True,
        description=(
            "Treat parts flagged part_kind == 'PURCHASED' as non-exploded "
            "leaves (their own line is kept, children are not aggregated)."
        ),
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_procurement_write),
):
    return await planning_service.generate_po_from_bom(
        db, bom_id, tenant_id=current_user.tenantId, purchased_as_leaf=purchased_as_leaf
    )
