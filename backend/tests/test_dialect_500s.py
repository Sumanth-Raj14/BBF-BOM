"""Regression test for the four SQLite 500s from the w5 browser sweep:
analytics/dashboard, budgets/workspace, dashboards/executive,
order-tracking/stats. All four raised sqlalchemy.exc.OperationalError from
Postgres-only SQL (TO_CHAR/::cast/EXTRACT/NOW()::text) that SQLite can't
parse. Asserts they now return 200 with sane, non-fabricated numbers.
"""

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.po_models import POHeader
from app.models.tenant import Tenant
from app.models.user import User
from app.services.auth_service import make_tokens
from app.core.security import get_password_hash


@pytest.fixture
async def seeded_user(client: AsyncClient, db_session: AsyncSession) -> tuple[str, int]:
    # Insert the user/tenant directly rather than going through
    # POST /auth/register: that endpoint is rate-limited to 3/hour and this
    # fixture runs once per test in this module, which would exhaust it.
    tenant = Tenant(tenant_name="Dialect500 Org", tenant_code="dialect500_org")
    db_session.add(tenant)
    await db_session.flush()
    user = User(
        email="dialect500@example.com",
        username="dialect500",
        hashedPassword=get_password_hash("ValidPass123!"),
        tenantId=tenant.id,
        isSuperuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    token = make_tokens(user)["access_token"]
    tenant_id = tenant.id

    this_year = date.today().year
    db_session.add_all(
        [
            POHeader(
                poNumber="PO-1",
                poDate=f"{this_year}-01-15",
                vendorName="Acme",
                project="ProjA",
                poTotal=1000,
                status="received",
                tenantId=tenant_id,
            ),
            POHeader(
                poNumber="PO-2",
                poDate=f"{this_year}-02-20",
                vendorName="Acme",
                project="ProjA",
                poTotal=500,
                status="submitted",
                tenantId=tenant_id,
            ),
        ]
    )
    await db_session.commit()
    return token, tenant_id


@pytest.mark.anyio
async def test_analytics_dashboard_no_500(client: AsyncClient, seeded_user):
    token, _ = seeded_user
    resp = await client.get(
        "/api/v1/analytics/dashboard", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["totalPOs"] == 2
    months = {m["month"] for m in data["monthlySpend"]}
    this_year = date.today().year
    assert f"{this_year}-01" in months
    assert f"{this_year}-02" in months


@pytest.mark.anyio
async def test_budgets_workspace_no_500(client: AsyncClient, seeded_user):
    token, _ = seeded_user
    resp = await client.get(
        "/api/v1/budgets/workspace?period=fy", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["byProject"]["ProjA"]["spent"] == 1000.0
    assert data["byProject"]["ProjA"]["committed"] == 500.0
    assert len(data["monthly"]) == 12


@pytest.mark.anyio
async def test_dashboards_executive_no_500(client: AsyncClient, seeded_user):
    token, _ = seeded_user
    resp = await client.get(
        "/api/v1/dashboards/executive", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["kpis"]["total_pos"] == 2
    this_year = date.today().year
    months = {m["month"] for m in data["monthly_spend"]}
    assert f"{this_year}-01" in months


@pytest.mark.anyio
async def test_order_tracking_stats_no_500(client: AsyncClient, seeded_user):
    token, _ = seeded_user
    resp = await client.get(
        "/api/v1/order-tracking/stats", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["totalTracked"] == 0
    assert data["overdue"] == 0
