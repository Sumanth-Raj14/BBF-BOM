import pytest

# Action endpoint (POST /scrape, GET /history). Exact-code smoke tests.


@pytest.mark.asyncio
async def test_scraping_history(client, auth_headers):
    resp = await client.get("/api/v1/scraping/history", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_scraping_scrape_validation(client, auth_headers):
    # Missing required `url` -> 422 before any network call.
    resp = await client.post(
        "/api/v1/scraping/scrape", headers=auth_headers, json={"name": "test"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_scraping_history_without_auth(client):
    resp = await client.get("/api/v1/scraping/history")
    assert resp.status_code == 401
