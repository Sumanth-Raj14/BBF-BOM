"""Name -> CadConnector class registry.

This is what lets the generic routes (`app.api.endpoints.cad_connectors`) and
future connectors (Fusion 360, Altium, ...) plug in without the importer or
routes ever growing a per-vendor if/elif — a new connector module just calls
`register()` on import.
"""

from app.integrations.cad.base import CadConnector

_REGISTRY: dict[str, type[CadConnector]] = {}


def register(cls: type[CadConnector]) -> type[CadConnector]:
    """Class decorator: `@register` on a `CadConnector` subclass makes it
    discoverable by `cls.connector_type`."""
    if not cls.connector_type:
        raise ValueError(f"{cls.__name__}.connector_type must be set before registering")
    _REGISTRY[cls.connector_type] = cls
    return cls


def get_connector_class(connector_type: str) -> type[CadConnector]:
    try:
        return _REGISTRY[connector_type]
    except KeyError:
        raise KeyError(f"Unknown CAD connector type: {connector_type!r}") from None


def list_connector_types() -> list[str]:
    return sorted(_REGISTRY.keys())


def build_connector(
    connector_type: str, credentials: dict, config: dict | None = None
) -> CadConnector:
    cls = get_connector_class(connector_type)
    return cls(credentials, config)
