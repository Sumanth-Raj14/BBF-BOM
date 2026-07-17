"""WS1 verification — SolidWorks BOM ingest builds a real multi-level BOM,
re-sync is idempotent, and the plugin can authenticate via an API key."""

import pytest


def _payload():
    """A 4-component assembly in pre-order with explicit tree levels:

        Robot Arm Assembly (ASM-100)          level 0  (root, assembly)
          ├─ Base Plate      (PRT-200) x1      level 1
          └─ Servo Motor     (PRT-201) x2      level 1  (assembly)
               └─ M4 Bolt     (PRT-202) x8     level 2
    """
    return {
        "source_file": "C:\\cad\\Robot.SLDASM",
        "model_type": "Assembly",
        "total_components": 4,
        "total_unique_parts": 4,
        "items": [
            {"component_name": "Robot Arm Assembly", "part_number": "ASM-100",
             "quantity": 1, "level": 0, "is_assembly": True, "cost": "0"},
            {"component_name": "Base Plate", "part_number": "PRT-200",
             "quantity": 1, "level": 1, "cost": "12.50", "material": "Aluminum", "vendor": "Acme"},
            {"component_name": "Servo Motor", "part_number": "PRT-201",
             "quantity": 2, "level": 1, "is_assembly": True, "cost": "45.00", "vendor": "MotorCo"},
            {"component_name": "M4 Bolt", "part_number": "PRT-202",
             "quantity": 8, "level": 2, "cost": "0.10"},
        ],
    }


@pytest.mark.asyncio
async def test_solidworks_multilevel_ingest(client, auth_headers):
    resp = await client.post("/api/v1/solidworks/sync", headers=auth_headers, json=_payload())
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    assert data["items_added"] == 4
    assert data["bom_template_id"]

    r2 = await client.get(
        "/api/v1/solidworks/bom-structure",
        headers=auth_headers,
        params={"source_file": "Robot.SLDASM"},
    )
    assert r2.status_code == 200, r2.text
    tree = r2.json()
    assert tree["name"] == "Robot.SLDASM"
    assert tree["total_items"] == 4
    assert tree["levels"] == 3

    # exactly one root (the top assembly)
    assert len(tree["tree"]) == 1
    root = tree["tree"][0]
    assert root["part_number"] == "ASM-100"
    assert root["is_assembly"] is True

    # root has two direct children
    child_pns = sorted(c["part_number"] for c in root["children"])
    assert child_pns == ["PRT-200", "PRT-201"]

    # the M4 bolt nests under the Servo Motor (level 2 under level 1)
    servo = next(c for c in root["children"] if c["part_number"] == "PRT-201")
    assert servo["quantity"] == 2
    assert len(servo["children"]) == 1
    bolt = servo["children"][0]
    assert bolt["part_number"] == "PRT-202"
    assert bolt["quantity"] == 8
    assert bolt["extended_cost"] == pytest.approx(0.8)


@pytest.mark.asyncio
async def test_solidworks_resync_is_idempotent(client, auth_headers):
    await client.post("/api/v1/solidworks/sync", headers=auth_headers, json=_payload())
    resp = await client.post("/api/v1/solidworks/sync", headers=auth_headers, json=_payload())
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # parts already exist → updated, not duplicated
    assert data["items_added"] == 0
    assert data["items_updated"] == 4

    r2 = await client.get(
        "/api/v1/solidworks/bom-structure",
        headers=auth_headers,
        params={"source_file": "Robot.SLDASM"},
    )
    assert r2.json()["total_items"] == 4  # rebuilt, not doubled


@pytest.mark.asyncio
async def test_plugin_login_with_api_key(client, db_session, test_user):
    from app.core.security import get_password_hash
    from app.models.api_key import ApiKey

    raw = "bkb_pluginkey_test_123"
    db_session.add(
        ApiKey(
            user_id=test_user.id,
            name="SolidWorks Add-in",
            key_hash=get_password_hash(raw),
            key_prefix="bkb",
            is_active=True,
            tenantId=test_user.tenantId,
        )
    )
    await db_session.commit()

    resp = await client.post(
        "/api/v1/auth/plugin-login",
        json={"api_key": raw, "client_type": "solidworks_addin", "client_version": "1.0.0"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["session_id"]
    assert data["user"]["email"] == "test@example.com"

    # the returned session token authenticates a protected SolidWorks call
    token = data["session_id"]
    r2 = await client.get(
        "/api/v1/solidworks/bom-structure",
        headers={"Authorization": f"Bearer {token}"},
        params={"source_file": "DoesNotExist.SLDASM"},
    )
    # 404 (no such BOM) proves auth passed — a 401 would mean the token was rejected
    assert r2.status_code == 404, r2.text


@pytest.mark.asyncio
async def test_plugin_login_rejects_bad_key(client, test_user):
    resp = await client.post("/api/v1/auth/plugin-login", json={"api_key": "bkb_totally_wrong"})
    assert resp.status_code == 401, resp.text
