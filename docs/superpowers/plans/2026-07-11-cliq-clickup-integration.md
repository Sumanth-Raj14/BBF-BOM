# Cliq + ClickUp Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror actionable work (Work Orders, CAPAs, ECO/ECR, NCR, Approvals, POs) from the BOM app into ClickUp tasks and post Zoho Cliq notifications, one-way, reliably, per tenant.

**Architecture:** Domain mutations call `emit_integration_event(...)`, which writes rows to an `integration_outbox` table (never calling external APIs inline). A background worker drains the outbox, calls thin ClickUp/Cliq clients with retries + backoff, and records an `integration_external_links` mapping so re-delivery updates the same ClickUp task (idempotent). A per-tenant `integration_connections` row holds encrypted credentials + config. An admin "Integrations" screen manages it.

**Tech Stack:** FastAPI, async SQLAlchemy 2.0, Alembic, httpx (already a dependency), cryptography.Fernet (already transitively present via passlib/jose — verify in Task 2), React + Vite frontend.

## Global Constraints

- Python backend under `backend/`; tests run on **SQLite** via `Base.metadata.create_all` with `pytest -p no:cacheprovider`. Set `TEST_DATABASE_URL=sqlite+aiosqlite:///./test_ws3.db` when running.
- All new tables use `TenantAwareMixin` (adds non-null `tenantId` FK → `tenants.id`); **set `tenantId` explicitly** on every insert and filter every query by it.
- Latest Alembic head is **`030_teams_and_work_assignment`**; the new migration chains after it. Keep a single head (`python -m alembic heads` must show one).
- External HTTP goes through **httpx**; clients accept an injectable `httpx.AsyncClient` so tests use `httpx.MockTransport` (no new test dependency, no real network).
- **One-way only.** No inbound webhooks, no ClickUp→app sync, no per-user OAuth.
- Secrets (ClickUp token, Cliq webhook URL) are **encrypted at rest** and never logged.
- Router auth: reuse `get_current_user`; admin-only mutations additionally require `require_admin` if present (else `get_current_user` + a superuser check).
- This project is **not under git**. Run `git init` in the project root once before starting if you want the commit steps to work; otherwise skip every "Commit" step.
- RTK/Windows note: run pytest via PowerShell (`python -m pytest ...`); the Bash tool's `grep`/`head` are rewritten by an `rtk` hook — use the editor's search or Python instead.

---

## File Structure

**Backend (create):**
- `backend/app/models/integration.py` — `IntegrationConnection`, `IntegrationOutbox`, `IntegrationExternalLink`
- `backend/alembic/versions/031_integration_tables.py` — migration
- `backend/app/integrations/__init__.py`
- `backend/app/integrations/crypto.py` — Fernet encrypt/decrypt
- `backend/app/integrations/clickup_client.py`
- `backend/app/integrations/cliq_client.py`
- `backend/app/integrations/events.py` — `emit_integration_event`
- `backend/app/integrations/worker.py` — `deliver_pending`
- `backend/app/api/endpoints/integrations.py` — admin API

**Backend (modify):**
- `backend/app/models/__init__.py` — import the 3 new models
- `backend/app/api/endpoints/__init__.py` — add `integrations`
- `backend/app/api/api_v1.py` — register router at `/integrations`
- `backend/app/api/endpoints/work_queue.py` — emit on `/work/assign`
- (later, Task 8) the mutation points for WO status / CAPA / ECO / NCR / PO

**Backend (tests):**
- `backend/app/tests/test_integration_crypto.py`
- `backend/app/tests/test_integration_clients.py`
- `backend/app/tests/test_integration_events.py`
- `backend/app/tests/test_integration_worker.py`
- `backend/app/tests/test_integrations_api.py`

**Frontend (create/modify):**
- Create `frontend/src/components/screens/IntegrationsScreen.jsx`
- Modify `frontend/src/components/LazyScreens.jsx`, `frontend/src/screens/App.jsx`, `frontend/src/components/NavRail.jsx`

---

## Task 1: Data models + migration

**Files:**
- Create: `backend/app/models/integration.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/031_integration_tables.py`
- Test: `backend/app/tests/test_integration_events.py` (reused later; here just a model insert smoke)

**Interfaces:**
- Produces: `IntegrationConnection(tenantId, provider, auth, config, is_enabled, status, last_error, last_checked_at)`, `IntegrationOutbox(tenantId, provider, entity_type, entity_id, action, payload, status, attempts, next_attempt_at, last_error)`, `IntegrationExternalLink(tenantId, provider, entity_type, entity_id, external_id, external_url)`.

- [ ] **Step 1: Write the model file**

```python
# backend/app/models/integration.py
from sqlalchemy import (
    JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class IntegrationConnection(Base, TenantAwareMixin):
    __tablename__ = "integration_connections"
    id = Column(Integer, primary_key=True)
    provider = Column(String(20), nullable=False)  # "clickup" | "cliq"
    auth = Column(Text)              # encrypted credential blob
    config = Column(JSON, default=dict)
    is_enabled = Column(Boolean, default=False)
    status = Column(String(20), default="unconfigured")  # ok | error | unconfigured
    last_error = Column(Text)
    last_checked_at = Column(DateTime(timezone=True))
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())
    __table_args__ = (
        UniqueConstraint("tenantId", "provider", name="uq_integration_conn_tenant_provider"),
    )


class IntegrationOutbox(Base, TenantAwareMixin):
    __tablename__ = "integration_outbox"
    id = Column(Integer, primary_key=True)
    provider = Column(String(20), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=False)
    action = Column(String(50), nullable=False)
    payload = Column(JSON, default=dict)
    status = Column(String(20), default="pending", index=True)  # pending|sent|failed|dead
    attempts = Column(Integer, default=0)
    next_attempt_at = Column(DateTime(timezone=True))
    last_error = Column(Text)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())
    __table_args__ = (Index("idx_outbox_status_next", "status", "next_attempt_at"),)


class IntegrationExternalLink(Base, TenantAwareMixin):
    __tablename__ = "integration_external_links"
    id = Column(Integer, primary_key=True)
    provider = Column(String(20), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=False)
    external_id = Column(String(100), nullable=False)
    external_url = Column(String(500))
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())
    __table_args__ = (
        UniqueConstraint(
            "tenantId", "provider", "entity_type", "entity_id",
            name="uq_extlink_entity",
        ),
    )
```

