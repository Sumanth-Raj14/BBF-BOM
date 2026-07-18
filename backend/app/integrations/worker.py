import logging
import re
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import or_, select

from app.integrations.cliq_client import CliqClient
from app.integrations.clickup_client import ClickUpClient
from app.integrations.crypto import decrypt_secret
from app.integrations.zoho_client import ZohoBooksClient
from app.models.integration import (
    IntegrationConnection, IntegrationExternalLink, IntegrationOutbox,
)

logger = logging.getLogger(__name__)

# entity_type -> managed ClickUp list name.
# NOTE: "capa" is emitted by the WS2 work queue for the CapaAction model (see
# app/api/endpoints/work_queue.py). The distinct legacy CAPA model (app/models/capa.py,
# emitted from app/api/endpoints/capa.py) uses "capa_legacy" so the two never collide on
# integration_external_links' unique (tenant, provider, entity_type, entity_id).
# ECR is NOT a standalone entity in this codebase — it is an Approval of type "ecr"
# (see app/models/approval.py ApprovalType.ECR) and is delivered via the "approval" path,
# so there is intentionally no "ecr" list entry here.
_LIST_NAMES = {
    "work_order": "BBOM · Work Orders", "capa": "BBOM · CAPAs",
    "capa_legacy": "BBOM · CAPAs (Legacy)", "eco": "BBOM · ECOs",
    "ncr": "BBOM · NCRs", "approval": "BBOM · Approvals",
    "purchase_order": "BBOM · Purchase Orders",
}

_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)


def _sanitize_error(e: Exception) -> str:
    """Never persist raw secrets/URLs. HTTP errors -> status only; other errors -> redacted."""
    if isinstance(e, httpx.HTTPStatusError):
        return f"HTTP {e.response.status_code}"
    msg = str(e)
    # strip anything after a query-string separator, then redact any remaining URL token
    msg = msg.split("?", 1)[0]
    msg = _URL_RE.sub("[redacted-url]", msg)
    return msg[:500]


def _mark_health(conn, *, ok: bool, error: str | None = None) -> None:
    """Reflect the latest delivery outcome on the connection so the UI health pill is real."""
    if conn is None:
        return
    conn.last_checked_at = datetime.now(UTC)
    if ok:
        conn.status = "ok"
        conn.last_error = None
    else:
        conn.status = "error"
        conn.last_error = error


async def _connection(db, tenant_id, provider):
    r = await db.execute(select(IntegrationConnection).where(
        IntegrationConnection.tenantId == tenant_id,
        IntegrationConnection.provider == provider,
        IntegrationConnection.is_enabled.is_(True)))
    return r.scalar_one_or_none()


def _build_client(conn, provider):
    if provider == "clickup":
        return ClickUpClient(decrypt_secret(conn.auth) if conn.auth else "")
    if provider == "zoho_books":
        # Decrypts the OAuth blob + reads region/api_domain/org from config.
        # Used by the /integrations test-connection dispatch; the outbound
        # deliver path for zoho_books lands in the next increment.
        return ZohoBooksClient.from_connection(conn)
    return CliqClient(decrypt_secret(conn.auth) if conn.auth else "")


async def _deliver_clickup(db, conn, row, client):
    p = row.payload or {}
    # "test" deliveries and sentinel (non-positive) entity ids must not create a
    # persistent external link — they are one-shot and have no real entity behind them.
    persist_link = row.action != "test" and (row.entity_id or 0) > 0
    link = None
    if persist_link:
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
        space_id = (conn.config or {}).get("space_id") if conn else None
        list_id = await client.ensure_list(space_id, _LIST_NAMES.get(row.entity_type, "BBOM · Work"))
        res = await client.create_task(list_id, name=p.get("ref") or f"{row.entity_type}-{row.entity_id}",
                                       description=p.get("title"), status=p.get("status"),
                                       assignee_ids=assignee_ids, due_ms=None)
        if persist_link:
            db.add(IntegrationExternalLink(tenantId=row.tenantId, provider="clickup",
                                           entity_type=row.entity_type, entity_id=row.entity_id,
                                           external_id=res["id"], external_url=res.get("url")))


async def _deliver_cliq(db, conn, row, client):
    p = row.payload or {}
    who = p.get("assignee_email") or p.get("team") or "unassigned"
    text = f"[{p.get('ref', row.entity_type)}] {row.action.replace('_', ' ')} — {p.get('status', '')} · {who}"
    await client.post_message(text.strip())


async def deliver_pending(db, clients=None, limit=20, max_attempts=5, tenant_id=None):
    now = datetime.now(UTC)
    q = select(IntegrationOutbox).where(IntegrationOutbox.status == "pending")
    if tenant_id is not None:
        q = q.where(IntegrationOutbox.tenantId == tenant_id)
    # Exclude future-gated (backoff) rows in SQL so the limit reflects deliverable work,
    # and process oldest-first for fair ordering.
    q = q.where(or_(IntegrationOutbox.next_attempt_at.is_(None),
                    IntegrationOutbox.next_attempt_at <= now))
    q = q.order_by(IntegrationOutbox.id).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    counts = {"sent": 0, "failed": 0, "dead": 0}
    for row in rows:
        conn = None
        try:
            conn = await _connection(db, row.tenantId, row.provider)
            if clients and row.provider in clients:
                client = clients[row.provider]
            else:
                if conn is None:
                    row.status = "dead"; row.last_error = "no enabled connection"; counts["dead"] += 1
                    continue
                client = _build_client(conn, row.provider)
            if row.provider == "clickup":
                await _deliver_clickup(db, conn, row, client)
            else:
                await _deliver_cliq(db, conn, row, client)
            row.status = "sent"; counts["sent"] += 1
            _mark_health(conn, ok=True)
        except Exception as e:  # noqa: BLE001
            row.attempts = (row.attempts or 0) + 1
            err = _sanitize_error(e)
            row.last_error = err
            _mark_health(conn, ok=False, error=err)
            if row.attempts >= max_attempts:
                row.status = "dead"; counts["dead"] += 1
            else:
                row.status = "pending"
                row.next_attempt_at = now + timedelta(seconds=2 ** row.attempts)
                counts["failed"] += 1
    await db.commit()
    return counts


async def drain_integration_outbox_once(session_maker=None, limit=50):
    """Drain pending outbox rows using an OWNED async session (never a request-scoped
    dependency). Intended to be called from the background drainer on an interval."""
    if session_maker is None:
        from app.db.session import get_session_maker
        session_maker = await get_session_maker()
    async with session_maker() as db:
        return await deliver_pending(db, limit=limit)
