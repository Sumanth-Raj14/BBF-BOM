"""Unified work queue — "My Work" / "Team Work" across assignable items (WS2).

Aggregates work assigned to the current user or to a team they belong to. Today it
spans WorkOrders and CAPA actions (both carry assignee + status + due date); new
assignable entities can be added here as they gain an ``assigned_team_id``.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.integrations.events import emit_integration_event
from app.models.quality import CapaAction
from app.models.team import TeamMember
from app.models.user import User
from app.models.work_order import WorkOrder

router = APIRouter()


async def _emit_assign(db, user, item_type, item, assignee_email=None, team=None):
    await emit_integration_event(
        db, user.tenantId, item_type, item.id, "assigned",
        {
            "ref": getattr(item, "wo_number", None) or getattr(item, "capa_number", None) or f"{item_type}-{item.id}",
            "status": getattr(item, "status", None),
            "assignee_email": assignee_email,
            "team": team,
        },
    )


class AssignRequest(BaseModel):
    item_type: str  # "work_order" | "capa"
    item_id: int
    assigned_to: Optional[int] = None
    assigned_team_id: Optional[int] = None


_MODELS = {"work_order": WorkOrder, "capa": CapaAction}


async def _my_team_ids(db: AsyncSession, user: User) -> list[int]:
    result = await db.execute(
        select(TeamMember.teamId).where(
            TeamMember.userId == user.id, TeamMember.tenantId == user.tenantId
        )
    )
    return [row[0] for row in result.all()]


def _wo_item(wo: WorkOrder) -> dict:
    return {
        "type": "work_order",
        "id": wo.id,
        "ref": wo.wo_number,
        "title": wo.customer_name or wo.wo_number,
        "status": wo.status,
        "priority": wo.priority,
        "due_date": wo.due_date.isoformat() if wo.due_date else None,
        "assigned_to": wo.assigned_to,
        "assigned_team_id": wo.assigned_team_id,
    }


def _capa_item(c: CapaAction) -> dict:
    return {
        "type": "capa",
        "id": c.id,
        "ref": c.capa_number,
        "title": (c.description or "")[:80],
        "status": c.status,
        "priority": None,
        "due_date": c.due_date.isoformat() if c.due_date else None,
        "assigned_to": c.assigned_to,
        "assigned_team_id": c.assigned_team_id,
    }


@router.get("/my")
async def my_work(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    team_ids = await _my_team_ids(db, user)
    items: list[dict] = []

    wo_conds = [WorkOrder.assigned_to == user.id]
    capa_conds = [CapaAction.assigned_to == user.id]
    if team_ids:
        wo_conds.append(WorkOrder.assigned_team_id.in_(team_ids))
        capa_conds.append(CapaAction.assigned_team_id.in_(team_ids))

    wos = await db.execute(
        select(WorkOrder).where(WorkOrder.tenantId == user.tenantId, or_(*wo_conds))
    )
    items.extend(_wo_item(w) for w in wos.scalars().all())

    capas = await db.execute(
        select(CapaAction).where(CapaAction.tenantId == user.tenantId, or_(*capa_conds))
    )
    items.extend(_capa_item(c) for c in capas.scalars().all())

    return {"count": len(items), "team_ids": team_ids, "items": items}


@router.get("/team/{team_id}")
async def team_work(
    team_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items: list[dict] = []
    wos = await db.execute(
        select(WorkOrder).where(
            WorkOrder.tenantId == user.tenantId, WorkOrder.assigned_team_id == team_id
        )
    )
    items.extend(_wo_item(w) for w in wos.scalars().all())
    capas = await db.execute(
        select(CapaAction).where(
            CapaAction.tenantId == user.tenantId, CapaAction.assigned_team_id == team_id
        )
    )
    items.extend(_capa_item(c) for c in capas.scalars().all())
    return {"team_id": team_id, "count": len(items), "items": items}


@router.post("/assign")
async def assign_work(
    body: AssignRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    model = _MODELS.get(body.item_type)
    if model is None:
        raise HTTPException(status_code=422, detail="item_type must be 'work_order' or 'capa'")

    result = await db.execute(
        select(model).where(model.id == body.item_id, model.tenantId == user.tenantId)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail=f"{body.item_type} #{body.item_id} not found")

    # Explicit nulls unassign.
    item.assigned_to = body.assigned_to
    item.assigned_team_id = body.assigned_team_id

    assignee_email = None
    if body.assigned_to:
        u = await db.get(User, body.assigned_to)
        assignee_email = u.email if u else None
    team_label = None
    if body.assigned_team_id:
        from app.models.team import Team
        t = await db.get(Team, body.assigned_team_id)
        team_label = t.name if t else None
    await _emit_assign(db, user, body.item_type, item, assignee_email, team_label)

    await db.commit()

    return {
        "status": "assigned",
        "item_type": body.item_type,
        "item_id": body.item_id,
        "assigned_to": body.assigned_to,
        "assigned_team_id": body.assigned_team_id,
    }