- [ ] **Step 2: Register the models** — add to `backend/app/models/__init__.py` (alphabetical-ish, after the `import` for `inventory`):

```python
from app.models.integration import (
    IntegrationConnection,
    IntegrationExternalLink,
    IntegrationOutbox,
)
```

- [ ] **Step 3: Write the Alembic migration** `backend/alembic/versions/031_integration_tables.py`

```python
"""WS3: integration connections, outbox, external links

Revision ID: 031_integration_tables
Revises: 030_teams_and_work_assignment
Create Date: 2026-07-11
"""
import sqlalchemy as sa
from alembic import op

revision = "031_integration_tables"
down_revision = "030_teams_and_work_assignment"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "integration_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("auth", sa.Text()),
        sa.Column("config", sa.JSON()),
        sa.Column("is_enabled", sa.Boolean(), server_default=sa.false()),
        sa.Column("status", sa.String(20), server_default="unconfigured"),
        sa.Column("last_error", sa.Text()),
        sa.Column("last_checked_at", sa.DateTime(timezone=True)),
        sa.Column("tenantId", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("tenantId", "provider", name="uq_integration_conn_tenant_provider"),
    )
    op.create_index("ix_integration_connections_tenantId", "integration_connections", ["tenantId"])

    op.create_table(
        "integration_outbox",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("payload", sa.JSON()),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("attempts", sa.Integer(), server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text()),
        sa.Column("tenantId", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_integration_outbox_provider", "integration_outbox", ["provider"])
    op.create_index("ix_integration_outbox_status", "integration_outbox", ["status"])
    op.create_index("idx_outbox_status_next", "integration_outbox", ["status", "next_attempt_at"])
    op.create_index("ix_integration_outbox_tenantId", "integration_outbox", ["tenantId"])

    op.create_table(
        "integration_external_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=False),
        sa.Column("external_url", sa.String(500)),
        sa.Column("tenantId", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("tenantId", "provider", "entity_type", "entity_id", name="uq_extlink_entity"),
    )
    op.create_index("ix_integration_external_links_tenantId", "integration_external_links", ["tenantId"])


def downgrade():
    op.drop_table("integration_external_links")
    op.drop_table("integration_outbox")
    op.drop_table("integration_connections")
```

- [ ] **Step 4: Verify single migration head**

Run (PowerShell, from `backend/`): `$env:SECRET_KEY='x'; $env:DATABASE_URL='postgresql+asyncpg://u:p@localhost/db'; python -m alembic heads`
Expected: exactly one line — `031_integration_tables (head)`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/integration.py backend/app/models/__init__.py backend/alembic/versions/031_integration_tables.py
git commit -m "feat(ws3): integration connection/outbox/external-link models + migration"
```

---

## Task 2: Credential encryption

**Files:**
- Create: `backend/app/integrations/__init__.py` (empty)
- Create: `backend/app/integrations/crypto.py`
- Test: `backend/app/tests/test_integration_crypto.py`

**Interfaces:**
- Produces: `encrypt_secret(plaintext: str) -> str`, `decrypt_secret(token: str) -> str`.

- [ ] **Step 1: Write the failing test** `backend/app/tests/test_integration_crypto.py`

```python
from app.integrations.crypto import decrypt_secret, encrypt_secret


def test_encrypt_decrypt_roundtrip():
    token = encrypt_secret("pk_clickup_secret_123")
    assert token != "pk_clickup_secret_123"       # actually encrypted
    assert decrypt_secret(token) == "pk_clickup_secret_123"


def test_encrypt_is_nondeterministic():
    assert encrypt_secret("same") != encrypt_secret("same")  # Fernet uses a random IV
```

- [ ] **Step 2: Run it — expect ImportError/fail**

Run: `python -m pytest app/tests/test_integration_crypto.py -q`
Expected: FAIL (module `app.integrations.crypto` not found).

- [ ] **Step 3: Implement** `backend/app/integrations/crypto.py`

```python
import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import settings


def _fernet() -> Fernet:
    # Derive a stable 32-byte key from SECRET_KEY. (For key rotation later,
    # store a dedicated INTEGRATION_ENCRYPTION_KEY; SECRET_KEY-derived is fine now.)
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    if plaintext is None:
        return None
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(token: str) -> str:
    if not token:
        return token
    return _fernet().decrypt(token.encode()).decode()
```

> If `from app.core.config import settings` is not the correct import (verify the app's settings singleton path, e.g. `app.core.config.get_settings()`), adjust to match. Confirm `settings.SECRET_KEY` exists (it is required by docker-compose env).

- [ ] **Step 4: Run tests — expect PASS**

Run: `python -m pytest app/tests/test_integration_crypto.py -q`
Expected: PASS (2 passed). If `cryptography` is missing, `pip install cryptography` and add it to `requirements.txt`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/integrations/__init__.py backend/app/integrations/crypto.py backend/app/tests/test_integration_crypto.py
git commit -m "feat(ws3): Fernet credential encryption helper"
```

