"""Enterprise audit logging middleware — persistent DB writes with retry."""

import asyncio
import json
import logging
import os
import time

from fastapi import Request

logger = logging.getLogger(__name__)
from datetime import UTC, datetime

from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

_MAX_RETRIES = 3
_RETRY_DELAYS = [0.1, 0.5, 2.0]

# Track pending audit tasks for clean shutdown
_pending_audit_tasks: set[asyncio.Task] = set()


async def drain_pending_audit_tasks(timeout: float = 5.0):
    """Wait for all pending audit tasks to complete during shutdown."""
    if not _pending_audit_tasks:
        return
    pending = list(_pending_audit_tasks)
    done, _ = await asyncio.wait(pending, timeout=timeout)
    logger.info("Drained %d/%d audit tasks on shutdown", len(done), len(pending))
    _pending_audit_tasks.clear()


async def write_audit_entry(entry: dict):
    """Write a single audit entry to the database with retry logic."""
    if os.environ.get("DISABLE_AUDIT_LOG", "").lower() in ("1", "true", "yes"):
        return
    last_error = None
    for attempt in range(_MAX_RETRIES):
        try:
            from app.core.tenant_context import get_tenant_id
            from app.db.session import get_session_maker

            tid = get_tenant_id()
            session_maker = await get_session_maker()
            async with session_maker() as session:
                await session.execute(
                    text("""
                        INSERT INTO audit_logs (action, "entityType", "entityId", "userId",
                                                "userEmail", "userIp", "userAgent",
                                                changes, "requestId", "createdAt", "tenantId")
                        VALUES (:action, :entityType, :entityId, :userId,
                                :userEmail, :userIp, :userAgent,
                                :changes, :requestId, :createdAt, :tenantId)
                    """),
                    {**entry, "tenantId": tid},
                )
                await session.commit()
            return
        except Exception as e:
            last_error = e
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(_RETRY_DELAYS[attempt])
                logger.warning("Audit write retry %d/%d: %s", attempt + 1, _MAX_RETRIES, e)
    logger.error("Audit write failed after %d retries: %s", _MAX_RETRIES, last_error, exc_info=True)


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Middleware that logs all mutating API requests to audit_logs table."""

    SKIP_PATHS = frozenset(
        {
            "/health",
            "/docs",
            "/openapi.json",
            "/redoc",
            "/metrics",
            "/health/detailed",
        }
    )

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        if request.url.path in self.SKIP_PATHS:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")

        user_id = None
        user_email = None
        auth_header = request.headers.get("authorization", "")
        access_cookie = request.cookies.get("access_token")
        token_str = None
        if auth_header.startswith("Bearer "):
            token_str = auth_header.split(" ")[1]
        elif access_cookie:
            token_str = access_cookie
        if token_str:
            try:
                from app.core.security import verify_token

                payload = verify_token(token_str)
                if payload and "sub" in payload:
                    user_id = int(payload["sub"])
                    user_email = payload.get("email")
            except Exception:
                logger.warning("Could not parse auth token for audit logging")

        response = await call_next(request)
        process_time = time.time() - start_time

        method = request.method
        action_map = {
            "GET": "READ",
            "POST": "CREATE",
            "PUT": "UPDATE",
            "PATCH": "UPDATE",
            "DELETE": "DELETE",
        }
        action = action_map.get(method, method)

        path = request.url.path
        entity_type = None
        entity_id = None
        path_parts = path.strip("/").split("/")
        if len(path_parts) >= 3 and path_parts[0] == "api" and path_parts[1] == "v1":
            entity_type = path_parts[2]
            if len(path_parts) >= 4:
                try:
                    entity_id = int(path_parts[3])
                except (ValueError, IndexError):
                    logger.warning("Could not parse entity ID from path: %s", path)

        changes = {
            "method": method,
            "path": path,
            "status_code": response.status_code,
            "process_time_ms": round(process_time * 1000, 2),
            "query_params": dict(request.query_params) if request.query_params else None,
        }

        should_log = method != "GET" or response.status_code >= 400

        if should_log:
            entry = {
                "action": action,
                "entityType": entity_type,
                "entityId": entity_id,
                "userId": user_id,
                "userEmail": user_email,
                "userIp": client_ip,
                "userAgent": user_agent,
                "changes": json.dumps(changes),
                "createdAt": datetime.now(UTC),
                "requestId": request.state.request_id
                if hasattr(request.state, "request_id")
                else None,
            }
            task = asyncio.create_task(write_audit_entry(entry))
            _pending_audit_tasks.add(task)
            task.add_done_callback(_pending_audit_tasks.discard)

        return response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Middleware that adds a unique request ID to each request."""

    async def dispatch(self, request: Request, call_next):
        import uuid

        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
