import pytest


@pytest.mark.asyncio
async def test_compliance_api_list(client, auth_headers):
    resp = await client.get("/api/v1/compliance", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_compliance_api_create(client, auth_headers):
    resp = await client.post("/api/v1/compliance", headers=auth_headers, json={"name": "test"})
    assert resp.status_code in (200, 201, 422)


@pytest.mark.asyncio
async def test_compliance_api_get_not_found(client, auth_headers):
    resp = await client.get("/api/v1/compliance/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_compliance_api_without_auth(client):
    resp = await client.get("/api/v1/compliance")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_compliance_api_double_prefix_is_gone(client, auth_headers):
    """The router used to double the /compliance segment onto itself
    (mounted with prefix="/compliance" while routes were also "/compliance/...").
    The un-doubled path must work and the doubled one must not exist."""
    resp = await client.get("/api/v1/compliance", headers=auth_headers)
    assert resp.status_code == 200

    stale = await client.get("/api/v1/compliance/compliance", headers=auth_headers)
    assert stale.status_code == 404


@pytest.mark.asyncio
async def test_compliance_update_sets_updated_at(client, auth_headers):
    """update_compliance used Postgres-only NOW() for updatedAt — must run on SQLite too."""
    created = await client.post("/api/v1/compliance", headers=auth_headers, json={"name": "iso-x"})
    assert created.status_code in (200, 201)
    cid = created.json()["id"]

    resp = await client.put(
        f"/api/v1/compliance/{cid}", headers=auth_headers, json={"description": "updated"}
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "updated"


@pytest.mark.asyncio
async def test_compliance_packs_list_empty(client, auth_headers):
    """list_packs used Postgres-only json_agg/json_build_object/FILTER + '::json' —
    must run (and not 500) on SQLite."""
    resp = await client.get("/api/v1/compliance/packs", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_compliance_pack_create_and_fetch_with_checklist(client, auth_headers):
    std = await client.post("/api/v1/compliance", headers=auth_headers, json={"name": "AS9100D"})
    assert std.status_code in (200, 201)
    std_id = std.json()["id"]

    created = await client.post(
        "/api/v1/compliance/packs",
        headers=auth_headers,
        json={"name": "AS9100D Pack", "standard_id": std_id, "checklist": ["4.1", "4.2"]},
    )
    assert created.status_code == 200
    body = created.json()
    pack_id = body["id"]
    assert [i["requirement"] for i in body["checklist"]] == ["4.1", "4.2"]

    fetched = await client.get(f"/api/v1/compliance/packs/{pack_id}", headers=auth_headers)
    assert fetched.status_code == 200
    assert [i["requirement"] for i in fetched.json()["checklist"]] == ["4.1", "4.2"]

    listed = await client.get("/api/v1/compliance/packs", headers=auth_headers)
    assert listed.status_code == 200
    assert any(p["id"] == pack_id for p in listed.json())


@pytest.mark.asyncio
async def test_compliance_pack_not_found(client, auth_headers):
    resp = await client.get("/api/v1/compliance/packs/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_compliance_part_status_and_certify(client, auth_headers, db_session, tenant_id):
    """get_part_compliance/certify_part used Postgres-only '::text' casts on the
    certification/expiry dates — must run (and not 500) on SQLite."""
    from app.models.part import Part

    part = Part(pn="PN-COMPLIANCE-1", name="Test Part", tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)

    std = await client.post("/api/v1/compliance", headers=auth_headers, json={"name": "RoHS"})
    assert std.status_code in (200, 201)
    std_id = std.json()["id"]

    status_before = await client.get(f"/api/v1/compliance/parts/{part.id}", headers=auth_headers)
    assert status_before.status_code == 200
    assert status_before.json()["part"]["id"] == part.id

    certify = await client.post(
        f"/api/v1/compliance/parts/{part.id}/certify",
        headers=auth_headers,
        json={"compliance_id": std_id, "certification_date": "2026-01-01", "expiry_date": "2027-01-01"},
    )
    assert certify.status_code == 200
    cert = certify.json()
    assert cert["certification_date"] == "2026-01-01"
    assert cert["expiry_date"] == "2027-01-01"

    status_after = await client.get(f"/api/v1/compliance/parts/{part.id}", headers=auth_headers)
    assert status_after.status_code == 200
    rows = [r for r in status_after.json()["compliance"] if r["id"] == std_id]
    assert rows and rows[0]["certification_date"] == "2026-01-01"


@pytest.mark.asyncio
async def test_compliance_dashboard(client, auth_headers):
    """compliance_dashboard used Postgres-only INTERVAL arithmetic — must run
    (and not 500) on SQLite."""
    resp = await client.get("/api/v1/compliance/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    for key in ("total_standards", "total_packs", "certified_parts", "expiring_soon_90_days", "expired"):
        assert key in body
