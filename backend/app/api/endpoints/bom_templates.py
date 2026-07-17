from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_parts_write
from app.db.session import get_db
from app.models.bom_item import BomItem
from app.models.bom_template import BomTemplate
from app.models.user import User

router = APIRouter()


class BomTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    partCount: Optional[int] = 0
    projectCode: Optional[str] = None


class BomTemplateCreate(BomTemplateBase):
    pass


class BomTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    partCount: Optional[int] = None
    projectCode: Optional[str] = None


class BomTemplateResponse(BomTemplateBase):
    id: int
    createdById: int
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


@router.get("/")
async def get_bom_templates(
    page: PageParams = Depends(get_page_params),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(BomTemplate)

    if search:
        query = query.where(
            (BomTemplate.name.ilike(f"%{search}%")) | (BomTemplate.description.ilike(f"%{search}%"))
        )

    query = query.order_by(BomTemplate.id)
    return await paginate(db, query, page)


@router.post("/", response_model=BomTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_bom_template(
    template: BomTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    """
    Create a new BOM template
    """
    db_template = BomTemplate(
        **template.model_dump(), createdById=current_user.id, tenantId=current_user.tenantId
    )
    db.add(db_template)
    await db.commit()
    await db.refresh(db_template)
    return db_template


@router.get("/{template_id}", response_model=BomTemplateResponse)
async def get_bom_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific BOM template by ID
    """
    result = await db.execute(select(BomTemplate).where(BomTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"BOM template with ID {template_id} not found",
        )
    return template


@router.put("/{template_id}", response_model=BomTemplateResponse)
async def update_bom_template(
    template_id: int,
    template_update: BomTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    """
    Update an existing BOM template
    """
    result = await db.execute(select(BomTemplate).where(BomTemplate.id == template_id))
    db_template = result.scalar_one_or_none()
    if not db_template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"BOM template with ID {template_id} not found",
        )

    update_data = template_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_template, field, value)

    await db.commit()
    await db.refresh(db_template)
    return db_template


@router.patch("/{template_id}", response_model=BomTemplateResponse)
async def patch_bom_template(
    template_id: int,
    template_update: BomTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_bom_template(template_id, template_update, db, current_user)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bom_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    """
    Delete a BOM template
    """
    result = await db.execute(select(BomTemplate).where(BomTemplate.id == template_id))
    db_template = result.scalar_one_or_none()
    if not db_template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"BOM template with ID {template_id} not found",
        )

    await db.delete(db_template)
    await db.commit()
    return None


@router.post("/{template_id}/load")
async def load_bom_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Load a BOM template (returns the BOM data for use in the editor)
    """
    result = await db.execute(
        select(BomTemplate)
        .where(BomTemplate.id == template_id)
        .options(selectinload(BomTemplate.items).selectinload(BomItem.part))
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"BOM template with ID {template_id} not found",
        )
    return {
        "bomData": template.bomDataComputed,
        "name": template.name,
        "items": template.bomDataComputed,
    }
