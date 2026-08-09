"""Endpoint-level proof that /api/v1/uom is actually reachable (not just
the service function) — GET /convert and POST /rollup-quantities, plus the
422 a client sees when a conversion is impossible.
"""

import pytest

from app.models.uom import UomConversion, UomUnit
from app.services.uom_service import STANDARD_CONVERSIONS, STANDARD_UNITS


@pytest.fixture(autouse=True)
async def seed_units(db_session, test_tenant, tenant_id):
    for code, name, dimension, is_base in STANDARD_UNITS:
        db_session.add(
            UomUnit(tenantId=tenant_id, code=code, name=name, dimension=dimension, is_base=is_base)
        )
    await db_session.flush()
    for from_uom, to_uom, factor in STANDARD_CONVERSIONS:
        db_session.add(
            UomConversion(tenantId=tenant_id, from_uom=from_uom, to_uom=to_uom, factor=factor)
        )
    await db_session.commit()


async def test_convert_endpoint_metre_to_centimetre(client, auth_headers):
    resp = await client.get(
        "/api/v1/uom/convert",
        params={"quantity": 1, "from_uom": "M", "to_uom": "CM"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["result"] == 100.0


async def test_convert_endpoint_cross_dimension_is_422_with_clear_message(client, auth_headers):
    resp = await client.get(
        "/api/v1/uom/convert",
        params={"quantity": 1, "from_uom": "M", "to_uom": "KG"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "dimension" in resp.json()["detail"]


async def test_rollup_endpoint_mixed_units(client, auth_headers):
    resp = await client.post(
        "/api/v1/uom/rollup-quantities",
        json={"lines": [{"quantity": 2, "uom": "M"}, {"quantity": 150, "uom": "CM"}]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    length = next(d for d in body["by_dimension"] if d["dimension"] == "length")
    assert length["total"] == 3.5


async def test_list_units_endpoint(client, auth_headers):
    resp = await client.get("/api/v1/uom/units", headers=auth_headers)
    assert resp.status_code == 200
    codes = {u["code"] for u in resp.json()}
    assert {"EA", "M", "CM", "KG"}.issubset(codes)
