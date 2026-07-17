"""Money columns must be Numeric, not Float, to avoid binary-float rounding drift.

Each test below builds a monetary value the way real code does: via Decimal
arithmetic that is mathematically exact (e.g. 0.1 + 0.2, or three repeated
0.1 adds), persists it, then re-reads it through a *brand-new* session (so
the read hits the database, not the ORM identity map) and asserts the value
comes back byte-for-byte exact as a Decimal. On a Float column, the same
value silently degrades to an IEEE-754 double (e.g. 0.30000000000000004, or
a plain 0.3 double that no longer compares equal to Decimal("0.3")), so
these assertions fail before the Numeric migration and pass after it.
"""

import decimal
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.bom_item import BomItem
from app.models.bom_template import BomTemplate
from app.models.make_vs_buy import MakeVsBuyAnalysis
from app.models.part import Part
from app.models.part_vendor import PartVendor
from app.models.po_models import POHeader, POLineItem
from app.models.should_cost import ShouldCostModel
from app.models.vendor import Vendor


async def _reload(test_engine, model, pk):
    """Fetch `model` by primary key through a fresh session/connection.

    Bypasses the ORM identity map entirely so the assertion reflects what is
    actually stored in the database, not an in-memory Python value.
    """
    session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async with session_factory() as fresh_session:
        result = await fresh_session.execute(select(model).where(model.id == pk))
        return result.scalar_one()


@pytest_asyncio.fixture
async def test_part(db_session, test_tenant, tenant_id):
    part = Part(pn="MP-001", name="Money Precision Part", tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)
    return part


@pytest_asyncio.fixture
async def test_vendor(db_session, test_tenant, tenant_id):
    vendor = Vendor(name="Money Precision Vendor", tenantId=tenant_id)
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)
    return vendor


@pytest.mark.asyncio
async def test_part_cost_exact_decimal_round_trip(db_session, test_engine, test_part, tenant_id):
    """0.1 + 0.2 must round-trip exactly through Part.cost."""
    exact_total = Decimal("0.1") + Decimal("0.2")
    assert exact_total == Decimal("0.3")

    test_part.cost = exact_total
    await db_session.commit()

    reloaded = await _reload(test_engine, Part, test_part.id)
    assert reloaded.cost == exact_total
    assert isinstance(reloaded.cost, decimal.Decimal)


@pytest.mark.asyncio
async def test_part_landed_cost_components_exact(db_session, test_engine, test_part, tenant_id):
    """freight/tax/landedCost must all preserve exact decimal values."""
    test_part.freight = Decimal("1.1") + Decimal("2.2")  # exact Decimal("3.3")
    test_part.tax = Decimal("0.1") + Decimal("0.1") + Decimal("0.1")  # exact Decimal("0.3")
    test_part.landedCost = test_part.freight + test_part.tax  # exact Decimal("3.6")
    await db_session.commit()

    reloaded = await _reload(test_engine, Part, test_part.id)
    assert reloaded.freight == Decimal("3.3")
    assert reloaded.tax == Decimal("0.3")
    assert reloaded.landedCost == Decimal("3.6")


@pytest.mark.asyncio
async def test_bom_item_repeated_add_extended_cost_exact(
    db_session, test_engine, test_part, test_user, tenant_id
):
    """A BOM line's extendedCost, built from a repeated per-unit add, must be exact."""
    template = BomTemplate(name="Money Precision BOM", createdById=test_user.id, tenantId=tenant_id)
    db_session.add(template)
    await db_session.commit()
    await db_session.refresh(template)

    unit_cost = Decimal("0.1")
    # Simulate qty=3 line extension via repeated add rather than qty * unit_cost,
    # matching the "repeated-add total" scenario called out in the task.
    extended = unit_cost + unit_cost + unit_cost  # exact Decimal("0.3")

    item = BomItem(
        bomTemplateId=template.id,
        partId=test_part.id,
        quantity=3,
        unitCostSnapshot=unit_cost,
        extendedCost=extended,
        tenantId=tenant_id,
    )
    db_session.add(item)
    await db_session.commit()

    reloaded = await _reload(test_engine, BomItem, item.id)
    assert reloaded.unitCostSnapshot == Decimal("0.1")
    assert reloaded.extendedCost == Decimal("0.3")


