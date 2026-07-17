from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter()


class CalendarEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    event_type: str = "general"
    start_time: str
    end_time: Optional[str] = None
    all_day: bool = False
    color: Optional[str] = None
    related_resource_type: Optional[str] = None
    related_resource_id: Optional[int] = None
    is_completed: bool = False


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    event_type: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    all_day: Optional[bool] = None
    color: Optional[str] = None
    related_resource_type: Optional[str] = None
    related_resource_id: Optional[int] = None
    is_completed: Optional[bool] = None


class CalendarEventResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    event_type: str
    start_time: str
    end_time: Optional[str]
    all_day: bool
    color: Optional[str]
    related_resource_type: Optional[str]
    related_resource_id: Optional[int]
    is_completed: bool
    created_at: Optional[str]
    updated_at: Optional[str]


@router.get("/calendar-events", response_model=list[CalendarEventResponse])
async def list_events(
    start_date: Optional[str] = Query(None, description="Filter events after ISO date"),
    end_date: Optional[str] = Query(None, description="Filter events before ISO date"),
    event_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    clauses = ["user_id = :uid"]
    params = {"uid": current_user.id}
    if start_date:
        clauses.append("start_time >= :start_date")
        params["start_date"] = start_date
    if end_date:
        clauses.append("end_time <= :end_date")
        params["end_date"] = end_date
    if event_type:
        clauses.append("event_type = :event_type")
        params["event_type"] = event_type
    where = " AND ".join(clauses)
    result = await db.execute(
        text(f"SELECT * FROM calendar_events WHERE {where} ORDER BY start_time ASC"),
        params,
    )
    rows = result.fetchall()
    return [_row_to_event(r) for r in rows]


@router.post("/calendar-events", response_model=CalendarEventResponse, status_code=201)
async def create_event(
    entry: CalendarEventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text("""
            INSERT INTO calendar_events
                (user_id, title, description, event_type, start_time, end_time,
                 all_day, color, related_resource_type, related_resource_id, is_completed)
            VALUES
                (:uid, :title, :desc, :etype, :start, :end,
                 :allday, :color, :restype, :resid, :done)
            RETURNING *
        """),
        {
            "uid": current_user.id,
            "title": entry.title,
            "desc": entry.description,
            "etype": entry.event_type,
            "start": entry.start_time,
            "end": entry.end_time,
            "allday": entry.all_day,
            "color": entry.color,
            "restype": entry.related_resource_type,
            "resid": entry.related_resource_id,
            "done": entry.is_completed,
        },
    )
    await db.commit()
    row = result.first()
    return _row_to_event(row)


@router.put("/calendar-events/{event_id}", response_model=CalendarEventResponse)
async def update_event(
    event_id: int,
    entry: CalendarEventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sets = []
    params = {"uid": current_user.id, "id": event_id}
    for field, col in [
        ("title", "title"),
        ("description", "description"),
        ("event_type", "event_type"),
        ("start_time", "start_time"),
        ("end_time", "end_time"),
        ("all_day", "all_day"),
        ("color", "color"),
        ("related_resource_type", "related_resource_type"),
        ("related_resource_id", "related_resource_id"),
        ("is_completed", "is_completed"),
    ]:
        val = getattr(entry, field, None)
        if val is not None:
            sets.append(f"{col} = :{field}")
            params[field] = val
    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")
    sets.append("updated_at = CURRENT_TIMESTAMP")
    set_clause = ", ".join(sets)
    result = await db.execute(
        text(
            f"UPDATE calendar_events SET {set_clause} WHERE id = :id AND user_id = :uid RETURNING *"
        ),
        params,
    )
    await db.commit()
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    return _row_to_event(row)


@router.delete("/calendar-events/{event_id}")
async def delete_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text("DELETE FROM calendar_events WHERE id = :id AND user_id = :uid RETURNING id"),
        {"id": event_id, "uid": current_user.id},
    )
    await db.commit()
    if not result.first():
        raise HTTPException(status_code=404, detail="Event not found")
    return {"deleted": True}


def _row_to_event(row) -> CalendarEventResponse:
    return CalendarEventResponse(
        id=row.id,
        title=row.title,
        description=row.description,
        event_type=row.event_type,
        start_time=row.start_time.isoformat()
        if hasattr(row.start_time, "isoformat")
        else str(row.start_time),
        end_time=row.end_time.isoformat()
        if row.end_time and hasattr(row.end_time, "isoformat")
        else str(row.end_time)
        if row.end_time
        else None,
        all_day=row.all_day,
        color=row.color,
        related_resource_type=row.related_resource_type,
        related_resource_id=row.related_resource_id,
        is_completed=row.is_completed,
        created_at=row.created_at.isoformat()
        if hasattr(row.created_at, "isoformat")
        else str(row.created_at),
        updated_at=row.updated_at.isoformat()
        if hasattr(row.updated_at, "isoformat")
        else str(row.updated_at),
    )
