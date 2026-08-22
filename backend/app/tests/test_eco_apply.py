"""An implemented ECO must actually apply its items to the parts and BOM lines.

Before this, "implement" was pure paperwork: it signed the transition, set
status='implemented' and stopped. Nothing read eco_items, so the approved
revision never reached the Part / BOMItem rows it named.

Covers:
  (a) implement applies modify / add / delete items to their real targets;
  (b) one bad item rolls the WHOLE ECO back — no partial application, and the
      ECO stays 'approved' so it can be fixed and re-run;
  (c) the status guard makes implement idempotent (a second one is rejected).
"""

from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.security import get_password_hash
from app.models.bom import BOM, BOMItem
from app.models.eco import EcoItem, EcoItemAttributeChange
from app.models.part import Part
from app.models.role import Role, user_roles
from app.models.user import User


# --------------------------------------------------------------------------
# users / auth — same shape as test_eco_implement.py (creator may not approve
# their own ECO, so two users with two roles are mandatory here)
# --------------------------------------------------------------------------
async def _make_user(db_session, tenant_id, role_name, email, username):
    role = (
        await db_session.execute(select(Role).where(Role.name == role_name))
    ).scalar_one_or_none()
    if role is None:
        role = Role(name=role_name, tenantId=tenant_id)
        db_session.add(role)
        await db_session.commit()
        await db_session.refresh(role)
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
async def creator_headers(client, db_session, test_tenant, tenant_id):
    await _make_user(db_session, tenant_id, "engineering", "eng@example.com", "enguser")
    return await _login(client, "eng@example.com")


@pytest_asyncio.fixture
async def approver_headers(client, db_session, test_tenant, tenant_id, creator_headers):
    await _make_user(db_session, tenant_id, "admin", "boss@example.com", "bossuser")
    return await _login(client, "boss@example.com")


# --------------------------------------------------------------------------
# the things an ECO is going to change
# --------------------------------------------------------------------------
@pytest_asyncio.fixture
async def fixture_data(db_session, test_tenant, tenant_id):
    """One part on a BOM line, one part NOT yet on the BOM, one line to drop."""
    widget = Part(pn="WIDGET-1", name="Widget", description="old text", cost=Decimal("1.0000"),
                  lead=0, tenantId=tenant_id)
    newcomer = Part(pn="NEWCOMER-1", name="Newcomer", tenantId=tenant_id)
    doomed = Part(pn="DOOMED-1", name="Doomed", tenantId=tenant_id)
    db_session.add_all([widget, newcomer, doomed])
    await db_session.commit()

    bom = BOM(bom_number="BOM-1", name="Assembly", tenantId=tenant_id)
    db_session.add(bom)
    await db_session.commit()

    widget_line = BOMItem(bom_id=bom.id, part_id=widget.id, quantity=Decimal("2"),
                          tenantId=tenant_id)
    doomed_line = BOMItem(bom_id=bom.id, part_id=doomed.id, quantity=Decimal("1"),
                          tenantId=tenant_id)
    db_session.add_all([widget_line, doomed_line])
    await db_session.commit()
    # Plain ids, not ORM objects: the tests expire_all() after the service has
    # committed, and touching an expired instance from a sync assert triggers
    # a lazy refresh -> MissingGreenlet on the async session.
    return {"bom": bom.id, "widget": widget.id, "newcomer": newcomer.id, "doomed": doomed.id}


async def _add_item(db, tenant_id, eco_id, part_id, change_type, bom_id=None, fields=None,
                    affected_quantity=None):
    item = EcoItem(eco_id=eco_id, part_id=part_id, bom_id=bom_id, change_type=change_type,
                   affected_quantity=affected_quantity, tenantId=tenant_id)
    db.add(item)
    await db.flush()
    for field_name, (old, new) in (fields or {}).items():
        db.add(EcoItemAttributeChange(eco_item_id=item.id, field_name=field_name,
                                      old_value=old, new_value=new, tenantId=tenant_id))
    await db.commit()
    return item


async def _create_and_approve(client, creator_headers, approver_headers):
    resp = await client.post("/api/v1/eco/", headers=creator_headers,
                             json={"title": "Revise the widget", "change_type": "design"})
    assert resp.status_code == 200, resp.text
    eco_id = resp.json()["id"]
    resp = await client.post(f"/api/v1/eco/{eco_id}/action", headers=creator_headers,
                             json={"action": "submit"})
    assert resp.status_code == 200, resp.text
    resp = await client.post(f"/api/v1/eco/{eco_id}/action", headers=approver_headers,
                             json={"action": "approve", "password": "testpass123"})
    assert resp.status_code == 200, resp.text
    return eco_id


async def _implement(client, headers, eco_id):
    return await client.post(f"/api/v1/eco/{eco_id}/action", headers=headers,
                             json={"action": "implement", "password": "testpass123"})


