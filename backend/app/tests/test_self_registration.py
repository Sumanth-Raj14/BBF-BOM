"""TDD for the self-registration tenant-breach fix.

Bug: unauthenticated POST /register did `select(Tenant).limit(1)` and silently
joined the new user to whichever tenant happened to be first in the table —
letting any anonymous signer-upper join an existing (unrelated) tenant.

Secure default: if NO tenant exists yet, the first registration bootstraps a
brand-new tenant and makes that user its admin. If a tenant already exists,
open self-registration is REJECTED (403) — new members must be invited by an
admin instead.
"""

import pytest
from sqlalchemy import select

from app.models.tenant import Tenant
from app.models.user import User


@pytest.mark.asyncio
async def test_self_registration_rejected_when_tenant_exists(client, test_tenant, db_session):
    """Anonymous /register must NOT join an already-existing tenant."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "intruder@example.com",
            "username": "intruder",
            "password": "Intrude123!",
        },
    )

    assert resp.status_code == 403

    result = await db_session.execute(select(User).where(User.email == "intruder@example.com"))
    assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_first_registration_bootstraps_new_tenant(client, db_session):
    """With NO tenant present, registration bootstraps a fresh tenant and the
    registering user becomes its admin."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "founder@example.com",
            "username": "founder",
            "password": "Founder123!",
        },
    )

    assert resp.status_code == 201

    result = await db_session.execute(select(User).where(User.email == "founder@example.com"))
    user = result.scalar_one()
    assert user.tenantId is not None
    assert user.isSuperuser is True

    tenants = (await db_session.execute(select(Tenant))).scalars().all()
    assert len(tenants) == 1
    assert tenants[0].id == user.tenantId


@pytest.mark.asyncio
async def test_opt_in_self_signup_grants_tenant_admin_not_global_superuser(
    client, test_tenant, db_session, monkeypatch
):
    """Security regression test.

    Bug: `register_new_user` set `isSuperuser=True` for EVERY self-registration,
    including the opt-in ALLOW_TENANT_SELF_SIGNUP path where a tenant already
    exists. `isSuperuser=True` is a GLOBAL tenant-bypass (see
    `models/user.py::effective_tenant_id`, which returns None -- i.e. no tenant
    filtering at all -- for superusers; see also `core/rbac.py`, where
    superusers bypass every role/tenant check). That meant every anonymous
    opt-in self-signup became a global cross-tenant superuser, reopening the
    exact cross-tenant breach this workstream closes.

    Fix: only the very first-ever registration (bootstrapping a brand-new,
    tenant-less on-prem install) may become a global superuser. Every
    subsequent self-signup gets a TENANT-SCOPED "admin" role instead --
    isSuperuser stays False, but an admin-gated RBAC check still passes.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "ALLOW_TENANT_SELF_SIGNUP", True)

    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "selfsignup@example.com",
            "username": "selfsignup",
            "password": "Selfsignup123!",
        },
    )
    assert resp.status_code == 201

    result = await db_session.execute(select(User).where(User.email == "selfsignup@example.com"))
    user = result.scalar_one()

    # Must NOT be a global superuser -- that bypasses tenant filtering entirely.
    assert user.isSuperuser is False

    # But must still pass an admin-gated RBAC check via a tenant-scoped role.
    from app.core.rbac import user_has_any_role

    is_admin = await user_has_any_role(db_session, user, ["admin", "superadmin"])
    assert is_admin is True
