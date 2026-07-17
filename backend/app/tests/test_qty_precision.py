"""Structural BOM-line quantities must be Numeric(10,4), not Integer, so
fractional quantities (2.5 meters of wire, 0.5 kg of material, etc.) can be
represented at all.

Each test creates a BOM-line-type row with a fractional quantity, persists
it, then re-reads it through a *brand-new* session (so the read hits the
database, not the ORM identity map) and asserts the value round-trips
exactly as Decimal("2.5000"). On an Integer column, binding a Decimal like
2.5 fails outright (the DBAPI has no lossless integer representation for
it) — these assertions fail before the Numeric(10,4) migration and pass
after it.
"""

import decimal
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.bom import BOM, BOMItem
from app.models.bom_item import BomItem
from app.models.bom_template import BomTemplate
from app.models.bom_variant import BomVariant, BomVariantItem
from app.models.part import Part
from app.models.revision import Revision, RevisionBomSnapshotItem


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
    part = Part(pn="QP-001", name="Qty Precision Part", tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)
    return part


@pytest.mark.asyncio
async def test_bom_item_master_quantity_fractional_exact(
    db_session, test_engine, test_part, tenant_id
):
    """BOMItem (bom_items_master), the canonical structural BOM line, must
    persist quantity=2.5 exactly rather than rejecting/truncating it."""
    bom = BOM(bom_number="QPREC-001", name="Qty Precision BOM", tenantId=tenant_id)
    db_session.add(bom)
    await db_session.commit()
    await db_session.refresh(bom)

    item = BOMItem(
        bom_id=bom.id,
        part_id=test_part.id,
        quantity=Decimal("2.5"),
        tenantId=tenant_id,
    )
    db_session.add(item)
    await db_session.commit()

    reloaded = await _reload(test_engine, BOMItem, item.id)
    assert reloaded.quantity == Decimal("2.5000")
    assert isinstance(reloaded.quantity, decimal.Decimal)


@pytest.mark.asyncio
async def test_bom_template_item_quantity_fractional_exact(
    db_session, test_engine, test_part, test_user, tenant_id
):
    """BomItem (normalized bom_items template line) quantity must persist
    2.5 exactly."""
    template = BomTemplate(
        name="Qty Precision Template", createdById=test_user.id, tenantId=tenant_id
    )
    db_session.add(template)
    await db_session.commit()
    await db_session.refresh(template)

    item = BomItem(
        bomTemplateId=template.id,
        partId=test_part.id,
        quantity=Decimal("2.5"),
        tenantId=tenant_id,
    )
    db_session.add(item)
    await db_session.commit()

    reloaded = await _reload(test_engine, BomItem, item.id)
    assert reloaded.quantity == Decimal("2.5000")
    assert isinstance(reloaded.quantity, decimal.Decimal)


@pytest.mark.asyncio
async def test_bom_variant_item_quantity_fractional_exact(
    db_session, test_engine, test_part, test_user, tenant_id
):
    """BomVariantItem quantity must persist 2.5 exactly."""
    bom = BOM(bom_number="QPREC-002", name="Qty Precision Base BOM", tenantId=tenant_id)
    db_session.add(bom)
    await db_session.commit()
    await db_session.refresh(bom)

    variant = BomVariant(
        base_bom_id=bom.id,
        variant_name="Variant A",
        created_by=test_user.id,
        tenantId=tenant_id,
    )
    db_session.add(variant)
    await db_session.commit()
    await db_session.refresh(variant)

    item = BomVariantItem(
        variant_id=variant.id,
        part_id=test_part.id,
        quantity=Decimal("2.5"),
        tenantId=tenant_id,
    )
    db_session.add(item)
    await db_session.commit()

    reloaded = await _reload(test_engine, BomVariantItem, item.id)
    assert reloaded.quantity == Decimal("2.5000")
    assert isinstance(reloaded.quantity, decimal.Decimal)


@pytest.mark.asyncio
async def test_revision_bom_snapshot_item_quantity_fractional_exact(
    db_session, test_engine, test_part, test_user, tenant_id
):
    """RevisionBomSnapshotItem quantity must persist 2.5 exactly."""
    revision = Revision(
        entityType="bom",
        entityId=1,
        revisionNumber="A",
        createdById=test_user.id,
        tenantId=tenant_id,
    )
    db_session.add(revision)
    await db_session.commit()
    await db_session.refresh(revision)

    item = RevisionBomSnapshotItem(
        revision_id=revision.id,
        part_id=test_part.id,
        part_number=test_part.pn,
        part_name=test_part.name,
        quantity=Decimal("2.5"),
        tenantId=tenant_id,
    )
    db_session.add(item)
    await db_session.commit()

    reloaded = await _reload(test_engine, RevisionBomSnapshotItem, item.id)
    assert reloaded.quantity == Decimal("2.5000")
    assert isinstance(reloaded.quantity, decimal.Decimal)


def test_exactly_one_alembic_head():
    """The migration chain must have exactly one head after the qty-precision migration."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config("alembic.ini")
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1, f"Expected exactly one alembic head, found: {heads}"
