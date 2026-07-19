"""Zoho Books API client.

Provides lazy OAuth access-token refresh, an honest read-only `verify()`
(GET /organizations) wired into the existing `/integrations` test-connection
dispatch, and (increment 2a) the OUTBOUND create/update calls the outbox
delivery path uses to push Items / Contacts / Purchase Orders to Books.

It NEVER fabricates success: an absent/invalid credential surfaces as a raised
exception the caller maps to `not_configured`/`auth_failed`, and a Books-side
4xx/5xx raises `httpx.HTTPStatusError` (never a silent no-op).

`organization_id` is appended to EVERY Books call EXCEPT `GET /organizations`
(that endpoint runs at connect time, before an org id exists — spec §4.1).

The inbound poll, sync-state upserts, and conflict resolution are the NEXT
increment and are deliberately NOT built here. The outbound PROACTIVE
client-side rate limiter (a token bucket honoring a 429 Retry-After) IS built
here — see `TokenBucket` / `ZohoBooksClient._rate_limiter` below.
"""

import time
from email.utils import parsedate_to_datetime

import asyncio

import httpx

from app.integrations.zoho_oauth import (
    api_domain_for_region,
    books_base,
    load_auth_blob,
    refresh_access_token,
)

# Refresh a little before the ~1h expiry so a call never fails on a token that
# lapses mid-flight.
_TOKEN_SKEW_SECONDS = 300
_HTTP_TIMEOUT = 15


class TokenBucket:
    """Asyncio-safe token-bucket rate limiter for outbound Zoho Books calls.

    PROACTIVE: `acquire()` is awaited before every outbound Books request so
    the client throttles itself well before Zoho's server-side limit would
    ever return a 429 (a conservative default of ~90/min, spec: client-side
    rate limit). `burst` sets the bucket capacity (how many requests may fire
    back-to-back before throttling kicks in) and defaults to `rate_per_min`
    (one minute's worth of headroom) when not given.

    `penalize()` is the REACTIVE half: when Zoho DOES return a 429 with a
    Retry-After, the caller feeds that value in here, which empties the
    bucket and holds it empty until the deadline — "back off, then refill" —
    so the very next call (this delivery cycle or a later retry) waits out
    the server's cooldown instead of hammering it again immediately.

    A single `asyncio.Lock` serializes bucket mutation; the lock is never
    held across an `await asyncio.sleep`, so concurrent callers queue fairly
    without risking deadlock.
    """

    def __init__(self, rate_per_min: float, burst: int | None = None):
        self._rate_per_sec = max(float(rate_per_min), 0.0) / 60.0
        self._capacity = float(burst if burst is not None else max(rate_per_min, 1))
        self._tokens = self._capacity
        self._updated = time.monotonic()
        self._blocked_until: float | None = None
        self._lock = asyncio.Lock()

    def _refill_locked(self, now: float) -> None:
        elapsed = now - self._updated
        if elapsed > 0:
            self._tokens = min(self._capacity, self._tokens + elapsed * self._rate_per_sec)
            self._updated = now

    async def acquire(self) -> None:
        """Block until one token is available, then consume it."""
        while True:
            async with self._lock:
                now = time.monotonic()
                if self._blocked_until is not None:
                    if now < self._blocked_until:
                        wait = self._blocked_until - now
                    else:
                        # Cooldown elapsed: resume normal refill from here.
                        self._blocked_until = None
                        self._updated = now
                        self._refill_locked(now)
                        wait = 0.0
                else:
                    self._refill_locked(now)
                    wait = 0.0
                if wait <= 0:
                    if self._tokens >= 1:
                        self._tokens -= 1
                        return
                    wait = (
                        (1 - self._tokens) / self._rate_per_sec
                        if self._rate_per_sec > 0
                        else 1.0
                    )
            await asyncio.sleep(max(wait, 0.001))

    async def penalize(self, retry_after_seconds: float) -> None:
        """Honor a 429 Retry-After: empty the bucket and hold it empty until
        `retry_after_seconds` from now, then let normal refill resume."""
        async with self._lock:
            self._tokens = 0.0
            now = time.monotonic()
            self._updated = now
            self._blocked_until = now + max(float(retry_after_seconds), 0.0)


