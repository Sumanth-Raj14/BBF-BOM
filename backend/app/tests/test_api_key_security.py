"""CLUSTER api-key-security regression tests.

Finding 1 (auth.py::plugin_login): the bearer JWT minted by plugin-login
carries no scope claim, and core/deps.py's bearer-token path enforces no
scope check at all (only the X-API-Key header path does). So a read-only
key could previously be exchanged for a token with full write access.
Fixed by refusing plugin-login for any key lacking "write" scope.

Finding 2 (api_keys.py::create_api_key / rotate_api_key): every key got the
literal prefix "bkb", and the auth lookup does
`.where(key_prefix == ...)` then `.scalar_one_or_none()` -- which raises
MultipleResultsFound as soon as a second active key exists anywhere.
Fixed by folding unique random hex into the prefix itself.
"""

import secrets

import pytest

from app.core.security import get_password_hash
from app.models.api_key import ApiKey


async def _make_key(db_session, user, scopes, raw=None):
    raw = raw or f"bkb_{secrets.token_urlsafe(16)}"
    db_session.add(
        ApiKey(
            user_id=user.id,
            tenantId=user.tenantId,
            name="security-test",
            key_hash=get_password_hash(raw),
            key_prefix=raw.split("_")[0],
            scopes=scopes,
            is_active=True,
        )
    )
    await db_session.commit()
    return raw


@pytest.mark.asyncio
async def test_read_only_key_cannot_get_token_via_plugin_login(client, db_session, test_user):
    """Finding 1: a read-only key must not mint a full-access bearer token."""
    raw = await _make_key(db_session, test_user, ["read"])

    resp = await client.post("/api/v1/auth/plugin-login", json={"api_key": raw})

    assert resp.status_code == 403, resp.text
    assert "scope" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_write_scoped_key_can_still_get_token_via_plugin_login(client, db_session, test_user):
    """Sanity: the fix doesn't break the legitimate (full-capability) case."""
    raw = await _make_key(db_session, test_user, ["read", "write"])

    resp = await client.post("/api/v1/auth/plugin-login", json={"api_key": raw})

    assert resp.status_code == 200, resp.text
    assert resp.json()["session_id"]


@pytest.mark.asyncio
async def test_two_active_keys_can_both_authenticate(client, auth_headers):
    """Finding 2: creating a second active key must not break lookups for
    either key (old code: shared "bkb" prefix -> MultipleResultsFound)."""
    r1 = await client.post("/api/v1/api-keys/", headers=auth_headers, json={"name": "key1"})
    assert r1.status_code == 200, r1.text
    raw1 = r1.json()["key"]

    r2 = await client.post("/api/v1/api-keys/", headers=auth_headers, json={"name": "key2"})
    assert r2.status_code == 200, r2.text
    raw2 = r2.json()["key"]

    # The two keys must not share a prefix (the actual root cause).
    assert raw1.split("_")[0] != raw2.split("_")[0]

    resp1 = await client.get("/api/v1/api-keys/", headers={"X-API-Key": raw1})
    resp2 = await client.get("/api/v1/api-keys/", headers={"X-API-Key": raw2})

    assert resp1.status_code == 200, resp1.text
    assert resp2.status_code == 200, resp2.text
