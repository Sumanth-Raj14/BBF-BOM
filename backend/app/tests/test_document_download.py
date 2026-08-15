"""Tests for GET /documents/{id}/download.

The vault could list documents and accept uploads, but nothing could fetch the
stored bytes back — downloads, previews and the 3D viewer all had no data
source. These cover the happy path and, more importantly, the guard that stops
a tampered/legacy `filePath` row from reading arbitrary files off the server.
"""

import os

import pytest

from app.api.endpoints import documents as documents_endpoint
from app.models.document import Document


async def _make_document(db_session, tenant_id, *, filename, path, storage="local"):
    doc = Document(
        filename=filename,
        originalName=filename,
        fileType=filename.rsplit(".", 1)[-1],
        filePath=path,
        storage_type=storage,
        tenantId=tenant_id,
    )
    db_session.add(doc)
    await db_session.commit()
    await db_session.refresh(doc)
    return doc


@pytest.mark.asyncio
async def test_download_returns_the_stored_bytes(
    client, db_session, auth_headers, test_user, tmp_path, monkeypatch
):
    monkeypatch.setattr(documents_endpoint, "UPLOAD_DIR", str(tmp_path))
    stored = tmp_path / "model.stl"
    stored.write_bytes(b"solid test\nendsolid test\n")

    doc = await _make_document(
        db_session, test_user.tenantId, filename="model.stl", path=str(stored)
    )

    resp = await client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.content == b"solid test\nendsolid test\n"


@pytest.mark.asyncio
async def test_download_requires_auth(client, db_session, test_user, tmp_path, monkeypatch):
    monkeypatch.setattr(documents_endpoint, "UPLOAD_DIR", str(tmp_path))
    stored = tmp_path / "a.stl"
    stored.write_bytes(b"x")
    doc = await _make_document(
        db_session, test_user.tenantId, filename="a.stl", path=str(stored)
    )

    resp = await client.get(f"/api/v1/documents/{doc.id}/download")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_download_refuses_paths_outside_the_upload_root(
    client, db_session, auth_headers, test_user, tmp_path, monkeypatch
):
    """SECURITY: filePath comes from the DB and must never escape UPLOAD_DIR.

    Without the containment check this serves the secret file with a 200.
    """
    upload_root = tmp_path / "uploads"
    upload_root.mkdir()
    monkeypatch.setattr(documents_endpoint, "UPLOAD_DIR", str(upload_root))

    secret = tmp_path / "secret.env"
    secret.write_bytes(b"SECRET_KEY=do-not-leak")

    traversal = os.path.join(str(upload_root), "..", "secret.env")
    doc = await _make_document(
        db_session, test_user.tenantId, filename="innocent.stl", path=traversal
    )

    resp = await client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers)
    assert resp.status_code == 404, (
        f"path traversal was served (status {resp.status_code})"
    )
    assert b"do-not-leak" not in resp.content


@pytest.mark.asyncio
async def test_download_404s_when_the_file_is_gone(
    client, db_session, auth_headers, test_user, tmp_path, monkeypatch
):
    monkeypatch.setattr(documents_endpoint, "UPLOAD_DIR", str(tmp_path))
    doc = await _make_document(
        db_session,
        test_user.tenantId,
        filename="missing.stl",
        path=str(tmp_path / "missing.stl"),
    )

    resp = await client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_download_404s_for_unknown_document(client, auth_headers):
    resp = await client.get("/api/v1/documents/999999/download", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_download_serves_local_bytes_when_row_claims_s3(
    client, db_session, auth_headers, test_user, tmp_path, monkeypatch
):
    """Local-first regression.

    Until this was fixed the upload never set storage_type, so every document
    inherited the model default of 's3' even when the bytes were written to
    local disk. On a self-hosted install with no object storage — the supported
    default for this product — the download endpoint then looked in S3, found
    nothing, and 404'd a file sitting in UPLOAD_DIR.
    """
    monkeypatch.setattr(documents_endpoint, "UPLOAD_DIR", str(tmp_path))
    stored = tmp_path / "mislabelled.stl"
    stored.write_bytes(b"local bytes")

    doc = await _make_document(
        db_session,
        test_user.tenantId,
        filename="mislabelled.stl",
        path=str(stored),
        storage="s3",  # what every pre-fix row claims
    )

    resp = await client.get(f"/api/v1/documents/{doc.id}/download", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.content == b"local bytes"


def test_document_storage_defaults_to_local_not_cloud():
    """The product is local-first: cloud storage is optional, never assumed."""
    from app.models.document import Document

    assert Document.__table__.c.storage_type.default.arg == "local"
