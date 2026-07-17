"""CSRF protection middleware using double-submit cookie pattern."""

import hmac
import secrets
from hashlib import sha256

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response
from starlette.types import ASGIApp

from app.core.config import settings

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})
CSRF_EXEMPT_PATHS = frozenset(
    {
        "/api/v1/auth/refresh",
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/logout",
        # Desktop plugin (e.g. SolidWorks add-in) credential exchange — machine client,
        # authenticates by API key in the body, cannot participate in browser CSRF.
        "/api/v1/auth/plugin-login",
    }
)
# Removed broad /api/v1/supplier-portal/ exemption — each endpoint should be explicitly exempted if needed
CSRF_EXEMPT_PREFIXES: frozenset = frozenset()


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


class CSRFMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, secret: str):
        super().__init__(app)
        self._secret = secret.encode("utf-8")

    def _sign(self, token: str) -> str:
        return hmac.new(self._secret, token.encode("utf-8"), sha256).hexdigest()

    def _make_cookie_value(self, token: str) -> str:
        return f"{token}.{self._sign(token)}"

    def _verify(self, cookie_val: str, header_val: str) -> bool:
        try:
            cookie_token = cookie_val.split(".")[0]
            expected_sig = self._sign(cookie_token)
            return hmac.compare_digest(
                cookie_val,
                f"{cookie_token}.{expected_sig}",
            ) and hmac.compare_digest(cookie_token, header_val)
        except (IndexError, AttributeError):
            return False

    def _is_exempt(self, path: str) -> bool:
        if path in CSRF_EXEMPT_PATHS:
            return True
        return any(path.startswith(prefix) for prefix in CSRF_EXEMPT_PREFIXES)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in SAFE_METHODS or self._is_exempt(request.url.path):
            response = await call_next(request)
            if CSRF_COOKIE_NAME not in request.cookies:
                token = generate_csrf_token()
                signed = self._make_cookie_value(token)
                # Note: NOT httponly — frontend JS reads this cookie to set X-CSRF-Token header.
                # Security comes from same-origin policy (attacker cannot set custom headers cross-origin).
                response.set_cookie(
                    key=CSRF_COOKIE_NAME,
                    value=signed,
                    httponly=False,
                    samesite="strict",
                    secure=settings.IS_PRODUCTION,
                    max_age=86400,
                    path="/",
                )
            return response

        # Bearer token auth is immune to CSRF (browsers don't auto-attach Authorization headers)
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            return await call_next(request)

        cookie_val = request.cookies.get(CSRF_COOKIE_NAME)
        header_val = request.headers.get(CSRF_HEADER_NAME)
        if not cookie_val or not header_val or not self._verify(cookie_val, header_val):
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token missing or invalid"},
            )
        return await call_next(request)
