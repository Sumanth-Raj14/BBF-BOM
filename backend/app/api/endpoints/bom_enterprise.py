"""
BOM Management Enterprise API
Multi-level BOM, quantity rollups, snapshots, where-used, variants
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.rbac import require_viewer
from app.db.session import get_db
from app.models.user import User
from app.services import bom_service

router = APIRouter(
    tags=["bom-enterprise"], dependencies=[Depends(get_current_user), Depends(require_viewer)]
)


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
async def get_cost_rollup(bom_id: int, db: AsyncSession = Depends(get_db)):
    return await bom_service.get_cost_rollup(db, bom_id)


@router.get("/where-used/{part_id}")
async def get_where_used(part_id: int, db: AsyncSession = Depends(get_db)):
    return await bom_service.get_where_used(db, part_id)


@router.get("/where-used/{part_id}/tree")
async def get_where_used_tree(part_id: int, db: AsyncSession = Depends(get_db)):
    return await bom_service.get_where_used_tree(db, part_id)


@router.post("/{bom_id}/snapshots")
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


@router.post("/{bom_id}/baselines")
async def create_baseline(
    bom_id: int,
    baseline_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await bom_service.create_baseline(db, bom_id, baseline_name, current_user.id)


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
    )


@router.get("/variants/{variant_id}")
async def get_variant(variant_id: int, db: AsyncSession = Depends(get_db)):
    return await bom_service.get_variant(db, variant_id)


@router.post("/variants/items")
async def add_variant_item(
    request: BomVariantItemRequest,
    db: AsyncSession = Depends(get_db),
):
    return await bom_service.add_variant_item(
        db,
        request.variant_id,
        request.part_id,
        request.quantity,
        request.substitute_part_id,
        request.is_optional,
        request.condition_expression,
    )


@router.post("/{bom_id}/export")
async def export_bom(
    bom_id: int,
    format: str = Query("csv", pattern="^(csv|excel|pdf|json)$"),
    db: AsyncSession = Depends(get_db),
):
    return await bom_service.export_bom(db, bom_id, format)


@router.post("/import")
async def import_bom(
    file_url: str,
    project_id: int,
    format: str = Query("csv", pattern="^(csv|excel|json)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await bom_service.import_bom(db, file_url, project_id, format)


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
