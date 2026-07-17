"""Part service layer — business logic for part management."""

from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get, cache_set
from app.core.pagination import PageParams, paginate
from app.models.part import Part


async def list_parts(
    db: AsyncSession,
    page: PageParams,
    tenant_id: int,
    search: Optional[str] = None,
    category: Optional[str] = None,
    vendor: Optional[str] = None,
    manufacturer: Optional[str] = None,
    status: Optional[str] = None,
):
    cache_key = f"parts:list:{tenant_id}:{search}:{category}:{vendor}:{manufacturer}:{status}:{page.page}:{page.per_page}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    query = select(Part)
    if search:
        query = query.where(
            or_(
                Part.name.ilike(f"%{search}%"),
                Part.pn.ilike(f"%{search}%"),
                Part.mpn.ilike(f"%{search}%"),
            )
        )
    if category:
        query = query.where(Part.category == category)
    if vendor:
        query = query.where(Part.vendor == vendor)
    if manufacturer:
        query = query.where(Part.manufacturer == manufacturer)
    if status:
        query = query.where(Part.status == status)

    query = query.order_by(Part.id)
    result = await paginate(db, query, page)
    await cache_set(cache_key, result, ttl=120)
    return result


async def get_part(db: AsyncSession, part_id: int) -> Part:
    result = await db.execute(select(Part).where(Part.id == part_id))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with ID {part_id} not found",
        )
    return part


async def create_part(db: AsyncSession, data: dict, tenant_id: int) -> Part:
    result = await db.execute(select(Part).where(Part.pn == data.get("pn")))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Part with PN {data.get('pn')} already exists",
        )
    create_data = {
        k: v
        for k, v in data.items()
        if hasattr(Part, k) and k not in ("tags", "compliance", "countryHistory", "vendorPrices")
    }
    db_part = Part(**create_data, tenantId=tenant_id)
    db.add(db_part)
    await db.commit()
    await db.refresh(db_part)
    return db_part


async def update_part(db: AsyncSession, part_id: int, data: dict) -> Part:
    result = await db.execute(select(Part).where(Part.id == part_id))
    db_part = result.scalar_one_or_none()
    if not db_part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with ID {part_id} not found",
        )
    for field, value in data.items():
        if hasattr(db_part, field):
            setattr(db_part, field, value)
    await db.commit()
    await db.refresh(db_part)
    return db_part


async def delete_part(db: AsyncSession, part_id: int) -> None:
    result = await db.execute(select(Part).where(Part.id == part_id))
    db_part = result.scalar_one_or_none()
    if not db_part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with ID {part_id} not found",
        )
    await db.delete(db_part)
    await db.commit()


async def bulk_delete_parts(db: AsyncSession, part_ids: list[int]) -> int:
    from sqlalchemy import delete

    result = await db.execute(delete(Part).where(Part.id.in_(part_ids)))
    await db.commit()
    return result.rowcount


async def check_duplicates(
    db: AsyncSession,
    pn: Optional[str] = None,
    mpn: Optional[str] = None,
    name: Optional[str] = None,
    vendor: Optional[str] = None,
) -> list[dict]:
    results = []
    seen_ids = set()

    if pn:
        r = await db.execute(select(Part).where(Part.pn == pn))
        for p in r.scalars().all():
            if p.id not in seen_ids:
                results.append(
                    {
                        "partId": p.id,
                        "pn": p.pn,
                        "name": p.name,
                        "matchType": "pn_exact",
                        "matchScore": 1.0,
                    }
                )
                seen_ids.add(p.id)

    if mpn:
        r = await db.execute(select(Part).where(Part.mpn == mpn))
        for p in r.scalars().all():
            if p.id not in seen_ids:
                results.append(
                    {
                        "partId": p.id,
                        "pn": p.pn,
                        "name": p.name,
                        "matchType": "mpn_exact",
                        "matchScore": 0.9,
                    }
                )
                seen_ids.add(p.id)

    if name and len(name) >= 3:
        r = await db.execute(select(Part).where(Part.name.ilike(f"%{name}%")))
        for p in r.scalars().all():
            if p.id not in seen_ids:
                results.append(
                    {
                        "partId": p.id,
                        "pn": p.pn,
                        "name": p.name,
                        "matchType": "name_fuzzy",
                        "matchScore": 0.6,
                    }
                )
                seen_ids.add(p.id)

    return results
