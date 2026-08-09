"""Registry adapters for the connectors that were built standalone.

`fusion.FusionConnector` and `altium.AltiumCloudConnector` were written before
`base.py`/`registry.py` existed: they take vendor-shaped keyword arguments, and
they return plain `{external_id, part_number, name, revision, quantity,
children[]}` dicts rather than the framework dataclasses. Their own tests assert
that dict shape, so the vendor modules are left exactly as they are and the
framework contract is satisfied by the two thin subclasses below — they take
`(credentials, config)`, delegate, convert dicts to `CadAssembly`/`CadNode`/
`CadDocumentRef`/`CadPartMetadata`, and translate vendor exceptions into the
framework's `Cad*Error` family so the routes' error handling works unchanged.

`altium.AltiumFileConnector` is deliberately NOT registered: it takes an
uploaded file, not credentials, so it cannot be built from a stored
`CadConnection`. Use it (or `parse_altium_bom_csv`/`_xlsx`) directly from an
upload path.
"""

from __future__ import annotations

import contextlib

import httpx

from app.integrations.cad.altium import (
    AltiumAPIError,
    AltiumAuthError,
    AltiumCloudConnector,
    AltiumParseError,
)
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
from app.integrations.cad.fusion import (
    FusionAuthError,
    FusionConnector,
    FusionConnectorError,
    FusionNotConfiguredError,
)
from app.integrations.cad.registry import register

# Keys of the vendors' normalised dict node that map onto named CadNode /
# CadPartMetadata fields; anything else a vendor carries (Altium's designators,
# footprint, manufacturer, supplier, ...) is preserved in custom_properties.
_NODE_KEYS = {"external_id", "part_number", "name", "revision", "quantity", "children", "description"}


@contextlib.contextmanager
def _translated(vendor: str):
    """Re-raise vendor-specific failures as the framework's honest errors."""
    try:
        yield
    except CadConnectorError:
        raise
    except (FusionNotConfiguredError, FusionAuthError, AltiumAuthError) as e:
        raise CadAuthError(f"{vendor}: {e}") from e
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        if code in (401, 403):
            raise CadAuthError(f"{vendor} rejected these credentials ({code})") from e
        if code == 404:
            raise CadNotFoundError(f"{vendor} resource not found: {e.request.url}") from e
        if code == 429:
            retry_after = e.response.headers.get("Retry-After")
            raise CadRateLimitError(
                f"{vendor} rate limit exceeded (429)",
                retry_after=float(retry_after) if retry_after else None,
            ) from e
        raise CadConnectorError(f"{vendor} API error {code}") from e
    except httpx.RequestError as e:
        raise CadConnectorError(f"{vendor} request failed: {e}") from e
    except (FusionConnectorError, AltiumAPIError, AltiumParseError) as e:
        raise CadConnectorError(f"{vendor}: {e}") from e


def _to_metadata(d: dict) -> CadPartMetadata:
    return CadPartMetadata(
        part_number=d.get("part_number"),
        name=d.get("name"),
        description=d.get("description"),
        revision=d.get("revision"),
        custom_properties={k: v for k, v in d.items() if k not in _NODE_KEYS},
    )


def _to_node(d: dict) -> CadNode:
    """Vendor dict node -> CadNode. `is_assembly` is derived from having
    children — neither vendor's tree carries an explicit part/assembly flag."""
    children = [_to_node(c) for c in d.get("children") or []]
    return CadNode(
        id=str(d.get("external_id") or ""),
        name=d.get("name") or "",
        quantity=float(d.get("quantity") or 1),
        part_number=d.get("part_number"),
        is_assembly=bool(children),
        metadata=_to_metadata(d),
        children=children,
    )


def _to_doc(d: dict) -> CadDocumentRef:
    return CadDocumentRef(id=str(d.get("external_id") or ""), name=d.get("name") or "", raw=d)


def _find_node(node: CadNode, node_id: str) -> CadNode | None:
    if node.id == node_id:
        return node
    for child in node.children:
        found = _find_node(child, node_id)
        if found:
            return found
    return None


