"""Every raw-SQL statement in enterprise_ext_api must be tenant-scoped.

This module is 100% raw text() SQL, which bypasses the ORM tenant filter in
tenant_events.py entirely — that only covers ORM select() and ORM flush. All
five tables it touches (currencies, exchange_rates, compliance_certificates,
auto_number_schemes, custom_attribute_definitions) carry a NOT NULL tenantId.

Before this was fixed:
  - every SELECT returned other tenants' rows, and
  - every INSERT omitted tenantId, which cannot even succeed against a NOT NULL
    column — so those write endpoints were broken as well as unscoped.

This is a source-level check rather than an HTTP test on purpose: the failure is
a missing predicate, and grepping the statements catches a newly-added unscoped
query the day it is written, instead of whenever someone happens to exercise
that endpoint with two tenants present.
"""

import pathlib
import re

MODULE = (
    pathlib.Path(__file__).resolve().parents[1]
    / "api"
    / "endpoints"
    / "enterprise_ext_api.py"
)

# Tables in this module that are tenant-owned (all of them carry NOT NULL tenantId).
TENANT_TABLES = {
    "currencies",
    "exchange_rates",
    "compliance_certificates",
    "auto_number_schemes",
    "custom_attribute_definitions",
}


def _statements() -> list[str]:
    """Every SQL string passed to text() in the module, normalised to one line."""
    src = MODULE.read_text(encoding="utf8")
    found = re.findall(r'text\(\s*\n?\s*f?["\']((?:[^"\']|\n)+?)["\']\s*\)', src)
    return [" ".join(s.split()) for s in found]


def test_every_read_of_a_tenant_table_is_scoped():
    unscoped = []
    for stmt in _statements():
        upper = stmt.upper()
        if not upper.startswith(("SELECT", "UPDATE", "DELETE")):
            continue
        if not any(t in stmt for t in TENANT_TABLES):
            continue
        # Either the interpolated helper clause, or an explicit predicate.
        if "{tc}" in stmt or "tenantId" in stmt:
            continue
        unscoped.append(stmt[:120])

    assert not unscoped, (
        "These raw statements touch a tenant-owned table with no tenant predicate, "
        "so they read or modify other tenants' rows:\n  - " + "\n  - ".join(unscoped)
    )


def test_every_insert_into_a_tenant_table_sets_tenant_id():
    bad = []
    for stmt in _statements():
        if not stmt.upper().startswith("INSERT INTO"):
            continue
        m = re.match(r'INSERT INTO (\w+)', stmt)
        if not m or m.group(1) not in TENANT_TABLES:
            continue
        if '"tenantId"' not in stmt:
            bad.append(stmt[:120])

    assert not bad, (
        "These INSERTs omit tenantId on a NOT NULL column — they cannot succeed, "
        "and if the column were nullable they would create unowned rows:\n  - "
        + "\n  - ".join(bad)
    )


def test_helper_is_actually_invoked_wherever_its_clause_is_used():
    """A {tc} placeholder with no tenant_sql_clause() call is a NameError."""
    src = MODULE.read_text(encoding="utf8")
    uses = src.count("{tc}")
    calls = src.count("tenant_sql_clause()")
    assert uses > 0, "expected this module to use the tenant clause"
    assert calls >= 1, "tenant_sql_clause() is never called"
    # Per-function: any function interpolating {tc} must bind it first.
    funcs = list(re.finditer(r"^async def (\w+)\(", src, re.M))
    missing = []
    for i, m in enumerate(funcs):
        start = m.start()
        end = funcs[i + 1].start() if i + 1 < len(funcs) else len(src)
        body = src[start:end]
        if "{tc}" in body and "tenant_sql_clause()" not in body:
            missing.append(m.group(1))
    assert not missing, f"these functions use {{tc}} without binding it: {missing}"
