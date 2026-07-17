import json

import httpx
import pytest

from app.integrations.clickup_client import ClickUpClient


def _mock(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="https://api.clickup.com")


@pytest.mark.asyncio
async def test_clickup_create_task_posts_to_list():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        seen["json"] = json.loads(request.content) if request.content else None
        return httpx.Response(200, json={"id": "abc123", "url": "https://app.clickup.com/t/abc123"})

    client = ClickUpClient("tok_1", http=_mock(handler))
    res = await client.create_task("list_9", name="WO-1", description="d", status="in progress", assignee_ids=[7], due_ms=None)
    assert res == {"id": "abc123", "url": "https://app.clickup.com/t/abc123"}
    assert seen["url"].endswith("/api/v2/list/list_9/task")
    assert seen["auth"] == "tok_1"
    assert seen["json"]["name"] == "WO-1"
    assert seen["json"]["assignees"] == [7]


@pytest.mark.asyncio
async def test_clickup_update_task_puts_to_task():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["method"] = request.method
        return httpx.Response(200, json={"id": "abc123", "url": "https://app.clickup.com/t/abc123"})

    client = ClickUpClient("tok_1", http=_mock(handler))
    res = await client.update_task("abc123", status="closed", assignee_ids=None, due_ms=None)
    assert res["id"] == "abc123"
    assert seen["method"] == "PUT"
    assert seen["url"].endswith("/api/v2/task/abc123")


from app.integrations.cliq_client import CliqClient


@pytest.mark.asyncio
async def test_cliq_posts_text_to_webhook():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["json"] = json.loads(request.content)
        return httpx.Response(200, json={"ok": True})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = CliqClient("https://cliq.zoho.com/api/v2/channelsbyname/eng/message?zapikey=XYZ", http=http)
    ok = await client.post_message("WO-1 assigned to Team A")
    assert ok is True
    assert "cliq.zoho.com" in seen["url"]
    assert seen["json"]["text"] == "WO-1 assigned to Team A"
