"""
SolidWorks Integration API Endpoints
Handles bidirectional sync, image upload, and plugin communication
"""

import json
import logging
from datetime import UTC, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user

logger = logging.getLogger(__name__)
from app.core.rbac import require_engineering, require_viewer
from app.db.session import get_db
from app.models.bom_item import BomItem
from app.models.bom_template import BomTemplate
from app.models.document import Document
from app.models.part import Part
from app.models.user import User

router = APIRouter(
    tags=["solidworks-integration"],
    dependencies=[Depends(get_current_user), Depends(require_viewer)],
)


class BomItemRequest(BaseModel):
    component_name: str
    part_number: Optional[str] = None
    description: Optional[str] = None
    quantity: int = 1
    level: int = 0  # depth in the assembly tree (0 = top level); used to rebuild hierarchy
    is_assembly: bool = False  # component is a sub-assembly (has children)
    material: Optional[str] = None
    weight: Optional[str] = None
    vendor: Optional[str] = None
    cost: Optional[str] = None
    configuration: Optional[str] = None
    custom_properties: Optional[dict[str, Any]] = None
    mass_properties: Optional[dict[str, Any]] = None
    bounding_box: Optional[dict[str, Any]] = None
    features: Optional[list[dict[str, Any]]] = None


class BomSyncRequest(BaseModel):
    source_file: str
    model_type: Optional[str] = "Assembly"
    extracted_at: Optional[datetime] = None
    total_components: int = 0
    total_unique_parts: int = 0
    items: list[BomItemRequest]


class SyncResult(BaseModel):
    session_id: str
    items_added: int
    items_updated: int
    items_deleted: int
    bom_template_id: Optional[int] = None
    conflicts: list[str] = []
    success: bool
    message: str


class PendingChange(BaseModel):
    change_id: str
    type: str
    part_number: str
    property: str
    old_value: Any
    new_value: Any
    user_name: Optional[str] = None
    timestamp: datetime
    reason: Optional[str] = None


class UpdateNotification(BaseModel):
    type: str
    model_name: Optional[str] = None
    user_name: Optional[str] = None
    timestamp: datetime
    data: Optional[dict[str, Any]] = None


async def _log_audit(db: AsyncSession, user: User, action: str, details: dict = None):
    from app.models.audit_log import AuditLog

    log = AuditLog(
        action=action,
        entityType="bom",
        entityId=0,
        userId=user.id,
        userEmail=user.email,
        changes=details or {},
    )
    db.add(log)


def _to_float(value) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _basename(path: str) -> str:
    return (path or "").split("/")[-1].split("\\")[-1] or "Untitled"


async def _find_or_create_part(
    db: AsyncSession, item: BomItemRequest, current_user: User, index: int = 0
) -> tuple[Part, bool]:
    pn = (item.part_number or "").strip() or f"CAD-{(item.component_name or 'PART').strip()}-{index}"
    result = await db.execute(select(Part).where(Part.pn == pn))
    part = result.scalar_one_or_none()
    is_new = part is None

    if is_new:
        part = Part(pn=pn, name=(item.component_name or pn), tenantId=current_user.tenantId)
        db.add(part)

    # Refresh mutable fields from the CAD extraction (new or existing part)
    if item.component_name:
        part.name = item.component_name
    if item.description:
        part.description = item.description
    if item.material:
        part.material = item.material
    if item.vendor:
        part.vendor = item.vendor
    cost = _to_float(item.cost)
    if cost is not None:
        part.cost = cost
    weight = _to_float(item.weight)
    if weight is not None:
        part.weight = weight
    if item.is_assembly:
        part.assembly = True
        part.category = "Assembly"

    await db.flush()
    return part, is_new


