"""Authentication and authorization tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_register_user(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "test@example.com",
            "username": "testuser",
            "password": "TestPass123!",
            "fullName": "Test User",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.anyio
async def test_register_duplicate_email(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={"email": "dup@example.com", "username": "user1", "password": "TestPass123!"},
    )
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "dup@example.com", "username": "user2", "password": "TestPass123!"},
    )
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"]


@pytest.mark.anyio
async def test_register_weak_password(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "weak@example.com", "username": "weakuser", "password": "short"},
    )
    assert response.status_code == 422

    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "weak2@example.com", "username": "weak2", "password": "nouppercase1!"},
    )
    assert response.status_code == 422

    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "weak3@example.com", "username": "weak3", "password": "NOLOWERCASE1!"},
    )
    assert response.status_code == 422

    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "weak4@example.com", "username": "weak4", "password": "NoSpecialChar1"},
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_login_success(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={"email": "login@example.com", "username": "loginuser", "password": "ValidPass123!"},
    )
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "ValidPass123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.anyio
async def test_login_wrong_password(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={"email": "wrong@example.com", "username": "wronguser", "password": "ValidPass123!"},
    )
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "wrong@example.com", "password": "WrongPass123!"},
    )
    assert response.status_code == 401


@pytest.mark.anyio
async def test_login_nonexistent_user(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "AnyPass123!"},
    )
    assert response.status_code == 401


@pytest.mark.anyio
async def test_refresh_token(client: AsyncClient):
    register_resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "refresh@example.com",
            "username": "refreshuser",
            "password": "ValidPass123!",
        },
    )
    tokens = register_resp.json()
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data


@pytest.mark.anyio
async def test_get_current_user(client: AsyncClient):
    register_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "me@example.com", "username": "meuser", "password": "ValidPass123!"},
    )
    token = register_resp.json()["access_token"]
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "me@example.com"
    assert data["username"] == "meuser"


@pytest.mark.anyio
async def test_mfa_setup(client: AsyncClient):
    register_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "mfa@example.com", "username": "mfauser", "password": "ValidPass123!"},
    )
    token = register_resp.json()["access_token"]
    response = await client.post(
        "/api/v1/auth/mfa/setup",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "secret" in data
    assert "qr_uri" in data
    assert "backup_codes" in data
    assert len(data["backup_codes"]) == 8


@pytest.mark.anyio
async def test_mfa_disable(client: AsyncClient):
    register_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "mfadis@example.com", "username": "mfadisuser", "password": "ValidPass123!"},
    )
    token = register_resp.json()["access_token"]
    await client.post("/api/v1/auth/mfa/setup", headers={"Authorization": f"Bearer {token}"})
    response = await client.post(
        "/api/v1/auth/mfa/disable",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is False


@pytest.mark.anyio
async def test_logout(client: AsyncClient):
    register_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "logout@example.com", "username": "logoutuser", "password": "ValidPass123!"},
    )
    token = register_resp.json()["access_token"]
    response = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