---

## Task 3: ClickUp client

**Files:**
- Create: `backend/app/integrations/clickup_client.py`
- Test: `backend/app/tests/test_integration_clients.py`

**Interfaces:**
- Produces: `class ClickUpClient(token: str, http: httpx.AsyncClient | None = None)` with async methods `create_task(list_id, name, description, status, assignee_ids, due_ms) -> dict`, `update_task(task_id, status, assignee_ids, due_ms) -> dict`, `resolve_member_id(email) -> int | None`, `ensure_list(space_id, name) -> str`. `create_task`/`update_task` return `{"id": ..., "url": ...}`.

- [ ] **Step 1: Write the failing test** (append to `backend/app/tests/test_integration_clients.py`)

```python
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
```

- [ ] **Step 2: Run — expect fail** — `python -m pytest app/tests/test_integration_clients.py -q` → FAIL (module missing).

- [ ] **Step 3: Implement** `backend/app/integrations/clickup_client.py`

```python
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
```

- [ ] **Step 4: Run — expect PASS** — `python -m pytest app/tests/test_integration_clients.py -q` → 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/integrations/clickup_client.py backend/app/tests/test_integration_clients.py
git commit -m "feat(ws3): ClickUp REST client (mock-tested)"
```

---

## Task 4: Cliq client

**Files:**
- Create: `backend/app/integrations/cliq_client.py`
- Test: append to `backend/app/tests/test_integration_clients.py`

**Interfaces:**
- Produces: `class CliqClient(webhook_url: str, http: httpx.AsyncClient | None = None)` with `async post_message(text: str) -> bool`.

- [ ] **Step 1: Failing test** (append)

```python
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
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement** `backend/app/integrations/cliq_client.py`

```python
import httpx


class CliqClient:
    def __init__(self, webhook_url: str, http: httpx.AsyncClient | None = None):
        self._url = webhook_url
        self._http = http or httpx.AsyncClient(timeout=15)

    async def post_message(self, text: str) -> bool:
        r = await self._http.post(self._url, json={"text": text})
        r.raise_for_status()
        return True
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add backend/app/integrations/cliq_client.py backend/app/tests/test_integration_clients.py
git commit -m "feat(ws3): Cliq incoming-webhook client (mock-tested)"
```

---

## Task 5: Event emitter

**Files:**
- Create: `backend/app/integrations/events.py`
- Test: `backend/app/tests/test_integration_events.py`

**Interfaces:**
- Consumes: models from Task 1.
- Produces: `async emit_integration_event(db, tenant_id, entity_type, entity_id, action, snapshot: dict) -> int` (returns number of outbox rows created; one per enabled connection).

- [ ] **Step 1: Failing test** `backend/app/tests/test_integration_events.py`

```python
import pytest
from sqlalchemy import select

from app.integrations.events import emit_integration_event
from app.models.integration import IntegrationConnection, IntegrationOutbox


@pytest.mark.asyncio
async def test_emit_creates_outbox_row_per_enabled_connection(db_session, test_user):
    tid = test_user.tenantId
    db_session.add(IntegrationConnection(tenantId=tid, provider="clickup", is_enabled=True, status="ok"))
    db_session.add(IntegrationConnection(tenantId=tid, provider="cliq", is_enabled=True, status="ok"))
    db_session.add(IntegrationConnection(tenantId=tid, provider="clickup", is_enabled=False, status="ok"))  # disabled dup ignored
    await db_session.commit()

    n = await emit_integration_event(
        db_session, tid, "work_order", 42, "assigned",
        {"ref": "WO-42", "title": "Build", "status": "in_progress", "assignee_email": "a@x.com"},
    )
    await db_session.commit()
    assert n == 2
    rows = (await db_session.execute(select(IntegrationOutbox).where(IntegrationOutbox.entity_id == 42))).scalars().all()
    assert {r.provider for r in rows} == {"clickup", "cliq"}
    assert all(r.status == "pending" for r in rows)


@pytest.mark.asyncio
async def test_emit_noop_when_no_connections(db_session, test_user):
    n = await emit_integration_event(db_session, test_user.tenantId, "capa", 1, "status_change", {"ref": "CAPA-1"})
    assert n == 0
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement** `backend/app/integrations/events.py`

```python
import logging

from sqlalchemy import select

from app.models.integration import IntegrationConnection, IntegrationOutbox

logger = logging.getLogger(__name__)


async def emit_integration_event(db, tenant_id, entity_type, entity_id, action, snapshot):
    """Enqueue outbox rows (one per enabled connection). Never calls external APIs."""
    result = await db.execute(
        select(IntegrationConnection).where(
            IntegrationConnection.tenantId == tenant_id,
            IntegrationConnection.is_enabled.is_(True),
        )
    )
    created = 0
    for conn in result.scalars().all():
        # respect per-tenant enabled entity types (default: all enabled)
        enabled_types = (conn.config or {}).get("enabled_entity_types")
        if enabled_types and entity_type not in enabled_types:
            continue
        db.add(IntegrationOutbox(
            tenantId=tenant_id, provider=conn.provider, entity_type=entity_type,
            entity_id=entity_id, action=action, payload=snapshot or {}, status="pending",
        ))
        created += 1
    return created
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add backend/app/integrations/events.py backend/app/tests/test_integration_events.py
git commit -m "feat(ws3): integration event emitter -> outbox"
```

---

## Task 6: Delivery worker

**Files:**
- Create: `backend/app/integrations/worker.py`
- Test: `backend/app/tests/test_integration_worker.py`

**Interfaces:**
- Consumes: `IntegrationConnection`, `IntegrationOutbox`, `IntegrationExternalLink`; `ClickUpClient`, `CliqClient`; `decrypt_secret`.
- Produces: `async deliver_pending(db, clients: dict | None = None, limit: int = 20, max_attempts: int = 5) -> dict` returning `{"sent": n, "failed": n, "dead": n}`. `clients` lets tests inject `{"clickup": ClickUpClient(...), "cliq": CliqClient(...)}`; in prod it builds them from the connection's decrypted `auth`/`config`.

- [ ] **Step 1: Failing tests** `backend/app/tests/test_integration_worker.py`

```python
import httpx
import pytest
from sqlalchemy import select

