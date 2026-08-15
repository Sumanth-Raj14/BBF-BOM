"""Onshape CAD connector.

Auth: Onshape API keys (access key + secret key), authenticated with the
documented HTTP Basic scheme — `Authorization: Basic base64(accessKey:secretKey)`
(https://onshape-public.github.io/docs/auth/apikeys/). Onshape also documents a
higher-security HMAC request-signing scheme for the same keys; that is NOT
implemented here (noted below) since Basic auth is fully documented, simpler,
and sufficient for a server-to-server integration.

Endpoints used (Onshape REST API, default base `https://cad.onshape.com/api/v10`):
  - GET /documents                                    (list_documents, paginated via `next`)
  - GET /documents/{did}                               (resolve defaultWorkspace)
  - GET /documents/d/{did}/w/{wid}/elements             (find an ASSEMBLY element)
  - GET /assemblies/d/{did}/w/{wid}/e/{eid}             (getAssemblyDefinition)
  - GET /metadata/d/{did}/w/{wid}/e/{eid}/p/{pid}       (get_part_metadata)

`get_assembly_structure` builds the normalised tree from `getAssemblyDefinition`
(rootAssembly / subAssemblies / parts) rather than the separate `/bom` endpoint:
that endpoint's exact response shape (custom BOM-table headers/columns vary per
document template) could not be confirmed against Onshape's published docs, so
building on the guessed shape would risk silently misreading a real BOM. The
assembly-definition endpoint's structure is documented and is what's implemented
here. A true BOM-table pull (respecting BOM templates) is a reasonable follow-up
once it can be verified against a real Onshape workspace.
"""

from __future__ import annotations

import base64

import httpx

from app.integrations.cad.base import (
    CadAssembly,
    CadAuthError,
    CadConnector,
    CadConnectorError,
    CadDocumentRef,
    CadNode,
    CadNotFoundError,
    CadPartMetadata,
    CadRateLimitError,
)
from app.integrations.cad.registry import register

DEFAULT_BASE_URL = "https://cad.onshape.com/api/v10"
_HTTP_TIMEOUT = 20
# ponytail: hard cap on document-list pages fetched per call — guards against
# an unbounded loop if Onshape ever returns a `next` cursor that doesn't
# terminate. Raise if a tenant genuinely has more than ~1000 documents.
_MAX_LIST_PAGES = 50


