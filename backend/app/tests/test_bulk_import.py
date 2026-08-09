import io

import pytest
from openpyxl import Workbook
from sqlalchemy import select

from app.models.part import Part
from app.models.tenant import Tenant
from app.tests.conftest import no_tenant_filter


@pytest.mark.asyncio
async def test_upload_csv_file(client, auth_headers):
    csv_content = "pn,name,category\nIMPORT-001,Imported Part,Electrical\nIMPORT-002,Imported Part 2,Mechanical\n"
    file_bytes = csv_content.encode("utf-8")
    resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={"file": ("test.csv", io.BytesIO(file_bytes), "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"] == "test.csv"
    assert data["status"] == "uploaded"
    assert data["totalRows"] == 2
    assert "id" in data


@pytest.mark.asyncio
async def test_upload_empty_filename(client, auth_headers):
    resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={"file": ("", io.BytesIO(b""), "text/csv")},
    )
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_process_import(client, auth_headers):
    upload_resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={
            "file": (
                "process.csv",
                io.BytesIO(b"pn,name\nPROC-001,Process Part\n"),
                "text/csv",
            )
        },
    )
    job_id = upload_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/import/{job_id}/process",
        headers=auth_headers,
        json={"mappingConfig": {"pn": "pn", "name": "name"}},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("completed", "completed_with_errors")
    assert data["processedRows"] >= 0


