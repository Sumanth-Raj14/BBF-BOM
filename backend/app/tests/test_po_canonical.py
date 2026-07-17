"""TDD for dropping the deprecated PurchaseOrder model (Track A: backend-core).

Per DECISIONS.md, POHeader/POLineItem (app.models.po_models) are the canonical
purchase-order tables. The legacy `PurchaseOrder` ORM model (app.models.procurement,
table `purchase_orders`) is deprecated, has column drift vs. the canonical tables,
and has no runtime callers left (the /procurement API + procurement_service already
operate exclusively on POHeader/POLineItem). This test file asserts:

1. The legacy PurchaseOrder symbol/module is gone.
2. POHeader/POLineItem CRUD (via procurement_service, the real runtime path) still
   works end-to-end.
3. That CRUD remains tenant-scoped (relies on the global tenant_events ORM listener
   applied to every TenantAwareMixin subclass, same mechanism proven for BOMItem
   in test_bom_instance_crud.py).
"""

import importlib

import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContext
from app.models.part import Part
from app.models.po_models import POHeader, POLineItem
from app.models.tenant import Tenant
from app.models.vendor import Vendor
from app.services import procurement_service


def test_legacy_purchase_order_model_is_gone():
    """The deprecated PurchaseOrder ORM model (and its module) must no longer exist."""
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("app.models.procurement")

    import app.models as models_pkg

    assert not hasattr(models_pkg, "PurchaseOrder")


async def _make_part(db_session, tenant_id, pn):
    part = Part(pn=pn, name="PO Canonical Part", category="Electrical", cost=1.0, tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)
    return part


async def _make_vendor(db_session, tenant_id, name):
    vendor = Vendor(name=name, country="US", tenantId=tenant_id)
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)
    return vendor


@pytest.mark.asyncio
async def test_po_header_line_item_crud_via_service(db_session, test_tenant):
    """POHeader/POLineItem CRUD through the real runtime path (procurement_service)
    must still work fully — create, read, update, advance status, delete."""
    tid = test_tenant.id
    part = await _make_part(db_session, tid, pn="PN-PO-CANON-001")
    vendor = await _make_vendor(db_session, tid, "PO Canon Vendor")

    created = await procurement_service.create_procurement(
        db_session,
        {"partId": part.id, "vendorId": vendor.id, "qty": 10, "unitCost": 2.5},
        tid,
    )
    assert created["partId"] == part.id
    assert created["vendorId"] == vendor.id
    assert created["qty"] == 10
    po_id = created["id"]

    # Row actually landed in the canonical tables, tagged with the right tenant.
    header = (
        await db_session.execute(select(POHeader).where(POHeader.id == po_id))
    ).scalar_one()
    assert header.tenantId == tid
    line_item = (
        await db_session.execute(
            select(POLineItem).where(POLineItem.headerId == po_id)
        )
    ).scalar_one()
    assert line_item.tenantId == tid
    assert line_item.partId == part.id

    fetched = await procurement_service.get_procurement_order(db_session, po_id)
    assert fetched["id"] == po_id

    updated = await procurement_service.update_procurement(
        db_session, po_id, {"qty": 20, "totalCost": 999}
    )
    assert updated["qty"] == 20

    advanced = await procurement_service.advance_procurement_status(db_session, po_id, None)
    assert advanced["status"] == "RFQ Sent"

    await procurement_service.delete_procurement(db_session, po_id)
    remaining = (
        await db_session.execute(select(POHeader).where(POHeader.id == po_id))
    ).scalar_one_or_none()
    assert remaining is None


@pytest.mark.asyncio
async def test_po_header_is_tenant_scoped(db_session, test_tenant):
    """A POHeader/POLineItem row created for tenant A must carry tenant A's
    tenantId and must not be reachable by a query explicitly scoped to
    tenant B — the same (tenantId, id) scoping contract enforced elsewhere
    in this codebase (e.g. bom_service.get_bom_or_404)."""
    tenant_a_id = test_tenant.id
    tenant_b = Tenant(id=tenant_a_id + 1000, tenant_name="Tenant B", tenant_code="TENB")
    db_session.add(tenant_b)
    await db_session.commit()
    tenant_b_id = tenant_b.id

    token = TenantContext.set(tenant_id=tenant_a_id)
    try:
        part = await _make_part(db_session, tenant_a_id, pn="PN-PO-TENANT-A")
        vendor = await _make_vendor(db_session, tenant_a_id, "Tenant A Vendor")
        created = await procurement_service.create_procurement(
            db_session, {"partId": part.id, "vendorId": vendor.id, "qty": 5}, tenant_a_id
        )
        po_id = created["id"]
    finally:
        TenantContext.reset(token)

    # Scoped to the wrong tenant -> invisible.
    result = await db_session.execute(
        select(POHeader).where(POHeader.id == po_id, POHeader.tenantId == tenant_b_id)
    )
    assert result.scalar_one_or_none() is None
    result = await db_session.execute(
        select(POLineItem).where(
            POLineItem.headerId == po_id, POLineItem.tenantId == tenant_b_id
        )
    )
    assert result.scalar_one_or_none() is None

    # Scoped to the right tenant -> visible, and correctly tagged.
    result = await db_session.execute(
        select(POHeader).where(POHeader.id == po_id, POHeader.tenantId == tenant_a_id)
    )
    header = result.scalar_one()
    assert header.tenantId == tenant_a_id
    result = await db_session.execute(
        select(POLineItem).where(
            POLineItem.headerId == po_id, POLineItem.tenantId == tenant_a_id
        )
    )
    assert result.scalar_one().tenantId == tenant_a_id
