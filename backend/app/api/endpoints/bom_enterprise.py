"""
BOM Management Enterprise API
Multi-level BOM, quantity rollups, snapshots, where-used, variants
"""

import io
from decimal import Decimal
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.object_perms import get_object_grants, require_bom_edit, require_bom_manage
from app.core.rbac import require_engineering, require_viewer
from app.db.session import get_db
from app.models.resource_grant import ResourceGrant
from app.models.team import Team
from app.models.user import User
from app.schemas.bom import BOMRead
from app.services import bom_service, export_service

router = APIRouter(
    tags=["bom-enterprise"], dependencies=[Depends(get_current_user), Depends(require_viewer)]
)


class BomItemCreateRequest(BaseModel):
    part_id: Optional[int] = None
    quantity: Decimal = Decimal("1")
    unit: Optional[str] = "EA"
    reference_designator: Optional[str] = None
    find_number: Optional[str] = None
    sort_order: int = 0
    parent_item_id: Optional[int] = None
    unit_cost_snapshot: Optional[Decimal] = None
    extended_cost: Optional[Decimal] = None
    notes: Optional[str] = None
    # Line-item media / visibility (migration 045) — see BomItemUpdateRequest.
    image_document_id: Optional[int] = None
    thumbnail_path: Optional[str] = None
    exclude_from_bom: Optional[bool] = None


class BomItemUpdateRequest(BaseModel):
    part_id: Optional[int] = None
    quantity: Optional[Decimal] = None
    unit: Optional[str] = None
    reference_designator: Optional[str] = None
    find_number: Optional[str] = None
    sort_order: Optional[int] = None
    parent_item_id: Optional[int] = None
    unit_cost_snapshot: Optional[Decimal] = None
    extended_cost: Optional[Decimal] = None
    notes: Optional[str] = None
    # Line-item media / visibility (migration 045: bom_items_master gained
    # image_document_id / thumbnail_path / exclude_from_bom). Exposed here so
    # the BOM grid's thumbnail-upload control and exclude toggle can persist
    # to the canonical bom_items_master row, not just mutate local state.
    image_document_id: Optional[int] = None
    thumbnail_path: Optional[str] = None
    exclude_from_bom: Optional[bool] = None


class BomItemReorderRequest(BaseModel):
    item_ids: list[int]


class BomItemCustomAttributeSetRequest(BaseModel):
    attribute_definition_id: int
    value: Optional[str] = None


class BomSnapshotRequest(BaseModel):
    bom_id: int
    snapshot_name: str
    snapshot_type: str
    change_description: Optional[str] = None


class BomCompareRequest(BaseModel):
    bom_id_1: int
    bom_id_2: int


class BomVariantRequest(BaseModel):
    base_bom_id: int
    variant_name: str
    description: Optional[str] = None
    configuration_rules: Optional[dict[str, Any]] = None


class BomVariantItemRequest(BaseModel):
    variant_id: int
    part_id: int
    quantity: int
    substitute_part_id: Optional[int] = None
    is_optional: bool = False
    condition_expression: Optional[str] = None


class BomCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[str] = None
    version: Optional[str] = None
    project_id: Optional[int] = None
    # xBOM (migration 052) — EBOM/MBOM/SBOM. Omit to keep the model's "EBOM"
    # default, so every existing caller is unaffected.
    bom_type: Optional[Literal["EBOM", "MBOM", "SBOM"]] = None