from app.integrations.clickup_client import ClickUpClient
from app.integrations.cliq_client import CliqClient
from app.integrations.worker import deliver_pending
from app.models.integration import (
    IntegrationConnection, IntegrationExternalLink, IntegrationOutbox,
)


async def _seed_conns(db, tid):
    db.add(IntegrationConnection(tenantId=tid, provider="clickup", is_enabled=True, status="ok",
                                 config={"space_id": "sp1"}))
    db.add(IntegrationConnection(tenantId=tid, provider="cliq", is_enabled=True, status="ok",
                                 config={"default_channel": "eng"}))
    await db.commit()


def _clickup(handler):
    return ClickUpClient("tok", http=httpx.AsyncClient(transport=httpx.MockTransport(handler),
                                                        base_url="https://api.clickup.com"))


def _cliq(handler):
    return CliqClient("https://cliq/x", http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


@pytest.mark.asyncio
async def test_clickup_creates_then_reuses_external_link(db_session, test_user):
    tid = test_user.tenantId
    await _seed_conns(db_session, tid)
    calls = []

    def cu(request):
        calls.append((request.method, str(request.url)))
        if request.url.path.endswith("/space/sp1/list"):
            return httpx.Response(200, json={"lists": [{"name": "BBOM · Work Orders", "id": "L1"}]})
        if request.url.path.endswith("/team"):
            return httpx.Response(200, json={"teams": [{"members": [{"user": {"id": 7, "email": "a@x.com"}}]}]})
        if request.method == "POST":
            return httpx.Response(200, json={"id": "T100", "url": "u"})
        return httpx.Response(200, json={"id": "T100", "url": "u"})

    def cq(request):
        return httpx.Response(200, json={"ok": True})

    clients = {"clickup": _clickup(cu), "cliq": _cliq(cq)}

    # first delivery -> create
    db_session.add(IntegrationOutbox(tenantId=tid, provider="clickup", entity_type="work_order",
                                     entity_id=42, action="assigned",
                                     payload={"ref": "WO-42", "title": "Build", "status": "in_progress",
                                              "assignee_email": "a@x.com"}, status="pending"))
    await db_session.commit()
    res = await deliver_pending(db_session, clients=clients)
    assert res["sent"] == 1
    link = (await db_session.execute(select(IntegrationExternalLink).where(
        IntegrationExternalLink.entity_id == 42))).scalar_one()
    assert link.external_id == "T100"

    # second delivery for same entity -> update (PUT), not a new create
    db_session.add(IntegrationOutbox(tenantId=tid, provider="clickup", entity_type="work_order",
                                     entity_id=42, action="status_change",
                                     payload={"ref": "WO-42", "status": "closed"}, status="pending"))
    await db_session.commit()
    calls.clear()
    res2 = await deliver_pending(db_session, clients=clients)
    assert res2["sent"] == 1
    assert any(m == "PUT" and "/task/T100" in u for m, u in calls)


@pytest.mark.asyncio
async def test_failure_retries_then_dead_letters(db_session, test_user):
    tid = test_user.tenantId
    await _seed_conns(db_session, tid)

    def cq(request):
        return httpx.Response(500, json={"error": "boom"})

    clients = {"clickup": _clickup(lambda r: httpx.Response(200, json={"id": "x", "url": "u"})),
               "cliq": _cliq(cq)}
    ob = IntegrationOutbox(tenantId=tid, provider="cliq", entity_type="capa", entity_id=1,
                           action="assigned", payload={"ref": "CAPA-1"}, status="pending")
    db_session.add(ob)
    await db_session.commit()

    # exhaust attempts (max_attempts=2 for the test); each call re-processes the same row
    for _ in range(2):
        # clear next_attempt gate for the test
        ob.next_attempt_at = None
        await db_session.commit()
        await deliver_pending(db_session, clients=clients, max_attempts=2)
    await db_session.refresh(ob)
    assert ob.status == "dead"
    assert ob.attempts >= 2
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement** `backend/app/integrations/worker.py`

```python
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.integrations.cliq_client import CliqClient
from app.integrations.clickup_client import ClickUpClient
from app.integrations.crypto import decrypt_secret
from app.models.integration import (
    IntegrationConnection, IntegrationExternalLink, IntegrationOutbox,
)

logger = logging.getLogger(__name__)

_LIST_NAMES = {
    "work_order": "BBOM · Work Orders", "capa": "BBOM · CAPAs", "eco": "BBOM · ECOs",
    "ecr": "BBOM · ECRs", "ncr": "BBOM · NCRs", "approval": "BBOM · Approvals",
    "purchase_order": "BBOM · Purchase Orders",
}


async def _connection(db, tenant_id, provider):
    r = await db.execute(select(IntegrationConnection).where(
        IntegrationConnection.tenantId == tenant_id,
        IntegrationConnection.provider == provider,
        IntegrationConnection.is_enabled.is_(True)))
    return r.scalar_one_or_none()


def _build_client(conn, provider):
    if provider == "clickup":
        return ClickUpClient(decrypt_secret(conn.auth) if conn.auth else "")
    return CliqClient(decrypt_secret(conn.auth) if conn.auth else "")


async def _deliver_clickup(db, conn, row, client):
    p = row.payload or {}
    link = (await db.execute(select(IntegrationExternalLink).where(
        IntegrationExternalLink.tenantId == row.tenantId,
        IntegrationExternalLink.provider == "clickup",
        IntegrationExternalLink.entity_type == row.entity_type,
        IntegrationExternalLink.entity_id == row.entity_id))).scalar_one_or_none()
    assignee_ids = None
    if p.get("assignee_email"):
        mid = await client.resolve_member_id(p["assignee_email"])
        assignee_ids = [mid] if mid else None
    if link:
        await client.update_task(link.external_id, status=p.get("status"), assignee_ids=assignee_ids, due_ms=None)
    else:
        space_id = (conn.config or {}).get("space_id")
        list_id = await client.ensure_list(space_id, _LIST_NAMES.get(row.entity_type, "BBOM · Work"))
        res = await client.create_task(list_id, name=p.get("ref") or f"{row.entity_type}-{row.entity_id}",
                                       description=p.get("title"), status=p.get("status"),
                                       assignee_ids=assignee_ids, due_ms=None)
        db.add(IntegrationExternalLink(tenantId=row.tenantId, provider="clickup",
                                       entity_type=row.entity_type, entity_id=row.entity_id,
                                       external_id=res["id"], external_url=res.get("url")))


async def _deliver_cliq(db, conn, row, client):
    p = row.payload or {}
    who = p.get("assignee_email") or p.get("team") or "unassigned"
    text = f"[{p.get('ref', row.entity_type)}] {row.action.replace('_', ' ')} — {p.get('status', '')} · {who}"
    await client.post_message(text.strip())


async def deliver_pending(db, clients=None, limit=20, max_attempts=5):
    now = datetime.now(UTC)
    q = select(IntegrationOutbox).where(IntegrationOutbox.status == "pending").limit(limit)
    rows = (await db.execute(q)).scalars().all()
    counts = {"sent": 0, "failed": 0, "dead": 0}
    for row in rows:
        if row.next_attempt_at is not None:
            na = row.next_attempt_at
            if na.tzinfo is None:
                na = na.replace(tzinfo=UTC)
            if na > now:
                continue
        try:
            if clients and row.provider in clients:
                client = clients[row.provider]
            else:
                conn0 = await _connection(db, row.tenantId, row.provider)
                if conn0 is None:
                    row.status = "dead"; row.last_error = "no enabled connection"; counts["dead"] += 1
                    continue
                client = _build_client(conn0, row.provider)
            conn = await _connection(db, row.tenantId, row.provider)
            if row.provider == "clickup":
                await _deliver_clickup(db, conn, row, client)
            else:
                await _deliver_cliq(db, conn, row, client)
            row.status = "sent"; counts["sent"] += 1
        except Exception as e:  # noqa: BLE001
            row.attempts = (row.attempts or 0) + 1
            row.last_error = str(e)[:500]
            if row.attempts >= max_attempts:
                row.status = "dead"; counts["dead"] += 1
            else:
                row.status = "pending"
                row.next_attempt_at = now + timedelta(seconds=2 ** row.attempts)
                counts["failed"] += 1
    await db.commit()
    return counts
```

- [ ] **Step 4: Run — expect PASS** — `python -m pytest app/tests/test_integration_worker.py -q` → 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/integrations/worker.py backend/app/tests/test_integration_worker.py
git commit -m "feat(ws3): outbox delivery worker (create/update, idempotent, retry+dead-letter)"
```

---

## Task 7: Integrations admin API

**Files:**
- Create: `backend/app/api/endpoints/integrations.py`
- Modify: `backend/app/api/endpoints/__init__.py`, `backend/app/api/api_v1.py`
- Test: `backend/app/tests/test_integrations_api.py`

**Interfaces:**
- Produces routes under `/api/v1/integrations`: `GET /` (list connections + status), `PUT /{provider}` (upsert credentials + config + enable), `DELETE /{provider}`, `POST /{provider}/test` (send-test via a synthetic outbox row + immediate `deliver_pending`), `GET /deliveries` (recent outbox rows for health).

- [ ] **Step 1: Failing test** `backend/app/tests/test_integrations_api.py`

```python
import pytest


@pytest.mark.asyncio
async def test_connect_and_list(client, auth_headers):
    r = await client.put("/api/v1/integrations/clickup", headers=auth_headers,
                         json={"token": "pk_123", "config": {"space_id": "sp1"}, "is_enabled": True})
    assert r.status_code == 200, r.text

    lst = await client.get("/api/v1/integrations/", headers=auth_headers)
    assert lst.status_code == 200
    conns = {c["provider"]: c for c in lst.json()}
    assert conns["clickup"]["is_enabled"] is True
    assert "token" not in str(conns["clickup"])  # secret never returned


@pytest.mark.asyncio
async def test_requires_auth(client):
    r = await client.get("/api/v1/integrations/")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_deliveries_endpoint(client, auth_headers):
    r = await client.get("/api/v1/integrations/deliveries", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement** `backend/app/api/endpoints/integrations.py`

```python
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.integrations.crypto import encrypt_secret
from app.integrations.events import emit_integration_event
from app.integrations.worker import deliver_pending
from app.models.integration import IntegrationConnection, IntegrationOutbox
from app.models.user import User

router = APIRouter()

_PROVIDERS = {"clickup", "cliq"}


class ConnectionUpsert(BaseModel):
    token: Optional[str] = None       # clickup token OR cliq webhook url
    config: Optional[dict] = None
    is_enabled: Optional[bool] = None


def _public(c: IntegrationConnection) -> dict:
    return {
        "provider": c.provider,
        "is_enabled": bool(c.is_enabled),
        "status": c.status,
        "last_error": c.last_error,
        "has_credentials": bool(c.auth),
        "config": c.config or {},
    }


@router.get("/")
async def list_connections(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(IntegrationConnection).where(
        IntegrationConnection.tenantId == user.tenantId))).scalars().all()
    return [_public(c) for c in rows]


@router.put("/{provider}")
async def upsert_connection(provider: str, body: ConnectionUpsert,
                            db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if provider not in _PROVIDERS:
        raise HTTPException(422, "unknown provider")
    row = (await db.execute(select(IntegrationConnection).where(
        IntegrationConnection.tenantId == user.tenantId,
        IntegrationConnection.provider == provider))).scalar_one_or_none()
    if row is None:
        row = IntegrationConnection(tenantId=user.tenantId, provider=provider)
        db.add(row)
    if body.token is not None:
        row.auth = encrypt_secret(body.token)
    if body.config is not None:
        row.config = body.config
    if body.is_enabled is not None:
        row.is_enabled = body.is_enabled
    row.status = "ok" if row.auth else "unconfigured"
    await db.commit()
    return _public(row)


@router.delete("/{provider}")
async def disconnect(provider: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = (await db.execute(select(IntegrationConnection).where(
        IntegrationConnection.tenantId == user.tenantId,
        IntegrationConnection.provider == provider))).scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()
    return {"status": "disconnected"}


@router.post("/{provider}/test")
async def send_test(provider: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if provider not in _PROVIDERS:
        raise HTTPException(422, "unknown provider")
    n = await emit_integration_event(db, user.tenantId, "work_order", 0, "test",
                                     {"ref": "TEST", "title": "Connection test", "status": "open"})
    await db.commit()
    result = await deliver_pending(db, limit=5)
    return {"enqueued": n, "delivery": result}


@router.get("/deliveries")
async def deliveries(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(IntegrationOutbox).where(
        IntegrationOutbox.tenantId == user.tenantId).order_by(
        IntegrationOutbox.id.desc()).limit(50))).scalars().all()
    return [{"id": r.id, "provider": r.provider, "entity_type": r.entity_type,
             "entity_id": r.entity_id, "action": r.action, "status": r.status,
             "attempts": r.attempts, "last_error": r.last_error} for r in rows]
```

- [ ] **Step 4: Register the router** — add `integrations,` to the import tuple in `backend/app/api/endpoints/__init__.py`, and in `backend/app/api/api_v1.py` after the teams/work registration:

```python
api_router.include_router(endpoints.integrations.router, prefix="/integrations", tags=["integrations"])
```

- [ ] **Step 5: Run — expect PASS** — `python -m pytest app/tests/test_integrations_api.py -q` → 3 passed.
  > Note: `send_test` with no live creds will record a `dead`/`failed` delivery (no reachable ClickUp/Cliq) — that's expected; the test above only checks connect/list/deliveries. Add a mock-injected send-test assertion only if you refactor the endpoint to accept injected clients.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/endpoints/integrations.py backend/app/api/endpoints/__init__.py backend/app/api/api_v1.py backend/app/tests/test_integrations_api.py
git commit -m "feat(ws3): integrations admin API (connect/config/test/deliveries)"
```

---

## Task 8: Wire emission into domain mutations

**Files:**
- Modify: `backend/app/api/endpoints/work_queue.py` (the `/work/assign` handler from WS2)
- Modify: the status/lifecycle handlers for WorkOrder, CAPA, ECO/ECR, NCR, PO (locate via their endpoint modules: `work_order_api.py`, `capa.py`, `eco_api.py`, `quality_api.py`, `po_order.py`/`procurement.py`)
- Test: `backend/app/tests/test_integration_events.py` (add end-to-end via `/work/assign`)

**Interfaces:**
- Consumes: `emit_integration_event` (Task 5). Each call passes a `snapshot` dict with keys used by the worker: `ref`, `title`, `status`, `assignee_email`, `team`, `due_date`, `url`.

- [ ] **Step 1: Add a snapshot helper** at the top of `work_queue.py` (after imports):

```python
from app.integrations.events import emit_integration_event


async def _emit_assign(db, user, item_type, item, assignee_email=None, team=None):
    await emit_integration_event(
        db, user.tenantId, item_type, item.id, "assigned",
        {
            "ref": getattr(item, "wo_number", None) or getattr(item, "capa_number", None) or f"{item_type}-{item.id}",
            "status": getattr(item, "status", None),
            "assignee_email": assignee_email,
            "team": team,
        },
    )
```

- [ ] **Step 2: Call it in `assign_work`** — in `work_queue.py`'s `assign_work`, after `item.assigned_to = ...; item.assigned_team_id = ...` and BEFORE `await db.commit()`, resolve the assignee email and emit:

```python
    assignee_email = None
    if body.assigned_to:
        u = await db.get(User, body.assigned_to)
        assignee_email = u.email if u else None
    team_label = None
    if body.assigned_team_id:
        from app.models.team import Team
        t = await db.get(Team, body.assigned_team_id)
        team_label = t.name if t else None
    await _emit_assign(db, user, body.item_type, item, assignee_email, team_label)
```

(The single `await db.commit()` already present persists both the assignment and the outbox rows atomically.)

- [ ] **Step 3: Failing/there-through test** — append to `test_integration_events.py`:

```python
@pytest.mark.asyncio
async def test_work_assign_emits_outbox(client, auth_headers, db_session, test_user):
    from app.models.integration import IntegrationConnection, IntegrationOutbox
    from app.models.work_order import WorkOrder
    from sqlalchemy import select

    db_session.add(IntegrationConnection(tenantId=test_user.tenantId, provider="cliq",
                                         is_enabled=True, status="ok"))
    db_session.add(WorkOrder(wo_number="WO-9", quantity_ordered=1, status="draft",
                             priority="normal", tenantId=test_user.tenantId))
    await db_session.commit()
    wo = (await db_session.execute(select(WorkOrder).where(WorkOrder.wo_number == "WO-9"))).scalar_one()

    r = await client.post("/api/v1/work/assign", headers=auth_headers,
                          json={"item_type": "work_order", "item_id": wo.id, "assigned_to": test_user.id})
    assert r.status_code == 200, r.text
    rows = (await db_session.execute(select(IntegrationOutbox).where(
        IntegrationOutbox.entity_id == wo.id))).scalars().all()
    assert any(x.provider == "cliq" and x.action == "assigned" for x in rows)
```

- [ ] **Step 4: Run — expect PASS** — `python -m pytest app/tests/test_integration_events.py -q`.

- [ ] **Step 5: Repeat the emit pattern** for the remaining status/lifecycle handlers (WorkOrder status update, CAPA status, ECO approve, NCR open/disposition, PO status). For each: locate the handler that mutates `status`, and before its `commit`, call `emit_integration_event(db, user.tenantId, "<entity_type>", item.id, "status_change", {"ref": ..., "status": item.status})`. Keep the entity_type strings consistent with `_LIST_NAMES` in `worker.py` (`work_order`, `capa`, `eco`, `ecr`, `ncr`, `approval`, `purchase_order`).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/endpoints/work_queue.py backend/app/tests/test_integration_events.py
git commit -m "feat(ws3): emit integration events on assignment + status changes"
```

---

## Task 9: Frontend Integrations screen

**Files:**
- Create: `frontend/src/components/screens/IntegrationsScreen.jsx`
- Modify: `frontend/src/components/LazyScreens.jsx`, `frontend/src/screens/App.jsx`, `frontend/src/components/NavRail.jsx`

**Interfaces:**
- Consumes: `apiRequest` from `../../../api.js`; endpoints from Task 7.
- Produces: `window.IntegrationsScreen` (self-registering), lazy export `IntegrationsScreen`, route `/integrations`, nav item in the System group.

- [ ] **Step 1: Create the screen** (mirror the `WorkQueueScreen.jsx` pattern) `frontend/src/components/screens/IntegrationsScreen.jsx`

```jsx
import React from "react";
import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { apiRequest } from "../../../api.js";

const PROVIDERS = [
  { id: "clickup", name: "ClickUp", credLabel: "API token", cfgLabel: "Space ID", cfgKey: "space_id" },
  { id: "cliq", name: "Zoho Cliq", credLabel: "Incoming webhook URL", cfgLabel: "Default channel", cfgKey: "default_channel" },
];

export default function IntegrationsScreen() {
  const [conns, setConns] = React.useState({});
  const [deliveries, setDeliveries] = React.useState([]);
  const [draft, setDraft] = React.useState({});

  const load = React.useCallback(async () => {
    try {
      const list = await apiRequest("/integrations/");
      const map = {};
      (list || []).forEach((c) => (map[c.provider] = c));
      setConns(map);
      setDeliveries((await apiRequest("/integrations/deliveries")) || []);
    } catch (e) {
      toast("Could not load integrations: " + (e.message || ""), { kind: "error" });
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const save = async (p) => {
    const d = draft[p.id] || {};
    try {
      await apiRequest(`/integrations/${p.id}`, {
        method: "PUT",
        body: JSON.stringify({
          token: d.token || undefined,
          config: d.cfg != null ? { [p.cfgKey]: d.cfg } : undefined,
          is_enabled: true,
        }),
      });
      toast(`${p.name} connected`, { kind: "success" });
      load();
    } catch (e) {
      toast("Save failed: " + (e.message || ""), { kind: "error" });
    }
  };

  const test = async (p) => {
    try {
      const r = await apiRequest(`/integrations/${p.id}/test`, { method: "POST" });
      toast(`Test: ${JSON.stringify(r.delivery)}`, { kind: "info" });
      load();
    } catch (e) {
      toast("Test failed: " + (e.message || ""), { kind: "error" });
    }
  };

  return (
    <div className="screen-wrap" style={{ maxWidth: 820 }}>
      <div className="screen-header">
        <div>
          <h1>{__t("integrations.title") || "Integrations"}</h1>
          <div className="sub">Connect ClickUp + Zoho Cliq to mirror work and post notifications.</div>
        </div>
      </div>

      {PROVIDERS.map((p) => {
        const c = conns[p.id] || {};
        const d = draft[p.id] || {};
        return (
          <div key={p.id} className="card" style={{ padding: 16, marginBottom: 16, border: "1px solid var(--line)", borderRadius: 8 }}>
            <div className="flex gap-8" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>{p.name}</strong>
              <span style={{ fontSize: 11, color: c.is_enabled ? "var(--ok)" : "var(--fg-3)" }}>
                {c.is_enabled ? "Connected" : "Not connected"}{c.status === "error" ? " · error" : ""}
              </span>
            </div>
            <div className="flex gap-8" style={{ marginTop: 10, flexWrap: "wrap" }}>
              <input className="input" placeholder={p.credLabel + (c.has_credentials ? " (set — leave blank to keep)" : "")}
                     style={{ flex: 2, minWidth: 220 }}
                     onChange={(e) => setDraft((s) => ({ ...s, [p.id]: { ...d, token: e.target.value } }))} />
              <input className="input" placeholder={p.cfgLabel}
                     defaultValue={(c.config || {})[p.cfgKey] || ""} style={{ flex: 1, minWidth: 140 }}
                     onChange={(e) => setDraft((s) => ({ ...s, [p.id]: { ...d, cfg: e.target.value } }))} />
              <button className="btn primary" onClick={() => save(p)}>Save</button>
              <button className="btn" onClick={() => test(p)} disabled={!c.is_enabled}>Send test</button>
            </div>
          </div>
        );
      })}

      <h3 style={{ marginTop: 8 }}>Recent deliveries</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ textAlign: "left", color: "var(--fg-3)" }}>
            <th style={{ padding: 6 }}>Provider</th><th style={{ padding: 6 }}>Entity</th>
            <th style={{ padding: 6 }}>Action</th><th style={{ padding: 6 }}>Status</th><th style={{ padding: 6 }}>Error</th>
          </tr></thead>
          <tbody>
            {deliveries.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ padding: 6 }}>{r.provider}</td>
                <td style={{ padding: 6 }}>{r.entity_type}#{r.entity_id}</td>
                <td style={{ padding: 6 }}>{r.action}</td>
                <td style={{ padding: 6 }}>{r.status}</td>
                <td style={{ padding: 6, color: "var(--danger)" }}>{r.last_error || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

IntegrationsScreen.displayName = "IntegrationsScreen";
window.IntegrationsScreen = IntegrationsScreen;
```

- [ ] **Step 2: Add the lazy export** — append to `frontend/src/components/LazyScreens.jsx`:

```javascript
export const IntegrationsScreen = createLazyScreen(function () {
  return import("./screens/IntegrationsScreen.jsx");
}, "IntegrationsScreen");
```

- [ ] **Step 3: Route it** — in `frontend/src/screens/App.jsx`, add `IntegrationsScreen,` to the `LazyScreens` import block, and add a route before the `*` catch-all:

```jsx
            <Route
              path="/integrations"
              element={<GenericScreen Component={IntegrationsScreen} />}
            />
```

- [ ] **Step 4: Nav item** — in `frontend/src/components/NavRail.jsx`, add to the `system` group `items` array:

```jsx
      { id: "integrations", label: "Integrations", icon: <Icon.Link size={18} /> },
```

- [ ] **Step 5: Build to verify** — Run: `npm --prefix frontend run build`
Expected: `✓ built` with no errors; an `IntegrationsScreen` chunk (or it folded into app-shell) appears.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/screens/IntegrationsScreen.jsx frontend/src/components/LazyScreens.jsx frontend/src/screens/App.jsx frontend/src/components/NavRail.jsx
git commit -m "feat(ws3): Integrations settings screen (ClickUp + Cliq)"
```

---

## Task 10: Full suite + docs

- [ ] **Step 1: Run the whole WS3 backend suite**

Run (PowerShell, from `backend/`):
`$env:TEST_DATABASE_URL='sqlite+aiosqlite:///./test_ws3.db'; python -m pytest app/tests/test_integration_crypto.py app/tests/test_integration_clients.py app/tests/test_integration_events.py app/tests/test_integration_worker.py app/tests/test_integrations_api.py -p no:cacheprovider -q`
Expected: all pass.

- [ ] **Step 2: Confirm no regressions in WS1/WS2 suites**

Run: `python -m pytest app/tests/test_solidworks_bom_ingest.py app/tests/test_teams_work_queue.py -p no:cacheprovider -q`
Expected: all pass.

- [ ] **Step 3: Add a live-verification note** to `docs/superpowers/specs/2026-07-11-cliq-clickup-integration-design.md` under "Testing / verification": how to run the live round-trip once ClickUp token + Cliq webhook are provided (connect in the Integrations screen → Send test → assign a work order → confirm task in ClickUp + message in Cliq).

- [ ] **Step 4: Commit**

```bash
git add backend/app/tests docs/superpowers/specs/2026-07-11-cliq-clickup-integration-design.md
git commit -m "test(ws3): full integration suite + live-verification notes"
```

---

## Self-Review

**Spec coverage:** connection model → Task 1/7; encrypted creds → Task 2/7; ClickUp mirror → Task 3/6; Cliq notify → Task 4/6; broad entity events → Task 5/8; async queue+worker w/ retries+idempotency+dead-letter → Task 6; per-entity lists + assignee-by-email + Cliq routing → Task 6; settings UI → Task 9; mock-based verification → Tasks 3–8; migration → Task 1; security (tenant isolation, no secret leakage) → Tasks 5/6/7. All spec sections mapped.

**Placeholder scan:** No TBD/TODO; every code step has complete code. Task 8 Step 5 intentionally generalizes the *same* emit pattern to the remaining handlers (their exact file/line locations must be found at execution time — flagged, not hand-waved).

**Type consistency:** entity_type strings (`work_order`, `capa`, `eco`, `ecr`, `ncr`, `approval`, `purchase_order`) are consistent between `worker._LIST_NAMES`, `events`, and Task 8. Client method names (`create_task`, `update_task`, `resolve_member_id`, `ensure_list`, `post_message`) match between Tasks 3/4 and their use in Task 6. `deliver_pending(db, clients, limit, max_attempts)` signature consistent between Task 6 and Task 7.

**Known execution-time lookups (not gaps):** exact settings import path (Task 2), the precise handler files/lines for WO-status/CAPA/ECO/NCR/PO (Task 8 Step 5), and whether `require_admin` exists for tightening the API (Task 7).
