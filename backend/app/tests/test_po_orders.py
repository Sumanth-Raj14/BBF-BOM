import pytest


@pytest.mark.asyncio
async def test_list_po_orders(client, auth_headers):
    resp = await client.get("/api/v1/po-orders", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data


@pytest.mark.asyncio
async def test_po_stats(client, auth_headers):
    resp = await client.get("/api/v1/po-orders/stats", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "totalPOs" in data
    assert "totalValue" in data
    assert "totalItems" in data
    assert "byStatus" in data
    assert "byProject" in data
    assert "byVendor" in data


@pytest.mark.asyncio
async def test_get_po_detail_not_found(client, auth_headers):
    resp = await client.get("/api/v1/po-orders/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_po_orders_with_filters(client, auth_headers):
    resp = await client.get(
        "/api/v1/po-orders", headers=auth_headers, params={"status": "Order Placed"}
    )
    assert resp.status_code == 200
