from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.pagination import PageParams, get_page_params, paginate
from app.core.rbac import require_vendors_write
from app.db.session import get_db
from app.models.part import Part
from app.models.part_vendor import PartVendor
from app.models.user import User
from app.models.vendor import Vendor

router = APIRouter()


class PartVendorBase(BaseModel):
    partId: int
    vendorId: int
    isPreferred: Optional[bool] = False
    isAlternate: Optional[bool] = False
    vendorPn: Optional[str] = None
    vendorCost: Optional[float] = None
    vendorLead: Optional[int] = None
    vendorMoq: Optional[int] = None
    qualityScore: Optional[float] = 5.0
    onTimeRate: Optional[float] = 100.0
    notes: Optional[str] = None


class PartVendorCreate(PartVendorBase):
    pass


class PartVendorUpdate(BaseModel):
    isPreferred: Optional[bool] = None
    isAlternate: Optional[bool] = None
    vendorPn: Optional[str] = None
    vendorCost: Optional[float] = None
    vendorLead: Optional[int] = None
    vendorMoq: Optional[int] = None
    qualityScore: Optional[float] = None
    onTimeRate: Optional[float] = None
    notes: Optional[str] = None


class PartVendorResponse(PartVendorBase):
    id: int
    createdAt: datetime
    updatedAt: Optional[datetime] = None
    # Include vendor details for display
    vendorName: Optional[str] = None
    vendorCountry: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


@router.get("/")
async def get_part_vendors(
    page: PageParams = Depends(get_page_params),
    partId: Optional[int] = None,
    vendorId: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(PartVendor)

    if partId:
        query = query.where(PartVendor.partId == partId)
    if vendorId:
        query = query.where(PartVendor.vendorId == vendorId)

    query = query.order_by(PartVendor.id)
    result = await paginate(db, query, page)

    enriched = []
    for pv in result["items"]:
        vendor_result = await db.execute(select(Vendor).where(Vendor.id == pv.vendorId))
        vendor = vendor_result.scalar_one_or_none()
        enriched.append(
            {
                "id": pv.id,
                "partId": pv.partId,
                "vendorId": pv.vendorId,
                "isPreferred": pv.isPreferred,
                "isAlternate": pv.isAlternate,
                "vendorPn": pv.vendorPn,
                "vendorCost": pv.vendorCost,
                "vendorLead": pv.vendorLead,
                "vendorMoq": pv.vendorMoq,
                "qualityScore": pv.qualityScore,
                "onTimeRate": pv.onTimeRate,
                "notes": pv.notes,
                "createdAt": pv.createdAt,
                "updatedAt": pv.updatedAt,
                "vendorName": vendor.name if vendor else None,
                "vendorCountry": vendor.country if vendor else None,
            }
        )

    result["items"] = enriched
    return result


@router.post("/", response_model=PartVendorResponse, status_code=status.HTTP_201_CREATED)
async def create_part_vendor(
    part_vendor: PartVendorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_vendors_write),
):
    """
    Link a vendor to a part
    """
    # Check if part exists
    part_result = await db.execute(select(Part).where(Part.id == part_vendor.partId))
    if not part_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Part not found")

    # Check if vendor exists
    vendor_result = await db.execute(select(Vendor).where(Vendor.id == part_vendor.vendorId))
    vendor = vendor_result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Check if link already exists
    existing = await db.execute(
        select(PartVendor).where(
            PartVendor.partId == part_vendor.partId,
            PartVendor.vendorId == part_vendor.vendorId,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Vendor already linked to this part")

    # If marking as preferred, unset other preferred vendors for this part
    if part_vendor.isPreferred:
        await db.execute(
            select(PartVendor).where(
                PartVendor.partId == part_vendor.partId, PartVendor.isPreferred
            )
        )
        # Note: In async SQLAlchemy, we need to use update() for bulk updates
        from sqlalchemy import update

        await db.execute(
            update(PartVendor)
            .where(PartVendor.partId == part_vendor.partId, PartVendor.isPreferred)
            .values(isPreferred=False)
        )

    db_part_vendor = PartVendor(**part_vendor.model_dump(), tenantId=current_user.tenantId)
    db.add(db_part_vendor)
    await db.commit()
    await db.refresh(db_part_vendor)

    return {
        "id": db_part_vendor.id,
        "partId": db_part_vendor.partId,
        "vendorId": db_part_vendor.vendorId,
        "isPreferred": db_part_vendor.isPreferred,
        "isAlternate": db_part_vendor.isAlternate,
        "vendorPn": db_part_vendor.vendorPn,
        "vendorCost": db_part_vendor.vendorCost,
        "vendorLead": db_part_vendor.vendorLead,
        "vendorMoq": db_part_vendor.vendorMoq,
        "qualityScore": db_part_vendor.qualityScore,
        "onTimeRate": db_part_vendor.onTimeRate,
        "notes": db_part_vendor.notes,
        "createdAt": db_part_vendor.createdAt,
        "updatedAt": db_part_vendor.updatedAt,
        "vendorName": vendor.name,
        "vendorCountry": vendor.country,
    }


@router.put("/{link_id}", response_model=PartVendorResponse)
async def update_part_vendor(
    link_id: int,
    update_data: PartVendorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_vendors_write),
):
    """
    Update a vendor link (e.g., change preferred status)
    """
    result = await db.execute(select(PartVendor).where(PartVendor.id == link_id))
    db_link = result.scalar_one_or_none()
    if not db_link:
        raise HTTPException(status_code=404, detail="Vendor link not found")

    update_dict = update_data.model_dump(exclude_unset=True)

    # If setting as preferred, unset other preferred vendors for this part
    if update_dict.get("isPreferred"):
        from sqlalchemy import update

        await db.execute(
            update(PartVendor)
            .where(
                PartVendor.partId == db_link.partId,
                PartVendor.id != link_id,
                PartVendor.isPreferred,
            )
            .values(isPreferred=False)
        )

    for field, value in update_dict.items():
        setattr(db_link, field, value)

    await db.commit()
    await db.refresh(db_link)

    # Get vendor details
    vendor_result = await db.execute(select(Vendor).where(Vendor.id == db_link.vendorId))
    vendor = vendor_result.scalar_one_or_none()

    return {
        "id": db_link.id,
        "partId": db_link.partId,
        "vendorId": db_link.vendorId,
        "isPreferred": db_link.isPreferred,
        "isAlternate": db_link.isAlternate,
        "vendorPn": db_link.vendorPn,
        "vendorCost": db_link.vendorCost,
        "vendorLead": db_link.vendorLead,
        "vendorMoq": db_link.vendorMoq,
        "qualityScore": db_link.qualityScore,
        "onTimeRate": db_link.onTimeRate,
        "notes": db_link.notes,
        "createdAt": db_link.createdAt,
        "updatedAt": db_link.updatedAt,
        "vendorName": vendor.name if vendor else None,
        "vendorCountry": vendor.country if vendor else None,
    }


@router.patch("/{link_id}", response_model=PartVendorResponse)
async def patch_part_vendor(
    link_id: int,
    update_data: PartVendorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_vendors_write),
):
    return await update_part_vendor(link_id, update_data, db, current_user)


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_part_vendor(
    link_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_vendors_write),
):
    """
    Remove a vendor link from a part
    """
    result = await db.execute(select(PartVendor).where(PartVendor.id == link_id))
    db_link = result.scalar_one_or_none()
    if not db_link:
        raise HTTPException(status_code=404, detail="Vendor link not found")

    await db.delete(db_link)
    await db.commit()
    return None
