"""TDD tests for 21 CFR Part 11 electronic signatures + audit trail.

Covers:
  (a) approving an ECO without a valid signature/re-auth (missing or wrong
      password) is rejected (401) and does NOT transition ECO state.
  (b) with valid re-auth (correct password), the ECO transitions AND an
      ESignature row + AuditLog row exist for the action, both tenant-scoped
      to the acting user's tenant.
  (c) ESignature and AuditLog rows cannot be mutated via the API — no
      PUT/PATCH/DELETE route exists for either.
  (d) cross-tenant isolation — a tenant-2 admin listing signatures/audit-log
      entries never sees tenant-1's rows, and vice versa.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.security import get_password_hash
from app.core.tenant_context import TenantContext
from app.models.audit_log import AuditLog
from app.models.esignature import ESignature
from app.models.role import Role, user_roles
from app.models.tenant import Tenant
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


async def _make_user(db_session, tenant_id, role, email, username, password="testpass123"):
    user = User(
        email=email,
        username=username,
        fullName=username,
        hashedPassword=get_password_hash(password),
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


async def _login(client, email, password="testpass123"):
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    token = resp.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    csrf_cookie = client.cookies.get("csrf_token")
    if csrf_cookie:
        headers["X-CSRF-Token"] = csrf_cookie.split(".")[0]
    # See test_eco_change_control.py: clear the cookie-based identity so each
    # caller's explicit Bearer header determines who the request is from.
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


# ---------------------------------------------------------------------------
# (a) missing/invalid re-auth blocks the transition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_approve_without_password_is_rejected(client, creator_headers, approver_headers):
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)

    resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=approver_headers,
        json={"action": "approve", "comments": "looks good"},  # no password
    )
    assert resp.status_code == 401, resp.text

    detail = await client.get(f"/api/v1/eco/{eco_id}", headers=creator_headers)
    assert detail.json()["status"] == "review"


@pytest.mark.asyncio
async def test_approve_with_wrong_password_is_rejected(client, creator_headers, approver_headers):
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)

    resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=approver_headers,
        json={"action": "approve", "comments": "looks good", "password": "wrong-password"},
    )
    assert resp.status_code == 401, resp.text

    detail = await client.get(f"/api/v1/eco/{eco_id}", headers=creator_headers)
    assert detail.json()["status"] == "review"


@pytest.mark.asyncio
async def test_implement_without_password_is_rejected(
    client, creator_headers, approver_headers
):
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)
    approve_resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=approver_headers,
        json={"action": "approve", "comments": "looks good", "password": "testpass123"},
    )
    assert approve_resp.status_code == 200, approve_resp.text

    resp = await client.post(
        f"/api/v1/eco/{eco_id}/implement",
        headers=creator_headers,
        params={"notes": "rolling out"},  # no password
    )
    assert resp.status_code == 401, resp.text

    detail = await client.get(f"/api/v1/eco/{eco_id}", headers=creator_headers)
    assert detail.json()["status"] == "approved"


# ---------------------------------------------------------------------------
# (b) valid re-auth: transition succeeds + ESignature/AuditLog rows exist
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_approve_with_valid_password_signs_and_transitions(
    client, creator_headers, approver_headers, approver, tenant_id, db_session
):
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)

    resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=approver_headers,
        json={
            "action": "approve",
            "comments": "looks good",
            "password": "testpass123",
            "signature_meaning": "I approve this engineering change",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "approved"

    sig_result = await db_session.execute(
        select(ESignature).where(
            ESignature.entity_type == "eco",
            ESignature.entity_id == eco_id,
            ESignature.action == "eco.approve",
        )
    )
    signatures = sig_result.scalars().all()
    assert len(signatures) == 1
    sig = signatures[0]
    assert sig.user_id == approver.id
    assert sig.tenantId == tenant_id
    assert sig.meaning == "I approve this engineering change"
    assert sig.content_hash  # non-empty integrity hash

    audit_result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entityType == "eco",
            AuditLog.entityId == eco_id,
            AuditLog.action == "eco.approve",
        )
    )
    audits = audit_result.scalars().all()
    assert len(audits) == 1
    assert audits[0].userId == approver.id
    assert audits[0].tenantId == tenant_id


@pytest.mark.asyncio
async def test_implement_with_valid_password_signs_and_transitions(
    client, creator_headers, approver_headers, creator, tenant_id, db_session
):
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)
    approve_resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=approver_headers,
        json={"action": "approve", "comments": "looks good", "password": "testpass123"},
    )
    assert approve_resp.status_code == 200, approve_resp.text

    resp = await client.post(
        f"/api/v1/eco/{eco_id}/implement",
        headers=creator_headers,
        params={"notes": "rolling out", "password": "testpass123"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "implemented"

    sig_result = await db_session.execute(
        select(ESignature).where(
            ESignature.entity_type == "eco",
            ESignature.entity_id == eco_id,
            ESignature.action == "eco.implement",
        )
    )
    signatures = sig_result.scalars().all()
    assert len(signatures) == 1
    assert signatures[0].user_id == creator.id
    assert signatures[0].tenantId == tenant_id

    audit_result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entityType == "eco",
            AuditLog.entityId == eco_id,
            AuditLog.action == "eco.implement",
        )
    )
    assert len(audit_result.scalars().all()) == 1


# ---------------------------------------------------------------------------
# (c) immutability — no update/delete route exists for either model
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_esignature_rows_cannot_be_mutated_via_api(
    client, creator_headers, approver_headers, db_session
):
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)
    await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=approver_headers,
        json={"action": "approve", "comments": "looks good", "password": "testpass123"},
    )

    sig_result = await db_session.execute(select(ESignature).where(ESignature.entity_id == eco_id))
    sig = sig_result.scalars().first()
    assert sig is not None

    put_resp = await client.put(
        f"/api/v1/esignatures/{sig.id}",
        headers=approver_headers,
        json={"meaning": "tampered"},
    )
    assert put_resp.status_code in (404, 405)

    delete_resp = await client.delete(f"/api/v1/esignatures/{sig.id}", headers=approver_headers)
    assert delete_resp.status_code in (404, 405)


@pytest.mark.asyncio
async def test_audit_log_rows_cannot_be_mutated_via_api(
    client, creator_headers, approver_headers, db_session
):
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)
    await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=approver_headers,
        json={"action": "approve", "comments": "looks good", "password": "testpass123"},
    )

    audit_result = await db_session.execute(
        select(AuditLog).where(AuditLog.entityId == eco_id, AuditLog.action == "eco.approve")
    )
    log = audit_result.scalars().first()
    assert log is not None

    put_resp = await client.put(
        f"/api/v1/audit-logs/{log.id}",
        headers=approver_headers,
        json={"action": "tampered"},
    )
    assert put_resp.status_code in (404, 405)

    delete_resp = await client.delete(f"/api/v1/audit-logs/{log.id}", headers=approver_headers)
    assert delete_resp.status_code in (404, 405)


# ---------------------------------------------------------------------------
# (d) cross-tenant isolation
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def second_tenant(db_session):
    tenant = Tenant(id=2, tenant_name="Second Tenant", tenant_code="TEST2")
    db_session.add(tenant)
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture
async def admin_role_t2(db_session, second_tenant):
    token = TenantContext.set(tenant_id=second_tenant.id)
    try:
        role = Role(name="admin", tenantId=second_tenant.id)
        db_session.add(role)
        await db_session.commit()
        await db_session.refresh(role)
        return role
    finally:
        TenantContext.reset(token)


@pytest_asyncio.fixture
async def admin_t2(db_session, second_tenant, admin_role_t2):
    return await _make_user(
        db_session, second_tenant.id, admin_role_t2, "admin-t2@example.com", "admint2user"
    )


@pytest_asyncio.fixture
async def admin_t2_headers(client, admin_t2, second_tenant):
    # Login itself updates the User row (failedLoginAttempts/lastLoginAt) via
    # a plain db.commit() — the tenant-scoped update guard in
    # app.core.tenant_events requires the ambient tenant context to match the
    # row's own tenantId at that moment. The autouse `setup_tenant_context`
    # fixture pins the ambient context to tenant 1 for the whole test, so
    # logging in as a tenant-2 user needs the context switched to tenant 2
    # for the duration of this one call.
    token = TenantContext.set(tenant_id=second_tenant.id)
    try:
        return await _login(client, "admin-t2@example.com")
    finally:
        TenantContext.reset(token)


@pytest.mark.asyncio
async def test_signatures_and_audit_log_are_tenant_isolated(
    client,
    creator_headers,
    approver_headers,
    admin_t2_headers,
    admin_t2,
    second_tenant,
):
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)
    approve_resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=approver_headers,
        json={"action": "approve", "comments": "looks good", "password": "testpass123"},
    )
    assert approve_resp.status_code == 200, approve_resp.text

    # Tenant-1's own admin can see the signature for tenant 1.
    own_resp = await client.get(
        "/api/v1/esignatures/", headers=approver_headers, params={"entity_type": "eco"}
    )
    assert own_resp.status_code == 200, own_resp.text
    own_items = own_resp.json()["items"]
    assert any(item["entity_id"] == eco_id for item in own_items)

    # Tenant-2's admin must NOT see tenant-1's signature.
    cross_resp = await client.get(
        "/api/v1/esignatures/", headers=admin_t2_headers, params={"entity_type": "eco"}
    )
    assert cross_resp.status_code == 200, cross_resp.text
    cross_items = cross_resp.json()["items"]
    assert all(item["entity_id"] != eco_id for item in cross_items)

    # Same for the audit log.
    own_audit = await client.get(
        "/api/v1/audit-logs/", headers=approver_headers, params={"entityType": "eco", "entityId": eco_id}
    )
    assert own_audit.status_code == 200, own_audit.text
    assert len(own_audit.json()["items"]) >= 1

    cross_audit = await client.get(
        "/api/v1/audit-logs/", headers=admin_t2_headers, params={"entityType": "eco", "entityId": eco_id}
    )
    assert cross_audit.status_code == 200, cross_audit.text
    assert cross_audit.json()["items"] == []
