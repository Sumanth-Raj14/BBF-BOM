"""Workspace Budget API — backs the Dashboard's "Workspace Budget" widget.

Annual + per-project budget *targets* are user-editable config, persisted on
the tenant record (Tenant.settings["workspace_budget"]). Spent/committed
figures are never stored — they're computed live from po_headers so the
numbers always reflect real purchase-order activity instead of a fabricated
snapshot. Tenant-scoped like analytics.py / dashboards_api.py.
"""

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.project import Project
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter()


def _tenant_filter_params(current_user: User) -> tuple[str, dict]:
    if current_user.isSuperuser:
        return "TRUE", {}
    tid = current_user.tenantId
    if tid is None:
        return "FALSE", {}
    return '"tenantId" = :tenantId', {"tenantId": tid}


def _period_bounds(period: Optional[str], today: date) -> tuple[date, date]:
    """Map the dashboard's period-selector keys to real calendar ranges.

    Replaces the old fabricated PERIODS scaling multipliers with an actual
    date-bounded query against po_headers.
    """
    year = today.year
    p = (period or "fy").lower()
    if p == "q1":
        return date(year, 1, 1), date(year, 3, 31)
    if p == "q2":
        return date(year, 4, 1), date(year, 6, 30)
    if p == "q3":
        return date(year, 7, 1), date(year, 9, 30)
    if p == "q4":
        return date(year, 10, 1), date(year, 12, 31)
    if p == "last30":
        return today - timedelta(days=30), today
    if p == "last7":
        return today - timedelta(days=7), today
    return date(year, 1, 1), date(year, 12, 31)


class WorkspaceBudgetUpdate(BaseModel):
    annual: float = Field(ge=0)
    byProject: dict[str, float] = Field(default_factory=dict)


async def _compute_workspace_budget(
    period: str, db: AsyncSession, current_user: User
) -> dict:
    today = date.today()
    tf, tf_params = _tenant_filter_params(current_user)
    start, end = _period_bounds(period, today)

    tenant = None
    if current_user.tenantId is not None:
        result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenantId))
        tenant = result.scalar_one_or_none()
    cfg = ((tenant.settings or {}) if tenant else {}).get("workspace_budget") or {}
    annual = float(cfg.get("annual") or 0)
    configured_budgets = {str(k): float(v or 0) for k, v in (cfg.get("byProject") or {}).items()}

    # Real project codes for this tenant — ORM select is auto tenant-filtered
    # (see app/core/tenant_events.py), unlike the raw SQL below.
    projects_result = await db.execute(select(Project))
    project_codes = [p.code for p in projects_result.scalars().all()]

    spend_rows = await db.execute(
        text(f"""
            SELECT COALESCE(project, 'Unassigned') as project,
                   COALESCE(SUM("poTotal") FILTER (WHERE status IN ('received', 'closed')), 0) as spent,
                   COALESCE(SUM("poTotal") FILTER (WHERE status NOT IN ('received', 'closed', 'cancelled', 'Rejected')), 0) as committed
            FROM po_headers
            WHERE {tf} AND "poDate" IS NOT NULL AND "poDate"::date BETWEEN :start AND :end
            GROUP BY COALESCE(project, 'Unassigned')
        """),
        {**tf_params, "start": start, "end": end},
    )
    spend_by_project = {
        row[0]: {"spent": float(row[1] or 0), "committed": float(row[2] or 0)}
        for row in spend_rows.fetchall()
    }

    by_project = {}
    for code in set(project_codes) | set(configured_budgets) | set(spend_by_project):
        agg = spend_by_project.get(code, {"spent": 0.0, "committed": 0.0})
        by_project[code] = {
            "spent": agg["spent"],
            "committed": agg["committed"],
            "budget": configured_budgets.get(code, 0.0),
        }

    spent_total = sum(v["spent"] for v in by_project.values())
    committed_total = sum(v["committed"] for v in by_project.values())

    # Monthly trend is a whole-current-year view, independent of the period
    # selector (matches the dashboard's separate "Monthly Spend" tile).
    monthly_rows = await db.execute(
        text(f"""
            SELECT EXTRACT(MONTH FROM "poDate"::date)::int as month, COALESCE(SUM("poTotal"), 0) as spend
            FROM po_headers
            WHERE {tf} AND "poDate" IS NOT NULL AND EXTRACT(YEAR FROM "poDate"::date) = :year
            GROUP BY EXTRACT(MONTH FROM "poDate"::date)
        """),
        {**tf_params, "year": today.year},
    )
    monthly_by_month = {int(row[0]): float(row[1] or 0) for row in monthly_rows.fetchall()}
    monthly = [round(monthly_by_month.get(m, 0.0) / 1e7, 2) for m in range(1, 13)]

    return {
        "annual": annual,
        "spent": spent_total,
        "committed": committed_total,
        "byProject": by_project,
        "monthly": monthly,
        "period": period,
    }


@router.get("/workspace")
async def get_workspace_budget(
    period: str = Query("fy"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _compute_workspace_budget(period, db, current_user)


@router.put("/workspace")
async def update_workspace_budget(
    payload: WorkspaceBudgetUpdate,
    period: str = Query("fy"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.tenantId is None:
        raise HTTPException(status_code=400, detail="No tenant context for this user")
    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenantId))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")

    settings_ = dict(tenant.settings or {})
    settings_["workspace_budget"] = {
        "annual": payload.annual,
        "byProject": {str(k): float(v) for k, v in payload.byProject.items()},
    }
    tenant.settings = settings_
    await db.commit()

    return await _compute_workspace_budget(period, db, current_user)
