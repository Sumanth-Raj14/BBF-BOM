"""Regression test for the tenant SELECT auto-filter (audit finding A6).

The `do_orm_execute` listener in app/core/tenant_events.py read
`execute_state.mapper_`, which has never existed on ORMExecuteState in
SQLAlchemy 2.x. Every SELECT raised AttributeError, a bare `except
AttributeError: return` swallowed it, and automatic tenant isolation became a
silent no-op — a cross-tenant read leak that no test caught.

These tests fail if the filter ever silently stops applying again.
"""

import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContext
from app.models.part import Part
from app.models.tenant import Tenant


@pytest.mark.asyncio
async def test_select_does_not_leak_other_tenants_rows(db_session, test_tenant, tenant_id):
    """A SELECT under tenant A must never return tenant B's rows."""
    other = Tenant(id=tenant_id + 1, tenant_name="Other Tenant", tenant_code="OTHER")
    db_session.add(other)
    await db_session.commit()

    # One part per tenant. tenantId is set explicitly so this test exercises the
    # SELECT filter, not the INSERT auto-population listener.
    db_session.add(Part(pn="PN-MINE", name="Mine", category="Electrical", tenantId=test_tenant.id))
    db_session.add(Part(pn="PN-THEIRS", name="Theirs", category="Electrical", tenantId=other.id))
    await db_session.commit()
    db_session.expunge_all()

    # Deliberately unfiltered query: the listener must scope it to the tenant.
    pns = (await db_session.execute(select(Part.pn))).scalars().all()

    assert "PN-MINE" in pns
    assert "PN-THEIRS" not in pns, f"cross-tenant leak: {pns}"


@pytest.mark.asyncio
async def test_select_filter_follows_the_active_tenant(db_session, test_tenant, tenant_id):
    """Switching tenant context switches which rows are visible."""
    other = Tenant(id=tenant_id + 1, tenant_name="Other Tenant", tenant_code="OTHER")
    db_session.add(other)
    await db_session.commit()

    db_session.add(Part(pn="PN-MINE", name="Mine", category="Electrical", tenantId=test_tenant.id))
    db_session.add(Part(pn="PN-THEIRS", name="Theirs", category="Electrical", tenantId=other.id))
    await db_session.commit()
    db_session.expunge_all()

    token = TenantContext.set(other.id)
    try:
        pns = (await db_session.execute(select(Part.pn))).scalars().all()
    finally:
        TenantContext.reset(token)

    assert "PN-THEIRS" in pns
    assert "PN-MINE" not in pns, f"cross-tenant leak: {pns}"


def test_listener_uses_a_real_ormexecutestate_attribute():
    """Guards the exact bug: the attribute the listener reads must exist.

    `mapper_` silently disabled isolation for every SELECT; this pins the
    contract so a future SQLAlchemy rename fails here instead of in production.
    """
    from sqlalchemy.orm import ORMExecuteState

    assert hasattr(ORMExecuteState, "bind_mapper")
    assert not hasattr(ORMExecuteState, "mapper_")
