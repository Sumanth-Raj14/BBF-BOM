"""RBAC (Role-Based Access Control) tests."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.role import Role, user_roles


@pytest.fixture
async def admin_token(client: AsyncClient, db_session: AsyncSession) -> str:
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "rbac_admin@example.com",
            "username": "rbacadmin",
            "password": "AdminPass123!",
        },
    )
    user_id = resp.json().get("id")
    if user_id is None:
        from app.core.security import verify_token

        payload = verify_token(resp.json()["access_token"])
        user_id = int(payload["sub"])
    result = await db_session.execute(select(Role).where(Role.name == "admin"))
    role = result.scalar_one_or_none()
    if role:
        await db_session.execute(user_roles.insert().values(user_id=user_id, role_id=role.id))
        await db_session.commit()
    return resp.json()["access_token"]


@pytest.mark.anyio
async def test_list_roles(client: AsyncClient, admin_token: str):
    response = await client.get(
        "/api/v1/rbac/roles",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.anyio
async def test_list_permissions(client: AsyncClient, admin_token: str):
    response = await client.get(
        "/api/v1/rbac/permissions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) > 0
