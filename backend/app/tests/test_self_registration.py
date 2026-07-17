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
