"""Tests for BOM line effectivity (migration 053_bom_effectivity).

Covers:
  - resolution: date/serial/lot axes filter correctly, unrestricted lines
    always appear, via both the pure service and the /bom-items/resolved
    endpoint.
  - validation: from>to rejected, multi-axis rejected, overlapping siblings
    for the same part+parent rejected — at the API layer (bom_items.py).
"""

from datetime import date, timedelta

import pytest

from app.models.bom_item import BomItem
from app.models.bom_template import BomTemplate
from app.models.part import Part
from app.services import bom_effectivity_service as svc


async def _make_part(db_session, tenant_id, pn):
    part = Part(pn=pn, name=pn, category="Electrical", cost=0.0, tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)
    return part


async def _make_template(db_session, tenant_id, created_by_id, name="Tpl"):
    tpl = BomTemplate(name=name, createdById=created_by_id, tenantId=tenant_id)
    db_session.add(tpl)
    await db_session.commit()
    await db_session.refresh(tpl)
    return tpl


async def _make_item(db_session, tenant_id, template_id, part_id, **kwargs):
    item = BomItem(bomTemplateId=template_id, partId=part_id, tenantId=tenant_id, **kwargs)
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


TODAY = date(2026, 8, 9)
PAST = TODAY - timedelta(days=30)
FUTURE = TODAY + timedelta(days=30)
FAR_FUTURE = TODAY + timedelta(days=60)


# ============ pure resolution logic ============


def test_unrestricted_line_always_effective():
    item = BomItem()
    assert svc.is_effective(item, as_of_date=TODAY) is True
    assert svc.is_effective(item) is True  # no as-of context at all


def test_future_date_line_excluded_today_included_future():
    item = BomItem(effectiveFrom=FUTURE)
    assert svc.is_effective(item, as_of_date=TODAY) is False
    assert svc.is_effective(item, as_of_date=FAR_FUTURE) is True


def test_past_date_line_excluded_after_effective_to():
    item = BomItem(effectiveFrom=PAST, effectiveTo=PAST + timedelta(days=5))
    assert svc.is_effective(item, as_of_date=TODAY) is False
    assert svc.is_effective(item, as_of_date=PAST + timedelta(days=2)) is True


def test_serial_range_inside_and_outside():
    item = BomItem(effectiveSerialFrom="1000", effectiveSerialTo="2000")
    assert svc.is_effective(item, as_of_serial="1500") is True
    assert svc.is_effective(item, as_of_serial="999") is False
    assert svc.is_effective(item, as_of_serial="2001") is False
    # no serial context supplied -> conservatively excluded
    assert svc.is_effective(item, as_of_date=TODAY) is False


def test_lot_match_and_mismatch():
    item = BomItem(effectiveLot="LOT-A,LOT-B")
    assert svc.is_effective(item, as_of_lot="lot-a") is True
    assert svc.is_effective(item, as_of_lot="LOT-C") is False
    assert svc.is_effective(item, as_of_date=TODAY) is False


def test_resolve_effective_items_mixed():
    always = BomItem(id=1)
    future = BomItem(id=2, effectiveFrom=FUTURE)
    in_range_serial = BomItem(id=3, effectiveSerialFrom="1", effectiveSerialTo="10")
    items = [always, future, in_range_serial]
    resolved = svc.resolve_effective_items(items, as_of_date=TODAY)
    assert always in resolved
    assert future not in resolved
    assert in_range_serial not in resolved  # no as_of_serial given

    resolved_future = svc.resolve_effective_items(items, as_of_date=FAR_FUTURE)
    assert future in resolved_future


# ============ validation ============


def test_validate_rejects_from_after_to():
    with pytest.raises(ValueError):
        svc.validate_effectivity_fields(FUTURE, PAST, None, None, None)


def test_validate_rejects_serial_from_after_to():
    with pytest.raises(ValueError):
        svc.validate_effectivity_fields(None, None, "2000", "1000", None)


def test_validate_rejects_multiple_axes():
    with pytest.raises(ValueError):
        svc.validate_effectivity_fields(PAST, FUTURE, "1", "2", None)


def test_validate_allows_single_axis_or_none():
    svc.validate_effectivity_fields(None, None, None, None, None)
    svc.validate_effectivity_fields(PAST, FUTURE, None, None, None)
    svc.validate_effectivity_fields(None, None, "1", "2", None)
    svc.validate_effectivity_fields(None, None, None, None, "LOT-A")


# ============ API-level: validation + overlap + /resolved ============


