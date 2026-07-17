"""Business unique keys must be scoped per-tenant, not globally unique.

Part numbers, BOM numbers, PO numbers, ECO numbers, serial numbers, etc. are
business identifiers a *tenant* assigns to its own records. A bare
`unique=True` on these columns means:
  (a) tenant A cannot use "PN-001" if tenant B already used it anywhere in
      the system (leaks the existence/volume of other tenants' data), and
  (b) two independent tenants can never use the same natural numbering
      scheme, which is normal in the real world.

Each pair of tests below asserts the composite (tenantId, <key>) shape:
  - same key value under two DIFFERENT tenants must both persist cleanly.
  - same key value under the SAME tenant must raise IntegrityError.

These fail on current behavior (bare global unique=True) and pass once the
column is converted to unique=False with a composite
UniqueConstraint("tenantId", <key>).
"""

import pytest
import pytest_asyncio
from sqlalchemy.exc import IntegrityError

from app.core.tenant_context import TenantContext
from app.models.bom import BOM
from app.models.eco import EcoHeader
from app.models.part import Part
from app.models.po_models import POHeader
from app.models.tenant import Tenant
from app.models.traceability import SerialNumber


@pytest_asyncio.fixture
async def second_tenant(db_session):
    """A second tenant (id=2) distinct from the session-scoped tenant_id=1 fixture."""
    tenant = Tenant(id=2, tenant_name="Second Tenant", tenant_code="TEST2")
    db_session.add(tenant)
    await db_session.commit()
    return tenant


async def _create_under_tenant(db_session, tid, obj):
    """Add+commit `obj` while the tenant context is switched to `tid`."""
    token = TenantContext.set(tenant_id=tid)
    try:
        db_session.add(obj)
        await db_session.commit()
    finally:
        TenantContext.reset(token)
    return obj


# ---------------------------------------------------------------------------
# Part.pn
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_same_pn_different_tenants_both_persist(
    db_session, test_tenant, second_tenant, tenant_id
):
    await _create_under_tenant(
        db_session, tenant_id, Part(pn="DUP-PN-001", name="Part A", tenantId=tenant_id)
    )
    await _create_under_tenant(
        db_session, second_tenant.id, Part(pn="DUP-PN-001", name="Part B", tenantId=second_tenant.id)
    )

    from sqlalchemy import select

    result = await db_session.execute(select(Part).where(Part.pn == "DUP-PN-001"))
    rows = result.scalars().all()
    assert len(rows) == 2
    assert {r.tenantId for r in rows} == {tenant_id, second_tenant.id}


@pytest.mark.asyncio
async def test_same_pn_same_tenant_violates_constraint(db_session, test_tenant, tenant_id):
    await _create_under_tenant(
        db_session, tenant_id, Part(pn="DUP-PN-002", name="Part A", tenantId=tenant_id)
    )
    db_session.add(Part(pn="DUP-PN-002", name="Part B duplicate", tenantId=tenant_id))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


# ---------------------------------------------------------------------------
# BOM.bom_number
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_same_bom_number_different_tenants_both_persist(
    db_session, test_tenant, second_tenant, tenant_id
):
    await _create_under_tenant(
        db_session, tenant_id, BOM(bom_number="DUP-BOM-001", name="BOM A", tenantId=tenant_id)
    )
    await _create_under_tenant(
        db_session,
        second_tenant.id,
        BOM(bom_number="DUP-BOM-001", name="BOM B", tenantId=second_tenant.id),
    )

    from sqlalchemy import select

    result = await db_session.execute(select(BOM).where(BOM.bom_number == "DUP-BOM-001"))
    rows = result.scalars().all()
    assert len(rows) == 2
    assert {r.tenantId for r in rows} == {tenant_id, second_tenant.id}


@pytest.mark.asyncio
async def test_same_bom_number_same_tenant_violates_constraint(db_session, test_tenant, tenant_id):
    await _create_under_tenant(
        db_session, tenant_id, BOM(bom_number="DUP-BOM-002", name="BOM A", tenantId=tenant_id)
    )
    db_session.add(BOM(bom_number="DUP-BOM-002", name="BOM B duplicate", tenantId=tenant_id))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


