"""Zoho Books OAuth 2.0 helpers (FOUNDATION increment).

Holds the per-data-center (region) URL table, the OAuth token
exchange/refresh/revoke calls against the region-specific accounts host, and
(de)serialization of the encrypted credential blob stored in
`IntegrationConnection.auth` (spec §2 / §5).

NOTE: only the pieces the foundation needs are wired up here — the region map,
token refresh (used by `ZohoBooksClient`/test-connection), and blob helpers.
`exchange_code`/`revoke_refresh_token` are thin helpers for the OAuth
start/callback/select-org endpoints that land in the NEXT increment; the sync
engine and conflict resolution are explicitly NOT built here.
"""

import json

import httpx

from app.integrations.crypto import (
    decrypt_integration_secret,
    encrypt_integration_secret,
)

# region -> {accounts host, api base}. The api base always gets `/books/v3`
# appended (see `books_base`). This table is the DEFAULT/fallback only: the
# real `api_domain`/`location` returned in the token response is persisted on
# the connection and preferred at call time (spec §5 — never hardcode).
ZOHO_DC: dict[str, dict[str, str]] = {
    "us": {"accounts": "https://accounts.zoho.com",     "api": "https://www.zohoapis.com"},
    "eu": {"accounts": "https://accounts.zoho.eu",      "api": "https://www.zohoapis.eu"},
    "in": {"accounts": "https://accounts.zoho.in",      "api": "https://www.zohoapis.in"},
    "au": {"accounts": "https://accounts.zoho.com.au",  "api": "https://www.zohoapis.com.au"},
    "jp": {"accounts": "https://accounts.zoho.jp",      "api": "https://www.zohoapis.jp"},
    "ca": {"accounts": "https://accounts.zohocloud.ca", "api": "https://www.zohoapis.ca"},
    "sa": {"accounts": "https://accounts.zoho.sa",      "api": "https://www.zohoapis.sa"},
    # cn is spec-listed (§2 enum) though not required by the foundation task list.
    "cn": {"accounts": "https://accounts.zoho.com.cn",  "api": "https://www.zohoapis.com.cn"},
}
DEFAULT_REGION = "us"

_OAUTH_TIMEOUT = 15


def _dc(region: str | None) -> dict[str, str]:
    return ZOHO_DC.get((region or DEFAULT_REGION).lower(), ZOHO_DC[DEFAULT_REGION])


def accounts_host(region: str | None) -> str:
    """Region-specific OAuth accounts host (token/revoke live here)."""
    return _dc(region)["accounts"]


def api_domain_for_region(region: str | None) -> str:
    """Region-specific API domain (fallback when the connection has no
    persisted `api_domain` from the token response)."""
    return _dc(region)["api"]


def books_base(api_domain: str) -> str:
    """Books v3 API base for an api_domain, e.g. https://www.zohoapis.com/books/v3."""
    return f"{api_domain.rstrip('/')}/books/v3"


# --- credential blob (de)serialization -------------------------------------
# The whole {refresh_token, client_id, client_secret, access_token,
# access_token_expires_at} dict is ONE Fernet ciphertext — no plaintext token
# at rest, and `auth` is never serialized back to clients (IntegrationConnection
# ._public() already redacts it).

def dump_auth_blob(blob: dict | None) -> str | None:
    if blob is None:
        return None
    return encrypt_integration_secret(json.dumps(blob, sort_keys=True))


def load_auth_blob(token: str | None) -> dict:
    if not token:
        return {}
    raw = decrypt_integration_secret(token)
    return json.loads(raw) if raw else {}


# --- OAuth token calls ------------------------------------------------------

async def refresh_access_token(
    *,
    refresh_token: str,
    client_id: str,
    client_secret: str,
    region: str | None = None,
    host: str | None = None,
    http: httpx.AsyncClient | None = None,
) -> dict:
    """Mint a fresh access token from the stored refresh token
    (grant_type=refresh_token) against the region-specific accounts host.

    Raises httpx.HTTPStatusError on an invalid/expired refresh token so callers
    (test-connection, the client) report an HONEST auth failure rather than a
    fabricated success.
    """
    host = host or accounts_host(region)
    data = {
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "refresh_token",
    }
    close = http is None
    http = http or httpx.AsyncClient(timeout=_OAUTH_TIMEOUT)
    try:
        r = await http.post(f"{host}/oauth/v2/token", data=data)
        r.raise_for_status()
        return r.json()  # {access_token, expires_in, api_domain?, token_type, ...}
    finally:
        if close:
            await http.aclose()


async def exchange_code(
    *,
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
    region: str | None = None,
    host: str | None = None,
    http: httpx.AsyncClient | None = None,
) -> dict:
    """Exchange an authorization code for refresh+access tokens (used by the
    OAuth callback in the next increment). Persist `api_domain`/`location` from
    the response, never hardcode (spec §5)."""
    host = host or accounts_host(region)
    data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    close = http is None
    http = http or httpx.AsyncClient(timeout=_OAUTH_TIMEOUT)
    try:
        r = await http.post(f"{host}/oauth/v2/token", data=data)
        r.raise_for_status()
        return r.json()
    finally:
        if close:
            await http.aclose()


async def revoke_refresh_token(
    *,
    refresh_token: str,
    region: str | None = None,
    host: str | None = None,
    http: httpx.AsyncClient | None = None,
) -> bool:
    """Revoke a refresh token (called before minting a new one on reconnect so
    the 20-tokens-per-user-per-client cap is not churned — spec §5)."""
    host = host or accounts_host(region)
    close = http is None
    http = http or httpx.AsyncClient(timeout=_OAUTH_TIMEOUT)
    try:
        r = await http.post(f"{host}/oauth/v2/token/revoke", params={"token": refresh_token})
        r.raise_for_status()
        return True
    finally:
        if close:
            await http.aclose()
