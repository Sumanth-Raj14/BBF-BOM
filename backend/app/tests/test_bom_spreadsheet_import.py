"""Multi-level BOM import from a spreadsheet (bom_service.import_bom).

Before this feature import_bom never read the file at all — it created an empty
draft BOM and returned import_status "not_implemented" with items_imported 0.
These tests pin the three things that make the real implementation trustworthy:
the LEVEL column really rebuilds parent/child links, an unknown part number is
reported as a ROW error (never silently dropped, never invented as a Part), and
a malformed file fails cleanly with no BOM left behind.
"""

import io

import openpyxl
import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.models.bom import BOM, BOMItem
from app.models.bom_closure import BomClosure
from app.models.part import Part
from app.services import bom_service


async def _make_parts(db_session, tenant_id, pns):
    parts = {}
    for pn in pns:
        part = Part(pn=pn, name=f"Part {pn}", category="Mechanical", cost=1.0, tenantId=tenant_id)
        db_session.add(part)
        parts[pn] = part
    await db_session.commit()
    for part in parts.values():
        await db_session.refresh(part)
    return parts


async def _items_by_pn(db_session, bom_id, parts):
    rows = (
        (await db_session.execute(select(BOMItem).where(BOMItem.bom_id == bom_id)))
        .scalars()
        .all()
    )
    by_part_id = {p.id: pn for pn, p in parts.items()}
    return {by_part_id[i.part_id]: i for i in rows}


THREE_LEVEL_CSV = (
    "Level,Part Number,Qty,UOM,Reference Designator\n"
    "1,ASSY-100,1,EA,\n"
    "1.1,SUB-200,2,EA,A1\n"
    "1.1.1,SCREW-300,4,EA,\n"
    "1.1.2,NUT-310,4,EA,\n"
    "1.2,SUB-210,1,EA,A2\n"
    "2,ASSY-400,3,EA,\n"
).encode()


@pytest.mark.asyncio
async def test_three_level_csv_rebuilds_the_hierarchy(db_session, test_tenant):
    tid = test_tenant.id
    parts = await _make_parts(
        db_session, tid, ["ASSY-100", "SUB-200", "SCREW-300", "NUT-310", "SUB-210", "ASSY-400"]
    )

    result = await bom_service.import_bom(
        db_session, filename="bom.csv", content=THREE_LEVEL_CSV, tenant_id=tid
    )

    assert result["import_status"] == "success"
    assert result["items_imported"] == 6
    assert result["items_failed"] == 0
    assert result["errors"] == []

    items = await _items_by_pn(db_session, result["bom_id"], parts)
    assert len(items) == 6

    # The whole point: real parent links, three levels deep.
    assert items["ASSY-100"].parent_item_id is None
    assert items["ASSY-400"].parent_item_id is None
    assert items["SUB-200"].parent_item_id == items["ASSY-100"].id
    assert items["SUB-210"].parent_item_id == items["ASSY-100"].id
    assert items["SCREW-300"].parent_item_id == items["SUB-200"].id
    assert items["NUT-310"].parent_item_id == items["SUB-200"].id

    # Non-hierarchy columns survive the trip.
    assert items["SUB-200"].quantity == 2
    assert items["SUB-200"].reference_designator == "A1"
    assert items["SCREW-300"].unit == "EA"

    # Closure rows must exist too, or where-used/explosion silently misses the
    # imported lines (the same bug apply_template had).
    depth_two = (
        await db_session.execute(
            select(BomClosure).where(
                BomClosure.bom_id == result["bom_id"],
                BomClosure.ancestor_item_id == items["ASSY-100"].id,
                BomClosure.descendant_item_id == items["SCREW-300"].id,
            )
        )
    ).scalar_one_or_none()
    assert depth_two is not None and depth_two.depth == 2


