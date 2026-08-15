"""Altium ECAD connector: Altium 365 cloud API + Altium BOM file importer.

Altium BOMs are FLAT electronics component lists (reference designators,
footprints, manufacturer/supplier part numbers) -- not nested mechanical
assemblies like Fusion/Onshape/SolidWorks. The normalised tree below is
therefore always one synthetic root (the project/file) with one level of
children (the grouped components); there is no deeper nesting to represent.

Framework status: `app/integrations/cad/base.py` (the shared connector
interface another workstream is building) did NOT exist in this tree at the
time this file was written -- `AltiumCloudConnector` / `AltiumFileConnector`
below are therefore plain classes, NOT subclasses of a base ABC. They expose
the method names the task described the interface as having:
`authenticate()` / `verify_connection()`, `list_documents()`,
`get_assembly_structure(document_id)`, `get_part_metadata(...)`, each
returning/consuming `{external_id, part_number, name, revision, quantity,
children[]}` nodes. When base.py lands, wire these in by inheriting it (or
adapting method signatures) -- nothing here otherwise depends on it.
Registry wiring (`registry.py` / `cad_connectors.py`) was explicitly out of
scope for this change; see the writeup for the suggested registry entry.

Cloud path (`AltiumCloudConnector`) implements what the public Altium
Developer Center docs confidently document:
  - GraphQL endpoint `https://{workspace_domain}/api/graphql`,
    `Authorization: Bearer {access_token}`.
  - Refresh-token exchange: `POST https://auth.altium.com/connect/token`
    (`grant_type=refresh_token`, form-urlencoded) -- a standard OAuth2
    refresh grant.
  - Listing workspace projects via the documented `desProjects(first, after)`
    query.
It does NOT confidently know the exact GraphQL field names for a project's
BOM/component tree -- the docs describe that such data exists ("BOMs,
components... in a single request") but never publish the literal schema.
`get_assembly_structure` ships a best-effort default query
(`_DEFAULT_BOM_QUERY`) inferred from partner support articles; treat its
output as UNCONFIRMED until validated against a real workspace's Voyager/
Nitro schema browser (Admin -> Developer), or pass `bom_query=` to override
it once you have.

File path (`AltiumFileConnector` / `parse_altium_bom_csv` /
`parse_altium_bom_xlsx`) needs NO credentials and is fully proven by the
tests in this change: it parses a standard Altium BOM export, tolerates the
common header variants, and groups rows by manufacturer part number so R1/
R2/R5 collapse into one component with quantity 3 and a preserved designator
list (the ECAD point of this whole connector).
"""

import csv
import io
import re
import time

import httpx
import openpyxl

# --------------------------------------------------------------------------
# Shared errors
# --------------------------------------------------------------------------


class AltiumParseError(ValueError):
    """Raised when a file does not look like a recognizable Altium BOM
    export, or can't be parsed at all. Never silently returns a partial/fake
    BOM."""


class AltiumAuthError(Exception):
    """Raised when no usable Altium 365 credential is configured (no access
    token, and no refresh_token+client_id+client_secret to exchange one).
    Surfaced honestly to the caller -- never a fake success."""


class AltiumAPIError(Exception):
    """Raised on a GraphQL-level error (top-level `errors` array) or a
    component/project lookup that comes back empty."""


# --------------------------------------------------------------------------
# Column mapping (file path) -- tolerant of the common Altium header variants
# --------------------------------------------------------------------------

# canonical field -> set of normalised header aliases (normalisation strips
# everything but lowercase letters/digits, so "Mfr. Part #", "MFR PART NO",
# and "mfrpartnumber" all reduce to comparable keys below).
_ALIASES: dict[str, set[str]] = {
    "designator": {
        "designator", "designators", "ref", "refdes",
        "referencedesignator", "referencedesignators",
    },
    "comment_value": {
        "comment", "value", "commentvalue", "partname", "comment/value".replace("/", ""),
    },
    "footprint": {"footprint", "pattern", "package"},
    "description": {"description", "desc"},
    "quantity": {"quantity", "qty", "count"},
    "manufacturer": {"manufacturer", "mfr", "mfg", "manufacturername"},
    "manufacturer_part_number": {
        "manufacturerpartnumber", "manufacturerpartno", "mfrpartnumber",
        "mfrpartno", "mfrpart", "mpn",
    },
    "supplier": {"supplier", "vendor", "distributor"},
    "supplier_part_number": {
        "supplierpartnumber", "supplierpartno", "vendorpartnumber", "vendorpartno",
        "distributorpartnumber", "distributorpartno", "spn",
    },
}

