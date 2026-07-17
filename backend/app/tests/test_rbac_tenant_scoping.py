"""TDD: Role.name / Permission.name must be unique per (tenantId, name), not globally.

Bug (review finding on the "business unique keys -> composite (tenantId, key)"
commit): Role and Permission both carry a non-nullable tenantId
(TenantAwareMixin) but `name` was left as a bare globally-unique column, and
`_get_or_create_admin_role` looked up the "admin" role by name alone. That
meant every self-registered tenant's "admin" role collapsed onto the same
physical row (found-by-name) -- and once a role already existed, ANY other
tenant's first self-signup that couldn't find "its" row (e.g. because the
ambient tenant context, when one happens to be set, filtered it out) would
crash trying to INSERT a second globally-unique "admin" row.

Fix: Role.name / Permission.name become unique per (tenantId, name) via a
composite UniqueConstraint (alembic migration 036), and
`_get_or_create_admin_role` explicitly filters by tenant_id instead of
relying on ambient context.

This test exercises the real bug through the public API: two independent
opt-in self-signups (each bootstrapping its own brand-new tenant) must BOTH
succeed and each land on its OWN "admin" Role row, scoped to its own tenant.
Pre-fix, the second signup fails (500) because Role.name="admin" already
exists globally for the first tenant.
"""

import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContext
from app.models.role import Role
from app.models.user import User


@pytest.mark.asyncio
async def test_two_tenants_self_signup_each_get_own_admin_role(
    client, test_tenant, db_session, monkeypatch
):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ALLOW_TENANT_SELF_SIGNUP", True)

    resp1 = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "tenant-alpha-admin@example.com",
            "username": "tenantalphaadmin",
            "password": "AlphaAdmin123!",
        },
    )
    assert resp1.status_code == 201, resp1.text

    resp2 = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "tenant-beta-admin@example.com",
            "username": "tenantbetaadmin",
            "password": "BetaAdmin123!",
        },
    )
    # Pre-fix this 500s: the second tenant's admin-role INSERT collides with
    # the first tenant's globally-unique Role.name="admin" row.
    assert resp2.status_code == 201, resp2.text

    result = await db_session.execute(
        select(User).where(
            User.email.in_(["tenant-alpha-admin@example.com", "tenant-beta-admin@example.com"])
        )
    )
    users = {u.email: u for u in result.scalars().all()}
    alpha_tenant_id = users["tenant-alpha-admin@example.com"].tenantId
    beta_tenant_id = users["tenant-beta-admin@example.com"].tenantId

    assert alpha_tenant_id is not None
    assert beta_tenant_id is not None
    assert alpha_tenant_id != beta_tenant_id
    assert test_tenant.id not in (alpha_tenant_id, beta_tenant_id)

    # Bypass the ambient tenant-context SELECT filter to see every tenant's rows.
    token = TenantContext.set(None)
    try:
        result = await db_session.execute(select(Role).where(Role.name == "admin"))
        admin_roles = result.scalars().all()
    finally:
        TenantContext.reset(token)

    admin_roles_by_tenant = {r.tenantId: r for r in admin_roles}
    assert alpha_tenant_id in admin_roles_by_tenant
    assert beta_tenant_id in admin_roles_by_tenant
    # Each tenant's self-signup created its OWN distinct admin Role row.
    assert admin_roles_by_tenant[alpha_tenant_id].id != admin_roles_by_tenant[beta_tenant_id].id

    from app.core.rbac import user_has_any_role

    assert (
        await user_has_any_role(db_session, users["tenant-alpha-admin@example.com"], ["admin"])
        is True
    )
    assert (
        await user_has_any_role(db_session, users["tenant-beta-admin@example.com"], ["admin"])
        is True
    )


@pytest.mark.asyncio
async def test_same_role_name_same_tenant_still_rejected(db_session, test_tenant, tenant_id):
    """Same-tenant duplicate Role.name must still raise IntegrityError (the
    composite constraint narrows scope to per-tenant, it doesn't remove it)."""
    from sqlalchemy.exc import IntegrityError

    db_session.add(Role(name="dup-role", description="first", tenantId=tenant_id))
    await db_session.commit()

    db_session.add(Role(name="dup-role", description="duplicate", tenantId=tenant_id))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_same_permission_name_different_tenants_both_persist(
    db_session, test_tenant, tenant_id
):
    """Two different tenants may each define a permission with the same name."""
    from app.models.permission import Permission
    from app.models.tenant import Tenant

    other = Tenant(id=tenant_id + 1000, tenant_name="Other Tenant", tenant_code="OTHER")
    db_session.add(other)
    await db_session.commit()

    token = TenantContext.set(tenant_id)
    try:
        db_session.add(Permission(name="widgets:read", tenantId=tenant_id))
        await db_session.commit()
    finally:
        TenantContext.reset(token)

    token = TenantContext.set(other.id)
    try:
        db_session.add(Permission(name="widgets:read", tenantId=other.id))
        await db_session.commit()
    finally:
        TenantContext.reset(token)

    token = TenantContext.set(None)
    try:
        from app.models.permission import Permission as Perm

        result = await db_session.execute(select(Perm).where(Perm.name == "widgets:read"))
        rows = result.scalars().all()
    finally:
        TenantContext.reset(token)

    assert len(rows) == 2
    assert {r.tenantId for r in rows} == {tenant_id, other.id}
