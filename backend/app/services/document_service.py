"""Document service layer — business logic for document management."""

import os
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams, paginate
from app.core.tenant_context import get_tenant_id
from app.models.document import Document

FOLDERS = [
    {"path": "/", "label": "All Documents", "icon": "folder", "count": 0},
    {"path": "/Electrical", "label": "Electrical", "icon": "bolt", "count": 0},
    {"path": "/Electrical/Datasheets", "label": "Datasheets", "icon": "doc", "count": 0},
    {"path": "/Electrical/Schematics", "label": "Schematics", "icon": "drawing", "count": 0},
    {"path": "/Electrical/CAD Models", "label": "CAD Models", "icon": "cube", "count": 0},
    {"path": "/Mechanical", "label": "Mechanical", "icon": "gear", "count": 0},
    {"path": "/Mechanical/Drawings", "label": "Drawings", "icon": "drawing", "count": 0},
    {"path": "/Mechanical/CAD", "label": "CAD", "icon": "cube", "count": 0},
    {"path": "/Procurement", "label": "Procurement", "icon": "box", "count": 0},
    {"path": "/Procurement/Quotes", "label": "Quotes", "icon": "money", "count": 0},
    {"path": "/Procurement/POs", "label": "POs", "icon": "list", "count": 0},
    {"path": "/Compliance", "label": "Compliance", "icon": "check", "count": 0},
    {"path": "/Test", "label": "Test Reports", "icon": "chart", "count": 0},
]

CATEGORY_FOLDER_MAP = {
    "Datasheet": "/Electrical/Datasheets",
    "Drawing": "/Mechanical/Drawings",
    "CAD": "/Mechanical/CAD",
    "Quote": "/Procurement/Quotes",
    "Compliance": "/Compliance",
    "Test": "/Test",
}


def format_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"


async def get_folders(db: AsyncSession) -> list[dict]:
    tid = get_tenant_id()
    count_stmt = select(Document.category, sqlfunc.count(Document.id))
    total_stmt = select(sqlfunc.count(Document.id)).select_from(Document)
    if tid is not None:
        count_stmt = count_stmt.where(Document.tenantId == tid)
        total_stmt = total_stmt.where(Document.tenantId == tid)
    count_stmt = count_stmt.group_by(Document.category)
    count_result = await db.execute(count_stmt)
    category_counts = dict(count_result.all())

    total_result = await db.execute(total_stmt)
    total_docs = total_result.scalar() or 0

    folder_counts = {f["path"]: 0 for f in FOLDERS}
    folder_counts["/"] = total_docs

    for cat, count in category_counts.items():
        folder_key = CATEGORY_FOLDER_MAP.get(cat or "Other")
        if folder_key and folder_key in folder_counts:
            folder_counts[folder_key] += count
            parent = "/".join(folder_key.split("/")[:-1])
            while parent:
                if parent in folder_counts:
                    folder_counts[parent] += count
                parent = "/".join(parent.split("/")[:-1])

    return [{**f, "count": folder_counts.get(f["path"], 0)} for f in FOLDERS]


async def list_documents(
    db: AsyncSession,
    page: PageParams,
    category: Optional[str] = None,
    folder: Optional[str] = None,
    search: Optional[str] = None,
    part_id: Optional[int] = None,
    project_id: Optional[int] = None,
):
    query = select(Document).where(Document.isLatest)
    tid = get_tenant_id()
    if tid is not None:
        query = query.where(Document.tenantId == tid)

    if category and category != "All":
        query = query.where(Document.category == category)
    if folder and folder != "/":
        folder_cats = [
            k for k, v in CATEGORY_FOLDER_MAP.items() if v == folder or v.startswith(folder + "/")
        ]
        if folder_cats:
            query = query.where(Document.category.in_(folder_cats))
    if search:
        query = query.where(Document.originalName.ilike(f"%{search}%"))
    if part_id is not None:
        query = query.where(Document.partId == part_id)
    if project_id is not None:
        query = query.where(Document.projectId == project_id)

    query = query.order_by(Document.id)
    return await paginate(db, query, page)


async def get_document(db: AsyncSession, document_id: int) -> Document:
    tid = get_tenant_id()
    stmt = select(Document).where(Document.id == document_id)
    if tid is not None:
        stmt = stmt.where(Document.tenantId == tid)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
    return doc


def _scoped(stmt):
    """Tenant-scope a Document select. The ORM auto-filter covers this too, but
    these queries are also called from services with an explicit tenant."""
    tid = get_tenant_id()
    return stmt if tid is None else stmt.where(Document.tenantId == tid)


