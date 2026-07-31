"""CRUD endpoints for typed CAD derivative links (part_derivatives table).

Attaches/lists/removes PDF/STEP/DWG/DXF/other derivative links produced by an
external CAD/PLM pipeline against a Part. Actual geometry -> drawing
generation requires a CAD kernel and is out of scope here; this endpoint only
stores + serves links produced elsewhere (see app/models/part_derivative.py
and app/services/derivative_service.py).
"""

from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params
from app.core.rbac import require_parts_write
from app.db.session import get_db
from app.models.user import User
from app.schemas.part_derivative import PartDerivativeCreate, PartDerivativeResponse
from app.services import derivative_service

router = APIRouter()


@router.get("/")
async def list_part_derivatives(
    page: PageParams = Depends(get_page_params),
    partId: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List CAD derivative links, optionally filtered to a single part."""
    return await derivative_service.list_derivatives_paginated(
        db, current_user.tenantId, page, partId
    )


@router.post("/", response_model=PartDerivativeResponse, status_code=status.HTTP_201_CREATED)
async def attach_part_derivative(
    payload: PartDerivativeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    """Attach (or upsert, if this (part, kind) already has a link) a derivative to a part."""
    derivative = await derivative_service.attach_derivative(
        db,
        current_user.tenantId,
        payload.partId,
        payload.kind,
        payload.url,
        payload.drawingStatus,
    )
    return derivative_service.to_response(derivative)


@router.delete("/{derivative_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_part_derivative(
    derivative_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    """Remove a derivative link."""
    await derivative_service.remove_derivative(db, current_user.tenantId, derivative_id)
    return None
