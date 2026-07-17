import pytest
from sqlalchemy import select

from app.integrations.events import emit_integration_event
from app.models.integration import IntegrationConnection, IntegrationOutbox


@pytest.mark.asyncio
async def test_emit_creates_outbox_row_per_enabled_connection(db_session, test_user):
    tid = test_user.tenantId
    db_session.add(IntegrationConnection(tenantId=tid, provider="clickup", is_enabled=True, status="ok"))
    db_session.add(IntegrationConnection(tenantId=tid, provider="cliq", is_enabled=True, status="ok"))
    # NOTE: a disabled connection sharing provider="clickup" for the same tenant would violate
    # the uq_integration_conn_tenant_provider unique constraint (Task 1 model), so we exercise the
    # is_enabled filter with a distinct provider value instead of a literal duplicate.
    db_session.add(IntegrationConnection(tenantId=tid, provider="disabled_other", is_enabled=False, status="ok"))  # disabled connection ignored
    await db_session.commit()

    n = await emit_integration_event(
        db_session, tid, "work_order", 42, "assigned",
        {"ref": "WO-42", "title": "Build", "status": "in_progress", "assignee_email": "a@x.com"},
    )
    await db_session.commit()
    assert n == 2
    rows = (await db_session.execute(select(IntegrationOutbox).where(IntegrationOutbox.entity_id == 42))).scalars().all()
    assert {r.provider for r in rows} == {"clickup", "cliq"}
    assert all(r.status == "pending" for r in rows)


@pytest.mark.asyncio
async def test_emit_noop_when_no_connections(db_session, test_user):
    n = await emit_integration_event(db_session, test_user.tenantId, "capa", 1, "status_change", {"ref": "CAPA-1"})
    assert n == 0
