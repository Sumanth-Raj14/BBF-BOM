"""Catalog service layer — business logic for part catalogs (OpenBOM-parity).

A Catalog is a tenant-scoped, named grouping of parts. Parts are linked to a
catalog through the ``part_catalogs`` association (PartCatalog model),
mirroring the part_vendors many-to-many pattern.

Tenant isolation: every tenant-scoped query below adds an explicit
``tenantId == tid`` filter via app.core.tenant_context.get_tenant_id(),
matching the pattern used in app/services/document_service.py and
app/services/substance_compliance_service.py — this is required in
addition to (not instead of) the automatic tenantId SELECT filter
registered by app.core.tenant_events, because that listener only patches
single-entity ORM selects and silently no-ops on the multi-entity JOIN
query used in list_parts_in_catalog.
"""

import os
import shutil
import tempfile
import zipfile
from math import ceil
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams, paginate
from app.core.tenant_context import get_tenant_id
from app.models.catalog import Catalog, PartCatalog
from app.models.part import Part

# Extensions handled by app.api.endpoints.cad's real parsers. Anything else
# falls back to "create a basic part by filename".
CAD_EXTENSIONS = {"step", "stp", "igs", "iges", "sldprt"}

# Files that show up in folders/zips but are never part files.
_SKIP_FILENAMES = {".ds_store", "thumbs.db", "desktop.ini"}

# Safety valve: a mistyped/malicious server-side folder_path (e.g. a whole
# drive root) must not turn one request into an unbounded os.walk() plus one
# Part-per-file DB write. Zip uploads are inherently bounded by upload size
# limits elsewhere, but folder_path has no such bound, so we cap it here.
MAX_FOLDER_IMPORT_FILES = 5000

CATALOG_UPLOAD_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "uploads",
    "catalogs",
)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


async def list_catalogs(
    db: AsyncSession,
    page: PageParams,
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
):
    query = select(Catalog)
    tid = get_tenant_id()
    if tid is not None:
        query = query.where(Catalog.tenantId == tid)
    if search:
        query = query.where(
            (Catalog.catalog_code.ilike(f"%{search}%"))
            | (Catalog.catalog_name.ilike(f"%{search}%"))
        )
    if is_active is not None:
        query = query.where(Catalog.is_active == is_active)
    query = query.order_by(Catalog.id)
    return await paginate(db, query, page)


async def get_catalog(db: AsyncSession, catalog_id: int) -> Catalog:
    tid = get_tenant_id()
    stmt = select(Catalog).where(Catalog.id == catalog_id)
    if tid is not None:
        stmt = stmt.where(Catalog.tenantId == tid)
    result = await db.execute(stmt)
    catalog = result.scalar_one_or_none()
    if not catalog:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Catalog with ID {catalog_id} not found",
        )
    return catalog


async def create_catalog(db: AsyncSession, data: dict, tenant_id: int) -> Catalog:
    existing = await db.execute(
        select(Catalog).where(
            Catalog.catalog_code == data.get("catalog_code"),
            Catalog.tenantId == tenant_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Catalog with code {data.get('catalog_code')} already exists",
        )
    db_catalog = Catalog(**data, tenantId=tenant_id)
    db.add(db_catalog)
    await db.commit()
    await db.refresh(db_catalog)
    return db_catalog


async def update_catalog(db: AsyncSession, catalog_id: int, data: dict) -> Catalog:
    db_catalog = await get_catalog(db, catalog_id)

    new_code = data.get("catalog_code")
    if new_code and new_code != db_catalog.catalog_code:
        tid = get_tenant_id()
        conflict_stmt = select(Catalog).where(Catalog.catalog_code == new_code)
        if tid is not None:
            conflict_stmt = conflict_stmt.where(Catalog.tenantId == tid)
        existing = await db.execute(conflict_stmt)
        conflict = existing.scalar_one_or_none()
        if conflict and conflict.id != catalog_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Catalog with code {new_code} already exists",
            )

    for field, value in data.items():
        if hasattr(db_catalog, field):
            setattr(db_catalog, field, value)

    await db.commit()
    await db.refresh(db_catalog)
    return db_catalog


async def deactivate_catalog(db: AsyncSession, catalog_id: int) -> Catalog:
    db_catalog = await get_catalog(db, catalog_id)
    db_catalog.is_active = False
    await db.commit()
    await db.refresh(db_catalog)
    return db_catalog


# ---------------------------------------------------------------------------
# Part <-> Catalog linking
# ---------------------------------------------------------------------------


async def add_or_update_part_in_catalog(
    db: AsyncSession, catalog_id: int, part_id: int, tenant_id: int
) -> tuple[PartCatalog, bool]:
    """Idempotent add: returns (link, created)."""
    await get_catalog(db, catalog_id)  # 404 if missing (tenant-scoped)
    tid = get_tenant_id()

    part_stmt = select(Part).where(Part.id == part_id)
    if tid is not None:
        part_stmt = part_stmt.where(Part.tenantId == tid)
    part_result = await db.execute(part_stmt)
    if not part_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=f"Part with ID {part_id} not found")

    link_stmt = select(PartCatalog).where(
        PartCatalog.catalog_id == catalog_id,
        PartCatalog.part_id == part_id,
    )
    if tid is not None:
        link_stmt = link_stmt.where(PartCatalog.tenantId == tid)
    existing = await db.execute(link_stmt)
    link = existing.scalar_one_or_none()
    if link:
        return link, False

    link = PartCatalog(catalog_id=catalog_id, part_id=part_id, tenantId=tenant_id)
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link, True


