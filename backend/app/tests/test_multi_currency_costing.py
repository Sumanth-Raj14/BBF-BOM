"""Multi-currency cost roll-up.

Fails without the feature: get_cost_rollup took no reporting currency, Part had
no currency column, and every line was summed as if already denominated the
same. The second test is the one that matters — a MISSING rate must produce a
warning, never a number pretending 1 EUR == 1 USD.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.core.tenant_context import TenantContext
from app.models.bom import BOM, BOMItem
from app.models.enterprise_extensions import ExchangeRate
from app.models.part import Part
from app.services import bom_service, currency_service


async def _commit_as(db_session, tenant_id, obj):
    db_session.add(obj)
    token = TenantContext.set(tenant_id=tenant_id)
    try:
        await db_session.commit()
        await db_session.refresh(obj)
    finally:
        TenantContext.reset(token)
    return obj


async def _rate(db_session, tid, src, dst, rate):
    return await _commit_as(
        db_session,
        tid,
        ExchangeRate(
            from_currency=src,
            to_currency=dst,
            rate=rate,
            effective_date=datetime.now(UTC),
            is_active=True,
            tenantId=tid,
        ),
    )


async def _two_currency_bom(db_session, tid, suffix):
    """One line priced in EUR, one in GBP; reported in USD."""
    eur_part = await _commit_as(
        db_session,
        tid,
        Part(pn=f"PN-EUR-{suffix}", name="Euro part", cost=10, currency="EUR", tenantId=tid),
    )
    gbp_part = await _commit_as(
        db_session,
        tid,
        Part(pn=f"PN-GBP-{suffix}", name="Pound part", cost=20, currency="GBP", tenantId=tid),
    )
    bom = await _commit_as(
        db_session, tid, BOM(bom_number=f"BOM-CCY-{suffix}", name="B", tenantId=tid)
    )
    for part, qty in ((eur_part, 2), (gbp_part, 3)):
        await _commit_as(
            db_session, tid, BOMItem(bom_id=bom.id, part_id=part.id, quantity=qty, tenantId=tid)
        )
    return bom


@pytest.mark.asyncio
async def test_two_currencies_roll_up_into_a_third(db_session, test_tenant):
    tid = test_tenant.id
    await _rate(db_session, tid, "EUR", "USD", "1.1")
    await _rate(db_session, tid, "GBP", "USD", "1.25")
    bom = await _two_currency_bom(db_session, tid, "OK")

    result = await bom_service.get_cost_rollup(db_session, bom.id, reporting_currency="usd")

    # EUR line: 10 * 2 = 20 EUR * 1.1 = 22 USD
    # GBP line: 20 * 3 = 60 GBP * 1.25 = 75 USD
    assert result["reporting_currency"] == "USD"
    assert result["currency_warnings"] == []
    assert result["total_cost"] == 97.0, result

    # Unconverted roll-up is untouched by the feature: 20 + 60 summed blind.
    plain = await bom_service.get_cost_rollup(db_session, bom.id)
    assert plain["reporting_currency"] is None
    assert plain["total_cost"] == 80.0, plain


@pytest.mark.asyncio
async def test_missing_rate_warns_instead_of_inventing_money(db_session, test_tenant):
    tid = test_tenant.id
    await _rate(db_session, tid, "EUR", "USD", "1.1")  # GBP -> USD deliberately absent
    bom = await _two_currency_bom(db_session, tid, "MISSING")

    result = await bom_service.get_cost_rollup(db_session, bom.id, reporting_currency="USD")

    # ONLY the convertible line is in the total. 97.0 would mean a real rate,
    # 82.0 (20*1.1 + 60*1.0) would mean GBP was silently treated as USD.
    assert result["total_cost"] == 22.0, result
    assert [w["part_number"] for w in result["currency_warnings"]] == ["PN-GBP-MISSING"]
    warning = result["currency_warnings"][0]
    assert (warning["from_currency"], warning["to_currency"]) == ("GBP", "USD")
    assert warning["unconverted_amount"] == 60.0
    assert "No active exchange rate" in warning["message"]


@pytest.mark.asyncio
async def test_inverse_rate_is_used_and_nulls_default_to_usd(db_session, test_tenant):
    """A stored USD -> EUR rate answers a EUR -> USD question; a part with no
    currency set is USD (what it meant before the column existed)."""
    tid = test_tenant.id
    await _rate(db_session, tid, "USD", "EUR", "2")
    assert await currency_service.get_rate(db_session, "EUR", "USD", tid) == 0.5

    legacy = await _commit_as(
        db_session, tid, Part(pn="PN-LEGACY", name="No currency", cost=7, tenantId=tid)
    )
    assert legacy.currency in (None, "USD")
    bom = await _commit_as(
        db_session, tid, BOM(bom_number="BOM-CCY-LEGACY", name="B", tenantId=tid)
    )
    await _commit_as(
        db_session, tid, BOMItem(bom_id=bom.id, part_id=legacy.id, quantity=2, tenantId=tid)
    )

    result = await bom_service.get_cost_rollup(db_session, bom.id, reporting_currency="USD")
    assert result["currency_warnings"] == []
    assert result["total_cost"] == 14.0, result


@pytest.mark.asyncio
async def test_future_dated_rate_is_not_yet_in_force(db_session, test_tenant):
    """A rate effective next month must not price today's BOM just because it
    sorts newest. Without the effective_date guard this returns 9."""
    tid = test_tenant.id
    await _rate(db_session, tid, "EUR", "USD", "1.1")
    future = ExchangeRate(
        from_currency="EUR",
        to_currency="USD",
        rate="9",
        effective_date=datetime.now(UTC) + timedelta(days=30),
        is_active=True,
        tenantId=tid,
    )
    await _commit_as(db_session, tid, future)

    assert await currency_service.get_rate(db_session, "EUR", "USD", tid) == Decimal("1.1")


@pytest.mark.asyncio
async def test_part_currency_round_trips_through_the_http_api(client, auth_headers):
    """The column is useless if the API silently drops it: without `currency`
    on PartBase/PartUpdate the POST body's EUR vanishes and every part is USD
    forever."""
    r = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "PN-HTTP-CCY", "name": "Euro part", "cost": 10, "currency": "EUR"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["currency"] == "EUR", r.text

    part_id = r.json()["id"]
    u = await client.put(
        f"/api/v1/parts/{part_id}", headers=auth_headers, json={"currency": "GBP"}
    )
    assert u.status_code == 200, u.text
    assert u.json()["currency"] == "GBP", u.text

    # Trust boundary: a 3-char column must not accept "euros".
    bad = await client.post(
        "/api/v1/parts/",
        headers=auth_headers,
        json={"pn": "PN-HTTP-BAD", "name": "x", "currency": "euros"},
    )
    assert bad.status_code == 422, bad.text


@pytest.mark.asyncio
async def test_cost_rollup_endpoint_converts_over_http(client, auth_headers, db_session, test_tenant):
    """The whole path: POST a EUR part -> BOM -> item -> GET the rollup with
    ?reporting_currency=USD and get a CONVERTED number back, not the EUR one."""
    tid = test_tenant.id
    await _rate(db_session, tid, "EUR", "USD", "1.5")

    part = (
        await client.post(
            "/api/v1/parts/",
            headers=auth_headers,
            json={"pn": "PN-E2E-EUR", "name": "Euro part", "cost": 10, "currency": "EUR"},
        )
    ).json()
    assert part["currency"] == "EUR", part
    bom = await _commit_as(
        db_session, tid, BOM(bom_number="BOM-E2E-CCY", name="e2e", tenantId=tid)
    )
    await _commit_as(
        db_session, tid, BOMItem(bom_id=bom.id, part_id=part["id"], quantity=2, tenantId=tid)
    )
    bom = {"id": bom.id}

    r = await client.get(
        f"/api/v1/bom/{bom['id']}/cost-rollup?reporting_currency=USD", headers=auth_headers
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reporting_currency"] == "USD"
    assert body["currency_warnings"] == []
    assert body["total_cost"] == 30.0, body  # 10 EUR * 2 * 1.5

    plain = await client.get(f"/api/v1/bom/{bom['id']}/cost-rollup", headers=auth_headers)
    assert plain.json()["total_cost"] == 20.0, plain.text

    # Query is pinned to 3 chars.
    assert (
        await client.get(
            f"/api/v1/bom/{bom['id']}/cost-rollup?reporting_currency=US", headers=auth_headers
        )
    ).status_code == 422
