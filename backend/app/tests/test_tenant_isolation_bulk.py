"""Regression tests for the tenant-security cluster (bulk-Core delete + raw
text() SQL bypassing tenant isolation).

app/core/tenant_events.py auto-filters ORM select() and blocks cross-tenant
ORM update/delete at flush, but it does NOT touch raw text() SQL or bulk Core
delete()/update() statements. Those bypassed isolation entirely before this
fix. Each test proves a caller pinned to tenant A cannot delete/read tenant
B's rows through the affected endpoint, and fails against the pre-fix code.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.endpoints.bom_items import BulkDeleteRequest, bulk_delete_bom_items
from app.api.endpoints.compliance_api import get_compliance, list_compliance
from app.models.bom_item import BomItem
from app.models.bom_template import BomTemplate
from app.models.compliance import Compliance
from app.models.part import Part
from app.models.tenant import Tenant
from app.services import part_service
from app.tests.conftest import no_tenant_filter


@pytest.mark.asyncio
async def test_bulk_delete_parts_does_not_delete_other_tenants_rows(
    db_session, test_tenant, tenant_id
):
    """bulk_delete_parts used Core delete(Part).where(Part.id.in_(ids)) with no
    tenantId predicate -- it bypassed the ORM before_flush tenant guard and
    deleted rows regardless of owner. Before the fix this call deletes BOTH
    rows and returns rowcount=2.
    """
    other = Tenant(id=tenant_id + 1, tenant_name="Other Tenant", tenant_code="OTHER")
    db_session.add(other)
    await db_session.commit()

    mine = Part(pn="PN-MINE", name="Mine", category="Electrical", tenantId=test_tenant.id)
    theirs = Part(pn="PN-THEIRS", name="Theirs", category="Electrical", tenantId=other.id)
    db_session.add_all([mine, theirs])
    await db_session.commit()
    mine_id, theirs_id = mine.id, theirs.id
    db_session.expunge_all()

    # setup_tenant_context (autouse) pins the current tenant to test_tenant.id.
    deleted = await part_service.bulk_delete_parts(db_session, [mine_id, theirs_id])

    assert deleted == 1, f"expected only tenant A's row deleted, deleted={deleted}"

    with no_tenant_filter():
        remaining_ids = (await db_session.execute(select(Part.id))).scalars().all()
    assert theirs_id in remaining_ids, "cross-tenant delete: tenant B's part was removed"
    assert mine_id not in remaining_ids


@pytest.mark.asyncio
async def test_bulk_delete_bom_items_does_not_delete_other_tenants_rows(
    db_session, test_tenant, test_user, tenant_id
):
    """bulk_delete_bom_items used Core delete(BomItem).where(BomItem.id.in_(ids))
    with no tenantId predicate. Before the fix this deletes BOTH rows and
    returns deleted=2.
    """
    other = Tenant(id=tenant_id + 1, tenant_name="Other Tenant", tenant_code="OTHER")
    db_session.add(other)
    await db_session.commit()

    part = Part(pn="PN-SHARED", name="Shared Part", tenantId=test_tenant.id)
    db_session.add(part)
    await db_session.commit()

    tmpl_mine = BomTemplate(name="Mine Template", createdById=test_user.id, tenantId=test_tenant.id)
    tmpl_theirs = BomTemplate(name="Their Template", createdById=test_user.id, tenantId=other.id)
    db_session.add_all([tmpl_mine, tmpl_theirs])
    await db_session.commit()

    item_mine = BomItem(bomTemplateId=tmpl_mine.id, partId=part.id, tenantId=test_tenant.id)
    item_theirs = BomItem(bomTemplateId=tmpl_theirs.id, partId=part.id, tenantId=other.id)
    db_session.add_all([item_mine, item_theirs])
    await db_session.commit()
    mine_id, theirs_id = item_mine.id, item_theirs.id
    db_session.expunge_all()

    result = await bulk_delete_bom_items(
        BulkDeleteRequest(ids=[mine_id, theirs_id]), db=db_session, current_user=None
    )

    assert result["deleted"] == 1, f"expected only tenant A's row deleted, got {result}"

    with no_tenant_filter():
        remaining_ids = (await db_session.execute(select(BomItem.id))).scalars().all()
    assert theirs_id in remaining_ids, "cross-tenant delete: tenant B's bom_item was removed"
    assert mine_id not in remaining_ids


@pytest.mark.asyncio
async def test_compliance_raw_sql_does_not_leak_other_tenants_rows(
    db_session, test_tenant, test_user, tenant_id
):
    """list_compliance / get_compliance ran raw text() SQL against the
    `compliance` table with no tenantId predicate. Before the fix, list_compliance
    returns both tenants' standards and get_compliance happily returns another
    tenant's row by id instead of 404.
    """
    other = Tenant(id=tenant_id + 1, tenant_name="Other Tenant", tenant_code="OTHER")
    db_session.add(other)
    await db_session.commit()

    mine = Compliance(name="Mine Standard", tenantId=test_tenant.id)
    theirs = Compliance(name="Their Standard", tenantId=other.id)
    db_session.add_all([mine, theirs])
    await db_session.commit()
    theirs_id = theirs.id
    db_session.expunge_all()

    rows = await list_compliance(db=db_session, user=test_user)
    names = {row["name"] for row in rows}
    assert "Mine Standard" in names
    assert "Their Standard" not in names, f"cross-tenant leak in list_compliance: {names}"

    with pytest.raises(HTTPException) as exc_info:
        await get_compliance(compliance_id=theirs_id, db=db_session, user=test_user)
    assert exc_info.value.status_code == 404
