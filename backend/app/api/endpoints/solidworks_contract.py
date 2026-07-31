"""SolidWorks contract API — property-mapping rules + complex part-number
resolution.

- Property mappings drive which SolidWorks custom properties get written
  onto a Part, and let a tenant explicitly exclude noisy/irrelevant
  properties from ever syncing.
- Complex-PN generation lets a SolidWorks-driven client resolve/mint a
  formatted part number from the tenant's existing auto-number-scheme
  machinery (see app/api/endpoints/enterprise_ext_api.py's
  /enterprise/auto-number-schemes), optionally filling SW-derived tokens
  (material, project code, etc.) into the scheme's prefix/suffix.

Write-back persistence (the sw_pending_changes outbox) is wired into the
existing GET/POST /solidworks/changes endpoints in solidworks_integration.py
— both that router and this one share the implementation in
app/services/solidworks_contract_service.py.
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.rbac import require_engineering, require_viewer
from app.db.session import get_db
from app.models.user import User
from app.services import solidworks_contract_service as service

router = APIRouter(
    tags=["solidworks-integration"],
    dependencies=[Depends(get_current_user), Depends(require_viewer)],
)


class PropertyMappingRequest(BaseModel):
    sw_property: str
    target_field: Optional[str] = None
    is_excluded: bool = False


class PropertyMappingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sw_property: str
    target_field: str
    is_excluded: bool


class GeneratePartNumberRequest(BaseModel):
    entity_type: str
    inputs: Optional[dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Property-mapping CRUD (#4/#5)
# ---------------------------------------------------------------------------


@router.get("/property-mappings", response_model=list[PropertyMappingResponse])
async def list_property_mappings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await service.list_property_mappings(db, current_user.tenantId)


@router.post("/property-mappings", response_model=PropertyMappingResponse)
async def set_property_mapping(
    body: PropertyMappingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    """Create or update the mapping for a SolidWorks custom property
    (upsert on the property name) — also used to mark a property excluded."""
    return await service.set_property_mapping(
        db,
        current_user.tenantId,
        sw_property=body.sw_property,
        target_field=body.target_field,
        is_excluded=body.is_excluded,
    )


@router.delete("/property-mappings/{mapping_id}")
async def delete_property_mapping(
    mapping_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    await service.delete_property_mapping(db, current_user.tenantId, mapping_id)
    return {"success": True}


# ---------------------------------------------------------------------------
# Complex part-number resolution (#11)
# ---------------------------------------------------------------------------


@router.post("/generate-part-number")
async def generate_part_number(
    body: GeneratePartNumberRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    """Resolve/generate a formatted part number for a SW-driven complex PN,
    using the tenant's auto-number-scheme machinery for `entity_type`."""
    return await service.generate_part_number(
        db, current_user.tenantId, body.entity_type, body.inputs
    )
