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


async def get_document_versions(db: AsyncSession, document_id: int) -> list[Document]:
    tid = get_tenant_id()
    doc_stmt = select(Document).where(Document.id == document_id)
    if tid is not None:
        doc_stmt = doc_stmt.where(Document.tenantId == tid)
    result = await db.execute(doc_stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")

    query = (
        select(Document)
        .where(Document.originalName == doc.originalName)
        .order_by(Document.version.desc())
    )
    if tid is not None:
        query = query.where(Document.tenantId == tid)
    result = await db.execute(query)
    return result.scalars().all()


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

    if db_doc.filePath and os.path.exists(db_doc.filePath):
        os.remove(db_doc.filePath)

    await db.delete(db_doc)
    await db.commit()
