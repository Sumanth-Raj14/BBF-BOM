"""Shared helper for resolving the real client IP.

X-Forwarded-For / X-Real-IP are client-spoofable and must only be trusted when
the app runs behind a trusted reverse proxy (settings.BEHIND_PROXY). Otherwise
the direct peer address is used so IP lockout / rate limiting cannot be evaded.
"""

from app.core.config import settings


def get_client_ip(request) -> str:
    if request is None:
        return "unknown"

    client = getattr(request, "client", None)
    peer = client.host if client else None

    if settings.BEHIND_PROXY:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        x_real_ip = request.headers.get("X-Real-IP")
        if x_real_ip:
            return x_real_ip.strip()

    return peer or "unknown"
