"""Track D -- where-used knowledge graph (nodes+edges) tests."""

import pytest

from app.api.endpoints import graph as graph_endpoints
from app.main import app
from app.models.bom import BOM, BOMItem
from app.models.part import Part
from app.services import graph_service

# The new /graph router is intentionally NOT wired into app/api/api_v1.py yet
# (see HARD RULES: shared router wiring is out of scope for this track --
# app_v1.py's include_router lines are supplied out-of-band in
# router_includes instead). Mount it directly on the shared test `app` here
# so the endpoint-level tests below exercise the real dependency-injected
# route rather than only the service function.
#
# main.py appends a catch-all `GET /{full_path:path}` (SPA frontend serving)
# AFTER api_v1's routes but this module is imported (and include_router
# called) well after app.main has already finished executing at import time
# -- so a plain include_router would append these routes AFTER that
# catch-all, which would shadow them (any unmatched GET path always matches
# `{full_path:path}` first). Insert the newly-added routes at the front of
# app.router.routes instead, so they are matched before the catch-all.
if not any(getattr(r, "path", "").startswith("/api/v1/graph") for r in app.routes):
    _before_ids = {id(r) for r in app.router.routes}
    app.include_router(graph_endpoints.router, prefix="/api/v1/graph", tags=["graph"])
    _new_routes = [r for r in app.router.routes if id(r) not in _before_ids]
    for _r in _new_routes:
        app.router.routes.remove(_r)
    for _r in reversed(_new_routes):
        app.router.routes.insert(0, _r)


async def _make_part(db_session, tenant_id, pn, name="Part", category="Electrical", status="Released"):
    part = Part(pn=pn, name=name, category=category, status=status, tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)
    return part


async def _make_bom(db_session, tenant_id, bom_number, name="BOM"):
    bom = BOM(bom_number=bom_number, name=name, tenantId=tenant_id)
    db_session.add(bom)
    await db_session.commit()
    await db_session.refresh(bom)
    return bom


