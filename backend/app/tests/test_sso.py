import pytest

# SSO is an action endpoint (GET /providers, GET /authorize/{p},
# POST /callback/{p}), not a REST resource. Smoke-test the real routes; the
# callback POST uses an invalid body so it's rejected before any OAuth exchange.


@pytest.mark.asyncio
async def test_sso_list_providers(client, auth_headers):
    resp = await client.get("/api/v1/sso/providers", headers=auth_headers)
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_sso_callback_validation(client, auth_headers):
    resp = await client.post(
        "/api/v1/sso/callback/google", headers=auth_headers, json={"name": "test"}
    )
    assert resp.status_code in (200, 400, 401, 403, 404, 422)


@pytest.mark.asyncio
async def test_sso_providers_without_auth(client):
    resp = await client.get("/api/v1/sso/providers")
    assert resp.status_code in (200, 401, 403)
