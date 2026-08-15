import io
import json

import httpx
import openpyxl
import pytest

from app.integrations.cad.altium import (
    AltiumAPIError,
    AltiumAuthError,
    AltiumCloudConnector,
    AltiumFileConnector,
    AltiumParseError,
    parse_altium_bom_csv,
    parse_altium_bom_xlsx,
)

CSV_HEADER = "Designator,Comment,Footprint,Description,Quantity,Manufacturer,Manufacturer Part Number,Supplier,Supplier Part Number\n"

REALISTIC_CSV = CSV_HEADER + (
    "R1,10k,0603,Resistor 10k 1%,1,Yageo,RC0603FR-0710KL,Digikey,311-10KGRCT-ND\n"
    "R2,10k,0603,Resistor 10k 1%,1,Yageo,RC0603FR-0710KL,Digikey,311-10KGRCT-ND\n"
    "R5,10k,0603,Resistor 10k 1%,1,Yageo,RC0603FR-0710KL,Digikey,311-10KGRCT-ND\n"
    "C1,100nF,0402,Cap 100nF X7R,1,Murata,GRM155R71H104KE14D,Digikey,490-1276-1-ND\n"
    "U1,ATMEGA328P,TQFP32,MCU,1,Microchip,ATMEGA328P-AU,Digikey,ATMEGA328P-AU-ND\n"
)

# ---------------------------------------------------------------------------
# File path: CSV
# ---------------------------------------------------------------------------


def test_csv_groups_designators_and_sums_quantity():
    doc = parse_altium_bom_csv(REALISTIC_CSV.encode(), source_name="test.csv")
    assert doc["external_id"] == "test.csv"
    assert len(doc["children"]) == 3  # 5 rows -> 3 distinct MPNs

    by_mpn = {c["part_number"]: c for c in doc["children"]}
    resistor = by_mpn["RC0603FR-0710KL"]
    assert resistor["quantity"] == 3
    assert resistor["designators"] == ["R1", "R2", "R5"]
    assert resistor["manufacturer"] == "Yageo"
    assert resistor["supplier_part_number"] == "311-10KGRCT-ND"

    cap = by_mpn["GRM155R71H104KE14D"]
    assert cap["quantity"] == 1
    assert cap["designators"] == ["C1"]

    mcu = by_mpn["ATMEGA328P-AU"]
    assert mcu["quantity"] == 1
    assert mcu["designators"] == ["U1"]


def test_csv_single_row_with_combined_designators():
    """Some Altium exports pre-aggregate: one row, Designator lists all
    placements, Quantity already reflects the count."""
    csv_text = CSV_HEADER + '"R10, R11, R12",1k,0603,Resistor 1k,3,Yageo,RC0603FR-071KL,Digikey,311-1.00KGRCT-ND\n'
    doc = parse_altium_bom_csv(csv_text.encode())
    assert len(doc["children"]) == 1
    node = doc["children"][0]
    assert node["quantity"] == 3
    assert node["designators"] == ["R10", "R11", "R12"]


def test_csv_tolerant_column_header_variants():
    header = "Ref Des,Value,Package,Desc,Qty,Mfr,Mfr Part No,Vendor,Vendor Part No\n"
    row = "D1,LED Red,0805,Red LED,1,Kingbright,APT1608SECK-J3-PF,Digikey,754-1234-1-ND\n"
    doc = parse_altium_bom_csv((header + row).encode())
    assert len(doc["children"]) == 1
    node = doc["children"][0]
    assert node["part_number"] == "APT1608SECK-J3-PF"
    assert node["designators"] == ["D1"]
    assert node["footprint"] == "0805"
    assert node["manufacturer"] == "Kingbright"
    assert node["supplier_part_number"] == "754-1234-1-ND"


def test_csv_no_mpn_falls_back_to_comment_footprint_grouping():
    header = "Designator,Comment,Footprint\n"
    rows = "R20,10k,0603\nR21,10k,0603\n"
    doc = parse_altium_bom_csv((header + rows).encode())
    assert len(doc["children"]) == 1
    node = doc["children"][0]
    assert node["quantity"] == 2
    assert node["designators"] == ["R20", "R21"]
    assert node["part_number"] is None


