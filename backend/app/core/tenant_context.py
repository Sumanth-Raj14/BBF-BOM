"""Tenant context management for multi-tenancy support.

Uses contextvars for thread-safe tenant context across async requests.
Provides utilities for raw SQL tenant filtering.
"""

import contextvars
from typing import Optional

current_tenant_id: contextvars.ContextVar[Optional[int]] = contextvars.ContextVar(
    "current_tenant_id", default=None
)


def set_tenant_id(tenant_id: Optional[int]) -> contextvars.Token:
    return current_tenant_id.set(tenant_id)


def get_tenant_id() -> Optional[int]:
    return current_tenant_id.get()


def tenant_sql_clause(table_alias: str = "") -> tuple[str, dict]:
    """Generate a tenant WHERE clause and params for raw SQL queries.

    Usage:
        where_clause, params = tenant_sql_clause("p")
        await db.execute(text(f"SELECT * FROM parts p WHERE 1=1 {where_clause}"), params)

    Returns ("", {}) if no tenant context (superuser).
    """
    tid = get_tenant_id()
    if tid is None:
        return "", {}
    prefix = f"{table_alias}." if table_alias else ""
    return f'AND {prefix}"tenantId" = :_tenant_id', {"_tenant_id": tid}


class TenantContext:
    """Wrapper class for tenant context management using contextvars."""

    @classmethod
    def set(cls, tenant_id: Optional[int]) -> contextvars.Token:
        return set_tenant_id(tenant_id)

    @classmethod
    def get(cls) -> Optional[int]:
        return get_tenant_id()

    @classmethod
    def reset(cls, token: contextvars.Token) -> None:
        current_tenant_id.reset(token)
