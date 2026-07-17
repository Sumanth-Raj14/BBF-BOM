"""Input sanitization utilities and (non-destructive) request inspection middleware.

XSS defense is provided by parameterized queries (already used throughout) plus
output encoding at render time. This middleware therefore does NOT mutate request
bodies — doing so silently corrupts legitimate user data (e.g. part descriptions).
It only inspects mutating requests and logs when a suspicious pattern is seen so
it can be flagged, never stripped.
"""

import html
import json
import logging
import re

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)

_MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH"})
_STRIP_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

_XSS_PATTERNS_RE = re.compile(
    r"<script[^>]*>.*?</script>|javascript:\s*|on\w+\s*=|"
    r"<iframe[^>]*>|onerror\s*=|onload\s*=|"
    r"<embed[^>]*>|<object[^>]*>",
    re.IGNORECASE | re.DOTALL,
)


def _contains_xss_pattern(
    v: str | int | float | bool | list | dict | None,
) -> bool:
    """Non-destructive detection: return True if any string value looks like an
    XSS vector. Does not alter the input."""
    if isinstance(v, str):
        return bool(_XSS_PATTERNS_RE.search(v))
    if isinstance(v, dict):
        return any(_contains_xss_pattern(val) for val in v.values())
    if isinstance(v, list):
        return any(_contains_xss_pattern(i) for i in v)
    return False


def sanitize_value(
    v: str | int | float | bool | list | dict | None,
) -> str | int | float | bool | list | dict | None:
    if isinstance(v, str):
        stripped = v.strip()
        if not stripped:
            return stripped
        cleaned = _STRIP_CONTROL_CHARS_RE.sub("", stripped)
        return html.escape(cleaned, quote=True)
    if isinstance(v, dict):
        return {k: sanitize_value(v) for k, v in v.items()}
    if isinstance(v, list):
        return [sanitize_value(i) for i in v]
    return v


class InputSanitizationMiddleware(BaseHTTPMiddleware):
    """Inspects mutating request bodies for XSS-looking patterns and logs a
    warning if found. It never modifies the body, preserving data integrity."""

    async def dispatch(self, request: Request, call_next):
        if request.method in _MUTATING_METHODS:
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type:
                try:
                    body = await request.body()
                    if body and _contains_xss_pattern(json.loads(body)):
                        logger.warning(
                            "Request to %s contains a value matching an XSS pattern "
                            "(not modified; rely on output encoding).",
                            request.url.path,
                        )
                except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
                    logger.debug(
                        "Could not parse JSON body for XSS inspection: content-type=%s",
                        content_type,
                    )
        return await call_next(request)
