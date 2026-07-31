"""Track D -- safe formula evaluator + computed custom-attribute tests."""

import pytest
from fastapi import HTTPException

from app.api.endpoints import formulas as formulas_endpoints
from app.main import app
from app.models.enterprise_extensions import CustomAttributeDefinition
from app.models.part import Part
from app.services.formula_service import FormulaError, compute_custom_attribute, evaluate_formula

# Mount the new /formulas router directly on the shared test app -- same
# rationale as test_where_used_graph.py (api_v1.py wiring is out of scope
# here; see router_includes). Routes must be inserted BEFORE main.py's SPA
# catch-all (`GET /{full_path:path}`, appended at app.main import time) or
# they'd be shadowed by it -- see the longer comment in
# test_where_used_graph.py for why a plain include_router isn't enough.
if not any(getattr(r, "path", "").startswith("/api/v1/formulas") for r in app.routes):
    _before_ids = {id(r) for r in app.router.routes}
    app.include_router(formulas_endpoints.router, prefix="/api/v1/formulas", tags=["formulas"])
    _new_routes = [r for r in app.router.routes if id(r) not in _before_ids]
    for _r in _new_routes:
        app.router.routes.remove(_r)
    for _r in reversed(_new_routes):
        app.router.routes.insert(0, _r)


# ---- evaluate_formula: correctness ----


def test_evaluate_formula_basic_multiplication():
    assert evaluate_formula("qty * unit_cost", {"qty": 3, "unit_cost": 2.5}) == 7.5


def test_evaluate_formula_arithmetic_precedence():
    assert evaluate_formula("2 + 3 * 4", {}) == 14


def test_evaluate_formula_parentheses_and_unary():
    assert evaluate_formula("-(a + b) * 2", {"a": 1, "b": 2}) == -6


def test_evaluate_formula_division():
    assert evaluate_formula("total / count", {"total": 10, "count": 4}) == 2.5


def test_evaluate_formula_division_by_zero_rejected():
    with pytest.raises(FormulaError):
        evaluate_formula("x / y", {"x": 1, "y": 0})


def test_evaluate_formula_unknown_variable_rejected():
    with pytest.raises(FormulaError):
        evaluate_formula("qty * missing_field", {"qty": 1})


def test_evaluate_formula_empty_rejected():
    with pytest.raises(FormulaError):
        evaluate_formula("", {})


# ---- evaluate_formula: malicious input rejected ----


@pytest.mark.parametrize(
    "malicious",
    [
        "__import__('os').system('echo pwned')",
        "os.system('rm -rf /')",
        "open('/etc/passwd').read()",
        "(lambda: 1)()",
        "[x for x in range(10)]",
        "{'a': 1}",
        "'literal string'",
        "a if True else b",
        "1 == 1",
        "1 and 2",
        "(x := 5)",
        "exec('1')",
        "().__class__",
        "a.b.c",
        "a[0]",
    ],
)
def test_evaluate_formula_rejects_malicious_or_disallowed_input(malicious):
    with pytest.raises(FormulaError):
        evaluate_formula(malicious, {"a": 1, "b": 2, "x": 1})


def test_evaluate_formula_rejects_syntax_errors():
    with pytest.raises(FormulaError):
        evaluate_formula("qty * * cost", {"qty": 1, "cost": 1})


# ---- compute_custom_attribute: entity-bound computation ----


async def _make_part(db_session, tenant_id, pn="P-1", qty=5, cost=2.0):
    part = Part(pn=pn, name="Test Part", category="Electrical", qty=qty, cost=cost, tenantId=tenant_id)
    db_session.add(part)
    await db_session.commit()
    await db_session.refresh(part)
    return part


async def _make_formula_attr(db_session, tenant_id, formula="qty * unit_cost", entity_type="part"):
    attr = CustomAttributeDefinition(
        entity_type=entity_type,
        attribute_name="extended_value",
        attribute_type="number",
        formula=formula,
        is_computed=True,
        tenantId=tenant_id,
    )
    db_session.add(attr)
    await db_session.commit()
    await db_session.refresh(attr)
    return attr


