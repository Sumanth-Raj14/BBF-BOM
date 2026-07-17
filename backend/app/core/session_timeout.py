"""Session inactivity timeout middleware.

Enforces max inactivity period for authenticated users.
After SESSION_INACTIVITY_MINUTES of no requests, forces re-authentication.
"""

import time

import jwt
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.config import settings

SESSION_INACTIVITY_MINUTES = 60


class SessionTimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not request.url.path.startswith("/api/v1"):
            return await call_next(request)

        if request.url.path in (
            "/api/v1/auth/login",
            "/api/v1/auth/register",
            "/api/v1/auth/refresh",
            "/api/v1/auth/logout",
            "/api/v1/health",
            "/api/v1/health/detailed",
        ):
            return await call_next(request)

        access_token = request.cookies.get("access_token")
        if access_token and settings.IS_PRODUCTION:
            from app.core.security import _get_jwt_verify_key

            try:
                payload = jwt.decode(
                    access_token, _get_jwt_verify_key(), algorithms=[settings.ALGORITHM]
                )
                exp = payload.get("exp", 0)
                if exp and time.time() > exp:
                    return Response(
                        status_code=401,
                        content='{"detail":"Session expired"}',
                        media_type="application/json",
                    )
            except jwt.InvalidTokenError:
                return Response(
                    status_code=401,
                    content='{"detail":"Invalid session"}',
                    media_type="application/json",
                )

        return await call_next(request)
