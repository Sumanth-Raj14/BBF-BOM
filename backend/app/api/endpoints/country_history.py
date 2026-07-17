from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.rbac import require_parts_write
from app.db.session import get_db
from app.models.part import Part
from app.models.part_country_history import PartCountryHistory
from app.models.user import User

router = APIRouter()


class CountryHistoryEntry(BaseModel):
    country: str
    date: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None


class CountryHistoryUpdate(BaseModel):
    countryHistory: list


class CountryStats(BaseModel):
    country: str
    partCount: int
    totalValue: float


def _to_country_history_list(records: list[PartCountryHistory]) -> list[dict]:
    return [
        {
            "country": r.country,
            "date": r.date_from.isoformat() if r.date_from else None,
            "reason": r.reason,
            "notes": "",
        }
        for r in records
    ]


@router.get("/parts/{part_id}/country-history")
async def get_country_history(
    part_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Part).where(Part.id == part_id))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    hist_result = await db.execute(
        select(PartCountryHistory)
        .where(PartCountryHistory.part_id == part_id)
        .order_by(PartCountryHistory.id)
    )
    history = hist_result.scalars().all()

    return {
        "partId": part.id,
        "pn": part.pn,
        "currentOrigin": part.origin,
        "countryHistory": _to_country_history_list(history),
    }


@router.post("/parts/{part_id}/country-history")
async def add_country_history(
    part_id: int,
    entry: CountryHistoryEntry,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(Part).where(Part.id == part_id))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    new_entry = PartCountryHistory(
        part_id=part_id,
        country=entry.country,
        date_from=datetime.fromisoformat(entry.date) if entry.date else datetime.now(UTC),
        reason=entry.reason,
        tenantId=current_user.tenantId,
    )
    db.add(new_entry)
    part.origin = entry.country
    await db.commit()

    hist_result = await db.execute(
        select(PartCountryHistory)
        .where(PartCountryHistory.part_id == part_id)
        .order_by(PartCountryHistory.id)
    )
    history = hist_result.scalars().all()

    return {
        "message": "Country history updated",
        "countryHistory": _to_country_history_list(history),
    }


@router.put("/parts/{part_id}/country-history")
async def update_country_history(
    part_id: int,
    data: CountryHistoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(Part).where(Part.id == part_id))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    # Delete existing records and replace with new ones
    existing = await db.execute(
        select(PartCountryHistory).where(PartCountryHistory.part_id == part_id)
    )
    for record in existing.scalars().all():
        await db.delete(record)

    for entry in data.countryHistory:
        new_entry = PartCountryHistory(
            part_id=part_id,
            country=entry.get("country", ""),
            date_from=datetime.fromisoformat(entry["date"]) if entry.get("date") else None,
            reason=entry.get("reason"),
            tenantId=current_user.tenantId,
        )
        db.add(new_entry)

    if data.countryHistory:
        part.origin = data.countryHistory[-1].get("country", part.origin)
    await db.commit()

    hist_result = await db.execute(
        select(PartCountryHistory)
        .where(PartCountryHistory.part_id == part_id)
        .order_by(PartCountryHistory.id)
    )
    history = hist_result.scalars().all()

    return {
        "message": "Country history replaced",
        "countryHistory": _to_country_history_list(history),
    }


@router.patch("/parts/{part_id}/country-history")
async def patch_country_history(
    part_id: int,
    data: CountryHistoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    return await update_country_history(part_id, data, db, current_user)


@router.delete("/parts/{part_id}/country-history/{index}")
async def delete_country_history_entry(
    part_id: int,
    index: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_parts_write),
):
    result = await db.execute(select(Part).where(Part.id == part_id))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    hist_result = await db.execute(
        select(PartCountryHistory)
        .where(PartCountryHistory.part_id == part_id)
        .order_by(PartCountryHistory.id)
    )
    history = hist_result.scalars().all()

    if index < 0 or index >= len(history):
        raise HTTPException(status_code=400, detail="Invalid index")

    await db.delete(history[index])
    await db.commit()

    remaining = await db.execute(
        select(PartCountryHistory)
        .where(PartCountryHistory.part_id == part_id)
        .order_by(PartCountryHistory.id)
    )
    remaining_history = remaining.scalars().all()

    return {
        "message": "Entry deleted",
        "countryHistory": _to_country_history_list(remaining_history),
    }


@router.get("/stats/by-country")
async def get_parts_by_country(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Part))
    parts = result.scalars().all()

    country_stats = {}
    for part in parts:
        country = part.origin or "Unknown"
        if country not in country_stats:
            country_stats[country] = {
                "country": country,
                "partCount": 0,
                "totalValue": 0,
            }
        country_stats[country]["partCount"] += 1
        country_stats[country]["totalValue"] += (part.cost or 0) * (part.qty or 0)

    return sorted(country_stats.values(), key=lambda x: x["partCount"], reverse=True)
