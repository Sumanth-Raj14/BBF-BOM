import io

import pytest


@pytest.mark.asyncio
async def test_full_workflow_vendor_part_bom(client, auth_headers):
    vendor_resp = await client.post(
        "/api/v1/vendors/",
        headers=auth_headers,
        json={
            "name": "Integration Vendor",
            "country": "US",
            "leadTime": 14,
            "reliabilityRating": 4.5,
        },
    )
    assert vendor_resp.status_code == 201
    vendor_id = vendor_resp.json()["id"]

    part_resp = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={
            "pn": "INT-001",
            "name": "Integration Part",
            "category": "Electrical",
            "cost": 25.50,
        },
    )
    assert part_resp.status_code == 201
    part_id = part_resp.json()["id"]

    template_resp = await client.post(
        "/api/v1/bom-templates/",
        headers=auth_headers,
        json={
            "name": "Integration BOM",
            "description": "Test integration BOM",
            "projectCode": "INT-PRJ-001",
        },
    )
    assert template_resp.status_code == 201
    bom_id = template_resp.json()["id"]

    load_resp = await client.post(f"/api/v1/bom-templates/{bom_id}/load", headers=auth_headers)
    assert load_resp.status_code == 200

    get_resp = await client.get(f"/api/v1/bom-templates/{bom_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Integration BOM"

    vendor_get = await client.get(f"/api/v1/vendors/{vendor_id}", headers=auth_headers)
    assert vendor_get.status_code == 200
    assert vendor_get.json()["name"] == "Integration Vendor"

    part_get = await client.get(f"/api/v1/parts/{part_id}", headers=auth_headers)
    assert part_get.status_code == 200
    assert part_get.json()["pn"] == "INT-001"


@pytest.mark.asyncio
async def test_po_workflow(client, auth_headers, db_session):
    from app.models.po_models import POHeader, POLineItem

    po = POHeader(
        poNumber="PO-2026-0001",
        vendorName="PO Vendor",
        project="Test Project",
        poTotal=1000.0,
        status="draft",
    )
    db_session.add(po)
    await db_session.commit()
    await db_session.refresh(po)

    item = POLineItem(
        headerId=po.id,
        itemName="Test Item",
        quantity=10,
        itemPrice=100.0,
        amount=1000.0,
        total=1000.0,
    )
    db_session.add(item)
    await db_session.commit()

    resp = await client.get("/api/v1/po-orders", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data
    assert data["total"] > 0

    stats_resp = await client.get("/api/v1/po-orders/stats", headers=auth_headers)
    assert stats_resp.status_code == 200
    stats = stats_resp.json()
    assert "totalPOs" in stats
    assert stats["totalPOs"] > 0

    first_po = data["items"][0]
    detail_resp = await client.get(f"/api/v1/po-orders/{first_po['id']}", headers=auth_headers)
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert "items" in detail
    assert isinstance(detail["items"], list)


@pytest.mark.asyncio
async def test_webhook_delivery_workflow(client, auth_headers):
    sub_resp = await client.post(
        "/api/v1/webhooks",
        headers=auth_headers,
        json={
            "url": "https://httpbin.org/post",
            "events": "test.delivery",
            "active": True,
        },
    )
    assert sub_resp.status_code == 200
    sub_resp.json()["id"]

    deliveries_resp = await client.get("/api/v1/webhooks/deliveries", headers=auth_headers)
    assert deliveries_resp.status_code == 200
    assert "total" in deliveries_resp.json()


@pytest.mark.asyncio
async def test_bulk_import_workflow(client, auth_headers):
    upload_resp = await client.post(
        "/api/v1/import/upload",
        headers=auth_headers,
        files={
            "file": (
                "workflow.csv",
                io.BytesIO(
                    b"pn,name,category\nWF-001,Workflow Part,Electrical\nWF-002,Workflow Part 2,Mechanical\n"
                ),
                "text/csv",
            )
        },
    )
    assert upload_resp.status_code == 200
    job_id = upload_resp.json()["id"]

    status_resp = await client.get(f"/api/v1/import/{job_id}/status", headers=auth_headers)
    assert status_resp.status_code == 200
    assert status_resp.json()["job"]["id"] == job_id

    process_resp = await client.post(
        f"/api/v1/import/{job_id}/process",
        headers=auth_headers,
        json={"mappingConfig": {"pn": "pn", "name": "name"}},
    )
    assert process_resp.status_code == 200
    assert process_resp.json()["status"] in ("completed", "completed_with_errors")

    errors_resp = await client.get(f"/api/v1/import/{job_id}/errors", headers=auth_headers)
    assert errors_resp.status_code == 200


@pytest.mark.asyncio
async def test_approval_automation_workflow(client, auth_headers):
    rule_resp = await client.post(
        "/api/v1/approval-automation/rules",
        headers=auth_headers,
        json={
            "name": "Auto-approve low value POs",
            "entityType": "PO",
            "conditionField": "poTotal",
            "conditionOperator": "lt",
            "conditionValue": "500",
            "action": "auto_approve",
            "isActive": True,
            "priority": 10,
        },
    )
    assert rule_resp.status_code == 201
    rule_id = rule_resp.json()["id"]

    rules_resp = await client.get("/api/v1/approval-automation/rules", headers=auth_headers)
    assert rules_resp.status_code == 200
    found = any(r["id"] == rule_id for r in rules_resp.json()["items"])
    assert found

    update_resp = await client.put(
        f"/api/v1/approval-automation/rules/{rule_id}",
        headers=auth_headers,
        json={"conditionValue": "1000", "priority": 20},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["conditionValue"] == "1000"

    del_resp = await client.delete(
        f"/api/v1/approval-automation/rules/{rule_id}", headers=auth_headers
    )
    assert del_resp.status_code == 204