# ---------------------------------------------------------------------------
# EcoHeader.eco_number
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_same_eco_number_different_tenants_both_persist(
    db_session, test_tenant, second_tenant, tenant_id
):
    await _create_under_tenant(
        db_session,
        tenant_id,
        EcoHeader(eco_number="DUP-ECO-001", title="ECO A", change_type="design", tenantId=tenant_id),
    )
    await _create_under_tenant(
        db_session,
        second_tenant.id,
        EcoHeader(
            eco_number="DUP-ECO-001",
            title="ECO B",
            change_type="design",
            tenantId=second_tenant.id,
        ),
    )

    from sqlalchemy import select

    result = await db_session.execute(select(EcoHeader).where(EcoHeader.eco_number == "DUP-ECO-001"))
    rows = result.scalars().all()
    assert len(rows) == 2
    assert {r.tenantId for r in rows} == {tenant_id, second_tenant.id}


@pytest.mark.asyncio
async def test_same_eco_number_same_tenant_violates_constraint(db_session, test_tenant, tenant_id):
    await _create_under_tenant(
        db_session,
        tenant_id,
        EcoHeader(eco_number="DUP-ECO-002", title="ECO A", change_type="design", tenantId=tenant_id),
    )
    db_session.add(
        EcoHeader(
            eco_number="DUP-ECO-002", title="ECO B duplicate", change_type="design", tenantId=tenant_id
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


# ---------------------------------------------------------------------------
# POHeader.poNumber
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_same_po_number_different_tenants_both_persist(
    db_session, test_tenant, second_tenant, tenant_id
):
    await _create_under_tenant(
        db_session,
        tenant_id,
        POHeader(poNumber="DUP-PO-001", vendorName="Vendor A", tenantId=tenant_id),
    )
    await _create_under_tenant(
        db_session,
        second_tenant.id,
        POHeader(poNumber="DUP-PO-001", vendorName="Vendor B", tenantId=second_tenant.id),
    )

    from sqlalchemy import select

    result = await db_session.execute(select(POHeader).where(POHeader.poNumber == "DUP-PO-001"))
    rows = result.scalars().all()
    assert len(rows) == 2
    assert {r.tenantId for r in rows} == {tenant_id, second_tenant.id}


@pytest.mark.asyncio
async def test_same_po_number_same_tenant_violates_constraint(db_session, test_tenant, tenant_id):
    await _create_under_tenant(
        db_session,
        tenant_id,
        POHeader(poNumber="DUP-PO-002", vendorName="Vendor A", tenantId=tenant_id),
    )
    db_session.add(POHeader(poNumber="DUP-PO-002", vendorName="Vendor B duplicate", tenantId=tenant_id))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


# ---------------------------------------------------------------------------
# SerialNumber.serialNumber
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_same_serial_number_different_tenants_both_persist(
    db_session, test_tenant, second_tenant, tenant_id
):
    part_a = await _create_under_tenant(
        db_session, tenant_id, Part(pn="SN-PART-A", name="Part A", tenantId=tenant_id)
    )
    part_b = await _create_under_tenant(
        db_session, second_tenant.id, Part(pn="SN-PART-B", name="Part B", tenantId=second_tenant.id)
    )
    await _create_under_tenant(
        db_session,
        tenant_id,
        SerialNumber(serialNumber="DUP-SN-001", partId=part_a.id, tenantId=tenant_id),
    )
    await _create_under_tenant(
        db_session,
        second_tenant.id,
        SerialNumber(serialNumber="DUP-SN-001", partId=part_b.id, tenantId=second_tenant.id),
    )

    from sqlalchemy import select

    result = await db_session.execute(
        select(SerialNumber).where(SerialNumber.serialNumber == "DUP-SN-001")
    )
    rows = result.scalars().all()
    assert len(rows) == 2
    assert {r.tenantId for r in rows} == {tenant_id, second_tenant.id}


@pytest.mark.asyncio
async def test_same_serial_number_same_tenant_violates_constraint(
    db_session, test_tenant, tenant_id
):
    part_a = await _create_under_tenant(
        db_session, tenant_id, Part(pn="SN-PART-C", name="Part C", tenantId=tenant_id)
    )
    await _create_under_tenant(
        db_session,
        tenant_id,
        SerialNumber(serialNumber="DUP-SN-002", partId=part_a.id, tenantId=tenant_id),
    )
    db_session.add(SerialNumber(serialNumber="DUP-SN-002", partId=part_a.id, tenantId=tenant_id))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


def test_exactly_one_alembic_head():
    """The migration chain must have exactly one head after the tenant-scoped-key migration."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config("alembic.ini")
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1, f"Expected exactly one alembic head, found: {heads}"