@pytest.mark.asyncio
async def test_implement_applies_items_to_parts_and_bom_lines(
    client, db_session, tenant_id, creator_headers, approver_headers, fixture_data
):
    """(a) After implement, the targets are verifiably CHANGED."""
    bom_id, widget_id = fixture_data["bom"], fixture_data["widget"]
    newcomer_id, doomed_id = fixture_data["newcomer"], fixture_data["doomed"]
    eco_id = await _create_and_approve(client, creator_headers, approver_headers)

    # part master: text + Numeric + Integer, to prove the Text-stored values
    # are coerced back to the column's real type.
    await _add_item(db_session, tenant_id, eco_id, widget_id, "modify",
                    fields={"description": ("old text", "new text"),
                            "cost": ("1.0000", "42.5000"),
                            "lead": ("0", "14")})
    # BOM line quantity change
    await _add_item(db_session, tenant_id, eco_id, widget_id, "modify", bom_id=bom_id,
                    fields={"quantity": ("2", "7")})
    # add a part to the BOM
    await _add_item(db_session, tenant_id, eco_id, newcomer_id, "add", bom_id=bom_id,
                    affected_quantity=3)
    # drop a line from the BOM
    await _add_item(db_session, tenant_id, eco_id, doomed_id, "delete", bom_id=bom_id)

    resp = await _implement(client, creator_headers, eco_id)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "implemented"

    db_session.expire_all()
    changed = (await db_session.execute(select(Part).where(Part.id == widget_id))).scalar_one()
    assert changed.description == "new text"
    assert Decimal(str(changed.cost)) == Decimal("42.5000")
    assert changed.lead == 14
    assert isinstance(changed.lead, int)  # not the string "14"

    lines = (await db_session.execute(select(BOMItem).where(BOMItem.bom_id == bom_id))).scalars().all()
    by_part = {line.part_id: line for line in lines}
    assert Decimal(str(by_part[widget_id].quantity)) == Decimal("7")
    assert newcomer_id in by_part, "add item did not create the BOM line"
    assert Decimal(str(by_part[newcomer_id].quantity)) == Decimal("3")
    assert doomed_id not in by_part, "delete item did not remove the BOM line"

    # every item is marked applied, so nothing can be replayed
    items = (await db_session.execute(select(EcoItem).where(EcoItem.eco_id == eco_id))).scalars().all()
    assert {i.status for i in items} == {"implemented"}


@pytest.mark.asyncio
async def test_failed_item_rolls_the_whole_eco_back(
    client, db_session, tenant_id, creator_headers, approver_headers, fixture_data
):
    """(b) A good item followed by a bad one must leave NOTHING applied.

    The bad item targets tenantId — the trust-boundary field an ECO must never
    be able to rewrite (it would move the part into another tenant).
    """
    bom_id, widget_id = fixture_data["bom"], fixture_data["widget"]
    eco_id = await _create_and_approve(client, creator_headers, approver_headers)

    await _add_item(db_session, tenant_id, eco_id, widget_id, "modify",
                    fields={"description": ("old text", "new text")})
    await _add_item(db_session, tenant_id, eco_id, widget_id, "modify", bom_id=bom_id,
                    fields={"tenantId": ("1", "999")})

    resp = await _implement(client, creator_headers, eco_id)
    assert resp.status_code == 409, resp.text
    assert "tenantId" in resp.text

    db_session.expire_all()
    unchanged = (await db_session.execute(select(Part).where(Part.id == widget_id))).scalar_one()
    assert unchanged.description == "old text", "first item was applied despite the rollback"
    assert unchanged.tenantId == tenant_id

    line = (
        await db_session.execute(
            select(BOMItem).where(BOMItem.bom_id == bom_id, BOMItem.part_id == widget_id)
        )
    ).scalar_one()
    assert line.tenantId == tenant_id

    # the ECO itself must stay approved so it can be corrected and re-run
    detail = await client.get(f"/api/v1/eco/{eco_id}", headers=creator_headers)
    assert detail.json()["status"] == "approved"
    items = (await db_session.execute(select(EcoItem).where(EcoItem.eco_id == eco_id))).scalars().all()
    assert {i.status for i in items} == {"pending"}


@pytest.mark.asyncio
async def test_implement_is_idempotent(
    client, db_session, tenant_id, creator_headers, approver_headers, fixture_data
):
    """(c) A second implement is refused, so quantities cannot be applied twice."""
    bom_id, widget_id = fixture_data["bom"], fixture_data["widget"]
    eco_id = await _create_and_approve(client, creator_headers, approver_headers)
    await _add_item(db_session, tenant_id, eco_id, widget_id, "modify", bom_id=bom_id,
                    fields={"quantity": ("2", "7")})

    assert (await _implement(client, creator_headers, eco_id)).status_code == 200
    second = await _implement(client, creator_headers, eco_id)
    assert second.status_code == 409, second.text

    db_session.expire_all()
    line = (
        await db_session.execute(
            select(BOMItem).where(BOMItem.bom_id == bom_id, BOMItem.part_id == widget_id)
        )
    ).scalar_one()
    assert Decimal(str(line.quantity)) == Decimal("7")
