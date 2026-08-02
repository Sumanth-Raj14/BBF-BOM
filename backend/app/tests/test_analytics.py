import pytest

from app.models.part import Part
from app.models.part_vendor import PartVendor
from app.models.vendor import Vendor


@pytest.mark.asyncio
async def test_analytics_dashboard(client, auth_headers):
    resp = await client.get("/api/v1/analytics/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "totalParts" in data
    assert "totalVendors" in data
    assert "totalPOs" in data
    assert "poByStatus" in data
    assert "vendorSpend" in data


@pytest.mark.asyncio
async def test_analytics_trends(client, auth_headers):
    resp = await client.get("/api/v1/analytics/trends", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "range" in data
    assert "data" in data


@pytest.mark.asyncio
async def test_analytics_trends_with_range(client, auth_headers):
    resp = await client.get(
        "/api/v1/analytics/trends", headers=auth_headers, params={"range_": "1yr"}
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_analytics_categories(client, auth_headers):
    resp = await client.get("/api/v1/analytics/categories", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_analytics_inflation(client, auth_headers):
    resp = await client.get("/api/v1/analytics/inflation", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "categories" in data
    assert isinstance(data["categories"], list)


@pytest.mark.asyncio
async def test_analytics_vendor_scorecards(client, auth_headers):
    resp = await client.get("/api/v1/analytics/vendor-scorecards", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_vendor_scorecards_have_no_hardcoded_constants(client, auth_headers, db_session):
    """Quality/on-time must track the stored data, and be null when absent.

    Regression guard: the endpoint used to return literal onTimeRate=94.5,
    qualityScore=4.2 and responseTime="2.3 days" for every vendor.
    """
    measured_vendor = Vendor(name="Acme Fasteners", tenantId=1)
    quiet_vendor = Vendor(name="Zeta Unmeasured", tenantId=1)
    part = Part(pn="SCORECARD-001", name="M3 Screw", tenantId=1)
    db_session.add_all([measured_vendor, quiet_vendor, part])
    await db_session.commit()
    await db_session.refresh(measured_vendor)
    await db_session.refresh(part)

    db_session.add(
        PartVendor(
            partId=part.id,
            vendorId=measured_vendor.id,
            onTimeRate=71.5,
            qualityScore=2.5,
            tenantId=1,
        )
    )
    await db_session.commit()

    resp = await client.get("/api/v1/analytics/vendor-scorecards", headers=auth_headers)
    assert resp.status_code == 200
    cards = {c["vendor"]: c for c in resp.json()}

    # Real data in -> those numbers out, not the old constants.
    assert cards["Acme Fasteners"]["onTimeRate"] == 71.5
    assert cards["Acme Fasteners"]["qualityScore"] == 2.5

    # No measurement for this vendor -> null, not a plausible-looking constant.
    assert cards["Zeta Unmeasured"]["onTimeRate"] is None
    assert cards["Zeta Unmeasured"]["qualityScore"] is None

    for card in resp.json():
        assert card["onTimeRate"] != 94.5
        assert card["qualityScore"] != 4.2
        # No source in this schema for vendor response time.
        assert card["responseTime"] is None
