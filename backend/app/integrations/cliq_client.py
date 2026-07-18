import httpx


class CliqClient:
    def __init__(self, webhook_url: str, http: httpx.AsyncClient | None = None):
        self._url = webhook_url
        self._http = http or httpx.AsyncClient(timeout=15)

    async def post_message(self, text: str) -> bool:
        r = await self._http.post(self._url, json={"text": text})
        r.raise_for_status()
        return True

    async def verify(self) -> dict:
        """Credential check for the incoming-webhook integration.

        Zoho Cliq only validates the webhook's zapikey on POST (a GET/HEAD to
        the same URL is accepted unconditionally and would report ok=True for
        a bad or revoked key — a fake success). To keep the honest-failure
        guarantee, we make the one real authenticated call the client
        supports: posting a small, clearly-labeled system message. A bad key
        raises httpx.HTTPStatusError (401/403), which callers must surface as
        a failure rather than swallow.
        """
        await self.post_message("BOM Tool - connection test (no action needed).")
        return {"ok": True}