@router.get("/")
async def list_imported_boms(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List BOMs imported from SolidWorks (most recent first)."""
    result = await db.execute(
        select(BomTemplate)
        .where(
            BomTemplate.tenantId == current_user.tenantId,
            BomTemplate.description.like("Imported from SolidWorks:%"),
        )
        .order_by(BomTemplate.createdAt.desc())
        .limit(200)
    )
    templates = result.scalars().all()
    return [
        {
            "template_id": t.id,
            "name": t.name,
            "part_count": t.partCount,
            "created_at": t.createdAt.isoformat() if t.createdAt else None,
        }
        for t in templates
    ]


@router.post("/sync")
async def sync_bom(
    request: BomSyncRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    session_id = f"session_{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}"
    template_name = _basename(request.source_file)

    # Find or create the BOM header (template) for this source file
    result = await db.execute(
        select(BomTemplate).where(
            BomTemplate.name == template_name,
            BomTemplate.tenantId == current_user.tenantId,
        )
    )
    template = result.scalar_one_or_none()
    if template is None:
        template = BomTemplate(
            name=template_name,
            description=f"Imported from SolidWorks: {request.source_file}",
            createdById=current_user.id,
            tenantId=current_user.tenantId,
        )
        db.add(template)
        await db.flush()
    else:
        # Re-sync: rebuild the item tree so it mirrors the current CAD structure
        await db.execute(delete(BomItem).where(BomItem.bomTemplateId == template.id))
        await db.flush()

    items_added = 0
    items_updated = 0
    stack: dict[int, int] = {}  # level -> most recent BomItem.id at that level

    for idx, item in enumerate(request.items):
        part, is_new = await _find_or_create_part(db, item, current_user, idx)
        if is_new:
            items_added += 1
        else:
            items_updated += 1

        level = item.level or 0
        parent_item_id = stack.get(level - 1) if level > 0 else None
        qty = item.quantity or 1
        unit_cost = part.cost or 0.0

        bom_item = BomItem(
            bomTemplateId=template.id,
            partId=part.id,
            quantity=qty,
            sortOrder=idx,
            parentItemId=parent_item_id,
            unitCostSnapshot=unit_cost,
            extendedCost=unit_cost * qty,
            tenantId=current_user.tenantId,
        )
        db.add(bom_item)
        await db.flush()

        stack[level] = bom_item.id
        for deeper in [lvl for lvl in list(stack) if lvl > level]:
            del stack[deeper]

    template.partCount = len(request.items)

    # Keep a Document record too (drives the vault / updates views)
    doc = Document(
        filename=template_name,
        originalName=template_name,
        fileType=request.model_type or "Assembly",
        category="cad",
        tenantId=current_user.tenantId,
    )
    db.add(doc)
    await db.commit()

    max_level = max((item.level or 0 for item in request.items), default=0)
    await _log_audit(
        db,
        current_user,
        "CAD_BOM_SYNCED",
        {
            "session_id": session_id,
            "source_file": request.source_file,
            "bom_template_id": template.id,
            "items_added": items_added,
            "items_updated": items_updated,
            "levels": max_level + 1,
            "total_items": len(request.items),
        },
    )
    await db.commit()

    return SyncResult(
        session_id=session_id,
        items_added=items_added,
        items_updated=items_updated,
        items_deleted=0,
        bom_template_id=template.id,
        conflicts=[],
        success=True,
        message=(
            f"BOM '{template_name}' synced: {len(request.items)} components across "
            f"{max_level + 1} level(s) -> template #{template.id}"
        ),
    )


@router.post("/apply-sync")
async def apply_sync(
    request: BomSyncRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_engineering),
):
    session_id = f"session_{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}"

    items_added = 0
    items_updated = 0
    items_deleted = 0

    for item in request.items:
        part, is_new = await _find_or_create_part(db, item, current_user)
        if is_new:
            items_added += 1
        else:
            items_updated += 1

    doc = Document(
        filename=_basename(request.source_file),
        originalName=_basename(request.source_file),
        fileType=request.model_type or "Assembly",
        tenantId=current_user.tenantId,
        category="cad",
    )
    db.add(doc)
    await db.commit()

    return {
        "session_id": session_id,
        "items_added": items_added,
        "items_updated": items_updated,
        "items_deleted": items_deleted,
        "success": True,
    }


@router.get("/bom")
async def get_bom(
    file: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(Document.filename == file.split("/")[-1].split("\\")[-1])
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="BOM not found")

    parts = await db.execute(
        select(Part).where(
            Part.name.ilike(f"%{file.split('/')[-1].split(chr(92))[-1].replace('.', ' ')}%")
        )
    )
    return {
        "source_file": file,
        "model_type": doc.fileType,
        "total_components": 0,
        "items": [
            {
                "component_name": p.name,
                "part_number": p.pn,
                "description": p.description,
                "quantity": 1,
            }
            for p in parts.scalars().all()
        ],
    }


@router.get("/bom/list")
async def list_boms(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document)
        .where(Document.category == "cad")
        .order_by(Document.createdAt.desc())
        .limit(100)
    )
    docs = result.scalars().all()
    return [
        {
            "source_file": d.filename,
            "file_type": d.fileType,
            "total_components": 0,
            "extracted_at": d.createdAt.isoformat() if d.createdAt else None,
        }
        for d in docs
    ]


@router.get("/bom-structure")
async def bom_structure(
    source_file: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the ingested multi-level BOM tree for a source file."""
    name = _basename(source_file)
    result = await db.execute(
        select(BomTemplate).where(
            BomTemplate.name == name,
            BomTemplate.tenantId == current_user.tenantId,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail=f"No imported BOM for '{name}'")

    result = await db.execute(
        select(BomItem).where(BomItem.bomTemplateId == template.id).order_by(BomItem.sortOrder)
    )
    items = list(result.scalars().all())

    parts_map: dict[int, Part] = {}
    if items:
        pr = await db.execute(select(Part).where(Part.id.in_([i.partId for i in items])))
        parts_map = {p.id: p for p in pr.scalars().all()}

    nodes: dict[int, dict] = {}
    for i in items:
        p = parts_map.get(i.partId)
        nodes[i.id] = {
            "bom_item_id": i.id,
            "part_number": p.pn if p else None,
            "name": p.name if p else None,
            "quantity": i.quantity,
            "unit_cost": i.unitCostSnapshot,
            "extended_cost": i.extendedCost,
            "is_assembly": bool(p.assembly) if p else False,
            "children": [],
        }

    roots: list[dict] = []
    for i in items:
        node = nodes[i.id]
        if i.parentItemId and i.parentItemId in nodes:
            nodes[i.parentItemId]["children"].append(node)
        else:
            roots.append(node)

    def _depth(node_list: list[dict], d: int = 1) -> int:
        best = d
        for n in node_list:
            if n["children"]:
                best = max(best, _depth(n["children"], d + 1))
        return best

    return {
        "template_id": template.id,
        "name": template.name,
        "part_count": template.partCount,
        "levels": _depth(roots) if roots else 0,
        "total_items": len(items),
        "tree": roots,
    }


@router.post("/images")
async def upload_image(
    part_number: str = Form(...),
    file: UploadFile = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Part).where(Part.pn == part_number))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    doc = Document(
        filename=file.filename if file else f"{part_number}.png",
        originalName=file.filename if file else f"{part_number}.png",
        fileType="image",
        category="cad",
        tenantId=current_user.tenantId,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return {
        "success": True,
        "part_number": part_number,
        "document_id": doc.id,
        "message": "Image uploaded successfully",
    }


@router.get("/images/{part_number}")
async def get_image(
    part_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(
            Document.category == "cad",
            Document.filename.ilike(f"%{part_number}%"),
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")
    return {
        "part_number": part_number,
        "document_id": doc.id,
        "filename": doc.filename,
        "file_type": doc.fileType,
        "has_thumbnail": True,
    }


@router.get("/images")
async def list_images(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(Document.category == "cad", Document.fileType == "image")
    )
    docs = result.scalars().all()
    return [
        {
            "part_number": d.filename.rsplit(".", 1)[0]
            if "." in (d.filename or "")
            else d.filename,
            "document_id": d.id,
            "filename": d.filename,
        }
        for d in docs
    ]


@router.post("/notify")
async def send_notification(
    notification: UpdateNotification,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.notification import Notification

    n = Notification(
        type=notification.type,
        message=json.dumps(notification.data or {}),
        userId=current_user.id,
    )
    db.add(n)
    await db.commit()

    return {"success": True}


@router.get("/updates")
async def get_updates(
    session: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(type("N", (), {"id": 0, "type": "", "data": "", "createdAt": datetime.now(UTC)}))
        .select_from(text("notifications"))
        .order_by(text("id DESC"))
        .limit(20)
    )
    try:
        result = await db.execute(
            select(Document)
            .where(Document.category == "cad")
            .order_by(Document.createdAt.desc())
            .limit(20)
        )
        docs = result.scalars().all()
        return [
            {
                "type": "bom_synced",
                "model_name": d.filename,
                "timestamp": d.createdAt.isoformat() if d.createdAt else None,
                "data": {"document_id": d.id},
            }
            for d in docs
        ]
    except Exception as exc:
        logger.warning("Failed to fetch SolidWorks updates: %s", exc)
        return []


@router.delete("/updates")
async def clear_updates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"success": True}


@router.get("/changes")
async def get_pending_changes(
    model: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return []


@router.post("/changes")
async def add_pending_changes(
    model: str,
    changes: list[PendingChange],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"success": True, "count": len(changes)}


@router.post("/apply-changes")
async def apply_changes(
    model: str,
    changes: list[PendingChange],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    applied = 0
    errors = []

    for change in changes:
        try:
            result = await db.execute(select(Part).where(Part.pn == change.part_number))
            part = result.scalar_one_or_none()
            if part and hasattr(part, change.property):
                setattr(part, change.property, change.new_value)
                applied += 1
        except Exception as e:
            errors.append(str(e))

    await db.commit()
    return {"success": len(errors) == 0, "changes_applied": applied, "errors": errors}


@router.get("/vault/stats")
async def get_vault_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_files = await db.execute(
        select(func.count()).select_from(Document).where(Document.category == "cad")
    )
    total_parts = await db.execute(select(func.count()).select_from(Part))
    total_assemblies = await db.execute(
        select(func.count())
        .select_from(Document)
        .where(Document.category == "cad", Document.fileType == "Assembly")
    )
    total_drawings = await db.execute(
        select(func.count())
        .select_from(Document)
        .where(Document.category == "cad", Document.fileType == "Drawing")
    )

    return {
        "total_files": total_files.scalar() or 0,
        "total_parts": total_parts.scalar() or 0,
        "total_assemblies": total_assemblies.scalar() or 0,
        "total_drawings": total_drawings.scalar() or 0,
        "total_size_mb": 0,
        "last_synced": datetime.now(UTC),
    }


@router.get("/vault/tree")
async def get_vault_tree(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Document).where(Document.category == "cad").limit(100))
    docs = result.scalars().all()
    return [
        {
            "name": d.filename,
            "path": f"/cad/{d.filename}",
            "type": d.fileType or "Unknown",
            "size": 0,
            "modified": d.createdAt.isoformat() if d.createdAt else None,
            "modified_by": "SolidWorks Plugin",
        }
        for d in docs
    ]


@router.post("/extract-attrs")
async def extract_attributes(
    file_path: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Part).where(Part.cadUrl == file_path))
    part = result.scalar_one_or_none()

    if not part:
        raise HTTPException(
            status_code=404,
            detail=f"No part found with CAD URL: {file_path}",
        )

    return {
        "file_path": file_path,
        "attributes": {
            "part_number": part.pn,
            "description": part.description,
            "material": part.material,
        },
    }


@router.get("/license/verify")
async def verify_license(
    machine: str,
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(
        status_code=501,
        detail="SolidWorks license verification is not yet implemented. Requires SolidWorks API integration.",
    )


@router.post("/license/activate")
async def activate_license(
    license_key: str,
    machine_id: str,
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(
        status_code=501,
        detail="SolidWorks license activation is not yet implemented. Requires SolidWorks API integration.",
    )
