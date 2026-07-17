"""Search and filter tests."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.role import Role, user_roles


@pytest.fixture
async def auth_token(client: AsyncClient, db_session: AsyncSession) -> str:
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "search@example.com",
            "username": "searchuser",
            "password": "SearchPass123!",
        },
    )
    user_id = resp.json().get("id")
    if user_id is None:
        from app.core.security import verify_token

        payload = verify_token(resp.json()["access_token"])
        user_id = int(payload["sub"])
    result = await db_session.execute(select(Role).where(Role.name == "engineering"))
    role = result.scalar_one_or_none()
    if role:
        await db_session.execute(user_roles.insert().values(user_id=user_id, role_id=role.id))
        await db_session.commit()
    return resp.json()["access_token"]


@pytest.mark.anyio
async def test_search_by_category(client: AsyncClient, auth_token: str):
    await client.post(
        "/api/v1/parts/",
        json={"pn": "CAT-001", "name": "Cat Part 1", "category": "Mechanical"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    await client.post(
        "/api/v1/parts/",
        json={"pn": "CAT-002", "name": "Cat Part 2", "category": "Mechanical"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    response = await client.get(
        "/api/v1/parts/?category=Mechanical",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 2


@pytest.mark.anyio
async def test_search_by_vendor(client: AsyncClient, auth_token: str):
    await client.post(
        "/api/v1/parts/",
        json={"pn": "VEN-001", "name": "Vendor Part", "vendor": "AcmeCorp"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    response = await client.get(
        "/api/v1/parts/?vendor=AcmeCorp",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1


@pytest.mark.anyio
async def test_search_vendors_by_name(client: AsyncClient, auth_token: str):
    await client.post(
        "/api/v1/vendors/",
        json={"name": "SearchableVendor Inc."},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    response = await client.get(
        "/api/v1/vendors/?search=SearchableVendor",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) >= 1


@pytest.mark.anyio
async def test_filter_projects_by_status(client: AsyncClient, auth_token: str):
    await client.post(
        "/api/v1/projects/",
        json={"code": "ST-ACTIVE", "name": "Active Project", "status": "active"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    response = await client.get(
        "/api/v1/projects/?status=active",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1


@pytest.mark.anyio
async def test_search_users(client: AsyncClient, auth_token: str):
    response = await client.get(
        "/api/v1/users/?search=searchuser",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