async def find_superseded(
    db: AsyncSession,
    *,
    replaces_id: Optional[int],
    original_name: str,
    part_id: Optional[int],
    project_id: Optional[int],
) -> Optional[Document]:
    """The document a new upload supersedes, or None for a first version.

    An explicit replaces_id wins. Otherwise re-uploading the same filename
    against the same part/project is treated as a revision — that is exactly
    the case that used to produce two rows both claiming version 1.
    """
    if replaces_id is not None:
        stmt = _scoped(select(Document).where(Document.id == replaces_id))
        prev = (await db.execute(stmt)).scalar_one_or_none()
        if prev is None:
            raise HTTPException(
                status_code=404, detail=f"Document {replaces_id} not found"
            )
        if not prev.isLatest:
            raise HTTPException(
                status_code=409,
                detail=f"Document {replaces_id} is already superseded",
            )
        return prev

    stmt = _scoped(
        select(Document)
        .where(Document.originalName == original_name)
        .where(Document.partId == part_id)
        .where(Document.projectId == project_id)
        .where(Document.isLatest)
        .order_by(Document.version.desc(), Document.id.desc())
    )
    return (await db.execute(stmt)).scalars().first()


async def get_document_versions(db: AsyncSession, document_id: int) -> list[Document]:
    """Full version chain for a document, newest first.

    Walks replacesDocumentId in both directions rather than grouping by
    originalName — a revision may be uploaded under a different filename, and
    two unrelated files may share one.

    ponytail: one query per hop. Revision chains are short; swap for a
    recursive CTE if a document ever grows hundreds of versions.
    """
    doc = await get_document(db, document_id)

    chain = [doc]
    seen = {doc.id}

    cur = doc
    while cur.replacesDocumentId and cur.replacesDocumentId not in seen:
        stmt = _scoped(select(Document).where(Document.id == cur.replacesDocumentId))
        prev = (await db.execute(stmt)).scalar_one_or_none()
        if prev is None:
            break
        chain.append(prev)
        seen.add(prev.id)
        cur = prev

    cur = doc
    while True:
        stmt = _scoped(
            select(Document)
            .where(Document.replacesDocumentId == cur.id)
            .order_by(Document.id)
        )
        nxt = (await db.execute(stmt)).scalars().first()
        if nxt is None or nxt.id in seen:
            break
        chain.append(nxt)
        seen.add(nxt.id)
        cur = nxt

    chain.sort(key=lambda d: ((d.version or 1), d.id), reverse=True)
    return chain


async def update_document(db: AsyncSession, document_id: int, data: dict) -> Document:
    tid = get_tenant_id()
    stmt = select(Document).where(Document.id == document_id)
    if tid is not None:
        stmt = stmt.where(Document.tenantId == tid)
    result = await db.execute(stmt)
    db_doc = result.scalar_one_or_none()
    if not db_doc:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")

    for field, value in data.items():
        if hasattr(db_doc, field):
            setattr(db_doc, field, value)

    await db.commit()
    await db.refresh(db_doc)
    return db_doc


async def delete_document(db: AsyncSession, document_id: int) -> None:
    tid = get_tenant_id()
    stmt = select(Document).where(Document.id == document_id)
    if tid is not None:
        stmt = stmt.where(Document.tenantId == tid)
    result = await db.execute(stmt)
    db_doc = result.scalar_one_or_none()
    if not db_doc:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")

    # History is not deletable. replacesDocumentId is ON DELETE CASCADE, so
    # removing a superseded row would also take every later revision that
    # points back at it with it.
    if db_doc.isLatest is False:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Document {document_id} is a superseded version and cannot be "
                "deleted; delete the current version instead"
            ),
        )

    # Deleting the current version hands the flag back to its predecessor,
    # otherwise the document disappears from listings entirely.
    predecessor = None
    if db_doc.replacesDocumentId:
        predecessor = (
            await db.execute(
                _scoped(select(Document).where(Document.id == db_doc.replacesDocumentId))
            )
        ).scalar_one_or_none()

    # Storage is content-addressed, so two rows with identical bytes share one
    # file. Only unlink it when nothing else still points at it.
    path = db_doc.filePath
    others = 0
    if path:
        others = (
            await db.execute(
                _scoped(
                    select(sqlfunc.count(Document.id))
                    .where(Document.filePath == path)
                    .where(Document.id != db_doc.id)
                )
            )
        ).scalar() or 0

    if predecessor is not None:
        predecessor.isLatest = True

    await db.delete(db_doc)
    await db.commit()

    if path and others == 0 and os.path.exists(path):
        os.remove(path)
