"""WebSocket authentication — validates JWT from query parameter or subprotocol."""

from fastapi import WebSocket, WebSocketException, status

from app.core.security import verify_token_with_blacklist


async def authenticate_websocket(websocket: WebSocket) -> dict:
    """Authenticate a WebSocket connection.

    Tries in order:
    1. `token` query parameter
    2. `proxy_authorization` header
    3. `authorization` header

    Checks token against blacklist.

    Returns JWT payload dict or raises WebSocketException.
    """
    token = websocket.query_params.get("token")

    if not token:
        auth_header = websocket.headers.get("proxy-authorization") or websocket.headers.get(
            "authorization", ""
        )
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION, reason="Missing authentication token"
        )

    payload = await verify_token_with_blacklist(token)
    if payload is None:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION, reason="Invalid, expired, or revoked token"
        )

    return payload
