import pytest


@pytest.mark.asyncio
async def test_list_approvals(client, auth_headers):
    resp = await client.get("/api/v1/approvals/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_create_approval(client, auth_headers):
    resp = await client.post(
        "/api/v1/approvals/",
        headers=auth_headers,
        json={
            "type": "ecr",
            "title": "Test ECR Approval",
            "description": "Engineering change request",
            "entityType": "part",
            "entityId": 1,
            "status": "pending",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["type"] == "ecr"
    assert data["title"] == "Test ECR Approval"
    assert data["status"] == "pending"
    assert "id" in data
    assert "requestedById" in data


@pytest.mark.asyncio
async def test_list_approvals_with_type_filter(client, auth_headers):
    resp = await client.get(
        "/api/v1/approvals/",
        headers=auth_headers,
        params={"type": "ecr"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data


@pytest.mark.asyncio
async def test_approve_request(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/approvals/",
        headers=auth_headers,
        json={
            "type": "eco",
            "title": "Approve ECO",
            "entityType": "part",
            "entityId": 1,
            "status": "pending",
        },
    )
    approval_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/approvals/{approval_id}",
        headers=auth_headers,
        json={"status": "approved", "comments": "Looks good"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"
    assert resp.json()["approvedById"] is not None


@pytest.mark.asyncio
async def test_reject_request(client, auth_headers):
    create_resp = await client.post(
        "/api/v1/approvals/",
        headers=auth_headers,
        json={
            "type": "ncr",
            "title": "Reject NCR",
            "entityType": "part",
            "entityId": 1,
            "status": "pending",
        },
    )
    approval_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/approvals/{approval_id}",
        headers=auth_headers,
        json={"status": "rejected", "comments": "Needs more info"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"