async def _make_item(db_session, tenant_id, bom_id, part_id=None, quantity=1, parent_item_id=None):
    item = BOMItem(
        bom_id=bom_id,
        part_id=part_id,
        quantity=quantity,
        parent_item_id=parent_item_id,
        tenantId=tenant_id,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


async def _build_two_level_bom(db_session, tenant_id):
    """assembly (root item) -> component (nested child item), inside one BOM."""
    assembly = await _make_part(db_session, tenant_id, "ASSY-001", "Widget Assembly", category="Assembly")
    component = await _make_part(db_session, tenant_id, "CMP-001", "Fastener", category="Hardware")
    bom = await _make_bom(db_session, tenant_id, "BOM-0001", name="Widget Product BOM")
    root_item = await _make_item(db_session, tenant_id, bom.id, part_id=assembly.id, quantity=1)
    child_item = await _make_item(
        db_session, tenant_id, bom.id, part_id=component.id, quantity=4, parent_item_id=root_item.id
    )
    return bom, assembly, component, root_item, child_item


@pytest.mark.asyncio
async def test_where_used_graph_returns_parent_assembly_for_component(db_session, test_tenant, tenant_id):
    bom, assembly, component, root_item, child_item = await _build_two_level_bom(db_session, tenant_id)

    graph = await graph_service.build_where_used_graph(db_session, tenant_id, component.id)

    node_ids = {n["id"] for n in graph["nodes"]}
    assert f"part:{component.id}" in node_ids
    assert f"part:{assembly.id}" in node_ids
    assert f"bom:{bom.id}" in node_ids

    edge_pairs = {(e["source"], e["target"]) for e in graph["edges"]}
    assert (f"bom:{bom.id}", f"part:{assembly.id}") in edge_pairs
    assert (f"part:{assembly.id}", f"part:{component.id}") in edge_pairs

    # The component-of edge carries the child line's own quantity.
    component_edge = next(
        e
        for e in graph["edges"]
        if e["source"] == f"part:{assembly.id}" and e["target"] == f"part:{component.id}"
    )
    assert float(component_edge["quantity"]) == 4.0


@pytest.mark.asyncio
async def test_where_used_graph_returns_own_components_for_assembly(db_session, test_tenant, tenant_id):
    bom, assembly, component, root_item, child_item = await _build_two_level_bom(db_session, tenant_id)

    graph = await graph_service.build_where_used_graph(db_session, tenant_id, assembly.id)

    node_ids = {n["id"] for n in graph["nodes"]}
    assert f"part:{assembly.id}" in node_ids
    assert f"part:{component.id}" in node_ids
    assert f"bom:{bom.id}" in node_ids

    edge_pairs = {(e["source"], e["target"]) for e in graph["edges"]}
    assert (f"bom:{bom.id}", f"part:{assembly.id}") in edge_pairs
    assert (f"part:{assembly.id}", f"part:{component.id}") in edge_pairs


@pytest.mark.asyncio
async def test_where_used_graph_unused_part_has_no_edges(db_session, test_tenant, tenant_id):
    lone = await _make_part(db_session, tenant_id, "LONE-001", "Unused Part")

    graph = await graph_service.build_where_used_graph(db_session, tenant_id, lone.id)

    assert graph["edges"] == []
    assert [n["id"] for n in graph["nodes"]] == [f"part:{lone.id}"]


@pytest.mark.asyncio
async def test_where_used_graph_part_not_found_raises_404(db_session, test_tenant, tenant_id):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await graph_service.build_where_used_graph(db_session, tenant_id, 999999)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_where_used_graph_scoped_to_tenant(db_session, test_tenant):
    """A part occurring in tenant 1's BOM must not leak into tenant 2's graph query."""
    from app.models.tenant import Tenant

    other_tenant = Tenant(id=2, tenant_name="Other Tenant", tenant_code="OTHER")
    db_session.add(other_tenant)
    await db_session.commit()

    bom, assembly, component, root_item, child_item = await _build_two_level_bom(db_session, 1)

    # Same part id looked up under a different tenant scope should 404 (the
    # part itself belongs to tenant 1, not tenant 2).
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await graph_service.build_where_used_graph(db_session, 2, component.id)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_part_analytics_counts_by_category_and_status(db_session, test_tenant, tenant_id):
    await _make_part(db_session, tenant_id, "A-1", category="Electrical", status="Released")
    await _make_part(db_session, tenant_id, "A-2", category="Electrical", status="Draft")
    await _make_part(db_session, tenant_id, "A-3", category="Mechanical", status="Released")

    result = await graph_service.get_part_analytics(db_session, tenant_id)

    assert result["total_parts"] == 3
    assert result["by_category"]["Electrical"] == 2
    assert result["by_category"]["Mechanical"] == 1
    assert result["by_status"]["Released"] == 2
    assert result["by_status"]["Draft"] == 1


@pytest.mark.asyncio
async def test_graph_api_where_used_endpoint(client, auth_headers, db_session, test_tenant, tenant_id):
    bom, assembly, component, root_item, child_item = await _build_two_level_bom(db_session, tenant_id)

    resp = await client.get(f"/api/v1/graph/where-used/{component.id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    node_ids = {n["id"] for n in data["nodes"]}
    assert f"part:{assembly.id}" in node_ids


@pytest.mark.asyncio
async def test_graph_api_analytics_endpoint(client, auth_headers, db_session, test_tenant, tenant_id):
    await _make_part(db_session, tenant_id, "AN-1", category="Electrical", status="Released")

    resp = await client.get("/api/v1/graph/analytics", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_parts"] >= 1


@pytest.mark.asyncio
async def test_graph_api_without_auth(client):
    resp = await client.get("/api/v1/graph/where-used/1")
    assert resp.status_code == 401
