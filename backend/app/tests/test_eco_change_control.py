"""TDD tests for ECO change-control guardrails (R8).

Covers:
  (a) the ECO creator/requester cannot approve their own ECO (403)
  (b) approving from an invalid source state is rejected (409/422)
  (c) a different, designated-approver user can approve a submitted ECO —
      status advances and an EcoApproval row is recorded (not hardcoded
      order=1)
  (d) a non-approver — an engineering user who is neither the creator nor
      holds the designated-approver role — is rejected with 403. This is
      the "any engineer can approve any ECO" prong: merely passing the
      endpoint's `require_engineering` gate and not being the creator must
      NOT be sufficient to approve.

NOTE: uses non-superuser, role-bearing users (rather than conftest's
`test_user`/`auth_headers`, which are superusers) because
`User.effective_tenant_id` returns None for superusers, and ECO creation
needs a real tenantId. Distinct users/roles are created so self-approval,
designated-approver-approval, and non-approver-approval can all be
distinguished.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.security import get_password_hash
from app.models.eco import EcoApproval, EcoNotification
from app.models.notification_queue import NotificationQueue
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
async def approver(db_session, tenant_id, admin_role):
    """A designated approver: holds the admin-level role required to
    approve an ECO (R8's ECO_APPROVER_ROLES), distinct from plain
    "engineering"."""
    return await _make_user(
        db_session, tenant_id, admin_role, "approver@example.com", "approveruser"
    )


@pytest_asyncio.fixture
async def non_approver_engineer(db_session, tenant_id, engineering_role):
    """A second engineer — NOT the creator, and NOT a designated approver
    (only holds "engineering", not "admin"/"superadmin"). Used to prove
    that merely being an authenticated engineer other than the creator is
    not sufficient to approve an ECO."""
    return await _make_user(
        db_session, tenant_id, engineering_role, "other-engineer@example.com", "otherengineeruser"
    )


@pytest_asyncio.fixture
async def creator_headers(client, creator):
    return await _login(client, "creator@example.com")


@pytest_asyncio.fixture
async def approver_headers(client, approver):
    return await _login(client, "approver@example.com")


@pytest_asyncio.fixture
async def non_approver_headers(client, non_approver_engineer):
    return await _login(client, "other-engineer@example.com")


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
        json={"action": "approve", "comments": "self-approving", "password": "testpass123"},
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
        json={"action": "approve", "comments": "approving from draft", "password": "testpass123"},
    )
    assert resp.status_code in (409, 422), resp.text


@pytest.mark.asyncio
async def test_non_approver_engineer_cannot_approve(
    client, creator_headers, non_approver_headers, non_approver_engineer, db_session
):
    """(d) A user who passes the endpoint's `require_engineering` gate and is
    NOT the creator must still be rejected if they lack the designated
    ECO-approver role. This is the "any engineer can approve any ECO" prong
    of D9 — distinct from self-approval, which is already covered by
    test_self_approval_is_rejected above."""
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)

    resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=non_approver_headers,
        json={
            "action": "approve",
            "comments": "I'll just approve this myself",
            "password": "testpass123",
        },
    )
    assert resp.status_code == 403, resp.text

    # No approval was recorded and the ECO did not advance to "approved".
    result = await db_session.execute(select(EcoApproval).where(EcoApproval.eco_id == eco_id))
    assert result.scalars().all() == []
    detail_resp = await client.get(f"/api/v1/eco/{eco_id}", headers=creator_headers)
    assert detail_resp.json()["status"] == "review"


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
        json={"action": "approve", "comments": "looks good", "password": "testpass123"},
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


# ---------------------------------------------------------------------------
# Change notifications: ECO transitions must actually tell the humans waiting
# on them. Before this, eco_notifications / notifications_queue rows were never
# constructed anywhere, so approvals were pull-only and the email dispatcher
# drained an empty queue forever.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_submit_notifies_designated_approver(
    client, creator_headers, creator, approver, db_session
):
    """Submitting an ECO notifies the designated approver — and only them."""
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)

    result = await db_session.execute(
        select(EcoNotification).where(EcoNotification.eco_id == eco_id)
    )
    notes = result.scalars().all()
    assert [n.user_id for n in notes] == [approver.id]
    assert notes[0].notification_type == "approval_requested"
    assert notes[0].tenantId == creator.tenantId
    # The submitter is not told about their own submission.
    assert creator.id not in [n.user_id for n in notes]

    # Queued for the existing email dispatcher, not sent inline.
    queued = await db_session.execute(
        select(NotificationQueue).where(
            NotificationQueue.reference_type == "eco", NotificationQueue.reference_id == eco_id
        )
    )
    rows = queued.scalars().all()
    assert [q.user_id for q in rows] == [approver.id]
    assert rows[0].channel == "email"
    assert rows[0].is_sent is False


@pytest.mark.asyncio
async def test_approve_notifies_requester(
    client, creator_headers, approver_headers, creator, db_session
):
    """Approval tells the person who asked for the change."""
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)
    resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=approver_headers,
        json={"action": "approve", "comments": "ok", "password": "testpass123"},
    )
    assert resp.status_code == 200, resp.text

    result = await db_session.execute(
        select(EcoNotification).where(
            EcoNotification.eco_id == eco_id,
            EcoNotification.notification_type == "approved",
        )
    )
    assert [n.user_id for n in result.scalars().all()] == [creator.id]


@pytest.mark.asyncio
async def test_implement_notifies_requester_and_approver(
    client, creator_headers, approver_headers, creator, approver, db_session
):
    """Implementation tells the requester and everyone who signed off."""
    eco_id = await _create_eco(client, creator_headers)
    await _submit_eco(client, creator_headers, eco_id)
    await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=approver_headers,
        json={"action": "approve", "password": "testpass123"},
    )
    resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=creator_headers,
        json={"action": "implement", "password": "testpass123"},
    )
    assert resp.status_code == 200, resp.text

    result = await db_session.execute(
        select(EcoNotification).where(
            EcoNotification.eco_id == eco_id,
            EcoNotification.notification_type == "implemented",
        )
    )
    # creator is the actor here, so only the approver is told.
    assert {n.user_id for n in result.scalars().all()} == {approver.id}


@pytest.mark.asyncio
async def test_notification_failure_does_not_fail_eco_action(
    client, creator_headers, approver, db_session, monkeypatch
):
    """A broken notification path must never roll back or 500 the ECO action."""
    from app.services import eco_service

    async def boom(*args, **kwargs):
        raise RuntimeError("notification backend exploded")

    monkeypatch.setattr(eco_service, "_eco_recipients", boom)

    eco_id = await _create_eco(client, creator_headers)
    resp = await client.post(
        f"/api/v1/eco/{eco_id}/action",
        headers=creator_headers,
        json={"action": "submit"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "review"

    # The transition survived; only the notification was lost.
    detail = await client.get(f"/api/v1/eco/{eco_id}", headers=creator_headers)
    assert detail.json()["status"] == "review"
    result = await db_session.execute(
        select(EcoNotification).where(EcoNotification.eco_id == eco_id)
    )
    assert result.scalars().all() == []
