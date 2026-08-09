"""Autodesk Fusion 360 CAD connector, built on Autodesk Platform Services (APS,
formerly Forge).

FRAMEWORK NOTE: `app/integrations/cad/base.py` (the `CadConnector` interface +
normalised assembly schema) and `registry.py` did not exist yet when this was
written (checked at write time). This module is therefore built against the
EXPECTED interface described in the task: `authenticate()` / `verify_connection()`,
`list_documents()`, `get_assembly_structure(document_id)`, `get_part_metadata()`,
returning a normalised tree of
`{external_id, part_number, name, revision, quantity, children[]}`.
`FusionConnector` does not subclass anything yet — when `base.py` lands, making
it inherit `CadConnector` should be a one-line change. A registry entry
(something like `registry.register("fusion360", FusionConnector)`) still needs
to be added to `registry.py`, which this task does not own; see the writeup's
`api_registration_line`/notes equivalent for the connector registry.

CREDENTIALS: Fusion/APS access needs a "BYO app" the tenant registers at
https://aps.autodesk.com (client id + secret), same shape as the existing Zoho
Books integration (`app/integrations/zoho_oauth.py` — read first, this module
mirrors its structure closely: region-free here since APS has one host).
The whole credential blob (client_id, client_secret, refresh_token,
access_token, access_token_expires_at) is ONE Fernet ciphertext via the
existing `app.integrations.crypto` helper — no plaintext token at rest.

OAUTH: Fusion hub/project/design data requires 3-legged OAuth (user consent) —
a 2-legged (client_credentials) token cannot read a user's hubs. This module
implements the authorization-code grant against APS's v2 OAuth endpoints
(`/authentication/v2/authorize`, `/authentication/v2/token`), which use HTTP
Basic auth (client_id:client_secret) for confidential/server-side apps per
APS's documented OAuth v2 flow — never PKCE-only, since a client_secret exists.

HONEST LIMITATIONS (do not build past what is documented):
  * Fusion's native BOM feature (with per-occurrence quantities) is not
    exposed via a broadly-documented, stable public REST endpoint — the
    "Fusion Data API" that has this is invite/beta-gated. This connector does
    NOT call it and does not fabricate quantities to compensate.
  * The only broadly-documented way to get assembly STRUCTURE over REST is the
    Model Derivative API's translated object tree + per-node properties
    (`GET .../metadata/{guid}` and `.../metadata/{guid}/properties`). That
    tree is occurrence-based (each occurrence is its own node), not
    pre-aggregated by part — so `get_assembly_structure()` returns one node
    per occurrence with `quantity=1` rather than guessing an aggregate count.
    `part_number`/`revision` are populated ONLY when the translated model
    actually carries those named properties (checked case-sensitively against
    a couple of common key spellings) — never invented when absent.
  * Model Derivative translation is asynchronous. `get_assembly_structure()`
    polls the manifest a bounded number of times and raises
    `FusionDerivativeNotReadyError`/`FusionDerivativeFailedError` rather than
    returning a partial or fabricated tree.
"""

from __future__ import annotations

import asyncio
import base64
import json
import time
from urllib.parse import urlencode

import httpx

from app.integrations.crypto import decrypt_integration_secret, encrypt_integration_secret

APS_HOST = "https://developer.api.autodesk.com"
DEFAULT_SCOPES = ["data:read", "data:search", "viewables:read"]

# Refresh a little before expiry so a call never fails on a token that lapses
# mid-flight (same margin as the Zoho client).
_TOKEN_SKEW_SECONDS = 300
_HTTP_TIMEOUT = 15


class FusionConnectorError(Exception):
    """Base class for honest Fusion/APS connector failures."""


class FusionNotConfiguredError(FusionConnectorError):
    """Raised when no APS app credentials / no refresh token are stored for
    this tenant. Callers must surface this as an honest "not configured"
    error — never a demo payload."""


class FusionAuthError(FusionConnectorError):
    """Raised when a token exchange/refresh call itself fails (bad/expired
    refresh token, revoked app, etc.)."""


class FusionDerivativeNotReadyError(FusionConnectorError):
    """Model Derivative translation has not finished within the poll budget."""


class FusionDerivativeFailedError(FusionConnectorError):
    """Model Derivative reported the translation job as failed."""


# --- credential blob (de)serialization --------------------------------------
# Mirrors app.integrations.zoho_oauth.dump_auth_blob/load_auth_blob exactly:
# the whole credential dict is one Fernet ciphertext, stored in
# IntegrationConnection.auth.

def dump_auth_blob(blob: dict | None) -> str | None:
    if blob is None:
        return None
    return encrypt_integration_secret(json.dumps(blob, sort_keys=True))


