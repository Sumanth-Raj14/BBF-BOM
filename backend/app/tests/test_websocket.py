"""WebSocket authentication and messaging tests."""

import json

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.main import app


def _make_token(user_id: int = 1) -> str:
    return create_access_token({"sub": str(user_id)})


def test_websocket_unauthenticated_rejected():
    client = TestClient(app)
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/test"):
            pass


def test_websocket_invalid_token_rejected():
    client = TestClient(app)
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/test?token=invalid_token_here"):
            pass


def test_websocket_authenticated_connect_and_message():
    client = TestClient(app)
    token = _make_token()
    with client.websocket_connect(f"/ws/test?token={token}") as ws:
        presence = ws.receive_json()
        assert presence["type"] == "presence"
        ws.send_text(json.dumps({"text": "hello world"}))
        data = ws.receive_json()
        assert data["text"] == "hello world"
        assert data["channel"] == "test"
        assert isinstance(data["user_id"], int)


def test_websocket_message_size_limit():
    client = TestClient(app)
    token = _make_token()
    with client.websocket_connect(f"/ws/test?token={token}") as ws:
        ws.receive_json()
        large_msg = "x" * 70000
        ws.send_text(json.dumps({"text": large_msg}))
        data = ws.receive_json()
        assert data["type"] == "error"
        assert "large" in data["message"].lower()


def test_websocket_broadcast():
    client = TestClient(app)
    token = _make_token()
    with client.websocket_connect(f"/ws/test?token={token}") as ws1:
        ws1.receive_json()
        with client.websocket_connect(f"/ws/test?token={token}") as ws2:
            ws2.receive_json()
            ws1.receive_json()
            ws1.send_text(json.dumps({"text": "broadcast test"}))
            data1 = ws1.receive_json()
            data2 = ws2.receive_json()
            assert data1["text"] == "broadcast test"
            assert data2["text"] == "broadcast test"
