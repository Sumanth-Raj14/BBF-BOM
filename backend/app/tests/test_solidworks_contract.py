"""Tests for the SolidWorks contract endpoints:

- Property-mapping CRUD (app/api/endpoints/solidworks_contract.py)
- Pending-change (write-back outbox) round trip, wired through the existing
  /solidworks/changes GET/POST endpoints in solidworks_integration.py
- Complex part-number generation via /solidworks/generate-part-number
"""

import pytest

from app.models.enterprise_extensions import AutoNumberScheme


# ---------------------------------------------------------------------------
# Property-mapping CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_property_mappings_require_auth(client):
    resp = await client.get("/api/v1/solidworks/property-mappings")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_property_mapping_crud_round_trip(client, auth_headers):
    create = await client.post(
        "/api/v1/solidworks/property-mappings",
        headers=auth_headers,
        json={"sw_property": "Material", "target_field": "material"},
    )
    assert create.status_code == 200, create.text
    created = create.json()
    assert created["sw_property"] == "Material"
    assert created["target_field"] == "material"
    assert created["is_excluded"] is False
    assert isinstance(created["id"], int)

    listing = await client.get("/api/v1/solidworks/property-mappings", headers=auth_headers)
    assert listing.status_code == 200
    assert any(m["sw_property"] == "Material" for m in listing.json())

    # Upsert on sw_property: same property name updates the existing row
    # rather than creating a duplicate.
    updated = await client.post(
        "/api/v1/solidworks/property-mappings",
        headers=auth_headers,
        json={"sw_property": "Material", "is_excluded": True},
    )
    assert updated.status_code == 200, updated.text
    updated_body = updated.json()
    assert updated_body["id"] == created["id"]
    assert updated_body["is_excluded"] is True
    assert updated_body["target_field"] == "material"  # unchanged (not passed)

    listing2 = await client.get("/api/v1/solidworks/property-mappings", headers=auth_headers)
    assert len(listing2.json()) == 1

    deleted = await client.delete(
        f"/api/v1/solidworks/property-mappings/{created['id']}", headers=auth_headers
    )
    assert deleted.status_code == 200

    listing3 = await client.get("/api/v1/solidworks/property-mappings", headers=auth_headers)
    assert listing3.json() == []


