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

The inbound poll, sync-state upserts, conflict resolution, and the rate-limit
token-bucket are the NEXT increment and are deliberately NOT built here.
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

# entity_type -> (module path segment, create/update record key, id field).
# The record key is the singular wrapper Books returns/accepts; the id field is
# the opaque Zoho id stored in IntegrationExternalLink.external_id.
ZOHO_MODULES: dict[str, dict[str, str]] = {
    "part": {"module": "items", "record": "item", "id_field": "item_id"},
    "vendor": {"module": "contacts", "record": "contact", "id_field": "contact_id"},
    "purchase_order": {
        "module": "purchaseorders",
        "record": "purchaseorder",
        "id_field": "purchaseorder_id",
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
        """
        token = await self._ensure_token()
        url = f"{books_base(self._api_domain)}{path}"
        q = dict(params or {})
        if with_org and self._organization_id:
            q["organization_id"] = self._organization_id
        close = self._http is None
        http = self._http or httpx.AsyncClient(timeout=_HTTP_TIMEOUT)
        try:
            r = await http.request(
                method, url, params=q or None, json=json, headers=self._auth_headers(token)
            )
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

    async def list_settings(self, kind: str) -> dict:
        """Per-org settings lookup (currencies|taxes|chartofaccounts) used to
        resolve opaque Books foreign keys on create (spec §4.1/§4.2). Read-only.
        """
        return await self._request("GET", f"/settings/{kind}")