def _parse_retry_after(value: str | None) -> float | None:
    """Retry-After is either an integer/float seconds count or an HTTP-date
    (RFC 7231 §7.1.3). Returns None when absent/unparseable so the caller can
    fall back to a sane default rather than crash on a malformed header."""
    if not value:
        return None
    value = value.strip()
    try:
        return max(float(value), 0.0)
    except ValueError:
        pass
    try:
        dt = parsedate_to_datetime(value)
        if dt is None:
            return None
        import datetime as _dt

        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=_dt.timezone.utc)
        delta = (dt - _dt.datetime.now(_dt.timezone.utc)).total_seconds()
        return max(delta, 0.0)
    except (TypeError, ValueError, OverflowError):
        return None


# Process-wide default limiter shared by every ZohoBooksClient that doesn't
# get one injected (e.g. for tests). Deliberately module-level, NOT per
# instance: the outbox drainer (app.integrations.worker.deliver_pending)
# builds a fresh ZohoBooksClient per outbox row, so a per-instance bucket
# would never see more than one request and could not throttle a batch — the
# shared bucket is what makes the limiter actually proactive across a drain.
_default_rate_limiter: "TokenBucket | None" = None


def _shared_rate_limiter() -> "TokenBucket":
    global _default_rate_limiter
    if _default_rate_limiter is None:
        from app.core.config import settings

        rate = getattr(settings, "ZOHO_RATE_LIMIT_PER_MIN", 90)
        _default_rate_limiter = TokenBucket(rate_per_min=rate)
    return _default_rate_limiter

# entity_type -> (module path segment, create/update record key, id field, list key).
# The record key is the singular wrapper Books returns/accepts; the id field is
# the opaque Zoho id stored in IntegrationExternalLink.external_id; the list key
# is the plural array Books returns on GET /{module} (used by the inbound poll).
ZOHO_MODULES: dict[str, dict[str, str]] = {
    "part": {"module": "items", "record": "item", "id_field": "item_id", "list": "items"},
    "vendor": {
        "module": "contacts", "record": "contact", "id_field": "contact_id", "list": "contacts",
    },
    "purchase_order": {
        "module": "purchaseorders",
        "record": "purchaseorder",
        "id_field": "purchaseorder_id",
        "list": "purchaseorders",
    },
}


class ZohoAuthError(Exception):
    """Raised when the stored credential blob cannot yield an access token
    (e.g. no refresh token persisted). Surfaced as an honest failure — never a
    fake success."""


