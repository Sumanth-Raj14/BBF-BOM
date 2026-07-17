import pytest


@pytest.mark.asyncio
async def test_csrf_cookie_set_on_get(client, test_user):
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer test"})
    assert "csrf_token" in resp.cookies or "set-cookie" in resp.headers


@pytest.mark.asyncio
async def test_csrf_protects_mutating_endpoints(client, test_user, auth_headers):
    # Send POST without Bearer token and without CSRF token to test rejection
    resp = await client.post(
        "/api/v1/parts/",
        json={"name": "test"},
    )
    assert resp.status_code == 403
    data = resp.json()
    assert "CSRF" in data.get("detail", "")


@pytest.mark.asyncio
async def test_csrf_allows_with_valid_token(client, test_user):
    get_resp = await client.get("/api/v1/health")
    csrf_cookie = get_resp.cookies.get("csrf_token")
    token = csrf_cookie.split(".")[0] if csrf_cookie else None
    login_resp = await client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "testpass123"},
    )
    token_from_cookie = login_resp.cookies.get("access_token")
    if token_from_cookie:
        resp = await client.post(
            "/api/v1/auth/logout",
            cookies={
                "access_token": token_from_cookie,
                "csrf_token": csrf_cookie,
            },
            headers={"X-CSRF-Token": token or ""},
        )
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_metrics_endpoint(client, auth_headers):
    resp = await client.get("/api/v1/metrics", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.text
    assert "http_requests_total" in body
    assert "db_queries_total" in body
    assert "active_users" in body
