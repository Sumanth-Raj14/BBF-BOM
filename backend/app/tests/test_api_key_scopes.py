"""API-key scope enforcement (app/core/deps.py::_authenticate_by_api_key).

Scopes were stored on `api_keys.scopes` and never read, so a read-only key
could write. These tests pin the guard.

NOTE: every key this app issues has the literal prefix "bkb", and the lookup
in _authenticate_by_api_key is `scalar_one_or_none()` on key_prefix -- so two
active keys at once raise MultipleResultsFound. Each test therefore creates
exactly one key (the autouse clean_db fixture truncates between tests).
"""

import secrets

import pytest

from app.core.security import get_password_hash
from app.models.api_key import ApiKey


async def _make_key(db_session, user, scopes):
    """Create one active API key for `user` and return the raw key string."""
    raw = f"bkb_{secrets.token_urlsafe(32)}"
    db_session.add(
        ApiKey(
            user_id=user.id,
            tenantId=user.tenantId,
            name="scope-test",
            key_hash=get_password_hash(raw),
            key_prefix=raw.split("_")[0],
            scopes=scopes,
            is_active=True,
        )
    )
    await db_session.commit()
    return raw


async def _write_headers(client, raw_key):
    """API-key headers for an unsafe method, including a valid CSRF token.

    Without this the CSRF middleware 403s the POST before it ever reaches the
    auth dependency -- which would make a scope test pass for the wrong reason.
    """
    await client.get("/api/v1/api-keys/", headers={"X-API-Key": raw_key})
    headers = {"X-API-Key": raw_key}
    csrf_cookie = client.cookies.get("csrf_token")
    if csrf_cookie:
        headers["X-CSRF-Token"] = csrf_cookie.split(".")[0]
    return headers


@pytest.mark.asyncio
async def test_read_scoped_key_is_refused_a_write(client, db_session, test_user):
    """THE regression test: read-only key must not be able to write."""
    raw = await _make_key(db_session, test_user, ["read"])
    headers = await _write_headers(client, raw)

    resp = await client.post("/api/v1/api-keys/", headers=headers, json={"name": "x"})

    assert resp.status_code == 403, resp.text
    # Assert on the reason too: a bare 403 could equally be the CSRF middleware.
    assert "scope" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_read_scoped_key_can_still_read(client, db_session, test_user):
    raw = await _make_key(db_session, test_user, ["read"])
    resp = await client.get("/api/v1/api-keys/", headers={"X-API-Key": raw})
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_write_scoped_key_succeeds_on_write(client, db_session, test_user):
    raw = await _make_key(db_session, test_user, ["read", "write"])
    headers = await _write_headers(client, raw)

    resp = await client.post("/api/v1/api-keys/", headers=headers, json={"name": "x"})

    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "scopes",
    [
        pytest.param([], id="empty"),
        pytest.param(None, id="null"),
        pytest.param(["banana"], id="unknown-value"),
        pytest.param("read", id="non-list-substring"),
    ],
)
async def test_key_without_usable_scopes_is_denied_reads(client, db_session, test_user, scopes):
    """Default deny: no scopes / unknown scopes / malformed scopes grant nothing.

    "read" as a bare string is included because `"read" in "read"` is True --
    a str must not be accepted as a scope collection.
    """
    raw = await _make_key(db_session, test_user, scopes)

    resp = await client.get("/api/v1/api-keys/", headers={"X-API-Key": raw})

    assert resp.status_code == 403, resp.text
    assert "scope" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_jwt_users_are_unaffected_by_scope_guard(client, auth_headers):
    """The guard is API-key-only; session/JWT callers keep full access."""
    resp = await client.post("/api/v1/api-keys/", headers=auth_headers, json={"name": "jwt"})
    assert resp.status_code == 200, resp.text
