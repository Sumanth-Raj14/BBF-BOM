"""The exported "Extended Cost" column must equal the Cost Rollup's number.

Two independent divergences existed between export_service._rows_bom and
bom_service.get_cost_rollup for the SAME BOM:

  1. Export multiplied unit_cost * quantity with no UOM conversion. A part
     costed per metre used on a line counted in centimetres exported 100x the
     rollup's figure.
  2. Export chose the snapshot cost with `is not None`, the rollup with a
     truthy test. A snapshot of 0 therefore exported 0 while the rollup fell
     back to the part's own cost.

Either way a user reconciling a spreadsheet against the app saw two different
totals for one BOM, with nothing to say which was right.
"""

import pytest

from app.models.bom import BOM, BOMItem
from app.models.part import Part
from app.models.uom import UomConversion, UomUnit
from app.services.uom_service import STANDARD_CONVERSIONS, STANDARD_UNITS


@pytest.fixture(autouse=True)
async def seed_units(db_session, test_tenant, tenant_id):
    """Same seeding as test_uom_service.py — create_all skips the migration's
    seed step, so the standard units must be inserted directly."""
    for code, name, dimension, is_base in STANDARD_UNITS:
        db_session.add(
            UomUnit(
                tenantId=tenant_id,
                code=code,
                name=name,
                dimension=dimension,
                is_base=is_base,
            )
        )
    await db_session.flush()
    for from_uom, to_uom, factor in STANDARD_CONVERSIONS:
        db_session.add(
            UomConversion(
                tenantId=tenant_id, from_uom=from_uom, to_uom=to_uom, factor=factor
            )
        )
    await db_session.commit()


@pytest.mark.asyncio
async def test_export_extended_cost_matches_rollup_on_mixed_uom(
    db_session, test_tenant, tenant_id
):
    from app.services import bom_service, export_service

    tid = tenant_id
    # Costed per METRE, but the BOM line counts CENTIMETRES.
    wire = Part(pn="XRC-WIRE", name="Wire", cost=10, uom="M", tenantId=tid)
    db_session.add(wire)
    await db_session.flush()

    bom = BOM(bom_number="XRC-1", name="Cost Agreement BOM", tenantId=tid)
    db_session.add(bom)
    await db_session.flush()
    db_session.add(
        BOMItem(bom_id=bom.id, part_id=wire.id, quantity=250, unit="CM", tenantId=tid)
    )
    await db_session.commit()

    rollup = await bom_service.get_cost_rollup(db_session, bom.id)
    rows = await export_service._rows_bom(
        db_session, tid, bom.id, {}, indented=True, include_sub_assemblies=True
    )

    assert len(rows) == 1, rows
    exported = rows[0]["extended_cost"]

    # 250 CM = 2.5 M at 10/M = 25.00. The naive product would be 2500.
    assert exported == pytest.approx(25.0), (
        f"export ignored the CM->M conversion: got {exported}, expected 25.0"
    )
    assert exported == pytest.approx(rollup["total_cost"]), (
        f"export ({exported}) disagrees with cost rollup ({rollup['total_cost']})"
    )


@pytest.mark.asyncio
async def test_zero_snapshot_falls_back_to_part_cost_in_both(
    db_session, test_tenant, tenant_id
):
    """A 0 snapshot must fall through to part.cost in the export too."""
    from app.services import bom_service, export_service

    tid = tenant_id
    widget = Part(pn="XRC-WIDGET", name="Widget", cost=4, uom="EA", tenantId=tid)
    db_session.add(widget)
    await db_session.flush()

    bom = BOM(bom_number="XRC-2", name="Zero Snapshot BOM", tenantId=tid)
    db_session.add(bom)
    await db_session.flush()
    db_session.add(
        BOMItem(
            bom_id=bom.id,
            part_id=widget.id,
            quantity=3,
            unit="EA",
            unit_cost_snapshot=0,
            tenantId=tid,
        )
    )
    await db_session.commit()

    rollup = await bom_service.get_cost_rollup(db_session, bom.id)
    rows = await export_service._rows_bom(
        db_session, tid, bom.id, {}, indented=True, include_sub_assemblies=True
    )

    # 3 x 4 = 12, not 0.
    assert rows[0]["extended_cost"] == pytest.approx(12.0), rows
    assert rows[0]["extended_cost"] == pytest.approx(rollup["total_cost"])