async def remove_part_from_catalog(db: AsyncSession, catalog_id: int, part_id: int) -> None:
    await get_catalog(db, catalog_id)  # 404 if missing (tenant-scoped)
    tid = get_tenant_id()
    stmt = select(PartCatalog).where(
        PartCatalog.catalog_id == catalog_id,
        PartCatalog.part_id == part_id,
    )
    if tid is not None:
        stmt = stmt.where(PartCatalog.tenantId == tid)
    existing = await db.execute(stmt)
    link = existing.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Part is not linked to this catalog")
    await db.delete(link)
    await db.commit()


async def list_parts_in_catalog(db: AsyncSession, catalog_id: int, page: PageParams):
    await get_catalog(db, catalog_id)  # 404 if missing (tenant-scoped)
    tid = get_tenant_id()

    query = (
        select(Part, PartCatalog.id.label("linkId"))
        .join(PartCatalog, PartCatalog.part_id == Part.id)
        .where(PartCatalog.catalog_id == catalog_id)
        .order_by(Part.id)
    )
    count_query = select(PartCatalog).where(PartCatalog.catalog_id == catalog_id)
    if tid is not None:
        # Explicit filter: the auto tenant SELECT-filter listener only
        # patches single-entity ORM selects and no-ops on this Part/PartCatalog
        # join, so both sides must be filtered here by hand.
        query = query.where(Part.tenantId == tid, PartCatalog.tenantId == tid)
        count_query = count_query.where(PartCatalog.tenantId == tid)

    offset = (page.page - 1) * page.per_page
    count_result = await db.execute(count_query)
    total = len(count_result.scalars().all())

    result = await db.execute(query.offset(offset).limit(page.per_page))
    rows = result.all()

    items = []
    for part, link_id in rows:
        items.append(
            {
                "linkId": link_id,
                "partId": part.id,
                "pn": part.pn,
                "name": part.name,
                "rev": part.rev,
                "category": part.category,
                "status": part.status,
                "cost": float(part.cost) if part.cost is not None else None,
                "vendor": part.vendor,
                "manufacturer": part.manufacturer,
            }
        )

    total_pages = max(1, ceil(total / page.per_page)) if total else 1
    return {
        "items": items,
        "total": total,
        "page": page.page,
        "per_page": page.per_page,
        "total_pages": total_pages,
        "has_next": page.page < total_pages,
        "has_prev": page.page > 1,
    }


# ---------------------------------------------------------------------------
# Create catalog from folder / zip
# ---------------------------------------------------------------------------


def _sanitize_pn(base_name: str, fallback_index: int) -> str:
    cleaned = "".join(c for c in base_name.strip() if c.isalnum() or c in "-_. ").strip()
    cleaned = cleaned.replace(" ", "_")
    return cleaned[:200] if cleaned else f"IMPORTED-PART-{fallback_index}"


def _safe_extract_zip(zip_bytes: bytes, dest_dir: str) -> None:
    """Extract a zip archive to dest_dir, guarding against zip-slip path
    traversal (members whose resolved path escapes dest_dir are skipped).
    """
    os.makedirs(dest_dir, exist_ok=True)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
        tmp.write(zip_bytes)
        tmp_path = tmp.name
    try:
        with zipfile.ZipFile(tmp_path) as zf:
            dest_abs = os.path.abspath(dest_dir)
            for member in zf.infolist():
                member_path = os.path.abspath(os.path.join(dest_dir, member.filename))
                if not (
                    member_path == dest_abs or member_path.startswith(dest_abs + os.sep)
                ):
                    continue  # zip-slip attempt — skip this entry
                if member.is_dir():
                    os.makedirs(member_path, exist_ok=True)
                    continue
                os.makedirs(os.path.dirname(member_path), exist_ok=True)
                with zf.open(member) as src, open(member_path, "wb") as dst:
                    shutil.copyfileobj(src, dst)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def _iter_part_files(root_dir: str):
    for current_root, _dirs, files in os.walk(root_dir):
        for fname in files:
            if fname.lower() in _SKIP_FILENAMES or fname.startswith("."):
                continue
            yield os.path.join(current_root, fname)


async def _extract_cad_metadata(db: AsyncSession, current_user, file_path: str) -> dict:
    """Reuse the existing CAD parsing logic in app.api.endpoints.cad rather
    than re-implementing STEP/IGES/SLDPRT parsing here.
    """
    from app.api.endpoints.cad import CADExtractRequest, cad_extract_attributes

    ext = file_path.rsplit(".", 1)[-1].lower()
    try:
        return await cad_extract_attributes(
            CADExtractRequest(filePath=file_path, fileType=ext.upper()),
            db=db,
            current_user=current_user,
        )
    except Exception:
        # Be robust to missing/corrupt metadata — extraction failure should
        # never abort the whole catalog import.
        return {"error": "extraction_failed"}