# ---------------------------------------------------------------------------
# File path: XLSX
# ---------------------------------------------------------------------------


def _xlsx_bytes(rows: list[list]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_xlsx_parses_and_groups_same_as_csv():
    header = [
        "Designator", "Comment", "Footprint", "Description", "Quantity",
        "Manufacturer", "Manufacturer Part Number", "Supplier", "Supplier Part Number",
    ]
    rows = [
        header,
        ["R1", "10k", "0603", "Resistor 10k", 1, "Yageo", "RC0603FR-0710KL", "Digikey", "311-10KGRCT-ND"],
        ["R2", "10k", "0603", "Resistor 10k", 1, "Yageo", "RC0603FR-0710KL", "Digikey", "311-10KGRCT-ND"],
        ["C1", "100nF", "0402", "Cap 100nF", 1, "Murata", "GRM155R71H104KE14D", "Digikey", "490-1276-1-ND"],
    ]
    doc = parse_altium_bom_xlsx(_xlsx_bytes(rows), source_name="bom.xlsx")
    assert doc["external_id"] == "bom.xlsx"
    assert len(doc["children"]) == 2
    resistor = next(c for c in doc["children"] if c["part_number"] == "RC0603FR-0710KL")
    assert resistor["quantity"] == 2
    assert resistor["designators"] == ["R1", "R2"]


# ---------------------------------------------------------------------------
# Malformed files fail honestly
# ---------------------------------------------------------------------------


def test_empty_csv_raises():
    with pytest.raises(AltiumParseError):
        parse_altium_bom_csv(b"")


def test_unrecognized_columns_raise():
    with pytest.raises(AltiumParseError):
        parse_altium_bom_csv(b"Foo,Bar\n1,2\n")


def test_undecodable_bytes_raise():
    with pytest.raises(AltiumParseError):
        parse_altium_bom_csv(b"\xff\xfe\x00\x01not text")


def test_empty_xlsx_raises():
    # a workbook with a truly empty first sheet -> no header row
    wb = openpyxl.Workbook()
    buf = io.BytesIO()
    wb.save(buf)
    with pytest.raises(AltiumParseError):
        parse_altium_bom_xlsx(buf.getvalue())


def test_not_xlsx_bytes_raise():
    with pytest.raises(AltiumParseError):
        parse_altium_bom_xlsx(b"this is not a real xlsx file")


# ---------------------------------------------------------------------------
# AltiumFileConnector (interface-shaped wrapper)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_file_connector_matches_expected_interface():
    connector = AltiumFileConnector(REALISTIC_CSV.encode(), "board_rev_b.csv")
    assert await connector.authenticate() is True
    assert await connector.verify_connection() is True

    docs = await connector.list_documents()
    assert docs[0]["external_id"] == "board_rev_b.csv"

    tree = await connector.get_assembly_structure()
    assert tree["name"] == "board_rev_b.csv"
    assert len(tree["children"]) == 3

    part = await connector.get_part_metadata("RC0603FR-0710KL")
    assert part["quantity"] == 3

    with pytest.raises(AltiumAPIError):
        await connector.get_part_metadata("NOT-A-REAL-MPN")


def test_file_connector_rejects_unsupported_extension():
    with pytest.raises(AltiumParseError):
        AltiumFileConnector(b"whatever", "board.pdf")


# ---------------------------------------------------------------------------
# Cloud path -- mocked HTTP (no live Altium 365 credentials exist here)
# ---------------------------------------------------------------------------


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_authenticate_missing_credentials_raises_honestly():
    connector = AltiumCloudConnector(workspace_domain="acme.365.altium.com")
    with pytest.raises(AltiumAuthError):
        await connector.authenticate()


@pytest.mark.asyncio
async def test_authenticate_exchanges_refresh_token():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["body"] = request.content.decode()
        return httpx.Response(200, json={"access_token": "tok_abc", "expires_in": 3600, "token_type": "Bearer"})

    connector = AltiumCloudConnector(
        workspace_domain="acme.365.altium.com",
        refresh_token="rt_1",
        client_id="cid",
        client_secret="csec",
        http=_mock_client(handler),
    )
    token = await connector.authenticate()
    assert token == "tok_abc"
    assert seen["url"] == "https://auth.altium.com/connect/token"
    assert "grant_type=refresh_token" in seen["body"]
    assert "refresh_token=rt_1" in seen["body"]
    # cached afterwards -- second call doesn't need to hit the handler again
    assert connector._token_is_valid()


@pytest.mark.asyncio
async def test_authenticate_bad_refresh_token_raises():
    def handler(request):
        return httpx.Response(400, text="invalid_grant")

    connector = AltiumCloudConnector(
        workspace_domain="acme.365.altium.com",
        refresh_token="bad",
        client_id="cid",
        client_secret="csec",
        http=_mock_client(handler),
    )
    with pytest.raises(AltiumAuthError):
        await connector.authenticate()


@pytest.mark.asyncio
async def test_list_documents_queries_des_projects():
    def handler(request):
        body = json.loads(request.content)
        assert "desProjects" in body["query"]
        assert request.headers["Authorization"] == "Bearer tok_abc"
        return httpx.Response(
            200,
            json={
                "data": {
                    "desProjects": {
                        "nodes": [{"id": "proj_1", "name": "Widget Board", "description": "rev B"}],
                        "pageInfo": {"hasNextPage": False, "endCursor": None},
                    }
                }
            },
        )

    connector = AltiumCloudConnector(
        workspace_domain="acme.365.altium.com",
        access_token="tok_abc",
        access_token_expires_at=9_999_999_999,
        http=_mock_client(handler),
    )
    docs = await connector.list_documents()
    assert docs == [{"external_id": "proj_1", "name": "Widget Board", "description": "rev B"}]


@pytest.mark.asyncio
async def test_get_assembly_structure_groups_designators_from_bom_items():
    def handler(request):
        return httpx.Response(
            200,
            json={
                "data": {
                    "desProjectById": {
                        "id": "proj_1",
                        "name": "Widget Board",
                        "bom": {
                            "items": [
                                {"id": "i1", "designator": "R1", "comment": "10k", "manufacturerPartNumber": "RC0603FR-0710KL", "quantity": 1},
                                {"id": "i2", "designator": "R2", "comment": "10k", "manufacturerPartNumber": "RC0603FR-0710KL", "quantity": 1},
                                {"id": "i3", "designator": "R5", "comment": "10k", "manufacturerPartNumber": "RC0603FR-0710KL", "quantity": 1},
                                {"id": "i4", "designator": "C1", "comment": "100nF", "manufacturerPartNumber": "GRM155R71H104KE14D", "quantity": 1},
                            ]
                        },
                    }
                }
            },
        )

    connector = AltiumCloudConnector(
        workspace_domain="acme.365.altium.com",
        access_token="tok_abc",
        access_token_expires_at=9_999_999_999,
        http=_mock_client(handler),
    )
    tree = await connector.get_assembly_structure("proj_1")
    assert tree["external_id"] == "proj_1"
    assert len(tree["children"]) == 2
    resistor = next(c for c in tree["children"] if c["part_number"] == "RC0603FR-0710KL")
    assert resistor["quantity"] == 3
    assert resistor["designators"] == ["R1", "R2", "R5"]


@pytest.mark.asyncio
async def test_graphql_error_response_raises_api_error():
    def handler(request):
        return httpx.Response(200, json={"errors": [{"message": "project not found"}]})

    connector = AltiumCloudConnector(
        workspace_domain="acme.365.altium.com",
        access_token="tok_abc",
        access_token_expires_at=9_999_999_999,
        http=_mock_client(handler),
    )
    with pytest.raises(AltiumAPIError):
        await connector.get_assembly_structure("missing-project")


@pytest.mark.asyncio
async def test_get_part_metadata_not_found_raises():
    def handler(request):
        return httpx.Response(
            200,
            json={"data": {"desProjectById": {"id": "proj_1", "name": "Widget Board", "bom": {"items": []}}}},
        )

    connector = AltiumCloudConnector(
        workspace_domain="acme.365.altium.com",
        access_token="tok_abc",
        access_token_expires_at=9_999_999_999,
        http=_mock_client(handler),
    )
    with pytest.raises(AltiumAPIError):
        await connector.get_part_metadata("proj_1", "NOT-THERE")
