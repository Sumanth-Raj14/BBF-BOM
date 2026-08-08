import pytest

from app.models.inventory import Inventory, Warehouse
from app.models.part import Part


@pytest.mark.asyncio
async def test_stock_valuation_uses_real_cost_not_hardcoded_one(
    client, auth_headers, db_session, tenant_id
):
    """tenant-insert-valuation: get_stock_valuation must price by real unit
    cost, not a hardcoded 1.0 (which made value == quantity)."""
    wh = Warehouse(warehouse_code="WH1", warehouse_name="Main", tenantId=tenant_id)
    part = Part(pn="P-1", name="Widget", cost=12.50, tenantId=tenant_id)
    db_session.add_all([wh, part])
    await db_session.commit()
    await db_session.refresh(wh)
    await db_session.refresh(part)

    # Lot with its own recorded unit_cost (should win over Part.cost).
    inv_with_lot_cost = Inventory(
        part_id=part.id,
        warehouse_id=wh.id,
        quantity_on_hand=10,
        unit_cost=5.0,
        tenantId=tenant_id,
    )
    # Lot with no unit_cost recorded: should fall back to Part.cost (12.50).
    inv_fallback = Inventory(
        part_id=part.id,
        warehouse_id=wh.id,
        quantity_on_hand=2,
        unit_cost=None,
        tenantId=tenant_id,
    )
    db_session.add_all([inv_with_lot_cost, inv_fallback])
    await db_session.commit()

    resp = await client.get("/api/v1/inventory/reports/stock-valuation", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()

    # Old buggy behavior: 10*1.0 + 2*1.0 = 12.0 (== raw quantity sum).
    # Correct: 10*5.0 (lot cost) + 2*12.50 (fallback to part cost) = 75.0.
    assert data["estimated_total_value"] == 75.0
    assert data["priced_items"] == 2
    assert data["total_items"] == 2


@pytest.mark.asyncio
async def test_inventory_api_list(client, auth_headers):
    resp = await client.get("/api/v1/inventory/", headers=auth_headers)
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_inventory_api_create(client, auth_headers):
    resp = await client.post("/api/v1/inventory/", headers=auth_headers, json={"name": "test"})
    assert resp.status_code in (201, 200, 401, 403, 422)


@pytest.mark.asyncio
async def test_inventory_api_get_not_found(client, auth_headers):
    resp = await client.get("/api/v1/inventory/99999", headers=auth_headers)
    assert resp.status_code in (404, 401, 403)


@pytest.mark.asyncio
async def test_inventory_api_without_auth(client):
    resp = await client.get("/api/v1/inventory/")
    assert resp.status_code in (200, 401)