# A row needs at least one of these mapped or the file isn't an Altium BOM.
_IDENTITY_FIELDS = {"designator", "comment_value", "manufacturer_part_number"}

_HEADER_NORM_RE = re.compile(r"[^a-z0-9]")
_DESIGNATOR_SPLIT_RE = re.compile(r"[,;\s]+")


def _norm_header(h: str) -> str:
    return _HEADER_NORM_RE.sub("", (h or "").lower())


def _map_headers(headers: list[str]) -> dict[str, str]:
    """actual header string -> canonical field name (best single match)."""
    mapping = {}
    for h in headers:
        key = _norm_header(h)
        for canon, aliases in _ALIASES.items():
            if key in aliases:
                mapping[h] = canon
                break
    return mapping


def _split_designators(raw) -> list[str]:
    if not raw:
        return []
    return [d for d in _DESIGNATOR_SPLIT_RE.split(str(raw).strip()) if d]


def _to_int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _group_rows(rows: list[dict]) -> list[dict]:
    """Group canonical rows into normalised component nodes.

    Same manufacturer part number (case/space-insensitive) collapses into ONE
    node whose quantity sums across rows and whose designator list is the
    union in encounter order -- this is what makes R1/R2/R5 read as one part
    instead of three, which is the entire point of this connector.

    Rows with no MPN fall back to grouping by (comment_value, footprint,
    description) -- a best-effort heuristic for generic passives placed
    without a manufacturer part number.
    # ponytail: heuristic fallback grouping key -- two genuinely distinct
    # unlabeled parts sharing comment+footprint+description would incorrectly
    # merge. Revisit with a per-row synthetic key (no grouping) if a customer
    # hits this; not built now because a real Altium export almost always
    # carries an MPN for anything that isn't a generic passive.
    """
    groups: dict[tuple, dict] = {}
    order: list[tuple] = []
    for row in rows:
        mpn = (row.get("manufacturer_part_number") or "").strip()
        if mpn:
            key = ("mpn", mpn.upper())
        else:
            key = (
                "fallback",
                (row.get("comment_value") or "").strip().lower(),
                (row.get("footprint") or "").strip().lower(),
                (row.get("description") or "").strip().lower(),
            )
        designators = _split_designators(row.get("designator"))
        qty_raw = _to_int(row.get("quantity"))
        qty = qty_raw if qty_raw is not None else max(len(designators), 1)

        node = groups.get(key)
        if node is None:
            node = {
                "external_id": mpn or f"altium-row-{len(order) + 1}",
                "part_number": mpn or None,
                "name": row.get("comment_value") or row.get("description") or mpn or "Unnamed part",
                "revision": None,
                "quantity": 0,
                "children": [],
                "designators": [],
                "footprint": row.get("footprint") or "",
                "description": row.get("description") or "",
                "manufacturer": row.get("manufacturer") or "",
                "supplier": row.get("supplier") or "",
                "supplier_part_number": row.get("supplier_part_number") or "",
            }
            groups[key] = node
            order.append(key)
        node["quantity"] += qty
        for d in designators:
            if d not in node["designators"]:
                node["designators"].append(d)
    return [groups[k] for k in order]


def _canonicalize_rows(headers: list[str], dict_rows: list[dict]) -> list[dict]:
    header_map = _map_headers(headers)
    if not (_IDENTITY_FIELDS & set(header_map.values())):
        raise AltiumParseError(
            "file does not look like an Altium BOM export -- no recognizable "
            "Designator / Comment(Value) / Manufacturer Part Number column found"
        )
    canon_rows = []
    for row in dict_rows:
        canon = {}
        for h, v in row.items():
            field = header_map.get(h)
            if field:
                canon[field] = v
        canon_rows.append(canon)
    return canon_rows


