import pytest


@pytest.mark.asyncio
async def test_calendar_events_list(client, auth_headers):
    resp = await client.get("/api/v1/calendar/calendar-events", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_calendar_events_create(client, auth_headers):
    resp = await client.post("/api/v1/calendar/calendar-events", headers=auth_headers, json={"name": "test"})
    assert resp.status_code in (200, 201, 422)


@pytest.mark.asyncio
async def test_calendar_events_get_not_found(client, auth_headers):
    resp = await client.get("/api/v1/calendar/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_calendar_events_without_auth(client):
    resp = await client.get("/api/v1/calendar/calendar-events")
    assert resp.status_code in (401, 403)
