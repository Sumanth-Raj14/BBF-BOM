"""Middleware for automatic tenant context isolation.

Sets the current tenant_id from the authenticated user's tenantId
on every request. Extracts user from JWT directly since middleware
executes before FastAPI dependency injection runs.
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.security import verify_token
from app.core.tenant_context import current_tenant_id, set_tenant_id


class TenantIsolationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        tenant_id = None

        # Extract user from JWT token directly (DI hasn't run yet)
        auth_header = request.headers.get("authorization", "")
        access_cookie = request.cookies.get("access_token")
        token_str = None
        if auth_header.startswith("Bearer "):
            token_str = auth_header.split(" ")[1]
        elif access_cookie:
            token_str = access_cookie

        if token_str:
            try:
                payload = verify_token(token_str)
                if payload and "sub" in payload and "tenantId" in payload:
                    is_superuser = payload.get("isSuperuser", False)
                    if not is_superuser:
                        tenant_id = payload.get("tenantId")
            except Exception as exc:
                import logging

                logging.debug("Token parse failed for tenant extraction: %s", exc)

        token = set_tenant_id(tenant_id)
        try:
            response = await call_next(request)
        finally:
            current_tenant_id.reset(token)
        return response
