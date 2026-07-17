"""
Routing + Process Plans API
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter()


class RoutingCreate(BaseModel):
    name: str
    description: Optional[str] = None
    part_id: Optional[int] = None


class RoutingOpCreate(BaseModel):
    operation_number: int
    operation_name: str
    description: Optional[str] = None
    work_center: Optional[str] = None
    setup_time_min: Optional[int] = None
    run_time_min: Optional[int] = None
    cycle_time_min: Optional[int] = None
    estimated_cost: Optional[float] = None


class ProcessPlanCreate(BaseModel):
    name: str
    description: Optional[str] = None
    part_family: Optional[str] = None
    is_template: bool = False


class ProcessPlanStepCreate(BaseModel):
    step_number: int
    step_name: str
    description: Optional[str] = None
    work_center: Optional[str] = None
    setup_time_min: Optional[int] = None
    run_time_min: Optional[int] = None
    inspection_required: bool = False


@router.get("/routings")
async def list_routings(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.execute(
        text(
            """SELECT rt.*, rt.routing_number as code,
               rt.status = 'active' as is_active,
               COALESCE(op_counts.cnt, 0) as operations_count
            FROM routing_tables rt
            LEFT JOIN (
                SELECT routing_id, COUNT(*) as cnt
                FROM routing_operations GROUP BY routing_id
            ) op_counts ON rt.id = op_counts.routing_id
            ORDER BY rt.id DESC LIMIT :l OFFSET :s"""
        ),
        {"l": limit, "s": skip},
    )
    return [dict(row) for row in r.mappings().all()]


@router.post("/routings")
async def create_routing(
    body: RoutingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count = (await db.execute(text("SELECT COUNT(*) FROM routing_tables"))).scalar() or 0
    num = f"RT-{count + 1:04d}"
    await db.execute(
        text(
            "INSERT INTO routing_tables (routing_number, name, description, part_id, created_by) VALUES (:rn, :n, :d, :p, :u)"
        ),
        {
            "rn": num,
            "n": body.name,
            "d": body.description,
            "p": body.part_id,
            "u": user.id,
        },
    )
    await db.commit()
    return {"routing_number": num, "status": "created"}


@router.get("/routings/{routing_id}")
async def get_routing(
    routing_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    hdr = (
        (await db.execute(text("SELECT * FROM routing_tables WHERE id = :id"), {"id": routing_id}))
        .mappings()
        .first()
    )
    if not hdr:
        raise HTTPException(404, "Routing not found")
    ops = await db.execute(
        text("SELECT * FROM routing_operations WHERE routing_id = :rid ORDER BY operation_number"),
        {"rid": routing_id},
    )
    return {"header": dict(hdr), "operations": [dict(r) for r in ops.mappings().all()]}


@router.post("/routings/{routing_id}/operations")
async def add_routing_operation(
    routing_id: int,
    body: RoutingOpCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        text(
            "INSERT INTO routing_operations (routing_id, operation_number, operation_name, description, work_center, setup_time_min, run_time_min, cycle_time_min, estimated_cost) VALUES (:rid, :on, :name, :d, :wc, :st, :rt, :ct, :ec)"
        ),
        {
            "rid": routing_id,
            "on": body.operation_number,
            "name": body.operation_name,
            "d": body.description,
            "wc": body.work_center,
            "st": body.setup_time_min,
            "rt": body.run_time_min,
            "ct": body.cycle_time_min,
            "ec": body.estimated_cost,
        },
    )
    await db.commit()
    return {"status": "added"}


@router.get("/process-plans")
async def list_process_plans(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.execute(
        text(
            """SELECT pp.*, pp.plan_number as code,
               COALESCE(step_counts.cnt, 0) as steps_count,
               COALESCE(
                   (SELECT SUM(COALESCE(setup_time_min, 0) + COALESCE(run_time_min, 0))
                    FROM process_plan_steps WHERE process_plan_id = pp.id), 0
               ) / 60.0 as estimated_hours
            FROM process_plans pp
            LEFT JOIN (
                SELECT process_plan_id, COUNT(*) as cnt
                FROM process_plan_steps GROUP BY process_plan_id
            ) step_counts ON pp.id = step_counts.process_plan_id
            ORDER BY pp.id DESC LIMIT :l OFFSET :s"""
        ),
        {"l": limit, "s": skip},
    )
    return [dict(row) for row in r.mappings().all()]


@router.post("/process-plans")
async def create_process_plan(
    body: ProcessPlanCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count = (await db.execute(text("SELECT COUNT(*) FROM process_plans"))).scalar() or 0
    num = f"PP-{count + 1:04d}"
    await db.execute(
        text(
            "INSERT INTO process_plans (plan_number, name, description, part_family, is_template, created_by) VALUES (:pn, :n, :d, :pf, :it, :u)"
        ),
        {
            "pn": num,
            "n": body.name,
            "d": body.description,
            "pf": body.part_family,
            "it": body.is_template,
            "u": user.id,
        },
    )
    await db.commit()
    return {"plan_number": num, "status": "created"}


@router.get("/process-plans/{plan_id}")
async def get_process_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    hdr = (
        (await db.execute(text("SELECT * FROM process_plans WHERE id = :id"), {"id": plan_id}))
        .mappings()
        .first()
    )
    if not hdr:
        raise HTTPException(404, "Process plan not found")
    steps = await db.execute(
        text("SELECT * FROM process_plan_steps WHERE process_plan_id = :pid ORDER BY step_number"),
        {"pid": plan_id},
    )
    return {"header": dict(hdr), "steps": [dict(r) for r in steps.mappings().all()]}


@router.post("/process-plans/{plan_id}/steps")
async def add_process_plan_step(
    plan_id: int,
    body: ProcessPlanStepCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        text(
            "INSERT INTO process_plan_steps (process_plan_id, step_number, step_name, description, work_center, setup_time_min, run_time_min, inspection_required) VALUES (:pid, :sn, :name, :d, :wc, :st, :rt, :ir)"
        ),
        {
            "pid": plan_id,
            "sn": body.step_number,
            "name": body.step_name,
            "d": body.description,
            "wc": body.work_center,
            "st": body.setup_time_min,
            "rt": body.run_time_min,
            "ir": body.inspection_required,
        },
    )
    await db.commit()
    return {"status": "added"}
