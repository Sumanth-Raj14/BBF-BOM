"""WS2 verification — Teams, membership, and the unified My Work / Team Work board."""

import pytest
from sqlalchemy import select


async def _make_team(client, auth_headers, name):
    r = await client.post("/api/v1/teams/", headers=auth_headers, json={"name": name})
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_team_crud_and_membership(client, auth_headers, test_user):
    tid = await _make_team(client, auth_headers, "Quality")

    # creator is auto-added as a lead → shows in "my teams"
    mine = await client.get("/api/v1/teams/mine", headers=auth_headers)
    assert mine.status_code == 200
    assert any(t["id"] == tid and t["member_count"] == 1 for t in mine.json())

    # members list includes the creator
    members = await client.get(f"/api/v1/teams/{tid}/members", headers=auth_headers)
    assert members.status_code == 200
    assert any(m["user_id"] == test_user.id and m["role"] == "lead" for m in members.json())


@pytest.mark.asyncio
async def test_my_work_spans_team_and_personal(client, auth_headers, db_session, test_user):
    from app.models.quality import CapaAction
    from app.models.work_order import WorkOrder

    tid = await _make_team(client, auth_headers, "Line 1")

    # a work order assigned to my TEAM
    db_session.add(
        WorkOrder(
            wo_number="WO-1",
            quantity_ordered=10,
            status="in_progress",
            priority="high",
            assigned_team_id=tid,
            tenantId=test_user.tenantId,
        )
    )
    # a CAPA assigned to ME personally
    db_session.add(
        CapaAction(
            capa_number="CAPA-1",
            description="Fix supplier defect on bracket",
            action_type="corrective",
            status="open",
            assigned_to=test_user.id,
            tenantId=test_user.tenantId,
        )
    )
    await db_session.commit()

    r = await client.get("/api/v1/work/my", headers=auth_headers)
    assert r.status_code == 200, r.text
    refs = {i["ref"] for i in r.json()["items"]}
    assert "WO-1" in refs  # via team membership
    assert "CAPA-1" in refs  # via personal assignment

    tw = await client.get(f"/api/v1/work/team/{tid}", headers=auth_headers)
    assert tw.status_code == 200
    assert any(i["ref"] == "WO-1" and i["status"] == "in_progress" for i in tw.json()["items"])


@pytest.mark.asyncio
async def test_assign_work_puts_item_on_my_board(client, auth_headers, db_session, test_user):
    from app.models.work_order import WorkOrder

    db_session.add(
        WorkOrder(
            wo_number="WO-2",
            quantity_ordered=5,
            status="draft",
            priority="normal",
            tenantId=test_user.tenantId,
        )
    )
    await db_session.commit()
    wo = (
        await db_session.execute(select(WorkOrder).where(WorkOrder.wo_number == "WO-2"))
    ).scalar_one()

    # initially not on my board
    before = await client.get("/api/v1/work/my", headers=auth_headers)
    assert "WO-2" not in {i["ref"] for i in before.json()["items"]}

    # assign it to me
    r = await client.post(
        "/api/v1/work/assign",
        headers=auth_headers,
        json={"item_type": "work_order", "item_id": wo.id, "assigned_to": test_user.id},
    )
    assert r.status_code == 200, r.text

    after = await client.get("/api/v1/work/my", headers=auth_headers)
    assert "WO-2" in {i["ref"] for i in after.json()["items"]}


@pytest.mark.asyncio
async def test_work_queue_requires_auth(client):
    resp = await client.get("/api/v1/work/my")
    assert resp.status_code in (401, 403)
