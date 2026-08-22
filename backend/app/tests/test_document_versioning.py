"""Document supersede / version-chain tests.

Before this, re-uploading a revised drawing produced two rows both claiming
version 1 and both flagged current, so nothing could answer "which drawing is
current and what did it replace".
"""

import pytest

from app.api.endpoints import documents as documents_endpoint


def _upload(client, headers, name, content, **form):
    return client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": (name, content, "application/pdf")},
        data={k: str(v) for k, v in form.items()},
    )


@pytest.fixture(autouse=True)
def _local_uploads(tmp_path, monkeypatch):
    """Keep uploaded bytes out of the real upload dir.

    s3_storage's local fallback writes under settings.UPLOAD_DIR/s3_fallback,
    and download refuses any path outside the endpoint's UPLOAD_DIR — so both
    have to point at the same root.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    monkeypatch.setattr(documents_endpoint, "UPLOAD_DIR", str(tmp_path))


@pytest.mark.asyncio
async def test_reupload_supersedes_and_leaves_exactly_one_current(
    client, auth_headers, tmp_path
):
    r1 = await _upload(client, auth_headers, "drawing.pdf", b"%PDF-1.4 rev A")
    assert r1.status_code == 201, r1.text
    v1 = r1.json()
    assert v1["version"] == 1 and v1["isLatest"] is True
    assert v1["replacesDocumentId"] is None

    r2 = await _upload(client, auth_headers, "drawing.pdf", b"%PDF-1.4 rev B")
    assert r2.status_code == 201, r2.text
    v2 = r2.json()

    assert v2["version"] == 2
    assert v2["isLatest"] is True
    assert v2["replacesDocumentId"] == v1["id"]

    chain = (
        await client.get(f"/api/v1/documents/{v1['id']}/versions", headers=auth_headers)
    ).json()
    assert [d["version"] for d in chain] == [2, 1], chain
    assert [d["isLatest"] for d in chain] == [True, False]
    assert sum(d["isLatest"] for d in chain) == 1

    # ...and the same chain is reachable from either end.
    from_head = (
        await client.get(f"/api/v1/documents/{v2['id']}/versions", headers=auth_headers)
    ).json()
    assert [d["id"] for d in from_head] == [d["id"] for d in chain]


@pytest.mark.asyncio
async def test_listing_returns_only_the_current_version(client, auth_headers):
    r1 = await _upload(client, auth_headers, "spec.pdf", b"%PDF rev A")
    r2 = await _upload(client, auth_headers, "spec.pdf", b"%PDF rev B")
    assert r2.status_code == 201, r2.text

    listing = (await client.get("/api/v1/documents/", headers=auth_headers)).json()
    items = listing["items"] if isinstance(listing, dict) else listing
    ids = [d["id"] for d in items]

    assert r2.json()["id"] in ids
    assert r1.json()["id"] not in ids


@pytest.mark.asyncio
async def test_superseded_version_still_resolves_to_its_stored_file(
    client, auth_headers
):
    r1 = await _upload(client, auth_headers, "bracket.pdf", b"%PDF rev A bytes")
    r2 = await _upload(client, auth_headers, "bracket.pdf", b"%PDF rev B bytes")
    old_id = r1.json()["id"]

    old = await client.get(f"/api/v1/documents/{old_id}/download", headers=auth_headers)
    assert old.status_code == 200, old.text
    assert old.content == b"%PDF rev A bytes"

    new = await client.get(
        f"/api/v1/documents/{r2.json()['id']}/download", headers=auth_headers
    )
    assert new.content == b"%PDF rev B bytes"


@pytest.mark.asyncio
async def test_superseded_version_cannot_be_deleted(client, auth_headers):
    r1 = await _upload(client, auth_headers, "cascade.pdf", b"%PDF rev A")
    r2 = await _upload(client, auth_headers, "cascade.pdf", b"%PDF rev B")

    resp = await client.delete(
        f"/api/v1/documents/{r1.json()['id']}", headers=auth_headers
    )
    assert resp.status_code == 409, resp.text

    # replacesDocumentId is ON DELETE CASCADE: without the guard this delete
    # would have taken rev B with it.
    still_there = await client.get(
        f"/api/v1/documents/{r2.json()['id']}", headers=auth_headers
    )
    assert still_there.status_code == 200


@pytest.mark.asyncio
async def test_deleting_current_version_promotes_its_predecessor(client, auth_headers):
    r1 = await _upload(client, auth_headers, "promote.pdf", b"%PDF rev A")
    r2 = await _upload(client, auth_headers, "promote.pdf", b"%PDF rev B")

    resp = await client.delete(
        f"/api/v1/documents/{r2.json()['id']}", headers=auth_headers
    )
    assert resp.status_code == 204, resp.text

    back = await client.get(
        f"/api/v1/documents/{r1.json()['id']}", headers=auth_headers
    )
    assert back.status_code == 200
    assert back.json()["isLatest"] is True

    # rev A's bytes were never touched by rev B's arrival or removal.
    dl = await client.get(
        f"/api/v1/documents/{r1.json()['id']}/download", headers=auth_headers
    )
    assert dl.content == b"%PDF rev A"


@pytest.mark.asyncio
async def test_explicit_supersede_across_a_renamed_revision(client, auth_headers):
    r1 = await _upload(client, auth_headers, "rev_a.pdf", b"%PDF A")
    r2 = await _upload(
        client, auth_headers, "rev_b.pdf", b"%PDF B", replacesDocumentId=r1.json()["id"]
    )
    assert r2.status_code == 201, r2.text
    assert r2.json()["version"] == 2
    assert r2.json()["replacesDocumentId"] == r1.json()["id"]

    # A second attempt to supersede the same, now-superseded, row is a conflict.
    r3 = await _upload(
        client, auth_headers, "rev_c.pdf", b"%PDF C", replacesDocumentId=r1.json()["id"]
    )
    assert r3.status_code == 409, r3.text


@pytest.mark.asyncio
async def test_same_name_on_a_different_part_is_not_a_revision(
    client, auth_headers, db_session, test_user
):
    from app.models.part import Part

    parts = [
        Part(pn=f"VER-{i}", name=f"ver {i}", tenantId=test_user.tenantId)
        for i in (1, 2)
    ]
    db_session.add_all(parts)
    await db_session.commit()
    for p in parts:
        await db_session.refresh(p)

    r1 = await _upload(client, auth_headers, "shared.pdf", b"%PDF one", partId=parts[0].id)
    r2 = await _upload(client, auth_headers, "shared.pdf", b"%PDF two", partId=parts[1].id)

    assert r1.json()["version"] == 1
    assert r2.json()["version"] == 1, r2.text
    assert r2.json()["replacesDocumentId"] is None
