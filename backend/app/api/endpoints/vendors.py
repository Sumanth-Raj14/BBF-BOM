from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_vendors_write
from app.db.session import get_db
from app.models.user import User
from app.models.vendor import Vendor

router = APIRouter()


class VendorBase(BaseModel):
    name: str
    country: Optional[str] = None
    leadTime: Optional[int] = None
    moq: Optional[int] = None
    terms: Optional[str] = None
    reliabilityRating: Optional[float] = None


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    country: Optional[str] = None
    leadTime: Optional[int] = None
    moq: Optional[int] = None
    terms: Optional[str] = None
    reliabilityRating: Optional[float] = None


class VendorResponse(VendorBase):
    id: int
    createdAt: datetime
    updatedAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


@router.get("/")
async def get_vendors(
    page: PageParams = Depends(get_page_params),
    search: Optional[str] = None,
    country: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.cache import cache_get, cache_set

    cache_key = (
        f"vendors:list:{current_user.tenantId}:{search}:{country}:{page.page}:{page.per_page}"
    )
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    query = select(Vendor)

    if search:
        query = query.where(Vendor.name.ilike(f"%{search}%"))
    if country:
        query = query.where(Vendor.country == country)

    query = query.order_by(Vendor.id)
    result = await paginate(db, query, page)
    await cache_set(cache_key, result, ttl=120)
    return result


@router.post("/", response_model=VendorResponse, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    vendor: VendorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_vendors_write),
):
    """
    Create a new vendor
    """
    db_vendor = Vendor(**vendor.model_dump(), tenantId=current_user.tenantId)
    db.add(db_vendor)
    await db.commit()
    await db.refresh(db_vendor)
    return db_vendor


@router.get("/{vendor_id}", response_model=VendorResponse)
async def get_vendor(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific vendor by ID
    """
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vendor with ID {vendor_id} not found",
        )
    return vendor


@router.put("/{vendor_id}", response_model=VendorResponse)
async def update_vendor(
    vendor_id: int,
    vendor_update: VendorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_vendors_write),
):
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    db_vendor = result.scalar_one_or_none()
    if not db_vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vendor with ID {vendor_id} not found",
        )

    update_data = vendor_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_vendor, field, value)

    await db.commit()
    await db.refresh(db_vendor)
    return db_vendor


@router.patch("/{vendor_id}", response_model=VendorResponse)
async def patch_vendor(
    vendor_id: int,
    vendor_update: VendorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_vendors_write),
):
    return await update_vendor(vendor_id, vendor_update, db, current_user)


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_vendors_write),
):
    """
    Delete a vendor
    """
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    db_vendor = result.scalar_one_or_none()
    if not db_vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vendor with ID {vendor_id} not found",
        )

    await db.delete(db_vendor)
    await db.commit()
    return None


class BulkDeleteRequest(BaseModel):
    ids: list[int]


@router.post("/bulk-delete")
async def bulk_delete_vendors(
    req: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_vendors_write),
):
    result = await db.execute(
        delete(Vendor).where(Vendor.id.in_(req.ids), Vendor.tenantId == current_user.tenantId)
    )
    await db.commit()
    return {"deleted": result.rowcount}
