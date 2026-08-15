"""Cross-tenant leak regression tests for BOM variants.

add_variant_item validated part_id existence with NO tenant filter (unlike
create_bom_item/update_bom_item, which do), so tenant A could attach tenant
B's Part to tenant A's own variant. get_variant then resolved part_id -> Part
with the same missing filter and returned tenant B's real pn/name in the
response. Both call sites now filter by Part.tenantId == tid, matching the
established convention elsewhere in bom_service.py.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.tenant_context import TenantContext
from app.models.bom import BOM
from app.models.bom_variant import BomVariantItem
from app.models.part import Part
from app.models.tenant import Tenant
from app.services import bom_service


async def _commit_as(db_session, tenant_id, *objs):
    for o in objs:
        db_session.add(o)
    token = TenantContext.set(tenant_id=tenant_id)
    try:
        await db_session.commit()
        for o in objs:
            await db_session.refresh(o)
    finally:
        TenantContext.reset(token)


@pytest.fixture(autouse=True)
def _clear_part_cache():
    bom_service._part_cache.clear()
    yield
    bom_service._part_cache.clear()


@pytest.fixture
async def two_tenants(db_session, test_tenant):
    tenant_a_id = test_tenant.id
    tenant_b = Tenant(id=tenant_a_id + 1000, tenant_name="Tenant B", tenant_code="TENB")
    db_session.add(tenant_b)
    await db_session.commit()
    return tenant_a_id, tenant_b.id


@pytest.mark.asyncio
async def test_add_variant_item_rejects_cross_tenant_part(db_session, two_tenants):
    tenant_a_id, tenant_b_id = two_tenants

    part_b = Part(pn="PN-TENANT-B-SECRET", name="Tenant B Confidential Part", cost=0.0)
    await _commit_as(db_session, tenant_b_id, part_b)

    base_bom = BOM(bom_number="BOM-VARIANT-A-001", name="Base BOM")
    await _commit_as(db_session, tenant_a_id, base_bom)

    token = TenantContext.set(tenant_id=tenant_a_id)
    try:
        variant = await bom_service.create_variant(
            db_session, base_bom.id, "Variant A", user_id=None
        )

        # Tenant A tries to attach tenant B's part to its own variant.
        with pytest.raises(HTTPException) as exc_info:
            await bom_service.add_variant_item(
                db_session, variant.id, part_b.id, quantity=1
            )
        assert exc_info.value.status_code == 404

        result = await db_session.execute(
            select(BomVariantItem).where(BomVariantItem.variant_id == variant.id)
        )
        assert result.scalars().first() is None, (
            "Cross-tenant part was attached to the variant despite the 404"
        )
    finally:
        TenantContext.reset(token)


@pytest.mark.asyncio
async def test_get_variant_does_not_leak_foreign_part_details(db_session, two_tenants):
    """Even if a BomVariantItem row somehow points at a foreign-tenant part
    (e.g. pre-existing bad data, or a bug in some other write path), reading
    the variant back must never surface that part's real number/name."""
    tenant_a_id, tenant_b_id = two_tenants

    part_b = Part(pn="PN-TENANT-B-SECRET", name="Tenant B Confidential Part", cost=0.0)
    await _commit_as(db_session, tenant_b_id, part_b)

    base_bom = BOM(bom_number="BOM-VARIANT-A-002", name="Base BOM")
    await _commit_as(db_session, tenant_a_id, base_bom)

    token = TenantContext.set(tenant_id=tenant_a_id)
    try:
        variant = await bom_service.create_variant(
            db_session, base_bom.id, "Variant A", user_id=None
        )
    finally:
        TenantContext.reset(token)

    # Bypass add_variant_item's own guard entirely -- insert the bad row
    # directly, as tenant A, pointing at tenant B's part id.
    bad_item = BomVariantItem(variant_id=variant.id, part_id=part_b.id, quantity=1)
    await _commit_as(db_session, tenant_a_id, bad_item)

    token = TenantContext.set(tenant_id=tenant_a_id)
    try:
        detail = await bom_service.get_variant(db_session, variant.id)
    finally:
        TenantContext.reset(token)

    leaked = [
        item
        for item in detail["items"]
        if item["part_number"] == "PN-TENANT-B-SECRET"
    ]
    assert leaked == [], (
        f"Tenant B's real part number leaked into tenant A's variant read: {detail['items']}"
    )
    # The foreign part_id is still whatever was stored, but it must not
    # resolve to a name/number -- same "not found" treatment as any other
    # part_id that doesn't belong to this tenant.
    item = next(i for i in detail["items"] if i["part_id"] == part_b.id)
    assert item["part_number"] is None