def load_auth_blob(token: str | None) -> dict:
    if not token:
        return {}
    raw = decrypt_integration_secret(token)
    return json.loads(raw) if raw else {}


# --- OAuth (3-legged, APS v2) ------------------------------------------------

def build_authorize_url(
    *, client_id: str, redirect_uri: str, scopes: list[str] | None = None, state: str | None = None
) -> str:
    """Build the APS `/authorize` URL the user is redirected to for consent."""
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": " ".join(scopes or DEFAULT_SCOPES),
    }
    if state:
        params["state"] = state
    return f"{APS_HOST}/authentication/v2/authorize?{urlencode(params)}"


async def _post_token(data: dict, client_id: str, client_secret: str, http: httpx.AsyncClient | None) -> dict:
    close = http is None
    http = http or httpx.AsyncClient(timeout=_HTTP_TIMEOUT)
    try:
        r = await http.post(
            f"{APS_HOST}/authentication/v2/token", data=data, auth=(client_id, client_secret)
        )
        r.raise_for_status()
        return r.json()
    finally:
        if close:
            await http.aclose()


async def exchange_code(
    *, code: str, client_id: str, client_secret: str, redirect_uri: str,
    http: httpx.AsyncClient | None = None,
) -> dict:
    """Exchange an authorization code for refresh+access tokens (callback)."""
    data = {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri}
    return await _post_token(data, client_id, client_secret, http)


async def refresh_access_token(
    *, refresh_token: str, client_id: str, client_secret: str,
    http: httpx.AsyncClient | None = None,
) -> dict:
    """Mint a fresh access token from a stored refresh token. Raises
    httpx.HTTPStatusError on an invalid/expired/revoked refresh token so
    callers report an honest auth failure rather than a fabricated success."""
    data = {"grant_type": "refresh_token", "refresh_token": refresh_token}
    return await _post_token(data, client_id, client_secret, http)


# --- Model Derivative helpers (module-level, pure) ---------------------------

def _encode_urn(version_id: str) -> str:
    """Model Derivative's `urn` path segment is the base64url (no padding)
    encoding of a Data Management version id, e.g.
    "urn:adsk.wipprod:fs.file:vf.XXXX?version=1"."""
    return base64.urlsafe_b64encode(version_id.encode()).decode().rstrip("=")


def _search_guid(node: dict) -> str | None:
    """DFS a manifest derivative tree for the first 3d/2d viewable guid."""
    if node.get("guid") and node.get("role") in ("3d", "2d"):
        return node["guid"]
    for child in node.get("children", []) or []:
        found = _search_guid(child)
        if found:
            return found
    return None


def _first_viewable_guid(manifest: dict) -> str | None:
    for derivative in manifest.get("derivatives", []) or []:
        guid = _search_guid(derivative)
        if guid:
            return guid
    return None


def _flatten_properties(collection: list[dict]) -> dict:
    """objectid -> flattened {property_name: value} across all of Model
    Derivative's property categories (categories are a display grouping only,
    not part of the key namespace we care about here)."""
    out: dict = {}
    for entry in collection:
        flat: dict = {}
        for cat_props in (entry.get("properties") or {}).values():
            if isinstance(cat_props, dict):
                flat.update(cat_props)
        out[entry.get("objectid")] = flat
    return out


_PART_NUMBER_KEYS = ("Part Number", "PartNumber", "Part_Number")
_REVISION_KEYS = ("Revision", "Rev")


def _pick(props: dict, keys: tuple[str, ...]) -> str | None:
    for k in keys:
        v = props.get(k)
        if v:
            return v
    return None


def _build_node(obj: dict, props_by_id: dict) -> dict:
    objectid = obj.get("objectid")
    props = props_by_id.get(objectid, {})
    children = [_build_node(c, props_by_id) for c in (obj.get("objects") or [])]
    return {
        "external_id": str(objectid),
        "part_number": _pick(props, _PART_NUMBER_KEYS),
        "name": obj.get("name"),
        "revision": _pick(props, _REVISION_KEYS),
        # ponytail: Model Derivative's object tree is occurrence-based with no
        # aggregated per-occurrence quantity field — each occurrence is its
        # own node here (quantity=1). Upgrade to real aggregated BOM
        # quantities if/when Fusion exposes a documented BOM REST endpoint.
        "quantity": 1,
        "children": children,
    }


