"""Abstract CAD connector interface + normalised assembly-structure schema.

Every CAD system (SolidWorks, Onshape, Fusion 360, Altium, ...) exposes
document/assembly/part concepts differently. Instead of writing a bespoke BOM
importer per vendor, every connector maps its native shapes into the
dataclasses below ONCE — `app.api.endpoints.cad_connectors` walks that single
normalised tree to create Parts/BOMItems (via `app.services.part_service` /
`app.services.bom_service`, never reimplementing BOM writing). Adding a new
vendor means implementing this interface + registering it (see
`app.integrations.cad.registry`), not touching the importer or the routes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


class CadConnectorError(Exception):
    """Base for every connector failure. Raised, never swallowed into a fake
    success — an endpoint that cannot reach/parse the vendor must say so."""


class CadAuthError(CadConnectorError):
    """Credentials missing, expired, or rejected by the vendor. Callers map
    this to an honest 401/"auth_failed" — never retried as if transient."""


class CadRateLimitError(CadConnectorError):
    """Vendor responded 429. `retry_after` (seconds) is set when the vendor
    supplied one via a Retry-After header, else None."""

    def __init__(self, message: str, retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


class CadNotFoundError(CadConnectorError):
    """Requested document/element/part does not exist, or isn't visible to
    these credentials."""


@dataclass
class CadDocumentRef:
    """One document/file as listed by `list_documents`."""

    id: str
    name: str
    url: str | None = None
    modified_at: str | None = None
    raw: dict = field(default_factory=dict)  # vendor's original record (debugging only)


@dataclass
class CadPartMetadata:
    """Normalised metadata for a single part/component (`get_part_metadata`)."""

    part_number: str | None = None
    name: str | None = None
    description: str | None = None
    material: str | None = None
    mass_grams: float | None = None
    revision: str | None = None
    custom_properties: dict = field(default_factory=dict)


@dataclass
class CadNode:
    """One node in a normalised assembly tree.

    `id` is a connector-scoped opaque identifier: it may encode whatever the
    vendor's own hierarchy needs (workspace/element/part ids, ...) so a later
    `get_part_metadata(document_id, node.id)` call round-trips cleanly.
    Callers must never parse it — only pass it back to the same connector.
    """

    id: str
    name: str
    quantity: float = 1.0
    part_number: str | None = None
    is_assembly: bool = False
    metadata: CadPartMetadata | None = None
    children: list[CadNode] = field(default_factory=list)


@dataclass
class CadAssembly:
    """Result of `get_assembly_structure`: the source document plus its
    normalised root node."""

    document_id: str
    document_name: str
    root: CadNode
    connector_type: str = ""


class CadConnector(ABC):
    """Base class every CAD integration implements.

    `connector_type` is the registry key subclasses set as a class attribute
    (e.g. "onshape") — see `app.integrations.cad.registry.register`.
    """

    connector_type: str = ""

    def __init__(self, credentials: dict, config: dict | None = None):
        self.credentials = credentials or {}
        self.config = config or {}

    def current_credentials(self) -> dict:
        """Current credential state, for the caller to detect vendor-side
        token rotation (a refresh call minting a new refresh_token) and
        persist it back to the stored connection. Default: unchanged — most
        connectors never mutate anything beyond what was passed in. Override
        when the vendor client caches/rotates tokens in memory (Fusion, Altium
        cloud) so a rotated refresh_token isn't silently lost."""
        return self.credentials

    @abstractmethod
    async def verify_connection(self) -> dict:
        """Lightweight, read-only credential check. Raises `CadAuthError` /
        `CadConnectorError` on failure — never returns ok on bad/missing creds."""

    @abstractmethod
    async def list_documents(self) -> list[CadDocumentRef]:
        """List documents/files visible to these credentials."""

    @abstractmethod
    async def get_assembly_structure(self, document_id: str) -> CadAssembly:
        """Fetch and normalise the full assembly tree for one document."""

    @abstractmethod
    async def get_part_metadata(self, document_id: str, part_id: str) -> CadPartMetadata:
        """Fetch metadata for one part referenced within a document."""
