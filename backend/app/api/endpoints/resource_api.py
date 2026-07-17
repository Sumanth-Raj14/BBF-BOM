"""
Resource Scheduling + Labor Tracking API
Work centers, capacity, timesheets, labor costs.
"""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter()


class WorkCenterCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    capacity_per_hour: Optional[float] = None
    cost_per_hour: Optional[float] = None
    available_hours_per_day: float = 8.0
    is_bottleneck: bool = False
    location: Optional[str] = None


class ScheduleCreate(BaseModel):
    work_center_id: int
    work_order_id: Optional[int] = None
    operation_name: Optional[str] = None
    scheduled_date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    planned_hours: Optional[float] = None


class LaborRateCreate(BaseModel):
    employee_id: str
    employee_name: str
    skill_level: Optional[str] = None
    regular_rate: float
    overtime_rate: Optional[float] = None


class TimesheetCreate(BaseModel):
    employee_id: str
    work_order_id: Optional[int] = None
    work_order_operation_id: Optional[int] = None
    work_center_id: Optional[int] = None
    date: str
    hours_worked: float
    is_overtime: bool = False
    activity_type: Optional[str] = None
    description: Optional[str] = None


# ---- Work Centers ----


@router.get("/work-centers")
async def list_work_centers(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    r = await db.execute(text("SELECT * FROM work_centers ORDER BY code"))
    return [dict(row) for row in r.mappings().all()]


@router.post("/work-centers")
async def create_work_center(
    body: WorkCenterCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        text(
            "INSERT INTO work_centers (code, name, description, capacity_per_hour, cost_per_hour, available_hours_per_day, is_bottleneck, location) VALUES (:c, :n, :d, :cp, :ch, :ah, :bn, :loc)"
        ),
        {
            "c": body.code,
            "n": body.name,
            "d": body.description,
            "cp": body.capacity_per_hour,
            "ch": body.cost_per_hour,
            "ah": body.available_hours_per_day,
            "bn": body.is_bottleneck,
            "loc": body.location,
        },
    )
    await db.commit()
    return {"status": "created"}


@router.get("/work-centers/capacity")
async def capacity_overview(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    r = await db.execute(
        text("""
        SELECT wc.id, wc.code, wc.name, wc.description, wc.capacity_per_hour, wc.cost_per_hour,
               wc.available_hours_per_day, wc.is_bottleneck, wc.is_active,
               COALESCE(rs.planned_hours, 0) as planned,
               COALESCE(rs.scheduled_count, 0) as scheduled_count
        FROM work_centers wc
        LEFT JOIN (
            SELECT work_center_id, SUM(planned_hours) as planned_hours, COUNT(*) as scheduled_count
            FROM resource_schedules WHERE status = 'scheduled' AND scheduled_date >= CURRENT_DATE
            GROUP BY work_center_id
        ) rs ON wc.id = rs.work_center_id
        ORDER BY wc.code
    """)
    )
    rows = [dict(row) for row in r.mappings().all()]
    return {"work_centers": rows, "total": len(rows)}


# ---- Resource Schedules ----


@router.get("/schedules")
async def list_schedules(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    r = await db.execute(
        text("SELECT * FROM resource_schedules ORDER BY scheduled_date DESC LIMIT 100")
    )
    return [dict(row) for row in r.mappings().all()]


@router.post("/schedules")
async def create_schedule(
    body: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        text(
            "INSERT INTO resource_schedules (work_center_id, work_order_id, operation_name, scheduled_date, start_time, end_time, planned_hours) VALUES (:wcid, :woid, :on, :sd, :st, :et, :ph)"
        ),
        {
            "wcid": body.work_center_id,
            "woid": body.work_order_id,
            "on": body.operation_name,
            "sd": body.scheduled_date,
            "st": body.start_time,
            "et": body.end_time,
            "ph": body.planned_hours,
        },
    )
    await db.commit()
    return {"status": "created"}


# ---- Labor Rates ----


@router.get("/labor-rates")
async def list_labor_rates(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    r = await db.execute(
        text("SELECT * FROM labor_rates WHERE is_active = true ORDER BY employee_name")
    )
    return [dict(row) for row in r.mappings().all()]


@router.post("/labor-rates")
async def create_labor_rate(
    body: LaborRateCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        text(
            "INSERT INTO labor_rates (employee_id, employee_name, skill_level, regular_rate, overtime_rate) VALUES (:eid, :en, :sl, :rr, :otr)"
        ),
        {
            "eid": body.employee_id,
            "en": body.employee_name,
            "sl": body.skill_level,
            "rr": body.regular_rate,
            "otr": body.overtime_rate,
        },
    )
    await db.commit()
    return {"status": "created"}


# ---- Timesheets ----


@router.get("/timesheets")
async def list_timesheets(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    r = await db.execute(text("SELECT * FROM timesheet_entries ORDER BY date DESC LIMIT 100"))
    return [dict(row) for row in r.mappings().all()]


@router.post("/timesheets")
async def create_timesheet(
    body: TimesheetCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        text(
            "INSERT INTO timesheet_entries (employee_id, work_order_id, work_order_operation_id, work_center_id, date, hours_worked, is_overtime, activity_type, description) VALUES (:eid, :woid, :wooid, :wcid, :d, :hw, :ot, :at, :desc)"
        ),
        {
            "eid": body.employee_id,
            "woid": body.work_order_id,
            "wooid": body.work_order_operation_id,
            "wcid": body.work_center_id,
            "d": body.date,
            "hw": body.hours_worked,
            "ot": body.is_overtime,
            "at": body.activity_type,
            "desc": body.description,
        },
    )
    await db.commit()
    return {"status": "created"}


@router.get("/timesheets/labor-cost")
async def labor_cost_summary(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    r = await db.execute(
        text("""
        SELECT employee_id, employee_name, regular_rate, overtime_rate,
               regular_hours, overtime_hours, regular_cost, overtime_cost
        FROM (
            SELECT te.employee_id, lr.employee_name, lr.regular_rate, lr.overtime_rate,
                   SUM(CASE WHEN te.is_overtime = false THEN te.hours_worked ELSE 0 END) as regular_hours,
                   SUM(CASE WHEN te.is_overtime = true THEN te.hours_worked ELSE 0 END) as overtime_hours,
                   SUM(CASE WHEN te.is_overtime = false THEN te.hours_worked * lr.regular_rate ELSE 0 END) as regular_cost,
                   SUM(CASE WHEN te.is_overtime = true THEN te.hours_worked * lr.overtime_rate ELSE 0 END) as overtime_cost
            FROM timesheet_entries te
            LEFT JOIN labor_rates lr ON te.employee_id = lr.employee_id
            GROUP BY te.employee_id, lr.employee_name, lr.regular_rate, lr.overtime_rate
        ) sub
        ORDER BY (COALESCE(regular_cost, 0) + COALESCE(overtime_cost, 0)) DESC
    """)
    )
    return [dict(row) for row in r.mappings().all()]
