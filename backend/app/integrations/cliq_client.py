import httpx


class CliqClient:
    def __init__(self, webhook_url: str, http: httpx.AsyncClient | None = None):
        self._url = webhook_url
        self._http = http or httpx.AsyncClient(timeout=15)

    async def post_message(self, text: str) -> bool:
        r = await self._http.post(self._url, json={"text": text})
        r.raise_for_status()
        return True
