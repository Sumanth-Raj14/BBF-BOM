import pytest


@pytest.mark.asyncio
async def test_register(client):
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "Newpass123!",
            "fullName": "New User",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_duplicate_email(client, test_user):
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "test@example.com",
            "username": "uniqueuser",
            "password": "Pass123!",
        },
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_login(client, test_user):
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "testpass123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_login_wrong_password(client, test_user):
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "wrongpass"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me(client, auth_headers):
    resp = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "test@example.com"
    assert data["username"] == "testuser"


@pytest.mark.asyncio
async def test_refresh_token(client, test_user):
    login_resp = await client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "testpass123"},
    )
    refresh = login_resp.json()["refresh_token"]
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_login_sets_cookies(client, test_user):
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "testpass123"},
    )
    assert "set-cookie" in resp.headers
    set_cookie = resp.headers["set-cookie"]
    assert "access_token=" in set_cookie
    assert "httponly" in set_cookie.lower()


@pytest.mark.asyncio
async def test_cookie_auth(client, test_user):
    login_resp = await client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "testpass123"},
    )
    access_cookie = login_resp.cookies.get("access_token")
    resp = await client.get(
        "/api/v1/auth/me",
        cookies={"access_token": access_cookie},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_cookie_refresh(client, test_user):
    login_resp = await client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "testpass123"},
    )
    refresh_token = login_resp.json()["refresh_token"]
    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_logout_clears_cookies(client, test_user, auth_headers):
    resp = await client.post("/api/v1/auth/logout", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Logged out successfully"


@pytest.mark.asyncio
async def test_register_sets_cookies(client):
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "cookietest@example.com",
            "username": "cookietest",
            "password": "Pass123!",
        },
    )
    assert "set-cookie" in resp.headers
    assert "access_token=" in resp.headers["set-cookie"]


@pytest.mark.asyncio
async def test_no_token_returns_401(client):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401
