import httpx

BASE = "https://api.clickup.com/api/v2"


class ClickUpClient:
    def __init__(self, token: str, http: httpx.AsyncClient | None = None):
        self._token = token
        self._http = http or httpx.AsyncClient(base_url="https://api.clickup.com", timeout=15)

    def _headers(self):
        return {"Authorization": self._token, "Content-Type": "application/json"}

    async def create_task(self, list_id, name, description=None, status=None, assignee_ids=None, due_ms=None):
        body = {"name": name}
        if description:
            body["description"] = description
        if status:
            body["status"] = status
        if assignee_ids:
            body["assignees"] = assignee_ids
        if due_ms:
            body["due_date"] = due_ms
        r = await self._http.post(f"{BASE}/list/{list_id}/task", json=body, headers=self._headers())
        r.raise_for_status()
        data = r.json()
        return {"id": data.get("id"), "url": data.get("url")}

    async def update_task(self, task_id, status=None, assignee_ids=None, due_ms=None):
        body = {}
        if status:
            body["status"] = status
        if due_ms:
            body["due_date"] = due_ms
        if assignee_ids is not None:
            body["assignees"] = {"add": assignee_ids}
        r = await self._http.put(f"{BASE}/task/{task_id}", json=body, headers=self._headers())
        r.raise_for_status()
        data = r.json()
        return {"id": data.get("id", task_id), "url": data.get("url")}

    async def resolve_member_id(self, email):
        r = await self._http.get(f"{BASE}/team", headers=self._headers())
        r.raise_for_status()
        for team in r.json().get("teams", []):
            for m in team.get("members", []):
                u = m.get("user", {})
                if (u.get("email") or "").lower() == (email or "").lower():
                    return u.get("id")
        return None

    async def ensure_list(self, space_id, name):
        r = await self._http.get(f"{BASE}/space/{space_id}/list", headers=self._headers())
        r.raise_for_status()
        for lst in r.json().get("lists", []):
            if lst.get("name") == name:
                return lst["id"]
        c = await self._http.post(f"{BASE}/space/{space_id}/list", json={"name": name}, headers=self._headers())
        c.raise_for_status()
        return c.json()["id"]
