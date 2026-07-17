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
