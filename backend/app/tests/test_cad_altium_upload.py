"""POST /api/v1/cad-connectors/altium/import-file — the credential-free CAD import.

Proves the route actually writes real Part/BOMItem rows (queried straight from
the DB, not just read back off the response), that designator grouping survives
into a single BOM line, that dry_run writes NOTHING, and that a bad file fails
honestly with a 400 instead of a partial import.
"""

import io

import openpyxl
import pytest
from sqlalchemy import func, select

from app.models.bom import BOM, BOMItem
from app.models.part import Part

URL = "/api/v1/cad-connectors/altium/import-file"

CSV_HEADER = (
    "Designator,Comment,Footprint,Description,Quantity,Manufacturer,"
    "Manufacturer Part Number,Supplier,Supplier Part Number\n"
)
REALISTIC_CSV = CSV_HEADER + (
    "R1,10k,0603,Resistor 10k 1%,1,Yageo,RC0603FR-0710KL,Digikey,311-10KGRCT-ND\n"
    "R2,10k,0603,Resistor 10k 1%,1,Yageo,RC0603FR-0710KL,Digikey,311-10KGRCT-ND\n"
    "R5,10k,0603,Resistor 10k 1%,1,Yageo,RC0603FR-0710KL,Digikey,311-10KGRCT-ND\n"
    "C1,100nF,0402,Cap 100nF X7R,1,Murata,GRM155R71H104KE14D,Digikey,490-1276-1-ND\n"
    "U1,ATMEGA328P,TQFP32,MCU,1,Microchip,ATMEGA328P-AU,Digikey,ATMEGA328P-AU-ND\n"
)


def _xlsx_bytes() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in [r.split(",") for r in REALISTIC_CSV.strip().split("\n")]:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def _counts(db):
    parts = (await db.execute(select(func.count()).select_from(Part))).scalar()
    boms = (await db.execute(select(func.count()).select_from(BOM))).scalar()
    items = (await db.execute(select(func.count()).select_from(BOMItem))).scalar()
    return parts, boms, items


