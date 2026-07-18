"""Zoho Books API client (FOUNDATION increment).

Provides lazy OAuth access-token refresh and an honest, read-only `verify()`
(GET /organizations) wired into the existing `/integrations` test-connection
dispatch for provider='zoho_books'. It NEVER fabricates success: an
absent/invalid credential surfaces as a raised exception the endpoint maps to
`not_configured`/`auth_failed`.

The outbound deliver path, inbound poll, sync-state upserts, rate-limit
token-bucket, and conflict resolution are the NEXT increment and are
deliberately NOT built here.
"""

import time

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

    async def verify(self) -> dict:
        """Lightweight, read-only credential check: GET /organizations (built
        from api_domain with NO organization_id param — that id is not yet known
        at connect and injecting it would break the call, spec §4.1).

        Raises httpx.HTTPStatusError / ZohoAuthError on bad or absent creds so
        the caller reports an honest failure. Never creates/modifies anything.
        """
        token = await self._ensure_token()
        url = f"{books_base(self._api_domain)}/organizations"
        close = self._http is None
        http = self._http or httpx.AsyncClient(timeout=_HTTP_TIMEOUT)
        try:
            r = await http.get(url, headers=self._auth_headers(token))
            r.raise_for_status()
            body = r.json() or {}
            orgs = body.get("organizations", []) or []
            return {
                "ok": True,
                "organizations": [
                    {"organization_id": o.get("organization_id"), "name": o.get("name")}
                    for o in orgs
                ],
            }
        finally:
            if close:
                await http.aclose()
