"""Object-level BOM grants (migration 063_resource_grants).

The load-bearing case is the FIRST one: with no grant rows, every BOM behaves
exactly as it did before this feature — otherwise the deploy revokes every
user's access to every BOM.
"""

import pytest
import pytest_asyncio

from app.core.security import get_password_hash
from app.models.bom import BOM
from app.models.role import Role, user_roles
from app.models.team import Team, TeamMember
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
        "/api/v1/auth/login", data={"username": email, "password": "testpass123"}
    )
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    csrf_cookie = client.cookies.get("csrf_token")
    if csrf_cookie:
        headers["X-CSRF-Token"] = csrf_cookie.split(".")[0]
    client.cookies.delete("access_token")
    client.cookies.delete("refresh_token")
    return headers


@pytest_asyncio.fixture
async def alice(db_session, tenant_id, engineering_role):
    return await _make_user(db_session, tenant_id, engineering_role, "alice@example.com", "alice")


@pytest_asyncio.fixture
async def bob(db_session, tenant_id, engineering_role):
    return await _make_user(db_session, tenant_id, engineering_role, "bob@example.com", "bob")


@pytest_asyncio.fixture
async def carol(db_session, tenant_id, engineering_role):
    return await _make_user(db_session, tenant_id, engineering_role, "carol@example.com", "carol")


@pytest_asyncio.fixture
async def bom(db_session, tenant_id, alice):
    """A BOM created by alice (owner) — bob/carol are plain engineers."""
    b = BOM(bom_number="BOM-OBJ-1", name="Widget", created_by=alice.id, tenantId=tenant_id)
    db_session.add(b)
    await db_session.commit()
    await db_session.refresh(b)
    return b


async def _add_item(client, headers, bom_id, refdes):
    return await client.post(
        f"/api/v1/bom/{bom_id}/items",
        headers=headers,
        json={"quantity": 1, "reference_designator": refdes},
    )


# --------------------------------------------------------------------------
# 1. DEFAULT: no grants => nothing changes.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_grants_means_any_engineer_can_write(client, bom, bob):
    headers = await _login(client, "bob@example.com")
    resp = await _add_item(client, headers, bom.id, "R1")
    assert resp.status_code == 201, resp.text


# --------------------------------------------------------------------------
# 2..4. Once a grant exists the BOM is restricted.
# --------------------------------------------------------------------------


async def _grant(client, headers, bom_id, grantee_type, grantee_id, level):
    return await client.post(
        f"/api/v1/bom/{bom_id}/grants",
        headers=headers,
        json={"grantee_type": grantee_type, "grantee_id": grantee_id, "level": level},
    )


@pytest.mark.asyncio
async def test_view_grantee_cannot_write_and_ungranted_engineer_is_denied(
    client, bom, alice, bob, carol
):
    owner = await _login(client, "alice@example.com")
    assert (await _grant(client, owner, bom.id, "user", bob.id, "view")).status_code == 201

    # bob holds view only -> write refused
    bob_h = await _login(client, "bob@example.com")
    resp = await _add_item(client, bob_h, bom.id, "R2")
    assert resp.status_code == 403, resp.text

    # carol has the engineering role but no grant at all -> refused now that
    # the BOM is restricted (this exact call succeeded in test 1).
    carol_h = await _login(client, "carol@example.com")
    resp = await _add_item(client, carol_h, bom.id, "R3")
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_edit_grantee_can_write(client, bom, alice, bob):
    owner = await _login(client, "alice@example.com")
    await _grant(client, owner, bom.id, "user", bob.id, "edit")
    bob_h = await _login(client, "bob@example.com")
    resp = await _add_item(client, bob_h, bom.id, "R4")
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_manage_grantee_can_grant_view_grantee_cannot(client, bom, alice, bob, carol):
    owner = await _login(client, "alice@example.com")
    await _grant(client, owner, bom.id, "user", bob.id, "manage")
    await _grant(client, owner, bom.id, "user", carol.id, "view")

    bob_h = await _login(client, "bob@example.com")
    resp = await _grant(client, bob_h, bom.id, "user", carol.id, "edit")
    assert resp.status_code == 201, resp.text
    assert resp.json()["level"] == "edit"  # re-grant updates, no duplicate

    carol_h = await _login(client, "carol@example.com")
    resp = await _grant(client, carol_h, bom.id, "user", bob.id, "view")
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_team_grant_and_revoke_restores_open_access(
    client, db_session, tenant_id, bom, alice, bob, carol
):
    team = Team(name="Mechanical", tenantId=tenant_id)
    db_session.add(team)
    await db_session.commit()
    await db_session.refresh(team)
    db_session.add(TeamMember(teamId=team.id, userId=bob.id, tenantId=tenant_id))
    await db_session.commit()

    owner = await _login(client, "alice@example.com")
    resp = await _grant(client, owner, bom.id, "team", team.id, "edit")
    assert resp.status_code == 201, resp.text
    grant_id = resp.json()["id"]

    bob_h = await _login(client, "bob@example.com")  # in the team
    assert (await _add_item(client, bob_h, bom.id, "R5")).status_code == 201

    carol_h = await _login(client, "carol@example.com")  # not in the team
    assert (await _add_item(client, carol_h, bom.id, "R6")).status_code == 403

    listed = await client.get(f"/api/v1/bom/{bom.id}/grants", headers=owner)
    assert [g["id"] for g in listed.json()] == [grant_id]

    # Last grant removed -> unrestricted again, carol can write.
    assert (
        await client.delete(f"/api/v1/bom/{bom.id}/grants/{grant_id}", headers=owner)
    ).status_code == 204
    assert (await _add_item(client, carol_h, bom.id, "R6")).status_code == 201


@pytest.mark.asyncio
async def test_grantee_must_exist_in_tenant(client, bom, alice):
    owner = await _login(client, "alice@example.com")
    resp = await _grant(client, owner, bom.id, "user", 999999, "edit")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_grant_on_unknown_bom_is_404_not_an_orphan_row(client, bom, alice, bob):
    """A grant on a nonexistent bom_id used to 201 and write a row nobody could
    ever list or revoke (every /grants route needs `manage`, which a phantom
    BOM can never confer)."""
    owner = await _login(client, "alice@example.com")
    resp = await _grant(client, owner, bom.id + 9999, "user", bob.id, "edit")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_first_grant_does_not_lock_out_the_grantor(client, db_session, tenant_id, alice, bob):
    """Every BOM created before `created_by` was populated has created_by NULL,
    so the creator bypass cannot save the grantor. The first grant must leave
    them `manage` or the BOM is superuser-only from then on."""
    legacy = BOM(bom_number="BOM-OBJ-LEGACY", name="Legacy", tenantId=tenant_id)
    db_session.add(legacy)
    await db_session.commit()
    await db_session.refresh(legacy)

    alice_h = await _login(client, "alice@example.com")
    assert (await _grant(client, alice_h, legacy.id, "user", bob.id, "edit")).status_code == 201

    # alice is neither creator nor the named grantee — she must still manage
    # and still write.
    listed = await client.get(f"/api/v1/bom/{legacy.id}/grants", headers=alice_h)
    assert listed.status_code == 200, listed.text
    assert (await _add_item(client, alice_h, legacy.id, "R7")).status_code == 201