async def create_catalog_from_folder(
    db: AsyncSession,
    current_user,
    catalog_code: str,
    catalog_name: str,
    description: Optional[str] = None,
    folder_path: Optional[str] = None,
    zip_bytes: Optional[bytes] = None,
) -> dict:
    if not folder_path and not zip_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either folder_path or an uploaded zip file",
        )

    tenant_id = current_user.tenantId

    existing = await db.execute(
        select(Catalog).where(
            Catalog.catalog_code == catalog_code, Catalog.tenantId == tenant_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Catalog with code {catalog_code} already exists",
        )

    if zip_bytes:
        # Extracted files are kept (not cleaned up) under CATALOG_UPLOAD_ROOT
        # so the Part.cadUrl paths created below stay valid after this request.
        safe_code = "".join(c for c in catalog_code if c.isalnum() or c in "-_") or "catalog"
        source_dir = os.path.join(CATALOG_UPLOAD_ROOT, safe_code)
        counter = 0
        while os.path.exists(source_dir):
            counter += 1
            source_dir = os.path.join(CATALOG_UPLOAD_ROOT, f"{safe_code}_{counter}")
        try:
            _safe_extract_zip(zip_bytes, source_dir)
        except zipfile.BadZipFile as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is not a valid zip"
            ) from exc
    else:
        # A server-side folder_path is an authenticated arbitrary-filesystem
        # enumeration/read primitive: the code os.walk()s it, creates a Part per
        # file storing the absolute server path in Part.cadUrl, and runs CAD
        # attribute extraction against arbitrary files. Exposing that to every
        # require_parts_write caller is unsafe, so it is gated to admins /
        # superusers here — ordinary users must use the bounded zip-upload path
        # (extracted only under CATALOG_UPLOAD_ROOT with zip-slip guarding).
        if not getattr(current_user, "isSuperuser", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Importing from a server-side folder_path requires admin "
                    "privileges; upload a zip archive instead"
                ),
            )
        if not os.path.isdir(folder_path):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Folder not found on server: {folder_path}",
            )
        source_dir = folder_path

    db_catalog = Catalog(
        catalog_code=catalog_code,
        catalog_name=catalog_name,
        description=description,
        tenantId=tenant_id,
    )
    db.add(db_catalog)
    await db.flush()  # obtain catalog.id without committing yet

    parts_created = 0
    parts_reused = 0
    parts_linked = 0
    errors: list[str] = []
    file_index = 0

    for file_path in _iter_part_files(source_dir):
        file_index += 1
        if file_index > MAX_FOLDER_IMPORT_FILES:
            errors.append(
                f"Stopped after {MAX_FOLDER_IMPORT_FILES} files "
                f"(MAX_FOLDER_IMPORT_FILES exceeded) — remaining files were not imported"
            )
            file_index -= 1
            break
        try:
            fname = os.path.basename(file_path)
            base_name, ext = os.path.splitext(fname)
            ext = ext.lstrip(".").lower()
            pn = _sanitize_pn(base_name, file_index)

            existing_part = await db.execute(
                select(Part).where(Part.pn == pn, Part.tenantId == tenant_id)
            )
            db_part = existing_part.scalar_one_or_none()

            if db_part is None:
                part_name = base_name.strip() or pn
                category = None
                cad_url = None

                if ext in CAD_EXTENSIONS:
                    category = "Mechanical"
                    cad_url = file_path
                    metadata = await _extract_cad_metadata(db, current_user, file_path)
                    if not metadata.get("error"):
                        custom_props = metadata.get("customProperties") or {}
                        part_name = (
                            custom_props.get("Name") or custom_props.get("Product") or part_name
                        )

                db_part = Part(
                    pn=pn,
                    name=part_name,
                    category=category,
                    cadUrl=cad_url,
                    status="Draft",
                    tenantId=tenant_id,
                )
                db.add(db_part)
                await db.flush()
                parts_created += 1
            else:
                parts_reused += 1

            link_existing = await db.execute(
                select(PartCatalog).where(
                    PartCatalog.catalog_id == db_catalog.id,
                    PartCatalog.part_id == db_part.id,
                    PartCatalog.tenantId == tenant_id,
                )
            )
            if not link_existing.scalar_one_or_none():
                db.add(
                    PartCatalog(
                        catalog_id=db_catalog.id,
                        part_id=db_part.id,
                        tenantId=tenant_id,
                    )
                )
                parts_linked += 1
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001 — robustness: one bad file shouldn't abort the import
            errors.append(f"{file_path}: {exc}")

    await db.commit()
    await db.refresh(db_catalog)

    return {
        "catalog": db_catalog,
        "filesScanned": file_index,
        "partsCreated": parts_created,
        "partsReused": parts_reused,
        "partsLinked": parts_linked,
        "errors": errors,
    }