@pytest.mark.asyncio
async def test_unknown_part_number_is_a_row_error(db_session, test_tenant):
    tid = test_tenant.id
    parts = await _make_parts(db_session, tid, ["ASSY-100", "SUB-200"])
    csv = (
        "Level,Part Number,Qty\n"
        "1,ASSY-100,1\n"
        "1.1,NOPE-999,2\n"
        "1.1.1,SUB-200,3\n"  # child of the failed row -> cannot be placed either
    ).encode()

    result = await bom_service.import_bom(
        db_session, filename="bom.csv", content=csv, tenant_id=tid
    )

    assert result["import_status"] == "partial"
    assert result["items_imported"] == 1
    assert result["items_failed"] == 2
    rows = {e["row"]: e["error"] for e in result["errors"]}
    assert "NOPE-999" in rows[3] and "does not exist" in rows[3]
    assert "parent row failed" in rows[4]

    # Never invent the missing part, and never count it as imported.
    assert (
        await db_session.execute(select(func.count()).select_from(Part).where(Part.pn == "NOPE-999"))
    ).scalar() == 0
    items = await _items_by_pn(db_session, result["bom_id"], parts)
    assert set(items) == {"ASSY-100"}


@pytest.mark.asyncio
async def test_malformed_file_fails_cleanly(db_session, test_tenant):
    tid = test_tenant.id
    before = (await db_session.execute(select(func.count()).select_from(BOM))).scalar()

    for filename, content in [
        ("bom.xlsx", b"this is definitely not a workbook"),
        ("bom.txt", b"Level,Part Number\n1,ASSY-100\n"),
        ("bom.csv", b"Colour,Size\nred,large\n"),  # no part number column
        ("bom.csv", b"Level,Part Number\n"),  # header only
    ]:
        with pytest.raises(HTTPException) as exc:
            await bom_service.import_bom(
                db_session, filename=filename, content=content, tenant_id=tid
            )
        assert exc.value.status_code == 400

    # A rejected file must not leave a BOM behind.
    after = (await db_session.execute(select(func.count()).select_from(BOM))).scalar()
    assert after == before


@pytest.mark.asyncio
async def test_no_level_column_imports_flat(db_session, test_tenant):
    tid = test_tenant.id
    parts = await _make_parts(db_session, tid, ["FLAT-1", "FLAT-2"])
    csv = b"Part Number,Quantity\nFLAT-1,5\nFLAT-2,6\n"

    result = await bom_service.import_bom(
        db_session, filename="flat.csv", content=csv, tenant_id=tid
    )

    assert result["import_status"] == "success"
    items = await _items_by_pn(db_session, result["bom_id"], parts)
    assert all(i.parent_item_id is None for i in items.values())
    assert items["FLAT-1"].quantity == 5


@pytest.mark.asyncio
async def test_xlsx_with_indent_levels(db_session, test_tenant):
    """XLSX + a 0-based indent column — the other level convention in the wild."""
    tid = test_tenant.id
    parts = await _make_parts(db_session, tid, ["X-TOP", "X-MID", "X-LEAF"])

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Indent", "PN", "Qty"])
    ws.append([0, "X-TOP", 1])
    ws.append([1, "X-MID", 2])
    ws.append([2, "X-LEAF", 3])
    buf = io.BytesIO()
    wb.save(buf)

    result = await bom_service.import_bom(
        db_session, filename="bom.xlsx", content=buf.getvalue(), tenant_id=tid
    )

    assert result["items_imported"] == 3, result["errors"]
    items = await _items_by_pn(db_session, result["bom_id"], parts)
    assert items["X-TOP"].parent_item_id is None
    assert items["X-MID"].parent_item_id == items["X-TOP"].id
    assert items["X-LEAF"].parent_item_id == items["X-MID"].id


@pytest.mark.asyncio
async def test_nothing_importable_creates_no_bom(db_session, test_tenant):
    tid = test_tenant.id
    before = (await db_session.execute(select(func.count()).select_from(BOM))).scalar()

    result = await bom_service.import_bom(
        db_session,
        filename="bom.csv",
        content=b"Part Number,Qty\nGHOST-1,1\nGHOST-2,2\n",
        tenant_id=tid,
    )

    assert result["import_status"] == "failed"
    assert result["items_imported"] == 0
    assert result["items_failed"] == 2
    assert result["bom_id"] is None
    after = (await db_session.execute(select(func.count()).select_from(BOM))).scalar()
    assert after == before