@register
class FusionCadConnector(CadConnector):
    """Autodesk Fusion 360 / APS, via `fusion.FusionConnector`.

    credentials (the APS OAuth blob, see fusion.py):
        client_id, client_secret      -- the tenant's registered APS app
        refresh_token                 -- from the 3-legged consent flow
        access_token, access_token_expires_at  -- optional cached token
    config:
        hub_id, project_id            -- REQUIRED: APS Data Management scoping,
                                         which the framework's document-id-only
                                         calls have nowhere else to come from
        folder_id                     -- optional; limits list_documents to one
                                         folder instead of all top folders
    """

    connector_type = "fusion"

    def __init__(self, credentials: dict, config: dict | None = None):
        super().__init__(credentials, config)
        self._vendor = FusionConnector(auth_blob=self.credentials)

    def _scope(self) -> tuple[str, str]:
        hub_id, project_id = self.config.get("hub_id"), self.config.get("project_id")
        if not hub_id or not project_id:
            raise CadConnectorError(
                "Fusion connection config must set hub_id and project_id "
                "(APS scopes every document call to a project)"
            )
        return hub_id, project_id

    async def verify_connection(self) -> dict:
        with _translated("Fusion"):
            return await self._vendor.verify_connection()

    async def list_documents(self) -> list[CadDocumentRef]:
        hub_id, project_id = self._scope()
        with _translated("Fusion"):
            docs = await self._vendor.list_documents(
                hub_id=hub_id, project_id=project_id, folder_id=self.config.get("folder_id")
            )
        return [_to_doc(d) for d in docs]

    async def get_assembly_structure(self, document_id: str) -> CadAssembly:
        _, project_id = self._scope()
        with _translated("Fusion"):
            root = await self._vendor.get_assembly_structure(document_id, project_id=project_id)
        node = _to_node(root)
        return CadAssembly(
            document_id=document_id,
            document_name=node.name,
            root=node,
            connector_type=self.connector_type,
        )

    async def get_part_metadata(self, document_id: str, part_id: str) -> CadPartMetadata:
        """Fusion exposes no per-part metadata endpoint — the occurrence
        properties live in the Model Derivative tree, so the node is looked up
        in the assembly structure rather than fetched on its own.
        # ponytail: costs a full get_assembly_structure per call. Add a cached
        # tree (or the Fusion Data API's BOM endpoint, if the tenant has it)
        # only if per-part lookups become hot.
        """
        assembly = await self.get_assembly_structure(document_id)
        node = _find_node(assembly.root, part_id)
        if node is None:
            raise CadNotFoundError(f"part {part_id!r} not found in Fusion document {document_id!r}")
        return node.metadata or CadPartMetadata(part_number=node.part_number, name=node.name)


@register
class AltiumCadConnector(CadConnector):
    """Altium 365 workspace (cloud), via `altium.AltiumCloudConnector`.

    credentials:
        workspace_domain              -- REQUIRED, e.g. "acme.365.altium.com"
        access_token                  -- a workspace token (used directly when
                                         no refresh triple is configured)
        access_token_expires_at       -- optional, epoch seconds
        refresh_token, client_id, client_secret -- optional; when all three are
                                         present the token is refreshed via
                                         auth.altium.com/connect/token
    config:
        bom_query                     -- optional GraphQL override; altium.py's
                                         default BOM query is UNCONFIRMED
                                         against a real workspace schema
    """

    connector_type = "altium"

    def __init__(self, credentials: dict, config: dict | None = None):
        super().__init__(credentials, config)
        self._cached = None

    def _client(self) -> AltiumCloudConnector:
        # Built lazily: a missing workspace_domain must surface as CadAuthError
        # from a call, not as a vendor exception out of build_connector().
        if self._cached is None:
            c = self.credentials
            with _translated("Altium"):
                self._cached = AltiumCloudConnector(
                    workspace_domain=c.get("workspace_domain"),
                    access_token=c.get("access_token"),
                    access_token_expires_at=c.get("access_token_expires_at"),
                    refresh_token=c.get("refresh_token"),
                    client_id=c.get("client_id"),
                    client_secret=c.get("client_secret"),
                    bom_query=self.config.get("bom_query"),
                )
        return self._cached

    async def verify_connection(self) -> dict:
        with _translated("Altium"):
            return await self._client().verify_connection()

    async def list_documents(self) -> list[CadDocumentRef]:
        with _translated("Altium"):
            docs = await self._client().list_documents()
        return [_to_doc(d) for d in docs]

    async def get_assembly_structure(self, document_id: str) -> CadAssembly:
        """Altium BOMs are flat: one synthetic root (the project) with one level
        of grouped components — there is no deeper nesting to represent."""
        with _translated("Altium"):
            root = await self._client().get_assembly_structure(document_id)
        node = _to_node(root)
        node.is_assembly = True  # the project root, even with no components yet
        return CadAssembly(
            document_id=document_id,
            document_name=node.name,
            root=node,
            connector_type=self.connector_type,
        )

    async def get_part_metadata(self, document_id: str, part_id: str) -> CadPartMetadata:
        with _translated("Altium"):
            component = await self._client().get_part_metadata(document_id, part_id)
        return _to_metadata(component)
