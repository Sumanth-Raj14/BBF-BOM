import pytest

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
