from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_read, require_parts_write
from app.db.session import get_db
from app.integrations.events import emit_integration_event
from app.models.capa import CAPA
from app.models.user import User
from app.schemas.capa import CAPACreate, CAPAResponse, CAPAUpdate

router = APIRouter(
    dependencies=[Depends(get_current_user)],
)


@router.get("/")
async def list_capas(
    page: PageParams = Depends(get_page_params),
    status: Optional[str] = None,
    type: Optional[str] = None,
    partId: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    stmt = select(CAPA)
    if status:
        stmt = stmt.where(CAPA.status == status)
    if type:
        stmt = stmt.where(CAPA.type == type)
    if partId:
        stmt = stmt.where(CAPA.partId == partId)
    stmt = stmt.order_by(CAPA.id)
    return await paginate(db, stmt, page)


@router.get("/{capa_id}", response_model=CAPAResponse)
async def get_capa(
    capa_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_read),
):
    result = await db.execute(select(CAPA).where(CAPA.id == capa_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="CAPA not found")
    return item


@router.post("/", response_model=CAPAResponse, status_code=201)
async def create_capa(
    payload: CAPACreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    obj = CAPA(**payload.model_dump(), createdBy=current_user.id, tenantId=current_user.tenantId)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/{capa_id}", response_model=CAPAResponse)
async def update_capa(
    capa_id: int,
    payload: CAPAUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(CAPA).where(CAPA.id == capa_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="CAPA not found")
    changed = payload.model_dump(exclude_unset=True)
    for k, v in changed.items():
        setattr(obj, k, v)
    if "status" in changed:
        await emit_integration_event(
            db, current_user.tenantId, "capa_legacy", obj.id, "status_change",
            {"ref": obj.capaNumber, "status": obj.status},
        )
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{capa_id}", response_model=CAPAResponse)
async def patch_capa(
    capa_id: int,
    payload: CAPAUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_capa(capa_id, payload, db, current_user)


@router.delete("/{capa_id}")
async def delete_capa(
    capa_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(CAPA).where(CAPA.id == capa_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="CAPA not found")
    await db.delete(obj)
    await db.commit()
    return {"detail": "CAPA deleted"}


@router.post("/{capa_id}/verify")
async def verify_capa(
    capa_id: int,
    result: str = Query(..., enum=["Effective", "Not Effective"]),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    db_result = await db.execute(select(CAPA).where(CAPA.id == capa_id))
    obj = db_result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="CAPA not found")
    obj.verificationResult = result
    obj.verifiedBy = current_user.id
    obj.verifiedDate = datetime.now(UTC)
    if result == "Effective":
        obj.status = "Closed"
    await emit_integration_event(
        db, current_user.tenantId, "capa_legacy", obj.id, "status_change",
        {"ref": obj.capaNumber, "status": obj.status},
    )
    await db.commit()
    return {"detail": f"CAPA verified: {result}"}