@router.get("/")
async def list_boms(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    bom_type: Optional[str] = Query(None, pattern="^(EBOM|MBOM|SBOM)$"),
    db: AsyncSession = Depends(get_db),
):
    boms, total = await bom_service.list_boms(db, skip=skip, limit=limit, bom_type=bom_type)
    return {
        "items": [
            {
                "id": b.id,
                "bom_number": b.bom_number,
                "name": b.name,
                "description": b.description,
                "status": b.status,
                "version": b.version,
                "bom_type": b.bom_type,
            }
            for b in boms
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/", status_code=201)
async def create_bom(
    request: BomCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    bom = await bom_service.create_bom(
        db,
        # created_by was never populated on this path, which left boms.created_by
        # NULL for every API-created BOM. Object-level grants use it as the
        # owner bypass (app/core/object_perms.py) — without it, the first grant
        # a user adds locks them out of the BOM they just created.
        {**request.model_dump(exclude_unset=True), "created_by": current_user.id},
        tenant_id=current_user.tenantId,
    )
    return {
        "id": bom.id,
        "bom_number": bom.bom_number,
        "name": bom.name,
        "description": bom.description,
        "status": bom.status,
        "version": bom.version,
        "bom_type": bom.bom_type,
    }


@router.get("/{bom_id}/explosion")
async def get_bom_explosion(
    bom_id: int, level: int = Query(10, ge=1, le=20), db: AsyncSession = Depends(get_db)
):
    return await bom_service.get_bom_explosion(db, bom_id, level)


@router.get("/{bom_id}/quantity-rollup")
async def get_quantity_rollup(
    bom_id: int,
    db: AsyncSession = Depends(get_db),
):
    return await bom_service.get_quantity_rollup(db, bom_id)


@router.get("/{bom_id}/cost-rollup")
async def get_cost_rollup(
    bom_id: int,
    reporting_currency: Optional[str] = Query(
        None,
        min_length=3,
        max_length=3,
        description="ISO code to report every line in (e.g. EUR). Lines with no "
        "usable exchange rate are excluded from the totals and listed in "
        "currency_warnings rather than converted at 1:1.",
    ),
    db: AsyncSession = Depends(get_db),
):
    return await bom_service.get_cost_rollup(db, bom_id, reporting_currency)


@router.get("/{bom_id}/mass-rollup")
async def get_mass_rollup(bom_id: int, db: AsyncSession = Depends(get_db)):
    return await bom_service.get_mass_rollup(db, bom_id)


# ---------------------------------------------------------------------------
# VARIANT ROUTES MUST BE REGISTERED BEFORE THE "/{bom_id}/..." ROUTES BELOW.
#
# Starlette matches routes in registration order, first match wins. When
# POST /variants/items was declared *after* POST /{bom_id}/items, every call to
# it matched the parameterised route with bom_id="variants" and died on int
# coercion — the endpoint was permanently unreachable despite being published
# in openapi.json and having a live client wrapper (frontend/api.js
# variants.addItem). CI never caught it because the variant tests call
# bom_service.add_variant_item() directly instead of going through HTTP.
#
# Keep every literal-prefixed route above the {bom_id} block.
# ---------------------------------------------------------------------------


@router.post("/variants")
async def create_variant(
    request: BomVariantRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await bom_service.create_variant(
        db,
        request.base_bom_id,
        request.variant_name,
        request.description,
        request.configuration_rules,
        current_user.id,
        tenant_id=current_user.tenantId,
    )


@router.post("/variants/items")
async def add_variant_item(
    request: BomVariantItemRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await bom_service.add_variant_item(
        db,
        request.variant_id,
        request.part_id,
        request.quantity,
        request.substitute_part_id,
        request.is_optional,
        request.condition_expression,
        tenant_id=current_user.tenantId,
    )


@router.get("/variants/{variant_id}")
async def get_variant(variant_id: int, db: AsyncSession = Depends(get_db)):
    return await bom_service.get_variant(db, variant_id)


@router.get("/{bom_id}/items")
async def list_bom_items(bom_id: int, db: AsyncSession = Depends(get_db)):
    return await bom_service.list_bom_items(db, bom_id)


@router.post("/{bom_id}/items", status_code=201, dependencies=[Depends(require_bom_edit)])
async def create_bom_item(
    bom_id: int,
    request: BomItemCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    return await bom_service.create_bom_item(
        db, bom_id, request.model_dump(exclude_unset=True), tenant_id=current_user.tenantId
    )


@router.put("/{bom_id}/items/{item_id}", dependencies=[Depends(require_bom_edit)])
async def update_bom_item(
    bom_id: int,
    item_id: int,
    request: BomItemUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    return await bom_service.update_bom_item(
        db, bom_id, item_id, request.model_dump(exclude_unset=True)
    )


@router.patch("/{bom_id}/items/{item_id}", dependencies=[Depends(require_bom_edit)])
async def patch_bom_item(
    bom_id: int,
    item_id: int,
    request: BomItemUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    return await bom_service.update_bom_item(
        db, bom_id, item_id, request.model_dump(exclude_unset=True)
    )


@router.delete(
    "/{bom_id}/items/{item_id}", status_code=204, dependencies=[Depends(require_bom_edit)]
)
async def delete_bom_item(
    bom_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    await bom_service.delete_bom_item(db, bom_id, item_id)
    return None


@router.post("/{bom_id}/items/reorder", dependencies=[Depends(require_bom_edit)])
async def reorder_bom_items(
    bom_id: int,
    request: BomItemReorderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    return await bom_service.reorder_bom_items(db, bom_id, request.item_ids)


@router.post("/{bom_id}/items/{item_id}/image", dependencies=[Depends(require_bom_edit)])
async def attach_bom_item_image(
    bom_id: int,
    item_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    return await bom_service.attach_bom_item_image(
        db,
        bom_id,
        item_id,
        file,
        tenant_id=current_user.tenantId,
        uploaded_by=current_user.email,
    )


@router.delete("/{bom_id}/items/{item_id}/image", dependencies=[Depends(require_bom_edit)])
async def clear_bom_item_image(
    bom_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    return await bom_service.clear_bom_item_image(db, bom_id, item_id)


@router.get("/{bom_id}/items/{item_id}/custom-attributes")
async def get_bom_item_custom_attributes(
    bom_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
):
    return await bom_service.get_bom_item_custom_attributes(db, bom_id, item_id)


@router.put("/{bom_id}/items/{item_id}/custom-attributes", dependencies=[Depends(require_bom_edit)])
async def set_bom_item_custom_attribute(
    bom_id: int,
    item_id: int,
    request: BomItemCustomAttributeSetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    return await bom_service.set_bom_item_custom_attribute(
        db,
        bom_id,
        item_id,
        request.attribute_definition_id,
        request.value,
        tenant_id=current_user.tenantId,
    )


@router.get("/where-used/{part_id}")
async def get_where_used(part_id: int, db: AsyncSession = Depends(get_db)):
    return await bom_service.get_where_used(db, part_id)


@router.get("/where-used/{part_id}/tree")
async def get_where_used_tree(part_id: int, db: AsyncSession = Depends(get_db)):
    return await bom_service.get_where_used_tree(db, part_id)


@router.post("/{bom_id}/snapshots", dependencies=[Depends(require_bom_edit)])
async def create_snapshot(
    bom_id: int,
    request: BomSnapshotRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await bom_service.create_snapshot(
        db,
        bom_id,
        request.snapshot_name,
        request.snapshot_type,
        request.change_description,
        current_user.id,
    )


@router.get("/{bom_id}/snapshots")
async def list_snapshots(bom_id: int, db: AsyncSession = Depends(get_db)):
    return await bom_service.list_snapshots(db, bom_id)


@router.post("/compare")
async def compare_boms(
    request: BomCompareRequest,
    db: AsyncSession = Depends(get_db),
):
    return await bom_service.compare_boms(db, request.bom_id_1, request.bom_id_2)


@router.post("/{bom_id}/baselines", dependencies=[Depends(require_bom_edit)])
async def create_baseline(
    bom_id: int,
    baseline_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await bom_service.create_baseline(db, bom_id, baseline_name, current_user.id)


@router.post("/{bom_id}/export")
async def export_bom(
    bom_id: int,
    format: str = Query("csv", pattern="^(csv|excel|pdf|json)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # "excel" is this endpoint's historical alias for the shared contract's "xlsx".
    resolved_format = "xlsx" if format == "excel" else format
    content, content_type, filename = await export_service.render_export(
        db,
        current_user.tenantId,
        entity="bom",
        format=resolved_format,
        bom_id=bom_id,
    )
    return StreamingResponse(
        io.BytesIO(content),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import")
async def import_bom(
    file: UploadFile = File(None),
    project_id: Optional[int] = Query(None),
    name: Optional[str] = Query(None),
    file_url: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    """Import a multi-level BOM from an uploaded CSV/XLSX spreadsheet.

    `file_url` is still accepted so the old query-param callers get a clear
    400 instead of a bare 422 — server-side fetching was never implemented
    (it only ever produced an empty draft BOM), the file is uploaded instead.
    """
    if file is None:
        detail = "Upload the spreadsheet as multipart/form-data field 'file'."
        if file_url:
            detail += " Fetching a file_url server-side is not supported."
        raise HTTPException(status_code=400, detail=detail)
    return await bom_service.import_bom(
        db,
        filename=file.filename or "upload.csv",
        content=await file.read(),
        project_id=project_id,
        tenant_id=current_user.tenantId,
        name=name,
    )


@router.post("/templates")
async def create_template(
    name: str,
    description: Optional[str] = None,
    source_bom_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await bom_service.create_template(db, name, description, source_bom_id, current_user.id)


@router.get("/templates")
async def list_templates(
    db: AsyncSession = Depends(get_db),
):
    return await bom_service.list_templates(db)


@router.post("/templates/{template_id}/apply")
async def apply_template(
    template_id: int,
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await bom_service.apply_template(db, template_id, project_id)


# ---------------------------------------------------------------------------
# Object-level permission grants (migration 063). A BOM with no grants is
# unrestricted — the role check alone governs, exactly as before this existed.
# The first grant added to a BOM restricts it to its grantees (plus the BOM's
# creator and superusers). Managing grants needs the engineering role AND
# `manage` on the BOM itself.
# ---------------------------------------------------------------------------


class BomGrantRequest(BaseModel):
    grantee_type: Literal["user", "team"]
    grantee_id: int
    level: Literal["view", "edit", "manage"]


def _grant_out(g: ResourceGrant) -> dict:
    return {
        "id": g.id,
        "resource_type": g.resourceType,
        "resource_id": g.resourceId,
        "grantee_type": g.granteeType,
        "grantee_id": g.granteeId,
        "level": g.level,
        "created_by": g.createdById,
    }


@router.get("/{bom_id}/grants", dependencies=[Depends(require_engineering)])
async def list_bom_grants(
    bom_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_bom_manage),
):
    return [_grant_out(g) for g in await get_object_grants(db, "bom", bom_id)]


@router.post("/{bom_id}/grants", status_code=201, dependencies=[Depends(require_engineering)])
async def grant_bom_access(
    bom_id: int,
    request: BomGrantRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_bom_manage),
):
    # 404 on an unknown/other-tenant BOM instead of writing an orphan grant
    # row: a grant on a nonexistent bom_id is unlistable and unrevokable
    # (every /grants route needs `manage`, and `manage` needs either a grant
    # or the BOM's creator — neither of which a phantom BOM can supply).
    bom = await bom_service.get_bom_or_404(db, bom_id)

    # Grantee must exist IN THIS TENANT — both selects are ORM and therefore
    # tenant-filtered, so a cross-tenant id reads as "not found".
    model = User if request.grantee_type == "user" else Team
    exists = (
        await db.execute(select(model.id).where(model.id == request.grantee_id))
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(
            status_code=404, detail=f"No such {request.grantee_type}: {request.grantee_id}"
        )

    # The FIRST grant flips the BOM from open to restricted, so whoever adds
    # it must keep a way back in. The creator bypass covers that only for BOMs
    # created after `created_by` started being populated — every older BOM has
    # created_by NULL, and there the first grant locked the grantor out of the
    # BOM *and* of these /grants routes, permanently (superuser only to undo).
    # Give the grantor `manage` alongside the first grant instead.
    prior = await get_object_grants(db, "bom", bom_id)
    grantee_is_self = request.grantee_type == "user" and request.grantee_id == current_user.id
    if (
        not prior
        and not grantee_is_self
        and not current_user.isSuperuser
        and bom.created_by != current_user.id
    ):
        db.add(
            ResourceGrant(
                resourceType="bom",
                resourceId=bom_id,
                granteeType="user",
                granteeId=current_user.id,
                level="manage",
                createdById=current_user.id,
                tenantId=current_user.tenantId,
            )
        )

    existing = (
        await db.execute(
            select(ResourceGrant).where(
                ResourceGrant.resourceType == "bom",
                ResourceGrant.resourceId == bom_id,
                ResourceGrant.granteeType == request.grantee_type,
                ResourceGrant.granteeId == request.grantee_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.level = request.level  # re-granting changes the level
        grant = existing
    else:
        grant = ResourceGrant(
            resourceType="bom",
            resourceId=bom_id,
            granteeType=request.grantee_type,
            granteeId=request.grantee_id,
            level=request.level,
            createdById=current_user.id,
            tenantId=current_user.tenantId,
        )
        db.add(grant)
    await db.commit()
    await db.refresh(grant)
    return _grant_out(grant)


@router.delete(
    "/{bom_id}/grants/{grant_id}", status_code=204, dependencies=[Depends(require_engineering)]
)
async def revoke_bom_access(
    bom_id: int,
    grant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_bom_manage),
):
    grant = (
        await db.execute(
            select(ResourceGrant).where(
                ResourceGrant.id == grant_id,
                ResourceGrant.resourceType == "bom",
                ResourceGrant.resourceId == bom_id,
            )
        )
    ).scalar_one_or_none()
    if grant is None:
        raise HTTPException(status_code=404, detail="Grant not found")
    await db.delete(grant)
    await db.commit()
    return None


# NOTE: deliberately declared LAST. "/{bom_id}" is a single-segment catch-all
# that would otherwise shadow every literal single-segment GET route above it
# (e.g. GET /templates) — FastAPI/Starlette matches routes in registration
# order, and an unconverted "{bom_id}" segment matches any string before the
# int-validation on the path param even runs.
@router.get("/{bom_id}", response_model=BOMRead)
async def get_bom(bom_id: int, db: AsyncSession = Depends(get_db)):
    return await bom_service.get_bom_or_404(db, bom_id)
