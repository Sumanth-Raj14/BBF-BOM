import pytest

from app.models.part import Part

# Action endpoint (POST /sync, ...) + GET /vault/stats. Exact-code smoke tests.


@pytest.mark.asyncio
async def test_cad_vault_stats(client, auth_headers):
    resp = await client.get("/api/v1/cad/vault/stats", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_cad_sync(client, auth_headers):
    resp = await client.post(
        "/api/v1/cad/sync", headers=auth_headers, json={"name": "test"}
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_cad_apply_sync_response_matches_what_it_did(client, auth_headers, db_session):
    """apply-sync writes nothing, so it must not report having applied anything.

    Regression guard: the endpoint used to look each part up, count it, write
    nothing, and return {"status": "applied", "appliedCount": N}, which the PDM
    UI printed as "Sync complete - N changes applied - audit logged".
    """
    part = Part(pn="CAD-APPLY-001", name="Bracket", description="original", tenantId=1)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)

    resp = await client.post(
        "/api/v1/cad/apply-sync",
        headers=auth_headers,
        json=[{"pn": "CAD-APPLY-001", "change": "File parsed: STEP", "direction": "pull"}],
    )

    assert resp.status_code == 501
    body = resp.json()
    assert "not implemented" in body["detail"].lower()
    # Must not assert an applied count or a success status anywhere in the payload.
    assert "appliedCount" not in body
    assert "applied" not in str(body.get("status", "")).lower()

    # And nothing was in fact written.
    await db_session.refresh(part)
    assert part.description == "original"


@pytest.mark.asyncio
async def test_cad_vault_stats_without_auth(client):
    resp = await client.get("/api/v1/cad/vault/stats")
    assert resp.status_code == 401