@pytest.mark.asyncio
async def test_set_property_mapping_defaults_target_field_when_excluding(client, auth_headers):
    """Marking a property excluded without naming a target field should not
    fail NOT NULL — it defaults target_field to the property name."""
    resp = await client.post(
        "/api/v1/solidworks/property-mappings",
        headers=auth_headers,
        json={"sw_property": "Vendor Notes", "is_excluded": True},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["target_field"] == "Vendor Notes"
    assert body["is_excluded"] is True


@pytest.mark.asyncio
async def test_delete_property_mapping_not_found(client, auth_headers):
    resp = await client.delete("/api/v1/solidworks/property-mappings/999999", headers=auth_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Pending-change write-back outbox
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pending_change_round_trip_then_marked_applied(client, auth_headers):
    change = {
        "change_id": "c1",
        "type": "property_update",
        "part_number": "SW-100",
        "property": "material",
        "old_value": "Steel",
        "new_value": "Aluminum",
        "user_name": "tester",
        "timestamp": "2026-07-19T00:00:00Z",
        "reason": "CAD update",
    }
    add_resp = await client.post(
        "/api/v1/solidworks/changes",
        headers=auth_headers,
        params={"model": "Widget.SLDASM"},
        json=[change],
    )
    assert add_resp.status_code == 200, add_resp.text
    assert add_resp.json() == {"success": True, "count": 1}

    get_resp = await client.get(
        "/api/v1/solidworks/changes",
        headers=auth_headers,
        params={"model": "Widget.SLDASM"},
    )
    assert get_resp.status_code == 200
    changes = get_resp.json()
    assert len(changes) == 1
    assert changes[0]["change_id"] == "c1"
    assert changes[0]["property"] == "material"
    assert changes[0]["new_value"] == "Aluminum"

    # Delivered changes are marked applied — a second fetch returns nothing.
    get_resp2 = await client.get(
        "/api/v1/solidworks/changes",
        headers=auth_headers,
        params={"model": "Widget.SLDASM"},
    )
    assert get_resp2.json() == []


@pytest.mark.asyncio
async def test_pending_changes_scoped_by_model(client, auth_headers):
    change = {
        "change_id": "c2",
        "type": "property_update",
        "part_number": "SW-200",
        "property": "vendor",
        "old_value": None,
        "new_value": "Acme",
        "timestamp": "2026-07-19T00:00:00Z",
    }
    await client.post(
        "/api/v1/solidworks/changes",
        headers=auth_headers,
        params={"model": "OtherModel.SLDASM"},
        json=[change],
    )

    # A different model's queue should not see it.
    unrelated = await client.get(
        "/api/v1/solidworks/changes",
        headers=auth_headers,
        params={"model": "Widget.SLDASM"},
    )
    assert unrelated.json() == []

    matching = await client.get(
        "/api/v1/solidworks/changes",
        headers=auth_headers,
        params={"model": "OtherModel.SLDASM"},
    )
    assert len(matching.json()) == 1
    assert matching.json()[0]["change_id"] == "c2"


@pytest.mark.asyncio
async def test_pending_changes_unknown_part_filter_returns_empty(client, auth_headers):
    resp = await client.get(
        "/api/v1/solidworks/changes",
        headers=auth_headers,
        params={"model": "Widget.SLDASM", "part": "DOES-NOT-EXIST"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# Complex part-number generation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_part_number_missing_scheme(client, auth_headers):
    resp = await client.post(
        "/api/v1/solidworks/generate-part-number",
        headers=auth_headers,
        json={"entity_type": "does_not_exist"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_generate_part_number_simple_sequence(client, auth_headers, db_session, tenant_id):
    scheme = AutoNumberScheme(
        tenantId=tenant_id,
        entity_type="sw_complex_part",
        prefix="ASM",
        separator="-",
        next_number=7,
        padding=4,
        suffix=None,
        is_active=True,
    )
    db_session.add(scheme)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/solidworks/generate-part-number",
        headers=auth_headers,
        json={"entity_type": "sw_complex_part"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["number"] == "ASM-0007"
    assert body["entity_type"] == "sw_complex_part"
    assert body["next"] == 8

    # Calling again advances the counter.
    resp2 = await client.post(
        "/api/v1/solidworks/generate-part-number",
        headers=auth_headers,
        json={"entity_type": "sw_complex_part"},
    )
    assert resp2.json()["number"] == "ASM-0008"


@pytest.mark.asyncio
async def test_generate_part_number_with_sw_derived_tokens(
    client, auth_headers, db_session, tenant_id
):
    scheme = AutoNumberScheme(
        tenantId=tenant_id,
        entity_type="sw_complex_part_v2",
        prefix="{material}",
        separator="-",
        next_number=1,
        padding=3,
        suffix="-{project}",
        is_active=True,
    )
    db_session.add(scheme)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/solidworks/generate-part-number",
        headers=auth_headers,
        json={
            "entity_type": "sw_complex_part_v2",
            "inputs": {"material": "AL", "project": "X1"},
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["number"] == "AL-001-X1"


@pytest.mark.asyncio
async def test_generate_part_number_unresolved_token_falls_back_to_template(
    client, auth_headers, db_session, tenant_id
):
    scheme = AutoNumberScheme(
        tenantId=tenant_id,
        entity_type="sw_complex_part_v3",
        prefix="{material}",
        separator="-",
        next_number=1,
        padding=3,
        is_active=True,
    )
    db_session.add(scheme)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/solidworks/generate-part-number",
        headers=auth_headers,
        json={"entity_type": "sw_complex_part_v3"},
    )
    assert resp.status_code == 200, resp.text
    # No `material` input supplied — falls back to the literal template.
    assert resp.json()["number"] == "{material}-001"
