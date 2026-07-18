"""21 CFR Part 11 — read-only electronic-signature listing.

`ESignature` rows are write-once (created only by
`app.services.part11_service.sign_action`) — this router intentionally
exposes GET only. There is no update/delete endpoint anywhere for this
model.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_admin
from app.db.session import get_db
from app.models.esignature import ESignature
from app.models.user import User

router = APIRouter()


class ESignatureResponse(BaseModel):
    id: int
    user_id: int
    action: str
    entity_type: str
    entity_id: int
    meaning: str
    content_hash: str
    signed_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("/", response_model=None)
async def list_signatures(
    page: PageParams = Depends(get_page_params),
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List electronic signatures for the caller's tenant, optionally
    filtered to a single entity. Tenant-scoped; admin-only (these are
    compliance/evidentiary records)."""
    query = select(ESignature)
    if not current_user.isSuperuser:
        query = query.where(ESignature.tenantId == current_user.tenantId)
    if entity_type:
        query = query.where(ESignature.entity_type == entity_type)
    if entity_id is not None:
        query = query.where(ESignature.entity_id == entity_id)
    query = query.order_by(ESignature.signed_at.desc())
    return await paginate(db, query, page)
