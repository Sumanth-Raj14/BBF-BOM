"""Generic CAD connector routes: framework-level, vendor-agnostic.

Lists available connector types (the registry — Onshape today, Fusion 360/
Altium can register without touching this file), CRUD for per-tenant
connections (credentials encrypted at rest — see app.models.cad_connection),
a real connectivity test, document listing, and an assembly-structure import
that maps a connector's normalised tree into Parts/BOMItems via the existing
part_service/bom_service (never reimplementing BOM writing here).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.rbac import require_parts_write
from app.db.session import get_db
from app.integrations.cad import (
    CadAssembly,
    CadAuthError,
    CadConnectorError,
    CadNode,
    CadNotFoundError,
    CadRateLimitError,
    build_connector,
    list_connector_types,
)
from app.integrations.cad.adapters import _to_node  # vendor dict -> CadNode, already written
from app.integrations.cad.altium import AltiumFileConnector, AltiumParseError
from app.models.cad_connection import CadConnection
from app.models.part import Part
from app.models.user import User
from app.services import bom_service, import_service, part_service

router = APIRouter()


class CadConnectionCreate(BaseModel):
    name: str
    connector_type: str
    credentials: dict
    config: dict | None = None


class CadImportRequest(BaseModel):
    document_id: str
    bom_id: int | None = None
    bom_name: str | None = None


def _public(conn: CadConnection) -> dict:
    """Never include credentials — even decrypted, they never leave this process."""
    return {
        "id": conn.id,
        "name": conn.name,
        "connector_type": conn.connector_type,
        "config": conn.config,
        "status": conn.status,
        "last_error": conn.last_error,
        "last_sync_at": conn.last_sync_at.isoformat() if conn.last_sync_at else None,
        "createdAt": conn.createdAt.isoformat() if conn.createdAt else None,
    }


async def _get_connection_or_404(db: AsyncSession, connection_id: int, tenant_id: int) -> CadConnection:
    result = await db.execute(
        select(CadConnection).where(
            CadConnection.id == connection_id, CadConnection.tenantId == tenant_id
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="CAD connection not found")
    return conn


def _build(conn: CadConnection):
    """Build a live connector instance from a stored connection. `conn.credentials`
    is already decrypted here — the model's `load` event handles that."""
    creds = json.loads(conn.credentials) if conn.credentials else {}
    return build_connector(conn.connector_type, creds, conn.config or {})


async def _sync_rotated_credentials(db: AsyncSession, conn: CadConnection, connector) -> None:
    """Some vendors (APS/Fusion, Altium 365) rotate the refresh_token on every
    token refresh. The connector only holds the new value in memory — read it
    back and persist it here, or the very next call uses the now-invalidated
    old refresh_token and the connection breaks permanently (mirrors
    app.api.endpoints.zoho_books' `conn.auth = dump_auth_blob(...)` pattern).
    Called unconditionally (success or failure) since auth can rotate before a
    later step in the same call fails for an unrelated reason."""
    get_current = getattr(connector, "current_credentials", None)
    if get_current is None:
        return
    current = get_current()
    if current != connector.credentials:
        conn.credentials = json.dumps(current)
        await db.commit()


@router.get("/types")
async def list_types(current_user: User = Depends(get_current_user)):
    return {"types": list_connector_types()}


@router.get("")
async def list_connections(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(CadConnection)
        .where(CadConnection.tenantId == current_user.tenantId)
        .order_by(CadConnection.id.desc())
    )
    return {"items": [_public(c) for c in result.scalars().all()]}


