import pytest


@pytest.mark.asyncio
async def test_list_approval_rules(client, auth_headers):
    resp = await client.get("/api/v1/approval-automation/rules", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data


@pytest.mark.asyncio
async def test_create_approval_rule(client, auth_headers):
    resp = await client.post(
        "/api/v1/approval-automation/rules",
        headers=auth_headers,
        json={
            "name": "Auto-approve low value",
            "description": "Auto-approve POs under $1000",
            "entityType": "PO",
            "conditionField": "poTotal",
            "conditionOperator": "lt",
            "conditionValue": "1000",
            "action": "auto_approve",
            "isActive": True,
            "priority": 10,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Auto-approve low value"
    assert data["entityType"] == "PO"
    assert data["conditionOperator"] == "lt"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_approval_rule(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/approval-automation/rules",
        headers=auth_headers,
        json={
            "name": "Get Rule",
            "entityType": "ECR",
            "conditionField": "status",
            "conditionOperator": "eq",
            "conditionValue": "pending",
            "action": "notify",
        },
    )
    rule_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/approval-automation/rules/{rule_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Get Rule"


@pytest.mark.asyncio
async def test_get_approval_rule_not_found(client, auth_headers):
    resp = await client.get("/api/v1/approval-automation/rules/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_approval_rule(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/approval-automation/rules",
        headers=auth_headers,
        json={
            "name": "Old Rule",
            "entityType": "PO",
            "conditionField": "poTotal",
            "conditionOperator": "gt",
            "conditionValue": "5000",
            "action": "reject",
        },
    )
    rule_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/approval-automation/rules/{rule_id}",
        headers=auth_headers,
        json={"name": "Updated Rule", "conditionValue": "10000"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Rule"
    assert resp.json()["conditionValue"] == "10000"


@pytest.mark.asyncio
async def test_delete_approval_rule(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/approval-automation/rules",
        headers=auth_headers,
        json={
            "name": "Delete Rule",
            "entityType": "PO",
            "conditionField": "poTotal",
            "conditionOperator": "gt",
            "conditionValue": "1000",
            "action": "reject",
        },
    )
    rule_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/approval-automation/rules/{rule_id}", headers=auth_headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_approval_rule_not_found(client, auth_headers):
    resp = await client.delete("/api/v1/approval-automation/rules/99999", headers=auth_headers)
    assert resp.status_code == 404