@pytest.mark.asyncio
async def test_get_import_status(client, auth_headers):
    upload_resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={
            "file": (
                "status.csv",
                io.BytesIO(b"pn,name\nSTAT-001,Status Part\n"),
                "text/csv",
            )
        },
    )
    job_id = upload_resp.json()["id"]
    resp = await client.get(f"/api/v1/import/{job_id}/status", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "job" in data
    assert "rows" in data
    assert data["job"]["id"] == job_id


@pytest.mark.asyncio
async def test_get_import_status_not_found(client, auth_headers):
    resp = await client.get("/api/v1/import/99999/status", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_import_errors(client, auth_headers):
    upload_resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={
            "file": (
                "errors.csv",
                io.BytesIO(b"pn,name\nERR-001,Error Part\n"),
                "text/csv",
            )
        },
    )
    job_id = upload_resp.json()["id"]
    resp = await client.get(f"/api/v1/import/{job_id}/errors", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "errors" in data


# --- Shared import contract: upload / mapping / commit ---


def _xlsx_bytes(rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_upload_response_has_contract_fields(client, auth_headers):
    csv_content = b"pn,name,category\nCT-001,Contract Part,Electrical\n"
    resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={"file": ("contract.csv", io.BytesIO(csv_content), "text/csv")},
        data={"entity": "parts"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["job_id"] == data["id"]
    assert data["detected_columns"] == ["pn", "name", "category"]
    assert data["row_count"] == 1
    assert data["sample_rows"][0]["pn"] == "CT-001"


@pytest.mark.asyncio
async def test_upload_xlsx_file(client, auth_headers):
    content = _xlsx_bytes(
        [
            ["pn", "name", "category"],
            ["XLS-001", "Xlsx Part", "Electrical"],
            ["XLS-002", "Xlsx Part 2", "Mechanical"],
        ]
    )
    resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={
            "file": (
                "test.xlsx",
                io.BytesIO(content),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["row_count"] == 2
    assert set(data["detected_columns"]) == {"pn", "name", "category"}


@pytest.mark.asyncio
async def test_upload_rejects_bad_extension(client, auth_headers):
    resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={"file": ("notes.txt", io.BytesIO(b"pn,name\nX,Y\n"), "text/plain")},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_upload_rejects_unsupported_entity(client, auth_headers):
    resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={"file": ("v.csv", io.BytesIO(b"name\nAcme\n"), "text/csv")},
        data={"entity": "vendors"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_mapping_validates_bad_row_without_writing(client, auth_headers, db_session):
    csv_content = b"pn,pname,category\nGOOD-001,Good Part,Electrical\n,Missing PN,Electrical\n"
    upload_resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={"file": ("mapcheck.csv", io.BytesIO(csv_content), "text/csv")},
    )
    job_id = upload_resp.json()["job_id"]

    resp = await client.post(
        f"/api/v1/import/{job_id}/mapping",
        headers=auth_headers,
        json={"mapping": {"pn": "pn", "pname": "name", "category": "category"}},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert data["will_create"] == 1
    assert any(e["row"] == 2 and "pn" in e["message"] for e in data["errors"])

    # Nothing written to the parts table yet.
    existing = (await db_session.execute(select(Part).where(Part.pn == "GOOD-001"))).scalars().all()
    assert existing == []


@pytest.mark.asyncio
async def test_commit_creates_parts_from_csv(client, auth_headers, db_session):
    csv_content = b"pn,name,category,cost\nCSV-001,CSV Part,Electrical,12.5\n"
    upload_resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={"file": ("create.csv", io.BytesIO(csv_content), "text/csv")},
    )
    job_id = upload_resp.json()["job_id"]

    mapping_resp = await client.post(
        f"/api/v1/import/{job_id}/mapping",
        headers=auth_headers,
        json={"mapping": {"pn": "pn", "name": "name", "category": "category", "cost": "cost"}},
    )
    assert mapping_resp.json()["valid"] is True
    assert mapping_resp.json()["will_create"] == 1

    commit_resp = await client.post(f"/api/v1/import/{job_id}/commit", headers=auth_headers)
    assert commit_resp.status_code == 200
    body = commit_resp.json()
    assert body["created"] == 1
    assert body["failed"] == 0

    part = (
        await db_session.execute(select(Part).where(Part.pn == "CSV-001"))
    ).scalar_one()
    assert part.name == "CSV Part"
    assert float(part.cost) == 12.5


@pytest.mark.asyncio
async def test_commit_creates_parts_from_xlsx(client, auth_headers, db_session):
    content = _xlsx_bytes([["pn", "name"], ["XCM-001", "Xlsx Commit Part"]])
    upload_resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={"file": ("commit.xlsx", io.BytesIO(content), "application/octet-stream")},
    )
    job_id = upload_resp.json()["job_id"]
    await client.post(
        f"/api/v1/import/{job_id}/mapping",
        headers=auth_headers,
        json={"mapping": {"pn": "pn", "name": "name"}},
    )
    commit_resp = await client.post(f"/api/v1/import/{job_id}/commit", headers=auth_headers)
    assert commit_resp.json()["created"] == 1

    part = (
        await db_session.execute(select(Part).where(Part.pn == "XCM-001"))
    ).scalar_one()
    assert part.name == "Xlsx Commit Part"


@pytest.mark.asyncio
async def test_commit_upserts_existing_part_by_pn(client, auth_headers, db_session, test_tenant):
    existing = Part(pn="UPD-001", name="Old Name", category="Electrical", tenantId=test_tenant.id)
    db_session.add(existing)
    await db_session.commit()

    csv_content = b"pn,name\nUPD-001,New Name\n"
    upload_resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={"file": ("upsert.csv", io.BytesIO(csv_content), "text/csv")},
    )
    job_id = upload_resp.json()["job_id"]
    mapping_resp = await client.post(
        f"/api/v1/import/{job_id}/mapping",
        headers=auth_headers,
        json={"mapping": {"pn": "pn", "name": "name"}},
    )
    assert mapping_resp.json()["will_update"] == 1
    assert mapping_resp.json()["will_create"] == 0

    commit_resp = await client.post(f"/api/v1/import/{job_id}/commit", headers=auth_headers)
    body = commit_resp.json()
    assert body["updated"] == 1
    assert body["created"] == 0

    await db_session.refresh(existing)
    assert existing.name == "New Name"


@pytest.mark.asyncio
async def test_commit_skips_bad_row_but_writes_good_rows(client, auth_headers, db_session):
    csv_content = b"pn,name\nSKIP-GOOD,Good Row\n,Bad Row Missing PN\n"
    upload_resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={"file": ("mixed.csv", io.BytesIO(csv_content), "text/csv")},
    )
    job_id = upload_resp.json()["job_id"]
    await client.post(
        f"/api/v1/import/{job_id}/mapping",
        headers=auth_headers,
        json={"mapping": {"pn": "pn", "name": "name"}},
    )
    commit_resp = await client.post(f"/api/v1/import/{job_id}/commit", headers=auth_headers)
    body = commit_resp.json()
    assert body["created"] == 1
    assert body["failed"] == 1
    assert len(body["errors"]) == 1

    good = (
        await db_session.execute(select(Part).where(Part.pn == "SKIP-GOOD"))
    ).scalar_one()
    assert good.name == "Good Row"


@pytest.mark.asyncio
async def test_commit_requires_mapping_first(client, auth_headers):
    upload_resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={"file": ("nomap.csv", io.BytesIO(b"pn,name\nNM-001,No Map\n"), "text/csv")},
    )
    job_id = upload_resp.json()["job_id"]
    resp = await client.post(f"/api/v1/import/{job_id}/commit", headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_import_never_crosses_tenants(client, auth_headers, db_session, test_tenant, tenant_id):
    other = Tenant(id=tenant_id + 1, tenant_name="Other Tenant", tenant_code="OTHERIMP")
    db_session.add(other)
    await db_session.commit()

    their_part = Part(pn="SHARED-KEY", name="Their Part", category="Electrical", tenantId=other.id)
    db_session.add(their_part)
    await db_session.commit()
    their_part_id = their_part.id

    csv_content = b"pn,name\nSHARED-KEY,My Part\n"
    upload_resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={"file": ("cross.csv", io.BytesIO(csv_content), "text/csv")},
    )
    job_id = upload_resp.json()["job_id"]
    mapping_resp = await client.post(
        f"/api/v1/import/{job_id}/mapping",
        headers=auth_headers,
        json={"mapping": {"pn": "pn", "name": "name"}},
    )
    # Tenant 1 has no part with this pn -- must be reported as a create, not
    # matched against the other tenant's row.
    assert mapping_resp.json()["will_create"] == 1
    assert mapping_resp.json()["will_update"] == 0

    commit_resp = await client.post(f"/api/v1/import/{job_id}/commit", headers=auth_headers)
    body = commit_resp.json()
    assert body["created"] == 1
    assert body["updated"] == 0

    with no_tenant_filter():
        rows = (
            await db_session.execute(select(Part).where(Part.pn == "SHARED-KEY"))
        ).scalars().all()
    assert len(rows) == 2
    mine = next(r for r in rows if r.tenantId == test_tenant.id)
    theirs = next(r for r in rows if r.tenantId == other.id)
    assert mine.name == "My Part"
    assert theirs.id == their_part_id
    assert theirs.name == "Their Part"