@router.post("")
async def create_connection(
    data: CadConnectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    if data.connector_type not in list_connector_types():
        raise HTTPException(
            status_code=400,
            detail=f"Unknown CAD connector type: {data.connector_type!r}. "
            f"Available: {list_connector_types()}",
        )
    conn = CadConnection(
        name=data.name,
        connector_type=data.connector_type,
        credentials=json.dumps(data.credentials),
        config=data.config or {},
        tenantId=current_user.tenantId,
    )
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return _public(conn)


@router.delete("/{connection_id}")
async def delete_connection(
    connection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    conn = await _get_connection_or_404(db, connection_id, current_user.tenantId)
    await db.delete(conn)
    await db.commit()
    return {"deleted": True}


@router.post("/{connection_id}/test")
async def test_connection(
    connection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    """Real, synchronous credential check via the connector's `verify_connection`
    (mocked HTTP in tests, the real vendor API in production). Never fabricates
    success: a bad/missing credential comes back as `ok: false` with an honest
    reason, and the connection's stored status/last_error reflect it."""
    conn = await _get_connection_or_404(db, connection_id, current_user.tenantId)
    connector = _build(conn)
    try:
        try:
            result = await connector.verify_connection()
        except CadAuthError as e:
            conn.status, conn.last_error = "error", str(e)
            await db.commit()
            return {"ok": False, "reason": "auth_failed", "detail": str(e)}
        except CadRateLimitError as e:
            conn.status, conn.last_error = "error", str(e)
            await db.commit()
            return {"ok": False, "reason": "rate_limited", "detail": str(e)}
        except CadNotFoundError as e:
            conn.status, conn.last_error = "error", str(e)
            await db.commit()
            return {"ok": False, "reason": "not_found", "detail": str(e)}
        except CadConnectorError as e:
            conn.status, conn.last_error = "error", str(e)
            await db.commit()
            return {"ok": False, "reason": "error", "detail": str(e)}

        conn.status, conn.last_error = "ok", None
        await db.commit()
        return {"ok": True, "reason": "ok", "detail": result}
    finally:
        await _sync_rotated_credentials(db, conn, connector)


@router.get("/{connection_id}/documents")
async def list_documents(
    connection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = await _get_connection_or_404(db, connection_id, current_user.tenantId)
    connector = _build(conn)
    try:
        try:
            docs = await connector.list_documents()
        except CadAuthError as e:
            raise HTTPException(status_code=401, detail=str(e)) from e
        except CadConnectorError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        return {"items": [d.__dict__ for d in docs]}
    finally:
        await _sync_rotated_credentials(db, conn, connector)


# Normalised CadPartMetadata.custom_properties key -> the Part column that
# holds it. Anything else a connector carries (Altium's footprint / supplier
# part number, ...) has no column and lands in Part.customFields, the same
# free-form JSON stash app/integrations/zoho_inbound.py uses for values with
# nowhere else to go. `designators` is excluded — it belongs on the BOM line
# (BOMItem.reference_designator), not on the part.
_CAD_PROP_TO_PART_COLUMN = {"mpn": "mpn", "manufacturer": "manufacturer", "supplier": "vendor"}


async def _find_or_create_part(
    db: AsyncSession, pn: str, name: str, tenant_id: int, is_assembly: bool, metadata=None
):
    existing = await db.execute(
        select(Part).where(Part.tenantId == tenant_id, Part.pn == pn)
    )
    part = existing.scalar_one_or_none()
    if part:
        return part, False
    data = {"pn": pn, "name": name or pn, "assembly": is_assembly, "status": "Draft"}
    if is_assembly:
        data["part_kind"] = "ASSEMBLY"
    if metadata is not None:
        props = metadata.custom_properties or {}
        if metadata.description:
            data["description"] = metadata.description
        data.update({col: props[k] for k, col in _CAD_PROP_TO_PART_COLUMN.items() if props.get(k)})
        leftovers = {
            k: v
            for k, v in props.items()
            if k not in _CAD_PROP_TO_PART_COLUMN and k != "designators" and v not in (None, "", [])
        }
        if leftovers:
            data["customFields"] = leftovers
    part = await part_service.create_part(db, data, tenant_id)
    return part, True


async def _import_node(
    db: AsyncSession,
    bom_id: int,
    document_id: str,
    node: CadNode,
    tenant_id: int,
    parent_item_id: int | None,
) -> tuple[int, int]:
    pn = node.part_number or f"CAD-{document_id}-{node.id}"
    part, created = await _find_or_create_part(
        db, pn, node.name, tenant_id, node.is_assembly, node.metadata
    )
    item_data = {"part_id": part.id, "quantity": node.quantity, "parent_item_id": parent_item_id}
    designators = ((node.metadata.custom_properties if node.metadata else None) or {}).get(
        "designators"
    )
    if designators:
        # ECAD reference designators (R1, R2, R5) — the grouped placements of
        # one component, kept on the BOM line they were grouped into.
        item_data["reference_designator"] = ", ".join(designators)
    item = await bom_service.create_bom_item(db, bom_id, item_data, tenant_id)
    items, parts = 1, (1 if created else 0)
    for child in node.children:
        c_items, c_parts = await _import_node(
            db, bom_id, document_id, child, tenant_id, item["id"]
        )
        items += c_items
        parts += c_parts
    return items, parts


async def _import_assembly_into_bom(
    db: AsyncSession,
    assembly: CadAssembly,
    document_id: str,
    tenant_id: int,
    *,
    bom_id: int | None = None,
    bom_name: str | None = None,
) -> tuple[object, int, int]:
    """Shared importer: a normalised CadAssembly -> real BOM + Parts/BOMItems.

    Used by BOTH the stored-connection import and the credential-free Altium
    file upload, so there is exactly one place that writes BOMs (and it does so
    through bom_service/part_service, never raw ORM). Targets `bom_id` if given
    (validated for this tenant), else creates a new BOM.
    """
    if bom_id is not None:
        bom = await bom_service.get_bom_or_404(db, bom_id)
        if bom.tenantId != tenant_id:
            raise HTTPException(status_code=404, detail="BOM not found")
    else:
        bom = await bom_service.create_bom(
            db, {"name": bom_name or f"{assembly.document_name} (CAD import)"}, tenant_id
        )

    total_items, total_parts = 0, 0
    for child in assembly.root.children:
        items, parts = await _import_node(db, bom.id, document_id, child, tenant_id, None)
        total_items += items
        total_parts += parts
    return bom, total_items, total_parts


@router.post("/{connection_id}/import")
async def import_assembly(
    connection_id: int,
    req: CadImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    """Fetch the normalised assembly tree for `document_id` and write it into
    Parts + BOM items (reusing part_service.create_part / bom_service.create_bom
    / bom_service.create_bom_item — no BOM-writing logic lives here). Targets
    `bom_id` if given (validated for this tenant), else creates a new BOM."""
    conn = await _get_connection_or_404(db, connection_id, current_user.tenantId)
    connector = _build(conn)
    try:
        try:
            assembly = await connector.get_assembly_structure(req.document_id)
        except CadAuthError as e:
            conn.status, conn.last_error = "error", str(e)
            await db.commit()
            raise HTTPException(status_code=401, detail=str(e)) from e
        except CadNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except CadConnectorError as e:
            conn.status, conn.last_error = "error", str(e)
            await db.commit()
            raise HTTPException(status_code=502, detail=str(e)) from e

        bom, total_items, total_parts = await _import_assembly_into_bom(
            db, assembly, req.document_id, current_user.tenantId, bom_id=req.bom_id, bom_name=req.bom_name
        )

        conn.status, conn.last_error, conn.last_sync_at = "ok", None, datetime.now(UTC)
        await db.commit()

        return {
            "bom_id": bom.id,
            "document_id": req.document_id,
            "items_created": total_items,
            "parts_created": total_parts,
        }
    finally:
        await _sync_rotated_credentials(db, conn, connector)


@router.post("/altium/import-file")
async def import_altium_file(
    file: UploadFile = File(...),
    bom_name: str | None = Form(None),
    dry_run: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    """Import an Altium BOM export (.csv/.xlsx) — the ONLY CAD import that needs
    no vendor credentials, so there is no stored CadConnection to load here.

    Designator grouping survives: R1/R2/R5 arrive as one component with
    quantity 3, written as one BOM line whose reference_designator keeps the
    list. Writing goes through the same `_import_assembly_into_bom` helper the
    stored-connection route uses.

    `dry_run=true` parses and reports what WOULD be created without writing a
    single row (the preview half of the import-mapping/commit split the bulk
    import already uses). A file that cannot be parsed is a 400 with the parse
    error — never a partial or fabricated success.
    """
    filename = file.filename or ""
    content = await file.read()
    if len(content) > import_service.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large: limit is {import_service.MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB",
        )

    try:
        # AltiumFileConnector parses in __init__ and rejects any extension that
        # is not .csv/.xlsx — both surface as AltiumParseError -> 400.
        connector = AltiumFileConnector(content, filename)
        document = await connector.get_assembly_structure()
    except AltiumParseError as e:
        raise HTTPException(status_code=400, detail=f"Could not parse Altium BOM: {e}") from e

    root = _to_node(document)
    root.is_assembly = True
    for node in root.children:
        # Altium's part_number IS the manufacturer part number (that's what the
        # parser groups on), so it lands in Part.mpn as well as Part.pn.
        node.metadata.custom_properties["mpn"] = node.part_number
    name = bom_name or filename.rsplit(".", 1)[0] or "Altium BOM"

    if dry_run:
        pns = [n.part_number or f"CAD-{filename}-{n.id}" for n in root.children]
        existing = set()
        if pns:
            existing = set(
                (
                    await db.execute(
                        select(Part.pn).where(
                            Part.tenantId == current_user.tenantId, Part.pn.in_(pns)
                        )
                    )
                )
                .scalars()
                .all()
            )
        return {
            "dry_run": True,
            "bom_name": name,
            "filename": filename,
            "items_to_create": len(root.children),
            "parts_to_create": len([p for p in pns if p not in existing]),
            "components": document["children"],
        }

    assembly = CadAssembly(
        document_id=filename,
        document_name=root.name or filename,
        root=root,
        connector_type="altium",
    )
    bom, total_items, total_parts = await _import_assembly_into_bom(
        db, assembly, filename, current_user.tenantId, bom_name=name
    )
    return {
        "dry_run": False,
        "bom_id": bom.id,
        "bom_name": bom.name,
        "filename": filename,
        "items_created": total_items,
        "parts_created": total_parts,
    }