def _rows_from_csv(content: bytes) -> tuple[list[str], list[dict]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise AltiumParseError(f"could not decode file as text/CSV: {e}") from e
    rows = [r for r in csv.reader(io.StringIO(text)) if any(c.strip() for c in r)]
    if not rows:
        raise AltiumParseError("empty CSV file")
    headers = rows[0]
    # strict=False deliberately: a ragged row (trailing empty cells dropped by
    # the exporter, or an extra column) is ordinary in real Altium CSV output,
    # and truncating to the shorter of the two is the tolerant behaviour an
    # importer wants. strict=True would abort the whole file over one row.
    dict_rows = [dict(zip(headers, r, strict=False)) for r in rows[1:]]
    return headers, dict_rows


def _rows_from_xlsx(content: bytes) -> tuple[list[str], list[dict]]:
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as e:
        raise AltiumParseError(f"could not read XLSX file: {e}") from e
    ws = wb.worksheets[0]
    rows_iter = ws.iter_rows(values_only=True)
    header_row = next(rows_iter, None)
    if header_row is None:
        raise AltiumParseError("empty XLSX sheet")
    headers = [str(h).strip() if h is not None else f"col{i}" for i, h in enumerate(header_row)]
    dict_rows = []
    for raw in rows_iter:
        if raw is None or all(v is None for v in raw):
            continue  # openpyxl often over-reports sheet dimensions
        dict_rows.append({headers[i]: raw[i] for i in range(len(headers)) if i < len(raw)})
    return headers, dict_rows


def _build_document(canon_rows: list[dict], source_name: str) -> dict:
    return {
        "external_id": source_name,
        "part_number": None,
        "name": source_name,
        "revision": None,
        "quantity": 1,
        "children": _group_rows(canon_rows),
    }


def parse_altium_bom_csv(content: bytes, *, source_name: str = "altium-bom.csv") -> dict:
    """Parse an Altium BOM CSV export into the normalised tree. Raises
    AltiumParseError on an empty/undecodable/unrecognizable file -- never
    returns a fake or partial tree."""
    headers, dict_rows = _rows_from_csv(content)
    return _build_document(_canonicalize_rows(headers, dict_rows), source_name)


def parse_altium_bom_xlsx(content: bytes, *, source_name: str = "altium-bom.xlsx") -> dict:
    """Parse an Altium BOM XLSX export into the normalised tree. Raises
    AltiumParseError on an empty/unreadable/unrecognizable file."""
    headers, dict_rows = _rows_from_xlsx(content)
    return _build_document(_canonicalize_rows(headers, dict_rows), source_name)


class AltiumFileConnector:
    """File-path connector: an uploaded Altium BOM export (CSV/XLSX).

    Needs NO credentials -- this is the path every Altium customer can use
    day one. Method names mirror the cloud connector / the expected
    `app.integrations.cad.base` interface (see module docstring) so a
    registry could treat both connectors uniformly.
    """

    def __init__(self, content: bytes, filename: str):
        self._filename = filename
        lower = filename.lower()
        if lower.endswith(".xlsx"):
            self._document = parse_altium_bom_xlsx(content, source_name=filename)
        elif lower.endswith(".csv"):
            self._document = parse_altium_bom_csv(content, source_name=filename)
        else:
            raise AltiumParseError(f"unsupported file extension for Altium BOM import: {filename}")

    async def authenticate(self) -> bool:
        return True  # no credentials involved in a local file import

    async def verify_connection(self) -> bool:
        return True

    async def list_documents(self) -> list[dict]:
        return [{"external_id": self._document["external_id"], "name": self._document["name"]}]

    async def get_assembly_structure(self, document_id: str | None = None) -> dict:
        return self._document

    async def get_part_metadata(self, external_id: str) -> dict:
        for child in self._document["children"]:
            if child["external_id"] == external_id:
                return child
        raise AltiumAPIError(f"component {external_id!r} not found in this BOM")


# --------------------------------------------------------------------------
# Cloud path -- Altium 365 Workspace GraphQL API
# --------------------------------------------------------------------------

_HTTP_TIMEOUT = 20
_TOKEN_SKEW_SECONDS = 60

# UNCONFIRMED: inferred field-name shape (see module docstring). Override via
# AltiumCloudConnector(..., bom_query=...) once validated against a real
# workspace schema.
_DEFAULT_BOM_QUERY = """
query($id: ID!) {
  desProjectById(id: $id) {
    id
    name
    bom {
      items {
        id
        designator
        comment
        footprint
        description
        quantity
        manufacturer
        manufacturerPartNumber
        supplier
        supplierPartNumber
      }
    }
  }
}
"""


def _normalize_cloud_bom(project: dict, document_id: str) -> dict:
    items = ((project or {}).get("bom") or {}).get("items") or []
    rows = [
        {
            "designator": it.get("designator") or "",
            "comment_value": it.get("comment") or "",
            "footprint": it.get("footprint") or "",
            "description": it.get("description") or "",
            "quantity": it.get("quantity"),
            "manufacturer": it.get("manufacturer") or "",
            "manufacturer_part_number": it.get("manufacturerPartNumber") or "",
            "supplier": it.get("supplier") or "",
            "supplier_part_number": it.get("supplierPartNumber") or "",
        }
        for it in items
    ]
    return {
        "external_id": (project or {}).get("id") or document_id,
        "part_number": None,
        "name": (project or {}).get("name") or document_id,
        "revision": None,
        "quantity": 1,
        "children": _group_rows(rows),
    }


class AltiumCloudConnector:
    """Altium 365 Workspace GraphQL API client (cloud path). See module
    docstring for exactly what is/isn't confidently implemented."""

    GRAPHQL_PATH = "/api/graphql"
    TOKEN_URL = "https://auth.altium.com/connect/token"

    def __init__(
        self,
        *,
        workspace_domain: str,
        access_token: str | None = None,
        access_token_expires_at: float | None = None,
        refresh_token: str | None = None,
        client_id: str | None = None,
        client_secret: str | None = None,
        http: httpx.AsyncClient | None = None,
        bom_query: str | None = None,
    ):
        if not workspace_domain:
            raise AltiumAuthError("workspace_domain is required to build the Altium 365 API base URL")
        self._workspace_domain = workspace_domain.strip().rstrip("/")
        self._access_token = access_token
        self._access_token_expires_at = access_token_expires_at
        self._refresh_token = refresh_token
        self._client_id = client_id
        self._client_secret = client_secret
        self._http = http
        self._bom_query = bom_query or _DEFAULT_BOM_QUERY

    @classmethod
    def from_credentials(cls, blob: dict, *, http: httpx.AsyncClient | None = None) -> "AltiumCloudConnector":
        """Build from an ALREADY-DECRYPTED credential blob -- the caller
        (registry/endpoint layer) is responsible for decrypting the stored
        connection first. This tree's actual convention for a whole-blob
        credential (as opposed to a single column) is
        app.integrations.crypto.decrypt_integration_secret, the same helper
        app.integrations.zoho_oauth.load_auth_blob uses for the Zoho
        connection -- prefer that over app.core.encryption's pgcrypto column
        helpers here, since there's no single DB column/session involved."""
        blob = blob or {}
        return cls(
            workspace_domain=blob.get("workspace_domain"),
            access_token=blob.get("access_token"),
            access_token_expires_at=blob.get("access_token_expires_at"),
            refresh_token=blob.get("refresh_token"),
            client_id=blob.get("client_id"),
            client_secret=blob.get("client_secret"),
            http=http,
        )

    def auth_blob(self) -> dict:
        """Current in-memory credential state, for the caller to persist back
        after `authenticate()` rotates a refresh_token (mirrors
        `fusion.FusionConnector.auth_blob`)."""
        return {
            "workspace_domain": self._workspace_domain,
            "access_token": self._access_token,
            "access_token_expires_at": self._access_token_expires_at,
            "refresh_token": self._refresh_token,
            "client_id": self._client_id,
            "client_secret": self._client_secret,
        }

    def _base_url(self) -> str:
        domain = self._workspace_domain
        if not domain.startswith("http"):
            domain = f"https://{domain}"
        return domain

    def _token_is_valid(self) -> bool:
        if not self._access_token or not self._access_token_expires_at:
            return False
        try:
            return float(self._access_token_expires_at) - time.time() > _TOKEN_SKEW_SECONDS
        except (TypeError, ValueError):
            return False

    async def authenticate(self) -> str:
        """Return a usable access token: the cached one if still valid, a
        refresh-token exchange (POST .../connect/token) if configured,
        otherwise the raw configured access token (a long-lived PAT with no
        tracked expiry). Raises AltiumAuthError when neither is available --
        never fabricates a token."""
        if self._token_is_valid():
            return self._access_token
        if not (self._refresh_token and self._client_id and self._client_secret):
            if self._access_token:
                return self._access_token
            raise AltiumAuthError(
                "no usable Altium 365 credential: need an access_token, or a "
                "refresh_token + client_id + client_secret to exchange one"
            )
        close = self._http is None
        http = self._http or httpx.AsyncClient(timeout=_HTTP_TIMEOUT)
        try:
            r = await http.post(
                self.TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": self._refresh_token,
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if r.status_code >= 400:
                raise AltiumAuthError(f"Altium 365 token refresh failed: {r.status_code} {r.text[:300]}")
            data = r.json()
        finally:
            if close:
                await http.aclose()
        token = data.get("access_token")
        if not token:
            raise AltiumAuthError("Altium 365 token refresh returned no access_token")
        self._access_token = token
        self._access_token_expires_at = time.time() + float(data.get("expires_in", 3600))
        if data.get("refresh_token"):
            self._refresh_token = data["refresh_token"]
        return token

    async def _graphql(self, query: str, variables: dict | None = None) -> dict:
        token = await self.authenticate()
        close = self._http is None
        http = self._http or httpx.AsyncClient(timeout=_HTTP_TIMEOUT)
        try:
            r = await http.post(
                f"{self._base_url()}{self.GRAPHQL_PATH}",
                json={"query": query, "variables": variables or {}},
                headers={"Authorization": f"Bearer {token}"},
            )
            r.raise_for_status()
            body = r.json() or {}
        finally:
            if close:
                await http.aclose()
        if body.get("errors"):
            raise AltiumAPIError(str(body["errors"]))
        return body.get("data") or {}

    async def verify_connection(self) -> dict:
        """Lightweight, read-only credential check using the documented
        `desProjects` example query. Raises on bad/absent credentials --
        never a fake success."""
        await self._graphql("query { desProjects(first: 1) { nodes { id } } }")
        return {"ok": True}

    async def list_documents(self, *, first: int = 50, after: str | None = None) -> list[dict]:
        """Enumerate workspace projects via the documented `desProjects`
        query (Quick Start Guide example)."""
        data = await self._graphql(
            """
            query($first: Int!, $after: String) {
              desProjects(first: $first, after: $after) {
                nodes { id name description }
                pageInfo { hasNextPage endCursor }
              }
            }
            """,
            {"first": first, "after": after},
        )
        nodes = ((data.get("desProjects") or {}).get("nodes")) or []
        return [
            {"external_id": n.get("id"), "name": n.get("name"), "description": n.get("description")}
            for n in nodes
        ]

    async def get_assembly_structure(self, document_id: str) -> dict:
        """Fetch + normalise a project's BOM. Uses the UNCONFIRMED default
        query shape unless `bom_query=` was supplied at construction (see
        module docstring)."""
        data = await self._graphql(self._bom_query, {"id": document_id})
        return _normalize_cloud_bom(data.get("desProjectById"), document_id)

    async def get_part_metadata(self, document_id: str, external_id: str) -> dict:
        tree = await self.get_assembly_structure(document_id)
        for child in tree.get("children", []):
            if child.get("external_id") == external_id:
                return child
        raise AltiumAPIError(f"component {external_id!r} not found in project {document_id!r}")