@pytest.mark.asyncio
async def test_po_line_item_repeated_add_total_exact(
    db_session, test_engine, test_part, test_vendor, tenant_id
):
    """PO line item amount/gst/total built from repeated adds must be exact."""
    header = POHeader(
        poNumber="PPREC-001",
        vendorName=test_vendor.name,
        vendor_id=test_vendor.id,
        tenantId=tenant_id,
    )
    db_session.add(header)
    await db_session.commit()
    await db_session.refresh(header)

    item_price = Decimal("0.1") + Decimal("0.2")  # exact Decimal("0.3")
    amount = item_price + item_price + item_price  # exact Decimal("0.9")
    gst = Decimal("0.1")
    total = amount + gst  # exact Decimal("1.0")

    line = POLineItem(
        headerId=header.id,
        itemName="Money Precision Line",
        partId=test_part.id,
        quantity=3,
        itemPrice=item_price,
        amount=amount,
        gst=gst,
        total=total,
        tenantId=tenant_id,
    )
    db_session.add(line)
    await db_session.commit()

    reloaded = await _reload(test_engine, POLineItem, line.id)
    assert reloaded.itemPrice == Decimal("0.3")
    assert reloaded.amount == Decimal("0.9")
    assert reloaded.total == Decimal("1.0")

    header.poTotal = total
    await db_session.commit()
    reloaded_header = await _reload(test_engine, POHeader, header.id)
    assert reloaded_header.poTotal == Decimal("1.0")


@pytest.mark.asyncio
async def test_make_vs_buy_costs_exact(db_session, test_engine, test_part, tenant_id):
    analysis = MakeVsBuyAnalysis(
        partId=test_part.id,
        decision="TBD",
        makeMaterialCost=Decimal("0.1") + Decimal("0.2"),
        makeLaborCost=Decimal("0.1") + Decimal("0.1") + Decimal("0.1"),
        buyUnitPrice=Decimal("10.10") + Decimal("0.01"),
        tenantId=tenant_id,
    )
    db_session.add(analysis)
    await db_session.commit()

    reloaded = await _reload(test_engine, MakeVsBuyAnalysis, analysis.id)
    assert reloaded.makeMaterialCost == Decimal("0.3")
    assert reloaded.makeLaborCost == Decimal("0.3")
    assert reloaded.buyUnitPrice == Decimal("10.11")


@pytest.mark.asyncio
async def test_should_cost_per_unit_exact(db_session, test_engine, test_part, tenant_id):
    model = ShouldCostModel(
        partId=test_part.id,
        rawMaterialCost=Decimal("0.1") + Decimal("0.2"),
        shouldCostPerUnit=Decimal("0.1") + Decimal("0.1") + Decimal("0.1"),
        tenantId=tenant_id,
    )
    db_session.add(model)
    await db_session.commit()

    reloaded = await _reload(test_engine, ShouldCostModel, model.id)
    assert reloaded.rawMaterialCost == Decimal("0.3")
    assert reloaded.shouldCostPerUnit == Decimal("0.3")


@pytest.mark.asyncio
async def test_part_vendor_cost_exact(db_session, test_engine, test_part, test_vendor, tenant_id):
    link = PartVendor(
        partId=test_part.id,
        vendorId=test_vendor.id,
        vendorCost=Decimal("0.1") + Decimal("0.2"),
        tenantId=tenant_id,
    )
    db_session.add(link)
    await db_session.commit()

    reloaded = await _reload(test_engine, PartVendor, link.id)
    assert reloaded.vendorCost == Decimal("0.3")


def test_exactly_one_alembic_head():
    """The migration chain must have exactly one head after the money-precision migration."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config("alembic.ini")
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1, f"Expected exactly one alembic head, found: {heads}"
