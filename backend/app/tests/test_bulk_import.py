import io

import pytest


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
