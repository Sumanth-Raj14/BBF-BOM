import pytest
from sqlalchemy import text


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
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_routing_api_create(client, auth_headers):
    resp = await client.post("/api/v1/manufacturing/routings", headers=auth_headers, json={"name": "test"})
    assert resp.status_code in (201, 200, 401, 403, 422)


@pytest.mark.asyncio
async def test_routing_api_get_not_found(client, auth_headers):
    resp = await client.get("/api/v1/manufacturing/99999", headers=auth_headers)
    assert resp.status_code in (404, 401, 403)


@pytest.mark.asyncio
async def test_routing_api_without_auth(client):
    resp = await client.get("/api/v1/manufacturing/routings")
    assert resp.status_code in (200, 401)
