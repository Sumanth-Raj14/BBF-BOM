"""TDD tests for work-order status-action 500s (R7 / D12).

`perform_work_order_action` maps action='hold' -> status='on_hold' and
action='scrap' -> status='scrapped', but the `work_orders` CHECK constraint
(`ck_work_orders_status`) historically only allowed
draft/released/in_progress/completed/closed/cancelled. Committing either
action raised an IntegrityError that surfaced to the client as a raw 500.

These tests exercise the real DB CHECK constraint (not mocked), so they will
fail-for-real on the buggy schema/model and pass once the constraint and
model are reconciled to allow 'on_hold' and 'scrapped'.
"""

import pytest
import pytest_asyncio

from app.models.work_order import WorkOrder


@pytest_asyncio.fixture
async def work_order(db_session, test_tenant, tenant_id):
    wo = WorkOrder(
        wo_number="WO-TEST-0001",
        quantity_ordered=10,
        status="released",
        tenantId=tenant_id,
    )
    db_session.add(wo)
    await db_session.commit()
    await db_session.refresh(wo)
    return wo


@pytest.mark.asyncio
async def test_hold_action_persists_on_hold_status(
    client, auth_headers, work_order, db_session
):
    """action='hold' must succeed (2xx) and persist status='on_hold', not 500."""
    resp = await client.post(
        f"/api/v1/work-orders/{work_order.id}/action",
        headers=auth_headers,
        json={"action": "hold", "comments": "waiting on parts"},
    )
    assert resp.status_code < 500, resp.text
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "on_hold"

    await db_session.refresh(work_order)
    assert work_order.status == "on_hold"


@pytest.mark.asyncio
async def test_scrap_action_persists_scrapped_status(
    client, auth_headers, work_order, db_session
):
    """action='scrap' must succeed (2xx) and persist status='scrapped', not 500."""
    resp = await client.post(
        f"/api/v1/work-orders/{work_order.id}/action",
        headers=auth_headers,
        json={"action": "scrap", "comments": "unrecoverable defect"},
    )
    assert resp.status_code < 500, resp.text
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "scrapped"

    await db_session.refresh(work_order)
    assert work_order.status == "scrapped"
