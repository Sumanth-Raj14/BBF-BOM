import pytest
from sqlalchemy import text

from app.core.security import get_password_hash
from app.models.routing import ProcessPlan
from app.models.tenant import Tenant
from app.models.user import User
from app.tests.conftest import no_tenant_filter


async def _scoped_login(client, db_session, tenant_id, email="scoped@example.com"):
    """Log in as a real, non-superuser, tenant-scoped user.

    auth_headers (conftest's test_user) is a superuser, and
    User.effective_tenant_id returns None for superusers — so requests made
    with auth_headers carry NO tenant context and bypass tenant_sql_clause
    filtering entirely (by design: superusers can see everything). Reads
    that must prove tenant *isolation* need an ordinary scoped user instead.
    """
    user = User(
        email=email,
        username=email.split("@")[0],
        fullName="Scoped User",
        hashedPassword=get_password_hash("testpass123"),
        isActive=True,
        isSuperuser=False,
        tenantId=tenant_id,
    )
    db_session.add(user)
    await db_session.commit()
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "testpass123"},
    )
    token = resp.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    csrf_cookie = client.cookies.get("csrf_token")
    if csrf_cookie:
        headers["X-CSRF-Token"] = csrf_cookie.split(".")[0]
    return headers


@pytest.mark.asyncio
async def test_raw_inserts_set_tenant_id(client, auth_headers, db_session, tenant_id):
    """tenant-insert-valuation: routing_api.py's raw text() INSERTs must stamp
    tenantId explicitly (the ORM before_insert listener does not run for raw
    SQL), otherwise the rows are NULL-tenant and invisible to tenant-scoped
    reads."""
    r = await client.post(
        "/api/v1/manufacturing/routings", headers=auth_headers, json={"name": "R1"}
    )
    assert r.status_code == 200
    routing_row = (
        (await db_session.execute(text('SELECT id, "tenantId" FROM routing_tables')))
        .mappings()
        .first()
    )
    assert routing_row["tenantId"] == tenant_id
    routing_id = routing_row["id"]

    op = await client.post(
        f"/api/v1/manufacturing/routings/{routing_id}/operations",
        headers=auth_headers,
        json={"operation_number": 1, "operation_name": "Cut"},
    )
    assert op.status_code == 200
    op_row = (
        (await db_session.execute(text('SELECT "tenantId" FROM routing_operations')))
        .mappings()
        .first()
    )
    assert op_row["tenantId"] == tenant_id

    pp = await client.post(
        "/api/v1/manufacturing/process-plans", headers=auth_headers, json={"name": "PP1"}
    )
    assert pp.status_code == 200
    pp_row = (
        (await db_session.execute(text('SELECT id, "tenantId" FROM process_plans')))
        .mappings()
        .first()
    )
    assert pp_row["tenantId"] == tenant_id
    plan_id = pp_row["id"]

    step = await client.post(
        f"/api/v1/manufacturing/process-plans/{plan_id}/steps",
        headers=auth_headers,
        json={"step_number": 1, "step_name": "Drill"},
    )
    assert step.status_code == 200
    step_row = (
        (await db_session.execute(text('SELECT "tenantId" FROM process_plan_steps')))
        .mappings()
        .first()
    )
    assert step_row["tenantId"] == tenant_id


@pytest.mark.asyncio
async def test_routing_api_list(client, auth_headers):
    resp = await client.get("/api/v1/manufacturing/routings", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_routing_api_create(client, auth_headers):
    resp = await client.post("/api/v1/manufacturing/routings", headers=auth_headers, json={"name": "test"})
    assert resp.status_code in (200, 201, 422)


@pytest.mark.asyncio
async def test_routing_api_get_not_found(client, auth_headers):
    resp = await client.get("/api/v1/manufacturing/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_routing_api_without_auth(client):
    resp = await client.get("/api/v1/manufacturing/routings")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_process_plans_list_scoped_to_tenant(client, db_session, test_tenant, tenant_id):
    """tenant-security: list_process_plans' raw text() read had no tenantId
    predicate — a tenant could see every other tenant's process plans."""
    other = Tenant(id=tenant_id + 1, tenant_name="Other Tenant", tenant_code="OTHER")
    db_session.add(other)
    await db_session.commit()

    mine = ProcessPlan(plan_number="PP-MINE-0001", name="Mine", tenantId=test_tenant.id)
    theirs = ProcessPlan(plan_number="PP-THEIRS-0001", name="Theirs", tenantId=other.id)
    db_session.add_all([mine, theirs])
    await db_session.commit()

    headers = await _scoped_login(client, db_session, tenant_id)
    resp = await client.get("/api/v1/manufacturing/process-plans", headers=headers)
    assert resp.status_code == 200, resp.text
    names = {row["name"] for row in resp.json()}
    assert "Mine" in names
    assert "Theirs" not in names


@pytest.mark.asyncio
async def test_process_plan_get_scoped_to_tenant(client, db_session, test_tenant, tenant_id):
    """tenant-security: get_process_plan's raw text() read had no tenantId
    predicate — a tenant could fetch another tenant's process plan by id."""
    other = Tenant(id=tenant_id + 1, tenant_name="Other Tenant", tenant_code="OTHER")
    db_session.add(other)
    await db_session.commit()

    theirs = ProcessPlan(plan_number="PP-THEIRS-0002", name="Theirs", tenantId=other.id)
    db_session.add(theirs)
    await db_session.commit()
    # refresh() issues a SELECT, which the ORM-level tenant-isolation listener
    # auto-filters to the ambient (tenant 1) context — bypass it here since
    # this is test setup for tenant 2's own row, not tenant 1 reading it.
    with no_tenant_filter():
        await db_session.refresh(theirs)
    theirs_id = theirs.id

    headers = await _scoped_login(client, db_session, tenant_id)
    resp = await client.get(f"/api/v1/manufacturing/process-plans/{theirs_id}", headers=headers)
    assert resp.status_code == 404, resp.text