@register
class OnshapeConnector(CadConnector):
    connector_type = "onshape"

    def __init__(self, credentials: dict, config: dict | None = None, http: httpx.AsyncClient | None = None):
        super().__init__(credentials, config)
        self._base_url = (self.config.get("base_url") or DEFAULT_BASE_URL).rstrip("/")
        self._http = http

    # -- auth -----------------------------------------------------------
    def _auth_header(self) -> str:
        access_key = self.credentials.get("access_key")
        secret_key = self.credentials.get("secret_key")
        if not access_key or not secret_key:
            raise CadAuthError("Onshape connection is missing access_key/secret_key")
        token = base64.b64encode(f"{access_key}:{secret_key}".encode()).decode()
        return f"Basic {token}"

    # -- transport --------------------------------------------------------
    async def _request(self, method: str, path: str, *, params: dict | None = None) -> dict:
        """One authenticated Onshape call. `path` may be a full URL (used to
        follow a `next` pagination link verbatim) or a path relative to the
        API base. Raises the honest `Cad*Error` subclasses on failure — never
        returns a fabricated body."""
        url = path if path.startswith("http") else f"{self._base_url}{path}"
        headers = {"Authorization": self._auth_header(), "Accept": "application/json"}
        close = self._http is None
        http = self._http or httpx.AsyncClient(timeout=_HTTP_TIMEOUT)
        try:
            try:
                r = await http.request(method, url, params=params, headers=headers)
            except httpx.RequestError as e:
                raise CadConnectorError(f"Onshape request failed: {e}") from e

            if r.status_code in (401, 403):
                raise CadAuthError(
                    f"Onshape rejected these credentials ({r.status_code}): {r.text[:300]}"
                )
            if r.status_code == 404:
                raise CadNotFoundError(f"Onshape resource not found: {url}")
            if r.status_code == 429:
                retry_after = r.headers.get("Retry-After")
                raise CadRateLimitError(
                    "Onshape rate limit exceeded (429)",
                    retry_after=float(retry_after) if retry_after else None,
                )
            if r.status_code >= 400:
                raise CadConnectorError(
                    f"Onshape API error {r.status_code}: {r.text[:300]}"
                )
            return r.json() or {}
        finally:
            if close:
                await http.aclose()

    # -- CadConnector interface -------------------------------------------
    async def verify_connection(self) -> dict:
        """Read-only credential check: list at most one document. Raises on
        bad/missing credentials rather than reporting a fake ok."""
        body = await self._request("GET", "/documents", params={"limit": 1, "offset": 0})
        return {"ok": True, "documentCount": body.get("totalCount")}

    async def list_documents(self) -> list[CadDocumentRef]:
        docs: list[CadDocumentRef] = []
        path, params = "/documents", {"limit": 20, "offset": 0}
        for _ in range(_MAX_LIST_PAGES):
            body = await self._request("GET", path, params=params)
            for item in body.get("items", []) or []:
                docs.append(
                    CadDocumentRef(
                        id=item.get("id"),
                        name=item.get("name"),
                        url=item.get("href"),
                        modified_at=item.get("modifiedAt"),
                        raw=item,
                    )
                )
            next_link = body.get("next")
            if not next_link:
                break
            path, params = next_link, None
        return docs

    async def _get_document(self, document_id: str) -> dict:
        return await self._request("GET", f"/documents/{document_id}")

    async def _find_assembly_element(self, document_id: str, workspace_id: str) -> dict:
        elements = await self._request(
            "GET", f"/documents/d/{document_id}/w/{workspace_id}/elements"
        )
        # The list endpoint returns a bare JSON array, not an {items: [...]} envelope.
        items = elements if isinstance(elements, list) else elements.get("items", [])
        for el in items:
            if el.get("elementType") == "ASSEMBLY":
                return el
        raise CadNotFoundError(f"No assembly element found in document {document_id}")

    async def get_assembly_structure(self, document_id: str) -> CadAssembly:
        doc = await self._get_document(document_id)
        workspace_id = (doc.get("defaultWorkspace") or {}).get("id")
        if not workspace_id:
            raise CadNotFoundError(f"Document {document_id} has no default workspace")
        element = await self._find_assembly_element(document_id, workspace_id)
        element_id = element["id"]

        definition = await self._request(
            "GET", f"/assemblies/d/{document_id}/w/{workspace_id}/e/{element_id}"
        )

        # Index sub-assemblies and parts by the key getAssemblyDefinition uses
        # to cross-reference instances -> their contents (documented shape).
        sub_by_key = {
            (sa.get("documentId"), sa.get("elementId"), sa.get("fullConfiguration")): sa
            for sa in definition.get("subAssemblies", []) or []
        }
        part_by_key = {
            (p.get("documentId"), p.get("elementId"), p.get("partId"), p.get("fullConfiguration")): p
            for p in definition.get("parts", []) or []
        }

        def _identity(inst: dict) -> tuple:
            return (
                inst.get("documentId"),
                inst.get("elementId"),
                inst.get("partId"),
                inst.get("fullConfiguration"),
            )

        def _build_children(instances: list[dict]) -> list[CadNode]:
            # Onshape lists each occurrence separately (one instance per
            # placed copy) rather than an instance + a count, so identical
            # occurrences are grouped here and normalised to one CadNode with
            # quantity = number of occurrences.
            grouped: dict[tuple, dict] = {}
            order: list[tuple] = []
            for inst in instances:
                if inst.get("suppressed"):
                    continue
                key = _identity(inst)
                if key not in grouped:
                    grouped[key] = inst
                    order.append(key)
            nodes = []
            for key in order:
                inst = grouped[key]
                count = sum(
                    1
                    for i in instances
                    if not i.get("suppressed") and _identity(i) == key
                )
                if inst.get("type") == "Assembly":
                    sub_key = (
                        inst.get("documentId"),
                        inst.get("elementId"),
                        inst.get("fullConfiguration"),
                    )
                    sub = sub_by_key.get(sub_key)
                    children = _build_children(sub.get("instances", [])) if sub else []
                    nodes.append(
                        CadNode(
                            id=f"{workspace_id}:{inst.get('elementId')}:{inst.get('documentId')}",
                            name=inst.get("name") or "Sub-assembly",
                            quantity=count,
                            is_assembly=True,
                            children=children,
                        )
                    )
                else:
                    part_key = (
                        inst.get("documentId"),
                        inst.get("elementId"),
                        inst.get("partId"),
                        inst.get("fullConfiguration"),
                    )
                    part = part_by_key.get(part_key, {})
                    part_id = inst.get("partId") or ""
                    nodes.append(
                        CadNode(
                            id=f"{workspace_id}:{element_id}:{part_id}",
                            name=inst.get("name") or part.get("name") or "Part",
                            quantity=count,
                            part_number=part.get("partNumber"),
                            is_assembly=False,
                        )
                    )
            return nodes

        root_instances = (definition.get("rootAssembly") or {}).get("instances", [])
        root = CadNode(
            id=f"{workspace_id}:{element_id}",
            name=doc.get("name") or element.get("name") or "Assembly",
            is_assembly=True,
            children=_build_children(root_instances),
        )
        return CadAssembly(
            document_id=document_id,
            document_name=doc.get("name", ""),
            root=root,
            connector_type=self.connector_type,
        )

    async def get_part_metadata(self, document_id: str, part_id: str) -> CadPartMetadata:
        """`part_id` must be the composite `{workspace_id}:{element_id}:{onshapePartId}`
        produced by the nodes `get_assembly_structure` returns — this connector
        never guesses a workspace/element for a bare vendor part id."""
        try:
            workspace_id, element_id, onshape_part_id = part_id.split(":", 2)
        except ValueError:
            raise CadConnectorError(
                f"Invalid part_id for Onshape connector: {part_id!r} "
                "(expected 'workspace_id:element_id:part_id')"
            ) from None

        body = await self._request(
            "GET",
            f"/metadata/d/{document_id}/w/{workspace_id}/e/{element_id}/p/{onshape_part_id}",
        )
        props = {p.get("name"): p.get("value") for p in body.get("properties", []) or []}
        by_lower = {(k or "").lower(): v for k, v in props.items()}
        known = {"part number", "name", "description", "material", "revision"}
        return CadPartMetadata(
            part_number=by_lower.get("part number"),
            name=by_lower.get("name"),
            description=by_lower.get("description"),
            material=by_lower.get("material"),
            revision=by_lower.get("revision"),
            custom_properties={k: v for k, v in props.items() if (k or "").lower() not in known},
        )