class ZohoBooksClient:
    def __init__(
        self,
        *,
        auth_blob: dict | None = None,
        region: str = "us",
        api_domain: str | None = None,
        organization_id: str | None = None,
        http: httpx.AsyncClient | None = None,
        rate_limiter: "TokenBucket | None" = None,
    ):
        self._auth = auth_blob or {}
        self._region = (region or "us").lower()
        # Prefer the persisted api_domain from the token response; fall back to
        # the region default only when absent (spec §5 — never hardcode).
        self._api_domain = api_domain or api_domain_for_region(self._region)
        self._organization_id = organization_id
        self._http = http
        self._access_token = self._auth.get("access_token")
        self._access_token_expires_at = self._auth.get("access_token_expires_at")
        # PROACTIVE outbound rate limiter (spec: client-side token bucket).
        # Shared process-wide by default (see `_shared_rate_limiter`) so it
        # actually throttles across the many short-lived clients the outbox
        # drainer builds; tests inject their own instance to control timing.
        self._rate_limiter = rate_limiter or _shared_rate_limiter()

    @classmethod
    def from_connection(cls, conn) -> "ZohoBooksClient":
        """Build a client from an IntegrationConnection: decrypt the auth blob
        and read the non-secret config (region/api_domain/organization_id)."""
        cfg = (conn.config or {}) if conn else {}
        blob = load_auth_blob(conn.auth) if conn and conn.auth else {}
        return cls(
            auth_blob=blob,
            region=cfg.get("region", "us"),
            api_domain=cfg.get("api_domain"),
            organization_id=cfg.get("organization_id"),
        )

    def _token_is_valid(self) -> bool:
        if not self._access_token or not self._access_token_expires_at:
            return False
        try:
            return float(self._access_token_expires_at) - time.time() > _TOKEN_SKEW_SECONDS
        except (TypeError, ValueError):
            return False

    async def _ensure_token(self) -> str:
        """Return a usable access token, refreshing from the stored refresh
        token when the cached one is missing/near expiry."""
        if self._token_is_valid():
            return self._access_token
        refresh_token = self._auth.get("refresh_token")
        if not refresh_token:
            raise ZohoAuthError("no refresh_token stored for this connection")
        data = await refresh_access_token(
            refresh_token=refresh_token,
            client_id=self._auth.get("client_id"),
            client_secret=self._auth.get("client_secret"),
            region=self._region,
            http=self._http,
        )
        self._access_token = data.get("access_token")
        if not self._access_token:
            raise ZohoAuthError("token refresh returned no access_token")
        self._access_token_expires_at = time.time() + float(data.get("expires_in", 3600))
        # Zoho returns the correct api_domain with the token — prefer it.
        if data.get("api_domain"):
            self._api_domain = data["api_domain"]
        return self._access_token

    def _auth_headers(self, token: str) -> dict:
        return {"Authorization": f"Zoho-oauthtoken {token}"}

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        params: dict | None = None,
        with_org: bool = True,
    ) -> dict:
        """Issue one authenticated Books call, injecting `organization_id` on
        everything except the org-listing endpoint (spec §4.1).

        Raises httpx.HTTPStatusError on any 4xx/5xx so callers classify the
        failure honestly (auth vs validation vs transient) — never a fake OK.
        A 429 still raises (preserving that classification/retry behavior in
        app.integrations.worker), but its Retry-After is first fed to the
        rate limiter so the NEXT call — this drain cycle or a later retry —
        waits out Zoho's cooldown instead of retrying immediately.
        """
        token = await self._ensure_token()
        url = f"{books_base(self._api_domain)}{path}"
        q = dict(params or {})
        if with_org and self._organization_id:
            q["organization_id"] = self._organization_id
        # PROACTIVE throttle: acquired before every outbound call.
        await self._rate_limiter.acquire()
        close = self._http is None
        http = self._http or httpx.AsyncClient(timeout=_HTTP_TIMEOUT)
        try:
            r = await http.request(
                method, url, params=q or None, json=json, headers=self._auth_headers(token)
            )
            if r.status_code == 429:
                retry_after = _parse_retry_after(r.headers.get("Retry-After"))
                if retry_after is not None:
                    await self._rate_limiter.penalize(retry_after)
            r.raise_for_status()
            return r.json() or {}
        finally:
            if close:
                await http.aclose()

    async def verify(self) -> dict:
        """Lightweight, read-only credential check: GET /organizations (built
        from api_domain with NO organization_id param — that id is not yet known
        at connect and injecting it would break the call, spec §4.1).

        Raises httpx.HTTPStatusError / ZohoAuthError on bad or absent creds so
        the caller reports an honest failure. Never creates/modifies anything.
        """
        body = await self._request("GET", "/organizations", with_org=False)
        orgs = body.get("organizations", []) or []
        return {
            "ok": True,
            "organizations": [
                {"organization_id": o.get("organization_id"), "name": o.get("name")}
                for o in orgs
            ],
        }

    async def list_organizations(self) -> list[dict]:
        """Return the raw org list for post-callback org selection (spec §5)."""
        body = await self._request("GET", "/organizations", with_org=False)
        return body.get("organizations", []) or []

    async def create_record(self, module: str, payload: dict) -> dict:
        """POST /{module} — create an Item/Contact/Purchase Order. Returns the
        full Books response body; the caller extracts the record + its id."""
        return await self._request("POST", f"/{module}", json=payload)

    async def update_record(self, module: str, external_id: str, payload: dict) -> dict:
        """PUT /{module}/{external_id} — update an existing Books record."""
        return await self._request("PUT", f"/{module}/{external_id}", json=payload)

    async def list_records(self, module: str, *, params: dict | None = None) -> dict:
        """GET /{module} — one page of records for the incremental inbound poll
        (spec §4.4). Returns the full Books body so the caller reads both the
        record array (module 'list' key) and `page_context.has_more_page`.

        Raises httpx.HTTPStatusError on any 4xx/5xx (e.g. 429 rate limit) so the
        poller can classify/back off honestly — never a silent empty page.
        """
        return await self._request("GET", f"/{module}", params=params)

    async def list_settings(self, kind: str) -> dict:
        """Per-org settings lookup (currencies|taxes|chartofaccounts) used to
        resolve opaque Books foreign keys on create (spec §4.1/§4.2). Read-only.
        """
        return await self._request("GET", f"/settings/{kind}")

    async def list_records(self, module: str, *, params: dict | None = None) -> dict:
        """GET /{module} for the inbound incremental poll / reconciliation. Returns
        the raw body (records list under the plural module key + `page_context`).
        Read-only."""
        return await self._request("GET", f"/{module}", params=params)
