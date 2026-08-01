import pytest

# Search is a query endpoint (GET /search/?q=..., GET /search/suggestions),
# not a REST resource. Exact-code smoke tests.


@pytest.mark.asyncio
async def test_search_query(client, auth_headers):
    resp = await client.get("/api/v1/search/?q=test", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_search_suggestions(client, auth_headers):
    resp = await client.get("/api/v1/search/suggestions?q=te", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_search_query_without_auth(client):
    resp = await client.get("/api/v1/search/?q=test")
    assert resp.status_code == 401
