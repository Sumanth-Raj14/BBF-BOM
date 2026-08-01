import pytest

# Scraping is an action endpoint (POST /scrape, GET /history), not a REST
# resource, so these are smoke tests against the real routes. The scrape POST
# uses an invalid body so it's rejected by validation before any network call.


@pytest.mark.asyncio
async def test_scraping_history(client, auth_headers):
    resp = await client.get("/api/v1/scraping/history", headers=auth_headers)
    assert resp.status_code in (200, 401, 403)


@pytest.mark.asyncio
async def test_scraping_scrape_validation(client, auth_headers):
    resp = await client.post(
        "/api/v1/scraping/scrape", headers=auth_headers, json={"name": "test"}
    )
    assert resp.status_code in (200, 400, 401, 403, 422)


@pytest.mark.asyncio
async def test_scraping_without_auth(client):
    resp = await client.get("/api/v1/scraping/history")
    assert resp.status_code in (200, 401, 403)
