from app.integrations.cad import adapters  # noqa: F401 -- registers Fusion/Altium adapters
from app.integrations.cad import onshape  # noqa: F401 -- registers OnshapeConnector
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
from app.integrations.cad.registry import (
    build_connector,
    get_connector_class,
    list_connector_types,
    register,
)

__all__ = [
    "CadAssembly",
    "CadAuthError",
    "CadConnector",
    "CadConnectorError",
    "CadDocumentRef",
    "CadNode",
    "CadNotFoundError",
    "CadPartMetadata",
    "CadRateLimitError",
    "build_connector",
    "get_connector_class",
    "list_connector_types",
    "register",
    "adapters",
    "onshape",
]
