import pytest

from app.api.endpoints import sso as sso_module

# Action endpoint (GET /providers, POST /callback/{p}). Exact-code smoke tests.


@pytest.mark.asyncio
async def test_sso_list_providers(client, auth_headers):
    resp = await client.get("/api/v1/sso/providers", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_sso_callback_validation(client, auth_headers):
    # Missing required callback fields -> 422 before any OAuth exchange.
    resp = await client.post(
        "/api/v1/sso/callback/google", headers=auth_headers, json={"name": "test"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_sso_providers_without_auth(client):
    # Provider list is intentionally public.
    resp = await client.get("/api/v1/sso/providers")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# End-to-end wiring: unconfigured stays disabled; configured completes a real
# cookie session. The provider's own HTTP (token exchange + userinfo) is
# mocked -- only our own endpoint behaviour is under test.
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, status_code, json_data):
        self.status_code = status_code
        self._json_data = json_data

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx

            raise httpx.HTTPStatusError("error", request=None, response=self)

    def json(self):
        return self._json_data


class _FakeAsyncClient:
    """Stands in for httpx.AsyncClient inside sso.py: canned token exchange
    + userinfo responses, no real network call."""

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, **kwargs):
        if "token" in url:
            return _FakeResponse(200, {"access_token": "fake-provider-access-token"})
        return _FakeResponse(404, {})

    async def get(self, url, **kwargs):
        return _FakeResponse(
            200, {"email": "ssouser@example.com", "name": "SSO User", "sub": "prov-123"}
        )


@pytest.fixture
def configured_google(monkeypatch):
    """Give the 'google' provider a client_id/secret for the duration of the
    test (real deployments come from GOOGLE_CLIENT_ID/SECRET env vars, which
    are unset in the test environment)."""
    google = sso_module.SSO_PROVIDERS["google"]
    monkeypatch.setitem(google, "client_id", "test-google-client-id")
    monkeypatch.setitem(google, "client_secret", "test-google-client-secret")
    return google


@pytest.mark.asyncio
async def test_unconfigured_provider_stays_disabled(client):
    # No env secrets set in the test environment -> every provider reports
    # disabled, and the authorize endpoint honestly refuses to start a flow.
    resp = await client.get("/api/v1/sso/providers")
    body = resp.json()
    github = next(p for p in body["providers"] if p["id"] == "github")
    assert github["enabled"] is False

    authorize_resp = await client.get("/api/v1/sso/authorize/github")
    assert authorize_resp.status_code == 400


@pytest.mark.asyncio
async def test_configured_provider_yields_authorize_redirect(client, configured_google):
    resp = await client.get("/api/v1/sso/providers")
    google = next(p for p in resp.json()["providers"] if p["id"] == "google")
    assert google["enabled"] is True

    authorize_resp = await client.get("/api/v1/sso/authorize/google")
    assert authorize_resp.status_code == 200
    payload = authorize_resp.json()
    assert payload["authorization_url"].startswith("https://accounts.google.com")
    assert "state=" in payload["authorization_url"]
    assert payload["state"]  # signed state handed back for the callback


@pytest.mark.asyncio
async def test_sso_callback_completes_a_real_session(
    client, configured_google, monkeypatch, test_tenant
):
    # test_tenant is required, not incidental: the callback provisions a User
    # row, and on Postgres that FK is enforced --
    #   insert or update on "users" violates fk_users_tenantId_tenants
    #   DETAIL: Key (tenantId)=(1) is not present in table "tenants"
    # SQLite does not enforce foreign keys by default, so without this fixture
    # the test passed locally and failed only on the Postgres CI track.
    monkeypatch.setattr(sso_module.httpx, "AsyncClient", _FakeAsyncClient)

    # Spy on set_auth_cookies (still delegates to the real implementation) so
    # this test proves OUR endpoint establishes a session exactly like
    # /auth/login does -- same helper, both tokens -- independent of whether
    # every Set-Cookie header survives the full middleware stack unchanged
    # in this test transport (a pre-existing, endpoint-agnostic concern
    # shared with /auth/login, not something introduced here).
    captured = {}
    real_set_auth_cookies = sso_module.set_auth_cookies

    def spy_set_auth_cookies(response, access_token, refresh_token):
        captured["access_token"] = access_token
        captured["refresh_token"] = refresh_token
        return real_set_auth_cookies(response, access_token, refresh_token)

    monkeypatch.setattr(sso_module, "set_auth_cookies", spy_set_auth_cookies)

    authorize_resp = await client.get("/api/v1/sso/authorize/google")
    signed_state = authorize_resp.json()["state"]

    csrf_cookie = client.cookies.get("csrf_token")
    headers = {"X-CSRF-Token": csrf_cookie.split(".")[0]} if csrf_cookie else {}

    resp = await client.post(
        "/api/v1/sso/callback/google",
        json={"code": "fake-provider-code", "state": signed_state, "provider": "google"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["user"]["email"] == "ssouser@example.com"

    # This is the actual "lands the user in the app" contract: the frontend
    # is entirely cookie-based, so the session must be a real httpOnly
    # cookie, not just a token in the JSON body nothing reads.
    assert resp.cookies.get("access_token")
    assert captured.get("access_token")
    assert captured.get("refresh_token")


@pytest.mark.asyncio
async def test_sso_callback_rejects_bad_state(client, configured_google):
    # Denied consent / tampered state must fail honestly, not silently log
    # someone in or redirect-loop.
    await client.get("/api/v1/sso/providers")  # seed the csrf_token cookie
    csrf_cookie = client.cookies.get("csrf_token")
    headers = {"X-CSRF-Token": csrf_cookie.split(".")[0]} if csrf_cookie else {}
    resp = await client.post(
        "/api/v1/sso/callback/google",
        json={"code": "x", "state": "tampered.notasignature", "provider": "google"},
        headers=headers,
    )
    assert resp.status_code == 401
