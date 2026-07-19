"""Lifecycle cascade-clean tests (spec §4.7 / §10-K).

On local hard-delete of a Part/Vendor/PO, the polymorphic ZohoSyncState +
IntegrationExternalLink rows must be removed so a stale mapping can never later
mis-drive a spurious create/update. The mapping tables have no FK to the entity
tables, so this app-layer hook is the only thing that cleans them.
"""

import pytest
from sqlalchemy import select

from app.integrations.zoho_inbound import cascade_clean
from app.models.integration import IntegrationExternalLink
from app.models.part import Part
from app.models.zoho_sync import ZohoSyncState


async def _seed_mapping(db, tid, entity_type, entity_id, external_id):
    db.add(IntegrationExternalLink(
        tenantId=tid, provider="zoho_books", entity_type=entity_type,
        entity_id=entity_id, external_id=external_id))
    db.add(ZohoSyncState(
        tenantId=tid, entity_type=entity_type, entity_id=entity_id,
        external_id=external_id, status="in_sync"))
    await db.commit()


@pytest.mark.asyncio
async def test_cascade_clean_removes_mapping(db_session, test_tenant, tenant_id):
    await _seed_mapping(db_session, tenant_id, "part", 101, "ZI-1")
    # An unrelated mapping that must survive (scoping check).
    await _seed_mapping(db_session, tenant_id, "part", 202, "ZI-2")

    await cascade_clean(db_session, tenant_id, "part", 101)
    await db_session.commit()

    links = (await db_session.execute(select(IntegrationExternalLink).where(
        IntegrationExternalLink.entity_type == "part"))).scalars().all()
    states = (await db_session.execute(select(ZohoSyncState).where(
        ZohoSyncState.entity_type == "part"))).scalars().all()
    assert [l.entity_id for l in links] == [202]
    assert [s.entity_id for s in states] == [202]


@pytest.mark.asyncio
async def test_cascade_clean_is_idempotent_noop(db_session, test_tenant, tenant_id):
    # Nothing mapped -> no error, no rows touched.
    await cascade_clean(db_session, tenant_id, "vendor", 999)
    await db_session.commit()
    rows = (await db_session.execute(select(IntegrationExternalLink))).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_delete_part_endpoint_cascade_cleans(db_session, test_tenant, tenant_id):
    from app.api.endpoints.parts import delete_part
    from types import SimpleNamespace

    part = Part(pn="PN-DEL", name="ToDelete", tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    await _seed_mapping(db_session, tenant_id, "part", part.id, "ZI-DEL")

    await delete_part(part.id, db=db_session,
                      current_user=SimpleNamespace(tenantId=tenant_id))

    assert (await db_session.execute(select(Part).where(Part.id == part.id))).scalar_one_or_none() is None
    assert (await db_session.execute(select(IntegrationExternalLink).where(
        IntegrationExternalLink.entity_id == part.id))).scalar_one_or_none() is None
    assert (await db_session.execute(select(ZohoSyncState).where(
        ZohoSyncState.entity_id == part.id))).scalar_one_or_none() is None
