"""CRUD and pagination tests for core entities."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.role import Role, user_roles


@pytest.fixture
async def auth_token(client: AsyncClient, db_session: AsyncSession) -> str:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "crud@example.com", "username": "cruduser", "password": "TestPass123!"},
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
async def test_create_part(client: AsyncClient, auth_token: str):
    response = await client.post(
        "/api/v1/parts/",
        json={
            "pn": "TEST-RES-0001",
            "name": "Test Resistor 10k",
            "category": "Electrical",
            "cost": 0.10,
        },
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["pn"] == "TEST-RES-0001"
    assert data["name"] == "Test Resistor 10k"
    assert "id" in data


@pytest.mark.anyio
async def test_create_duplicate_part(client: AsyncClient, auth_token: str):
    await client.post(
        "/api/v1/parts/",
        json={"pn": "TEST-DUP-0001", "name": "Duplicate"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    response = await client.post(
        "/api/v1/parts/",
        json={"pn": "TEST-DUP-0001", "name": "Duplicate Again"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


@pytest.mark.anyio
async def test_get_part_by_id(client: AsyncClient, auth_token: str):
    create_resp = await client.post(
        "/api/v1/parts/",
        json={"pn": "TEST-GET-0001", "name": "Get Test Part"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    part_id = create_resp.json()["id"]
    response = await client.get(
        f"/api/v1/parts/{part_id}",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    assert response.json()["pn"] == "TEST-GET-0001"


@pytest.mark.anyio
async def test_get_part_not_found(client: AsyncClient, auth_token: str):
    response = await client.get(
        "/api/v1/parts/99999",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 404


@pytest.mark.anyio
async def test_update_part(client: AsyncClient, auth_token: str):
    create_resp = await client.post(
        "/api/v1/parts/",
        json={"pn": "TEST-UPD-0001", "name": "Original Name"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    part_id = create_resp.json()["id"]
    response = await client.put(
        f"/api/v1/parts/{part_id}",
        json={"name": "Updated Name", "cost": 1.50},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Name"
    assert response.json()["cost"] == 1.50


@pytest.mark.anyio
async def test_delete_part(client: AsyncClient, auth_token: str):
    create_resp = await client.post(
        "/api/v1/parts/",
        json={"pn": "TEST-DEL-0001", "name": "Delete Me"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    part_id = create_resp.json()["id"]
    response = await client.delete(
        f"/api/v1/parts/{part_id}",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 204


@pytest.mark.anyio
async def test_list_parts_pagination(client: AsyncClient, auth_token: str):
    for i in range(5):
        await client.post(
            "/api/v1/parts/",
            json={"pn": f"PAG-PART-{i:04d}", "name": f"Paginated Part {i}"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
    response = await client.get(
        "/api/v1/parts/?page=1&per_page=3",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "per_page" in data
    assert "total_pages" in data
    assert "has_next" in data
    assert "has_prev" in data
    assert data["page"] == 1
    assert data["per_page"] == 3
    assert len(data["items"]) <= 3


@pytest.mark.anyio
async def test_create_vendor(client: AsyncClient, auth_token: str):
    response = await client.post(
        "/api/v1/vendors/",
        json={"name": "Test Vendor Inc.", "country": "US", "leadTime": 14},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 201
    assert response.json()["name"] == "Test Vendor Inc."


@pytest.mark.anyio
async def test_list_vendors_pagination(client: AsyncClient, auth_token: str):
    for i in range(3):
        await client.post(
            "/api/v1/vendors/",
            json={"name": f"Vendor {i}", "country": "US"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
    response = await client.get(
        "/api/v1/vendors/?page=1&per_page=10",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert data["page"] == 1


@pytest.mark.anyio
async def test_get_vendor_by_id(client: AsyncClient, auth_token: str):
    create_resp = await client.post(
        "/api/v1/vendors/",
        json={"name": "Specific Vendor"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    vendor_id = create_resp.json()["id"]
    response = await client.get(
        f"/api/v1/vendors/{vendor_id}",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200


@pytest.mark.anyio
async def test_create_project(client: AsyncClient, auth_token: str):
    response = await client.post(
        "/api/v1/projects/",
        json={"code": "PRJ-001", "name": "Test Project"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 201
    assert response.json()["code"] == "PRJ-001"


@pytest.mark.anyio
async def test_list_projects_pagination(client: AsyncClient, auth_token: str):
    for i in range(3):
        await client.post(
            "/api/v1/projects/",
            json={"code": f"PRJ-{i:03d}", "name": f"Project {i}"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
    response = await client.get(
        "/api/v1/projects/?page=1&per_page=10",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


@pytest.mark.anyio
async def test_create_user_admin(client: AsyncClient, auth_token: str):
    response = await client.post(
        "/api/v1/users/",
        json={
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "NewUserPass123!",
            "fullName": "New User",
        },
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code in (201, 403)


@pytest.mark.anyio
async def test_list_users_pagination(client: AsyncClient, auth_token: str):
    response = await client.get(
        "/api/v1/users/?page=1&per_page=10",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert data["page"] == 1


@pytest.mark.anyio
async def test_health_check(client: AsyncClient):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.anyio
async def test_search_parts(client: AsyncClient, auth_token: str):
    await client.post(
        "/api/v1/parts/",
        json={"pn": "SRCH-001", "name": "Searchable Resistor"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    response = await client.get(
        "/api/v1/parts/?search=Resistor",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) > 0


@pytest.mark.anyio
async def test_unauthorized_access(client: AsyncClient):
    response = await client.get("/api/v1/parts/")
    assert response.status_code == 401


@pytest.mark.anyio
async def test_invalid_token(client: AsyncClient):
    response = await client.get(
        "/api/v1/parts/",
        headers={"Authorization": "Bearer invalid_token_here"},
    )
    assert response.status_code == 401


@pytest.mark.anyio
async def test_root_endpoint(client: AsyncClient):
    response = await client.get("/")
    assert response.status_code == 200
    assert "Blackbox BOM" in response.json()["message"]


@pytest.mark.anyio
async def test_create_multiple_parts_bulk(client: AsyncClient, auth_token: str):
    ids = []
    for i in range(10):
        resp = await client.post(
            "/api/v1/parts/",
            json={"pn": f"BULK-{i:04d}", "name": f"Bulk Part {i}"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 201
        ids.append(resp.json()["id"])
    assert len(ids) == 10


@pytest.mark.anyio
async def test_check_duplicate_pn(client: AsyncClient, auth_token: str):
    await client.post(
        "/api/v1/parts/",
        json={"pn": "DUPCHECK-001", "name": "Duplicate Check"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    response = await client.post(
        "/api/v1/parts/check-duplicates",
        json={"pn": "DUPCHECK-001"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert response.status_code == 200
    assert len(response.json()) > 0
