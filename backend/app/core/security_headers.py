from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        # HSTS and CSP upgrade-insecure-requests are HTTPS-only concepts. Over
        # plain HTTP (the local-first desktop deployment serves
        # http://127.0.0.1:8756) `upgrade-insecure-requests` makes the browser
        # rewrite EVERY api/asset request to https://, which the server does
        # not speak -> ERR_SSL_PROTOCOL_ERROR and the whole app "loses
        # connection". Only emit them when the request actually arrived over
        # TLS (directly or via a reverse proxy).
        is_https = (
            request.url.scheme == "https"
            or request.headers.get("x-forwarded-proto", "").lower() == "https"
        )
        if is_https:
            if settings.IS_PRODUCTION:
                response.headers["Strict-Transport-Security"] = (
                    "max-age=63072000; includeSubDomains; preload"
                )
            else:
                response.headers["Strict-Transport-Security"] = (
                    "max-age=31536000; includeSubDomains"
                )

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        )

        if settings.IS_PRODUCTION:
            csp_directives = [
                "default-src 'self'",
                "script-src 'self'",
                "style-src 'self'",
                "img-src 'self' data: blob:",
                "font-src 'self' data:",
                "connect-src 'self' ws: wss:",
                "frame-ancestors 'none'",
                "base-uri 'self'",
                "form-action 'self'",
                "require-trusted-types-for 'script'",
                "report-uri /api/v1/csp-report",
            ]
        else:
            csp_directives = [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: blob:",
                "font-src 'self' data:",
                "connect-src 'self' ws: wss:",
                "frame-ancestors 'none'",
                "base-uri 'self'",
                "form-action 'self'",
            ]
            if is_https:
                csp_directives.append("upgrade-insecure-requests")

        response.headers["Content-Security-Policy"] = "; ".join(csp_directives)
        response.headers["X-XSS-Protection"] = "0"

        return response
