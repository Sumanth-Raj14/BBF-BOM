import pytest


@pytest.mark.asyncio
async def test_create_supplier_user(client, auth_headers):
    resp = await client.post(
        "/api/v1/supplier-portal/users",
        json={
            "vendorId": 1,
            "email": "supplier@example.com",
            "name": "Test Supplier",
            "password": "supplierpass123",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "supplier@example.com"
    assert data["name"] == "Test Supplier"
    assert data["vendorId"] == 1


@pytest.mark.asyncio
async def test_create_supplier_user_duplicate_email(client, auth_headers):
    await client.post(
        "/api/v1/supplier-portal/users",
        json={
            "vendorId": 1,
            "email": "dup-supplier@example.com",
            "name": "Dup Supplier",
            "password": "pass123",
        },
        headers=auth_headers,
    )
    resp = await client.post(
        "/api/v1/supplier-portal/users",
        json={
            "vendorId": 2,
            "email": "dup-supplier@example.com",
            "name": "Dup Supplier 2",
            "password": "pass456",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_supplier_login(client, auth_headers):
    await client.post(
        "/api/v1/supplier-portal/users",
        json={
            "vendorId": 1,
            "email": "login-supplier@example.com",
            "name": "Login Supplier",
            "password": "loginpass123",
        },
        headers=auth_headers,
    )
    resp = await client.post(
        "/api/v1/supplier-portal/login",
        json={"email": "login-supplier@example.com", "password": "loginpass123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "user" in data
    assert data["user"]["email"] == "login-supplier@example.com"


@pytest.mark.asyncio
async def test_supplier_login_invalid_credentials(client, auth_headers):
    resp = await client.post(
        "/api/v1/supplier-portal/login",
        json={"email": "nonexistent@example.com", "password": "wrongpass"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_price_updates(client, auth_headers):
    # Create supplier user
    await client.post(
        "/api/v1/supplier-portal/users",
        json={
            "vendorId": 1,
            "email": "list-price-supplier@example.com",
            "name": "List Price Supplier",
            "password": "listprice123",
        },
        headers=auth_headers,
    )
    # Login to get JWT
    login_resp = await client.post(
        "/api/v1/supplier-portal/login",
        json={"email": "list-price-supplier@example.com", "password": "listprice123"},
    )
    token = login_resp.json()["access_token"]
    supplier_auth = {"Authorization": f"Bearer {token}"}
    resp = await client.get("/api/v1/supplier-portal/price-updates", headers=supplier_auth)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "items" in data


@pytest.mark.asyncio
async def test_submit_price_update(client, auth_headers):
    await client.post(
        "/api/v1/supplier-portal/users",
        json={
            "vendorId": 1,
            "email": "price-supplier@example.com",
            "name": "Price Supplier",
            "password": "pricepass123",
        },
        headers=auth_headers,
    )
    login_resp = await client.post(
        "/api/v1/supplier-portal/login",
        json={"email": "price-supplier@example.com", "password": "pricepass123"},
    )
    token = login_resp.json()["access_token"]
    supplier_auth = {"Authorization": f"Bearer {token}"}
    resp = await client.post(
        "/api/v1/supplier-portal/price-updates",
        headers=supplier_auth,
        json={"partId": 1, "newPrice": 25.50},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["newPrice"] == 25.50
    assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_submit_price_update_unauthorized(client, auth_headers):
    resp = await client.post(
        "/api/v1/supplier-portal/price-updates",
        json={"partId": 1, "newPrice": 10.0},
    )
    assert resp.status_code == 401