@pytest.mark.asyncio
async def test_compute_custom_attribute_for_part(db_session, test_tenant, tenant_id):
    part = await _make_part(db_session, tenant_id, qty=5, cost=2.0)
    attr = await _make_formula_attr(db_session, tenant_id, formula="qty * unit_cost")

    result = await compute_custom_attribute(db_session, tenant_id, attr.id, "part", part.id)

    assert result["value"] == 10.0
    assert result["attribute_definition_id"] == attr.id
    assert result["entity_id"] == part.id


@pytest.mark.asyncio
async def test_compute_custom_attribute_with_extra_context_override(db_session, test_tenant, tenant_id):
    part = await _make_part(db_session, tenant_id, qty=5, cost=2.0)
    attr = await _make_formula_attr(db_session, tenant_id, formula="qty * bonus_multiplier")

    result = await compute_custom_attribute(
        db_session, tenant_id, attr.id, "part", part.id, extra_context={"bonus_multiplier": 3}
    )

    assert result["value"] == 15.0


@pytest.mark.asyncio
async def test_compute_custom_attribute_rejects_malicious_stored_formula(db_session, test_tenant, tenant_id):
    part = await _make_part(db_session, tenant_id)
    attr = await _make_formula_attr(
        db_session, tenant_id, formula="__import__('os').system('echo pwned')"
    )

    with pytest.raises(HTTPException) as exc_info:
        await compute_custom_attribute(db_session, tenant_id, attr.id, "part", part.id)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_compute_custom_attribute_not_computed_rejected(db_session, test_tenant, tenant_id):
    part = await _make_part(db_session, tenant_id)
    attr = CustomAttributeDefinition(
        entity_type="part",
        attribute_name="plain_attr",
        attribute_type="text",
        is_computed=False,
        tenantId=tenant_id,
    )
    db_session.add(attr)
    await db_session.commit()
    await db_session.refresh(attr)

    with pytest.raises(HTTPException) as exc_info:
        await compute_custom_attribute(db_session, tenant_id, attr.id, "part", part.id)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_compute_custom_attribute_not_found(db_session, test_tenant, tenant_id):
    with pytest.raises(HTTPException) as exc_info:
        await compute_custom_attribute(db_session, tenant_id, 999999, "part", 1)
    assert exc_info.value.status_code == 404


# ---- HTTP endpoint tests ----


@pytest.mark.asyncio
async def test_formulas_evaluate_endpoint(client, auth_headers):
    resp = await client.post(
        "/api/v1/formulas/evaluate",
        headers=auth_headers,
        json={"formula": "qty * unit_cost", "context": {"qty": 3, "unit_cost": 2.5}},
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == 7.5


@pytest.mark.asyncio
async def test_formulas_evaluate_endpoint_rejects_malicious_input(client, auth_headers):
    resp = await client.post(
        "/api/v1/formulas/evaluate",
        headers=auth_headers,
        json={"formula": "__import__('os').system('echo pwned')", "context": {}},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_formulas_compute_endpoint(client, auth_headers, db_session, test_tenant, tenant_id):
    part = await _make_part(db_session, tenant_id, qty=4, cost=1.5)
    attr = await _make_formula_attr(db_session, tenant_id, formula="qty * unit_cost")

    resp = await client.post(
        f"/api/v1/formulas/{attr.id}/compute",
        headers=auth_headers,
        json={"entity_type": "part", "entity_id": part.id},
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == 6.0


@pytest.mark.asyncio
async def test_formulas_endpoints_without_auth(client):
    # POST without credentials is rejected before it ever reaches the
    # formula evaluator -- either by auth (401) or, for state-changing
    # verbs, by CSRF (403); matches the (401, 403) convention used by the
    # other *_without_auth POST tests in this suite (e.g. test_bom_items.py).
    resp = await client.post("/api/v1/formulas/evaluate", json={"formula": "1+1", "context": {}})
    assert resp.status_code in (401, 403)