@pytest.mark.asyncio
async def test_api_rejects_from_after_to(db_session, test_tenant, test_user, client, auth_headers):
    part = await _make_part(db_session, test_tenant.id, "PN-EFF-1")
    tpl = await _make_template(db_session, test_tenant.id, test_user.id)

    resp = await client.post(
        "/api/v1/bom-items/",
        headers=auth_headers,
        json={
            "bomTemplateId": tpl.id,
            "partId": part.id,
            "effectiveFrom": str(FUTURE),
            "effectiveTo": str(PAST),
        },
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_api_rejects_overlapping_date_ranges(
    db_session, test_tenant, test_user, client, auth_headers
):
    part = await _make_part(db_session, test_tenant.id, "PN-EFF-2")
    tpl = await _make_template(db_session, test_tenant.id, test_user.id)
    await _make_item(
        db_session, test_tenant.id, tpl.id, part.id, effectiveFrom=PAST, effectiveTo=FUTURE
    )

    resp = await client.post(
        "/api/v1/bom-items/",
        headers=auth_headers,
        json={
            "bomTemplateId": tpl.id,
            "partId": part.id,
            # overlaps the existing PAST..FUTURE window
            "effectiveFrom": str(TODAY),
            "effectiveTo": str(FAR_FUTURE),
        },
    )
    assert resp.status_code == 400
    assert "overlaps" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_api_allows_non_overlapping_sequential_windows(
    db_session, test_tenant, test_user, client, auth_headers
):
    part = await _make_part(db_session, test_tenant.id, "PN-EFF-3")
    tpl = await _make_template(db_session, test_tenant.id, test_user.id)
    await _make_item(
        db_session,
        test_tenant.id,
        tpl.id,
        part.id,
        effectiveFrom=PAST,
        effectiveTo=PAST + timedelta(days=1),
    )

    resp = await client.post(
        "/api/v1/bom-items/",
        headers=auth_headers,
        json={
            "bomTemplateId": tpl.id,
            "partId": part.id,
            "effectiveFrom": str(FUTURE),
            "effectiveTo": str(FAR_FUTURE),
        },
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_resolved_endpoint_excludes_future_by_default_includes_asof_future(
    db_session, test_tenant, test_user, client, auth_headers
):
    part_always = await _make_part(db_session, test_tenant.id, "PN-EFF-ALWAYS")
    part_future = await _make_part(db_session, test_tenant.id, "PN-EFF-FUTURE")
    tpl = await _make_template(db_session, test_tenant.id, test_user.id)
    await _make_item(db_session, test_tenant.id, tpl.id, part_always.id)
    await _make_item(
        db_session, test_tenant.id, tpl.id, part_future.id, effectiveFrom=FUTURE
    )

    resp_today = await client.get(
        "/api/v1/bom-items/resolved",
        headers=auth_headers,
        params={"bomTemplateId": tpl.id, "asOfDate": str(TODAY)},
    )
    assert resp_today.status_code == 200
    part_ids_today = {row["partId"] for row in resp_today.json()}
    assert part_always.id in part_ids_today
    assert part_future.id not in part_ids_today

    resp_future = await client.get(
        "/api/v1/bom-items/resolved",
        headers=auth_headers,
        params={"bomTemplateId": tpl.id, "asOfDate": str(FAR_FUTURE)},
    )
    part_ids_future = {row["partId"] for row in resp_future.json()}
    assert part_always.id in part_ids_future
    assert part_future.id in part_ids_future


@pytest.mark.asyncio
async def test_plain_list_endpoint_serializes_items_with_effectivity(
    db_session, test_tenant, test_user, client, auth_headers
):
    """The frontend's effectivity-editing grid reads lines via the plain
    GET /bom-items/ list endpoint (not /resolved). That endpoint has no
    response_model, so confirm it actually serializes real ORM rows (with
    the new effectivity columns) to JSON instead of choking on SQLAlchemy
    instance state."""
    part = await _make_part(db_session, test_tenant.id, "PN-EFF-LIST")
    tpl = await _make_template(db_session, test_tenant.id, test_user.id)
    await _make_item(
        db_session, test_tenant.id, tpl.id, part.id, effectiveFrom=PAST, effectiveTo=FUTURE
    )

    resp = await client.get(
        "/api/v1/bom-items/",
        headers=auth_headers,
        params={"bomTemplateId": tpl.id},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"][0]["partId"] == part.id
    assert body["items"][0]["effectiveFrom"] == str(PAST)


@pytest.mark.asyncio
async def test_resolved_endpoint_serial_axis(
    db_session, test_tenant, test_user, client, auth_headers
):
    part = await _make_part(db_session, test_tenant.id, "PN-EFF-SERIAL")
    tpl = await _make_template(db_session, test_tenant.id, test_user.id)
    await _make_item(
        db_session,
        test_tenant.id,
        tpl.id,
        part.id,
        effectiveSerialFrom="1000",
        effectiveSerialTo="2000",
    )

    inside = await client.get(
        "/api/v1/bom-items/resolved",
        headers=auth_headers,
        params={"bomTemplateId": tpl.id, "asOfSerial": "1500"},
    )
    assert len(inside.json()) == 1

    outside = await client.get(
        "/api/v1/bom-items/resolved",
        headers=auth_headers,
        params={"bomTemplateId": tpl.id, "asOfSerial": "5"},
    )
    assert len(outside.json()) == 0
