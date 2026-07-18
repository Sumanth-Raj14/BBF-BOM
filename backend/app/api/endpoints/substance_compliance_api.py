"""RoHS/REACH substance-compliance API.

Backs ``frontend/api.js`` -> ``substanceComplianceAPI`` (paths mirrored
exactly) and the two UI surfaces that consume it:
``frontend/src/components/PartComplianceTab.jsx`` (part detail-drawer
Compliance tab) and ``ComplianceReportPanel.jsx`` (BOM editor Compliance
tab). All logic lives in ``app.services.substance_compliance_service`` —
this router is thin request/response plumbing only.

Substances are GLOBAL reference data (spec 2.2, P1) — readable by any
authenticated tenant user, mutable by admins only (mutating them affects
every tenant). Part composition + compliance are tenant-scoped (every
service call is scoped by the ambient tenant context; see
``app.core.tenant_context`` / ``app.core.tenant_middleware``).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.rbac import require_admin, require_engineering, require_viewer
from app.db.session import get_db
from app.models.user import User
from app.services import substance_compliance_service as svc

router = APIRouter(dependencies=[Depends(get_current_user), Depends(require_viewer)])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class SubstanceCreateRequest(BaseModel):
    cas_number: str
    name: str
    ec_number: Optional[str] = None
    substance_group_id: Optional[int] = None


class SubstanceUpdateRequest(BaseModel):
    cas_number: Optional[str] = None
    name: Optional[str] = None
    ec_number: Optional[str] = None
    substance_group_id: Optional[int] = None


class CompositionCreateRequest(BaseModel):
    substance_id: int
    mass_ppm: float = 0


class CompositionUpdateRequest(BaseModel):
    mass_ppm: Optional[float] = None
    is_exempt: Optional[bool] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Substance catalog
# ---------------------------------------------------------------------------


@router.get("/substances")
async def list_substances(db: AsyncSession = Depends(get_db)):
    return await svc.list_substances(db)


@router.get("/substances/{substance_id}")
async def get_substance(substance_id: int, db: AsyncSession = Depends(get_db)):
    return await svc.get_substance(db, substance_id)


@router.post("/substances")
async def create_substance(
    request: SubstanceCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return await svc.create_substance(db, request.model_dump())


@router.put("/substances/{substance_id}")
async def update_substance(
    substance_id: int,
    request: SubstanceUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    data = {k: v for k, v in request.model_dump().items() if v is not None}
    return await svc.update_substance(db, substance_id, data)


@router.delete("/substances/{substance_id}")
async def delete_substance(
    substance_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    await svc.delete_substance(db, substance_id)
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Part composition (tenant-scoped)
# ---------------------------------------------------------------------------


@router.get("/parts/{part_id}/composition")
async def list_part_composition(part_id: int, db: AsyncSession = Depends(get_db)):
    return await svc.list_part_composition(db, part_id)


@router.post("/parts/{part_id}/composition")
async def add_part_composition(
    part_id: int,
    request: CompositionCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    return await svc.add_part_composition(db, part_id, request.model_dump())


@router.put("/parts/{part_id}/composition/{row_id}")
async def update_part_composition(
    part_id: int,
    row_id: int,
    request: CompositionUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    data = {k: v for k, v in request.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    return await svc.update_part_composition(db, part_id, row_id, data)


@router.delete("/parts/{part_id}/composition/{row_id}")
async def delete_part_composition(
    part_id: int,
    row_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    await svc.delete_part_composition(db, part_id, row_id)
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Derived compliance (read-only, server-computed)
# ---------------------------------------------------------------------------


@router.get("/parts/{part_id}/compliance")
async def get_part_compliance(part_id: int, db: AsyncSession = Depends(get_db)):
    return await svc.evaluate_part_compliance(db, part_id)


@router.get("/bom/{bom_id}/compliance")
async def get_bom_compliance(bom_id: int, db: AsyncSession = Depends(get_db)):
    return await svc.evaluate_bom_compliance(db, bom_id)