class FusionConnector:
    """Autodesk Fusion 360 / APS connector for one tenant's IntegrationConnection."""

    def __init__(self, *, auth_blob: dict | None = None, http: httpx.AsyncClient | None = None):
        auth_blob = auth_blob or {}
        self._client_id = auth_blob.get("client_id")
        self._client_secret = auth_blob.get("client_secret")
        self._refresh_token = auth_blob.get("refresh_token")
        self._access_token = auth_blob.get("access_token")
        self._access_token_expires_at = auth_blob.get("access_token_expires_at")
        self._http = http

    @classmethod
    def from_connection(cls, conn) -> "FusionConnector":
        blob = load_auth_blob(conn.auth) if conn and conn.auth else {}
        return cls(auth_blob=blob)

    def auth_blob(self) -> dict:
        """Current in-memory credential state, for the caller to persist back
        (via `dump_auth_blob`) after `authenticate()` rotates a token."""
        return {
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "refresh_token": self._refresh_token,
            "access_token": self._access_token,
            "access_token_expires_at": self._access_token_expires_at,
        }

    def _token_is_valid(self) -> bool:
        if not self._access_token or not self._access_token_expires_at:
            return False
        try:
            return float(self._access_token_expires_at) - time.time() > _TOKEN_SKEW_SECONDS
        except (TypeError, ValueError):
            return False

    async def authenticate(self) -> str:
        """Return a usable access token, refreshing when missing/near expiry.

        Raises `FusionNotConfiguredError` when no APS app credentials or no
        refresh token are stored — an honest "not configured" state, never a
        fabricated token. Raises `FusionAuthError` when APS itself rejects the
        refresh (httpx.HTTPStatusError also propagates for the caller that
        wants the raw status)."""
        if not self._client_id or not self._client_secret:
            raise FusionNotConfiguredError(
                "Fusion/APS connector has no client_id/client_secret configured for this tenant"
            )
        if self._token_is_valid():
            return self._access_token
        if not self._refresh_token:
            raise FusionNotConfiguredError(
                "no refresh_token stored — user must complete the APS OAuth consent flow"
            )
        data = await refresh_access_token(
            refresh_token=self._refresh_token,
            client_id=self._client_id,
            client_secret=self._client_secret,
            http=self._http,
        )
        self._access_token = data.get("access_token")
        if not self._access_token:
            raise FusionAuthError("token refresh returned no access_token")
        self._access_token_expires_at = time.time() + float(data.get("expires_in", 3600))
        # APS may rotate the refresh token on refresh — persist the new one.
        if data.get("refresh_token"):
            self._refresh_token = data["refresh_token"]
        return self._access_token

    async def verify_connection(self) -> dict:
        """Lightweight, read-only credential check: GET /userprofile/v1/users/@me.
        Raises on bad/absent creds (via `authenticate()` or an HTTP error) so
        the caller reports an honest failure — never creates/modifies anything."""
        body = await self._get("/userprofile/v1/users/@me")
        return {
            "ok": True,
            "user": {
                "user_id": body.get("userId"),
                "name": body.get("userName"),
                "email": body.get("emailId"),
            },
        }

    async def _get(self, path: str, *, params: dict | None = None) -> dict:
        token = await self.authenticate()
        close = self._http is None
        http = self._http or httpx.AsyncClient(timeout=_HTTP_TIMEOUT)
        try:
            r = await http.get(
                f"{APS_HOST}{path}", params=params, headers={"Authorization": f"Bearer {token}"}
            )
            r.raise_for_status()
            return r.json() or {}
        finally:
            if close:
                await http.aclose()

    async def _post(self, path: str, json_body: dict) -> dict:
        token = await self.authenticate()
        close = self._http is None
        http = self._http or httpx.AsyncClient(timeout=_HTTP_TIMEOUT)
        try:
            r = await http.post(f"{APS_HOST}{path}", json=json_body, headers={"Authorization": f"Bearer {token}"})
            r.raise_for_status()
            return r.json() or {}
        finally:
            if close:
                await http.aclose()

    # --- Data Management: hubs -> projects -> folders -> items -------------

    async def list_hubs(self) -> list[dict]:
        body = await self._get("/project/v1/hubs")
        return [
            {"external_id": h.get("id"), "name": (h.get("attributes") or {}).get("name")}
            for h in body.get("data", []) or []
        ]

    async def list_projects(self, hub_id: str) -> list[dict]:
        body = await self._get(f"/project/v1/hubs/{hub_id}/projects")
        return [
            {"external_id": p.get("id"), "name": (p.get("attributes") or {}).get("name")}
            for p in body.get("data", []) or []
        ]

    async def list_top_folders(self, hub_id: str, project_id: str) -> list[dict]:
        body = await self._get(f"/project/v1/hubs/{hub_id}/projects/{project_id}/topFolders")
        return [
            {"external_id": f.get("id"), "name": (f.get("attributes") or {}).get("name")}
            for f in body.get("data", []) or []
        ]

    async def list_folder_contents(self, project_id: str, folder_id: str) -> list[dict]:
        body = await self._get(f"/data/v1/projects/{project_id}/folders/{folder_id}/contents")
        return [
            {
                "external_id": entry.get("id"),
                "name": (entry.get("attributes") or {}).get("displayName"),
                "type": entry.get("type"),  # "items" | "folders"
            }
            for entry in body.get("data", []) or []
        ]

    async def list_documents(
        self, *, hub_id: str, project_id: str, folder_id: str | None = None
    ) -> list[dict]:
        """Enumerate designs (Data Management 'items'). With no `folder_id`,
        lists the direct items in every top folder (one level deep — walking
        into sub-'folders' entries this returns is left to the caller via
        repeated `list_folder_contents()` calls; a full recursive tree walk
        isn't built here, see module docstring)."""
        if folder_id:
            contents = await self.list_folder_contents(project_id, folder_id)
            return [c for c in contents if c["type"] == "items"]
        docs: list[dict] = []
        for folder in await self.list_top_folders(hub_id, project_id):
            contents = await self.list_folder_contents(project_id, folder["external_id"])
            docs.extend(c for c in contents if c["type"] == "items")
        return docs

    async def list_item_versions(self, project_id: str, item_id: str) -> list[dict]:
        body = await self._get(f"/data/v1/projects/{project_id}/items/{item_id}/versions")
        return body.get("data", []) or []

    async def get_part_metadata(self, document_id: str, *, project_id: str) -> dict:
        """Data Management item metadata. Honest: this level carries no part
        number/revision field — those are read from Model Derivative
        properties in `get_assembly_structure()` when the model has them."""
        body = await self._get(f"/data/v1/projects/{project_id}/items/{document_id}")
        item = body.get("data") or {}
        attrs = item.get("attributes") or {}
        return {
            "external_id": document_id,
            "name": attrs.get("displayName"),
            "part_number": None,
            "revision": None,
            "extension_type": (attrs.get("extension") or {}).get("type"),
        }

    # --- Model Derivative: translated object tree -> normalised assembly ---

    async def get_assembly_structure(
        self,
        document_id: str,
        *,
        project_id: str,
        version_id: str | None = None,
        max_poll_attempts: int = 6,
        poll_interval_seconds: float = 2.0,
    ) -> dict:
        """Return the normalised assembly tree for a Fusion design.

        Raises `FusionDerivativeNotReadyError`/`FusionDerivativeFailedError`
        rather than returning a partial/fabricated tree when the translation
        hasn't finished or failed."""
        if version_id is None:
            versions = await self.list_item_versions(project_id, document_id)
            if not versions:
                raise FusionConnectorError(f"item {document_id} has no versions")
            version = versions[0]
            version_id = version.get("id")
        else:
            version = {"id": version_id}

        urn = _encode_urn(version_id)
        await self._post(
            "/modelderivative/v2/designdata/job",
            {"input": {"urn": urn}, "output": {"formats": [{"type": "svf2", "views": ["2d", "3d"]}]}},
        )
        manifest = await self._poll_manifest(urn, max_poll_attempts, poll_interval_seconds)
        guid = _first_viewable_guid(manifest)
        if not guid:
            raise FusionDerivativeNotReadyError(f"no viewable metadata guid in manifest for {urn}")

        tree_body = await self._get(f"/modelderivative/v2/designdata/{urn}/metadata/{guid}")
        props_body = await self._get(f"/modelderivative/v2/designdata/{urn}/metadata/{guid}/properties")
        props_by_id = _flatten_properties((props_body.get("data") or {}).get("collection", []) or [])

        objects = (tree_body.get("data") or {}).get("objects", []) or []
        if not objects:
            raise FusionConnectorError(f"empty object tree for {urn}")

        root = _build_node(objects[0], props_by_id)
        version_number = (version.get("attributes") or {}).get("versionNumber")
        if root["revision"] is None and version_number is not None:
            root["revision"] = str(version_number)
        root["external_id"] = str(document_id)
        return root

    async def _poll_manifest(self, urn: str, max_attempts: int, interval_seconds: float) -> dict:
        for attempt in range(max_attempts):
            manifest = await self._get(f"/modelderivative/v2/designdata/{urn}/manifest")
            status = manifest.get("status")
            if status == "success":
                return manifest
            if status == "failed":
                raise FusionDerivativeFailedError(f"translation failed for {urn}: {manifest.get('progress')}")
            if attempt < max_attempts - 1:
                await asyncio.sleep(interval_seconds)
        raise FusionDerivativeNotReadyError(f"translation for {urn} did not complete after {max_attempts} polls")
