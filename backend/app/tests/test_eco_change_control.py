"""TDD tests for ECO change-control guardrails (R8).

Covers:
  (a) the ECO creator/requester cannot approve their own ECO (403)
  (b) approving from an invalid source state is rejected (409/422)
  (c) a different, authorized user can approve a submitted ECO — status
      advances and an EcoApproval row is recorded (not hardcoded order=1)

NOTE: uses non-superuser, role-bearing users (rather than conftest's
`test_user`/`auth_headers`, which are superusers) because
`User.effective_tenant_id` returns None for superusers, and ECO creation
needs a real tenantId. Two distinct "engineering" users are created so
self-approval vs. other-approval can be distinguished.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.security import get_password_hash
from app.models.eco import EcoApproval
from app.models.role import Role, user_roles
from app.models.user import User


@pytest_asyncio.fixture
async def engineering_role(db_session, test_tenant, tenant_id):
    role = Role(name="engineering", tenantId=tenant_id)
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
    # get_current_user() prefers request.cookies["access_token"] over the
    # explicit Bearer header. Since all fixtures share one AsyncClient (one
    # cookie jar), the *last* login's cookie would otherwise silently
    # override every other identity's Authorization header. Clear the auth
    # cookie so each caller's explicit Bearer header is what actually
    # determines identity.
    client.cookies.delete("access_token")
    client.cookies.delete("refresh_token")
    return headers


@pytest_asyncio.fixture
async def creator(db_session, tenant_id, engineering_role):
    return await _make_user(db_session, tenant_id, engineering_role, "creator@example.com", "creatoruser")


@pytest_asyncio.fixture
async def approver(db_session, tenant_id, engineering_role):
    return await _make_user(
        db_session, tenant_id, engineering_role, "approver@example.com", "approveruser"
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
    return resp


@pytest.mark.asyncio
async def test_self_approval_is_rejected(client, creator_headers, creator):
    """(a) The ECO creator cannot approve their own ECO."""
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)

    resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=creator_headers,
        json={"action": "approve", "comments": "self-approving"},
    )
    assert resp.status_code in (403, 422), resp.text


@pytest.mark.asyncio
async def test_approve_from_invalid_source_state_is_rejected(
    client, creator_headers, approver_headers
):
    """(b) Approving an ECO that is still in 'draft' (never submitted) is rejected."""
    eco_id = await _create_eco(client, creator_headers)
    # NOTE: no submit — eco.status is still "draft"

    resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=approver_headers,
        json={"action": "approve", "comments": "approving from draft"},
    )
    assert resp.status_code in (409, 422), resp.text


@pytest.mark.asyncio
async def test_authorized_user_can_approve_submitted_eco(
    client, creator_headers, approver_headers, approver, db_session
):
    """(c) A different, authorized user can approve a submitted ECO — status
    advances and an EcoApproval row is recorded with a real approval_order."""
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)

    resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=approver_headers,
        json={"action": "approve", "comments": "looks good"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "approved"

    result = await db_session.execute(select(EcoApproval).where(EcoApproval.eco_id == eco_id))
    approvals = result.scalars().all()
    assert len(approvals) == 1
    approval = approvals[0]
    assert approval.approver_id == approver.id
    assert approval.status == "approved"
    assert approval.approval_order == 1
