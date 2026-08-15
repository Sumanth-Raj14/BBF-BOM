"""HTTP-level tests for the BOM variant routes.

Why these exist separately from test_variant_tenant_isolation.py: that file
calls bom_service.add_variant_item() DIRECTLY, at the service layer. So when
POST /api/v1/bom/variants/items was shadowed by the earlier-registered
POST /api/v1/bom/{bom_id}/items — making the endpoint permanently unreachable,
every call landing in create_bom_item with bom_id="variants" and dying on int
coercion — the whole 918-test suite stayed green.

A service-layer test cannot catch a routing bug. These drive the real ASGI app
so route-registration-order regressions fail in CI.

Everything is set up over HTTP on purpose: it exercises the same tenant-context
path a real request uses, rather than hand-managing TenantContext around direct
inserts (which is what the service-layer tests do).
"""

import pytest


async def _make_bom(client, auth_headers, name="Variant Route BOM"):
    resp = await client.post("/api/v1/bom/", json={"name": name}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _make_part(client, auth_headers, pn="VAR-ROUTE-PART"):
    resp = await client.post(
        "/api/v1/parts/",
        json={"pn": pn, "name": "Variant route part"},
        headers=auth_headers,
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_post_variants_items_is_not_shadowed_by_bom_id_items(client, auth_headers):
    """The regression guard.

    Before the route-ordering fix this matched /{bom_id}/items with
    bom_id="variants" and returned 422 on int coercion, never reaching variant
    code at all.
    """
    bom_id = await _make_bom(client, auth_headers)
    part_id = await _make_part(client, auth_headers)

    created = await client.post(
        "/api/v1/bom/variants",
        headers=auth_headers,
        json={
            "base_bom_id": bom_id,
            "variant_name": "Route Variant",
            "description": "created over HTTP",
            "configuration_rules": {},
        },
    )
    assert created.status_code in (200, 201), created.text
    variant_id = created.json()["id"]

    resp = await client.post(
        "/api/v1/bom/variants/items",
        headers=auth_headers,
        json={
            "variant_id": variant_id,
            "part_id": part_id,
            "quantity": 3,
            "is_optional": False,
        },
    )
    # The precise symptom this guards against: a 422 complaining that
    # "variants" is not a valid integer means /{bom_id}/items swallowed it.
    assert resp.status_code != 422, (
        "POST /bom/variants/items is shadowed by /{bom_id}/items again — "
        f"got 422: {resp.text}"
    )
    assert resp.status_code in (200, 201), resp.text


@pytest.mark.asyncio
async def test_get_variant_over_http_returns_the_created_item(client, auth_headers):
    bom_id = await _make_bom(client, auth_headers, "Readback BOM")
    part_id = await _make_part(client, auth_headers, "VAR-READBACK-PART")

    variant_id = (
        await client.post(
            "/api/v1/bom/variants",
            headers=auth_headers,
            json={
                "base_bom_id": bom_id,
                "variant_name": "Readback Variant",
                "description": "",
                "configuration_rules": {},
            },
        )
    ).json()["id"]

    add = await client.post(
        "/api/v1/bom/variants/items",
        headers=auth_headers,
        json={"variant_id": variant_id, "part_id": part_id, "quantity": 2},
    )
    assert add.status_code in (200, 201), add.text

    got = await client.get(f"/api/v1/bom/variants/{variant_id}", headers=auth_headers)
    assert got.status_code == 200, got.text
    body = got.json()
    items = body.get("items") or body.get("variant_items") or []
    # Proves the POST reached variant code rather than being absorbed by
    # another route that happened to return 2xx.
    assert any(i.get("part_id") == part_id for i in items), body


@pytest.mark.asyncio
async def test_bom_id_items_route_still_works(client, auth_headers):
    """Moving the variant routes above /{bom_id}/items must not break it."""
    bom_id = await _make_bom(client, auth_headers, "Plain Items BOM")
    part_id = await _make_part(client, auth_headers, "VAR-PLAIN-PART")

    resp = await client.post(
        f"/api/v1/bom/{bom_id}/items",
        headers=auth_headers,
        json={"part_id": part_id, "quantity": 1},
    )
    assert resp.status_code in (200, 201), resp.text
