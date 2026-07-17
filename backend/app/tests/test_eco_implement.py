"""TDD tests closing the ECO /implement bypass.

POST /eco/{id}/implement previously set status='implemented' directly with
NO source-state check (draft/review -> implemented, skipping approval
entirely) and its SELECT was not tenant-scoped. Fixed by routing /implement
through the same state-machine guard used by perform_eco_action (only
'approved' -> 'implemented' is legal) and tenant-scoping the lookup exactly
like perform_eco_action.

Covers:
  (a) implementing an ECO that is NOT approved (still 'draft') is rejected
      with 400/409 and status does not change.
  (b) implementing an ECO that IS approved succeeds and sets
      status='implemented'.
"""

import pytest
import pytest_asyncio

from app.core.security import get_password_hash
from app.models.role import Role, user_roles
from app.models.user import User


@pytest_asyncio.fixture
async def engineering_role(db_session, test_tenant, tenant_id):
    role = Role(name="engineering", tenantId=tenant_id)
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)
    return role


@pytest_asyncio.fixture
async def admin_role(db_session, test_tenant, tenant_id):
    role = Role(name="admin", tenantId=tenant_id)
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)
    return role


async def _make_user(db_session, tenant_id, role, email, username):
    user = User(
        email=email,
        username=username,
        fullName=username,
        hashedPassword=get_password_hash("testpass123"),
        isActive=True,
        isSuperuser=False,
        tenantId=tenant_id,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.execute(user_roles.insert().values(user_id=user.id, role_id=role.id))
    await db_session.commit()
    return user


async def _login(client, email):
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "testpass123"},
    )
    token = resp.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    csrf_cookie = client.cookies.get("csrf_token")
    if csrf_cookie:
        headers["X-CSRF-Token"] = csrf_cookie.split(".")[0]
    client.cookies.delete("access_token")
    client.cookies.delete("refresh_token")
    return headers


@pytest_asyncio.fixture
async def creator(db_session, tenant_id, engineering_role):
    return await _make_user(db_session, tenant_id, engineering_role, "creator@example.com", "creatoruser")


@pytest_asyncio.fixture
async def approver(db_session, tenant_id, admin_role):
    return await _make_user(
        db_session, tenant_id, admin_role, "approver@example.com", "approveruser"
    )


@pytest_asyncio.fixture
async def creator_headers(client, creator):
    return await _login(client, "creator@example.com")


@pytest_asyncio.fixture
async def approver_headers(client, approver):
    return await _login(client, "approver@example.com")


async def _create_eco(client, headers):
    resp = await client.post(
        "/api/v1/eco/",
        headers=headers,
        json={"title": "Change the widget", "change_type": "design"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


async def _submit_eco(client, headers, eco_id):
    resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=headers,
        json={"action": "submit"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "review"


async def _approve_eco(client, headers, eco_id):
    resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=headers,
        json={"action": "approve", "comments": "looks good"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_implement_draft_eco_is_rejected(client, creator_headers, creator):
    """(a) Implementing an ECO that is still 'draft' (never approved) must
    be rejected — approval cannot be bypassed via /implement."""
    eco_id = await _create_eco(client, creator_headers)
    # NOTE: no submit/approve — eco.status is still "draft"

    resp = await client.post(
        f"/api/v1/eco/{eco_id}/implement",
        headers=creator_headers,
        params={"notes": "skipping approval"},
    )
    assert resp.status_code in (400, 409), resp.text

    detail_resp = await client.get(f"/api/v1/eco/{eco_id}", headers=creator_headers)
    assert detail_resp.json()["status"] == "draft"


@pytest.mark.asyncio
async def test_implement_review_eco_is_rejected(client, creator_headers, creator):
    """Implementing an ECO in 'review' (submitted but not yet approved) must
    also be rejected."""
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)

    resp = await client.post(
        f"/api/v1/eco/{eco_id}/implement",
        headers=creator_headers,
        params={"notes": "skipping approval"},
    )
    assert resp.status_code in (400, 409), resp.text

    detail_resp = await client.get(f"/api/v1/eco/{eco_id}", headers=creator_headers)
    assert detail_resp.json()["status"] == "review"


@pytest.mark.asyncio
async def test_implement_approved_eco_succeeds(
    client, creator_headers, approver_headers, creator
):
    """(b) Implementing an ECO that IS approved succeeds and sets
    status='implemented'."""
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)
    await _approve_eco(client, approver_headers, eco_id)

    resp = await client.post(
        f"/api/v1/eco/{eco_id}/implement",
        headers=creator_headers,
        params={"notes": "rolled out to production"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "implemented"

    detail_resp = await client.get(f"/api/v1/eco/{eco_id}", headers=creator_headers)
    assert detail_resp.json()["status"] == "implemented"
