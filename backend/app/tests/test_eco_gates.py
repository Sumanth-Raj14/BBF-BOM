"""Schema-gates cluster: authorization gates missing on create_ecr/create_ecn,
and a forgeable userId on audit-log creation.

Uses non-superuser, role-bearing users (like test_eco_change_control.py)
rather than conftest's superuser test_user/auth_headers, because the
require_engineering gate under test is bypassed entirely for superusers.
"""

import pytest
import pytest_asyncio

from app.core.security import get_password_hash
from app.models.audit_log import AuditLog
from app.models.role import Role, user_roles
from app.models.user import User


@pytest_asyncio.fixture
async def viewer_role(db_session, test_tenant, tenant_id):
    role = Role(name="viewer", tenantId=tenant_id)
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
async def viewer(db_session, tenant_id, viewer_role):
    """Passes the router's require_viewer gate but NOT require_engineering."""
    return await _make_user(db_session, tenant_id, viewer_role, "viewer@example.com", "vieweruser")


@pytest_asyncio.fixture
async def viewer_headers(client, viewer):
    return await _login(client, "viewer@example.com")


@pytest.mark.asyncio
async def test_create_ecr_rejects_non_engineering_user(client, viewer_headers):
    # RED (pre-fix): create_ecr only depended on get_current_user, so any
    # viewer-role user passed straight through to a 200/201 instead of 403.
    resp = await client.post(
        "/api/v1/eco/ecr",
        headers=viewer_headers,
        params={"title": "t", "description": "d", "requested_by": 1},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_ecn_rejects_non_engineering_user(client, viewer_headers):
    # RED (pre-fix): create_ecn only depended on get_current_user, so any
    # viewer-role user passed straight through (then 404 for the missing
    # eco_id, never a 403).
    resp = await client.post(
        "/api/v1/eco/ecn",
        headers=viewer_headers,
        params={"eco_id": 99999, "description": "d"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_audit_log_userid_forgery_ignored(client, viewer_headers, viewer, db_session):
    # RED (pre-fix): create_audit_log did AuditLog(**log.model_dump()), so the
    # forged userId=999999 in the request body was written verbatim instead
    # of being replaced by the authenticated caller's id.
    resp = await client.post(
        "/api/v1/audit-logs/",
        headers=viewer_headers,
        json={"action": "CREATE", "entityType": "part", "userId": 999999},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["userId"] == viewer.id
    assert body["userId"] != 999999

    row = await db_session.get(AuditLog, body["id"])
    assert row.userId == viewer.id