@pytest.mark.asyncio
async def test_csv_upload_creates_real_parts_and_bom_items(client, auth_headers, db_session):
    resp = await client.post(
        URL,
        headers=auth_headers,
        files={"file": ("acme-board-bom.csv", REALISTIC_CSV.encode(), "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["items_created"] == 3  # 5 rows -> 3 distinct components
    assert data["parts_created"] == 3
    assert data["bom_name"] == "acme-board-bom"  # defaults to the filename stem

    # Straight to the DB — the response could lie, the rows cannot.
    bom = (await db_session.execute(select(BOM).where(BOM.id == data["bom_id"]))).scalar_one()
    assert bom.name == "acme-board-bom"

    items = (
        (await db_session.execute(select(BOMItem).where(BOMItem.bom_id == bom.id))).scalars().all()
    )
    assert len(items) == 3

    parts = {
        p.pn: p
        for p in (await db_session.execute(select(Part))).scalars().all()
    }
    assert set(parts) == {"RC0603FR-0710KL", "GRM155R71H104KE14D", "ATMEGA328P-AU"}

    resistor = parts["RC0603FR-0710KL"]
    assert resistor.mpn == "RC0603FR-0710KL"
    assert resistor.manufacturer == "Yageo"
    assert resistor.vendor == "Digikey"
    assert resistor.description == "Resistor 10k 1%"
    # No footprint / supplier-PN columns on Part — they land in customFields.
    assert resistor.customFields["footprint"] == "0603"
    assert resistor.customFields["supplier_part_number"] == "311-10KGRCT-ND"


@pytest.mark.asyncio
async def test_designator_grouping_gives_one_line_with_summed_quantity(
    client, auth_headers, db_session
):
    resp = await client.post(
        URL, headers=auth_headers, files={"file": ("bom.csv", REALISTIC_CSV.encode(), "text/csv")}
    )
    assert resp.status_code == 200

    resistor = (
        await db_session.execute(select(Part).where(Part.pn == "RC0603FR-0710KL"))
    ).scalar_one()
    item = (
        await db_session.execute(select(BOMItem).where(BOMItem.part_id == resistor.id))
    ).scalar_one()  # exactly one line for R1+R2+R5, not three
    assert float(item.quantity) == 3
    assert item.reference_designator == "R1, R2, R5"

    mcu = (await db_session.execute(select(Part).where(Part.pn == "ATMEGA328P-AU"))).scalar_one()
    mcu_item = (
        await db_session.execute(select(BOMItem).where(BOMItem.part_id == mcu.id))
    ).scalar_one()
    assert float(mcu_item.quantity) == 1
    assert mcu_item.reference_designator == "U1"


@pytest.mark.asyncio
async def test_xlsx_upload_creates_real_rows(client, auth_headers, db_session):
    resp = await client.post(
        URL,
        headers=auth_headers,
        files={
            "file": (
                "board.xlsx",
                _xlsx_bytes(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        data={"bom_name": "Rev B Board"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["items_created"] == 3
    assert data["bom_name"] == "Rev B Board"

    bom = (await db_session.execute(select(BOM).where(BOM.id == data["bom_id"]))).scalar_one()
    assert bom.name == "Rev B Board"
    items = (
        (await db_session.execute(select(BOMItem).where(BOMItem.bom_id == bom.id))).scalars().all()
    )
    assert len(items) == 3
    assert {float(i.quantity) for i in items} == {3.0, 1.0}
    assert (await db_session.execute(select(func.count()).select_from(Part))).scalar() == 3


@pytest.mark.asyncio
async def test_dry_run_writes_nothing(client, auth_headers, db_session):
    before = await _counts(db_session)

    resp = await client.post(
        URL,
        headers=auth_headers,
        files={"file": ("preview.csv", REALISTIC_CSV.encode(), "text/csv")},
        data={"dry_run": "true"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["dry_run"] is True
    assert data["items_to_create"] == 3
    assert data["parts_to_create"] == 3
    mpns = {c["part_number"] for c in data["components"]}
    assert mpns == {"RC0603FR-0710KL", "GRM155R71H104KE14D", "ATMEGA328P-AU"}
    resistor = next(c for c in data["components"] if c["part_number"] == "RC0603FR-0710KL")
    assert resistor["quantity"] == 3
    assert resistor["designators"] == ["R1", "R2", "R5"]

    assert await _counts(db_session) == before == (0, 0, 0)


@pytest.mark.asyncio
async def test_malformed_file_is_400_and_writes_nothing(client, auth_headers, db_session):
    resp = await client.post(
        URL,
        headers=auth_headers,
        files={"file": ("junk.csv", b"alpha,beta\n1,2\n", "text/csv")},
    )
    assert resp.status_code == 400
    assert "Altium" in resp.json()["detail"]
    assert await _counts(db_session) == (0, 0, 0)


@pytest.mark.asyncio
async def test_unreadable_xlsx_is_400(client, auth_headers):
    resp = await client.post(
        URL,
        headers=auth_headers,
        files={"file": ("broken.xlsx", b"not a real spreadsheet", "application/octet-stream")},
    )
    assert resp.status_code == 400
    assert "XLSX" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_unsupported_extension_is_400(client, auth_headers, db_session):
    resp = await client.post(
        URL,
        headers=auth_headers,
        files={"file": ("bom.txt", REALISTIC_CSV.encode(), "text/plain")},
    )
    assert resp.status_code == 400
    assert "extension" in resp.json()["detail"]
    assert await _counts(db_session) == (0, 0, 0)


@pytest.mark.asyncio
async def test_requires_authentication(client):
    resp = await client.post(
        URL, files={"file": ("bom.csv", REALISTIC_CSV.encode(), "text/csv")}
    )
    assert resp.status_code in (401, 403)
