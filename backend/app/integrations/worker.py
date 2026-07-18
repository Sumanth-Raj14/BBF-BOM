import hashlib
import json
import logging
import re
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import or_, select

from app.core.tenant_context import TenantContext
from app.db.rls import apply_rls_tenant_context
from app.integrations.cliq_client import CliqClient
from app.integrations.clickup_client import ClickUpClient
from app.integrations.crypto import decrypt_secret
from app.integrations.zoho_client import ZOHO_MODULES, ZohoAuthError, ZohoBooksClient
from app.models.integration import (
    IntegrationConnection, IntegrationExternalLink, IntegrationOutbox,
)

logger = logging.getLogger(__name__)


class ZohoValidationError(Exception):
    """A non-retryable Zoho Books failure raised by the deliver path (e.g. a
    missing local entity or an unsupported entity_type). Classified as terminal
    so it is logged once and never burns retries (spec §4.3)."""

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


async def _connection_exists(db, tenant_id, provider):
    """Is there ANY connection row (enabled or not) for this tenant+provider?
    Distinguishes a *disabled* connection (hold queued rows — the kill switch,
    spec §4.3) from a *truly absent* one (dead-letter)."""
    r = await db.execute(select(IntegrationConnection.id).where(
        IntegrationConnection.tenantId == tenant_id,
        IntegrationConnection.provider == provider))
    return r.first() is not None


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


# --- Zoho Books outbound (tool -> Books) ------------------------------------
# Field mapping per spec §2/§4. Ownership rule on OUTBOUND: push tool-owned
# identity fields always; push Books-owned cost/pricing ONLY on the initial
# create, never on update (an update must not clobber a price the finance team
# adjusted in Books — spec §4.5).

def _num(v):
    """Money -> float for the JSON body; None passes through."""
    return None if v is None else float(v)


def _zoho_item_body(p: dict, *, is_update: bool) -> dict:
    """Part -> Books Item (spec §4.2 field translation)."""
    body: dict = {}
    if p.get("name") is not None:
        body["name"] = p["name"]
    if p.get("pn") is not None:
        body["sku"] = p["pn"]
    if p.get("uom") is not None:
        body["unit"] = p["uom"]
    if p.get("description") is not None:
        body["description"] = p["description"]
    # cost -> purchase_rate/rate: Books-owned on UPDATE, so only on CREATE.
    if not is_update and p.get("cost") is not None:
        body["rate"] = _num(p["cost"])
        body["purchase_rate"] = _num(p["cost"])
    return body


def _zoho_contact_body(p: dict, *, is_update: bool) -> dict:
    """Vendor -> Books Contact(contact_type=vendor). Identity is tool-owned;
    payment_terms/currency/tax are Books-owned and never pushed (spec §4.5)."""
    body: dict = {"contact_type": "vendor"}
    if p.get("name") is not None:
        body["contact_name"] = p["name"]
        body["company_name"] = p["name"]
    if p.get("contactEmail") is not None:
        body["email"] = p["contactEmail"]
    if p.get("contactPhone") is not None:
        body["phone"] = p["contactPhone"]
    if p.get("address"):
        body["billing_address"] = {"address": p["address"]}
    return body


async def _zoho_link(db, tenant_id, entity_type, entity_id):
    return (await db.execute(select(IntegrationExternalLink).where(
        IntegrationExternalLink.tenantId == tenant_id,
        IntegrationExternalLink.provider == "zoho_books",
        IntegrationExternalLink.entity_type == entity_type,
        IntegrationExternalLink.entity_id == entity_id))).scalar_one_or_none()


async def _zoho_po_body(db, conn, row, *, is_update: bool) -> dict:
    """POHeader -> Books Purchase Order. Loads the header + lines from the DB
    (the emitted snapshot is intentionally thin for POs). Resolves the Books
    vendor contact id and per-line item ids from existing links; falls back to
    name-only lines when a Part isn't linked yet (spec §4.2 line ordering)."""
    from app.models.po_models import POHeader, POLineItem

    header = (await db.execute(select(POHeader).where(
        POHeader.id == row.entity_id))).scalar_one_or_none()
    if header is None:
        raise ZohoValidationError(f"purchase_order {row.entity_id} not found")

    body: dict = {}
    if header.vendor_id:
        vlink = await _zoho_link(db, row.tenantId, "vendor", header.vendor_id)
        if vlink:
            body["vendor_id"] = vlink.external_id
    # Only send the number on create, and only when the org is NOT auto-numbering
    # (a supplied number is rejected/diverges otherwise — spec §4.2 §13 fix).
    if not is_update and not (conn.config or {}).get("po_auto_numbering"):
        body["purchaseorder_number"] = header.poNumber

    lines = (await db.execute(select(POLineItem).where(
        POLineItem.headerId == header.id).order_by(POLineItem.id))).scalars().all()
    items = []
    for ln in lines:
        li = {
            "name": ln.itemName or f"line-{ln.id}",
            "quantity": int(ln.quantity or 1),
            "rate": _num(ln.itemPrice) or 0,
        }
        if ln.partId:
            plink = await _zoho_link(db, row.tenantId, "part", ln.partId)
            if plink:
                li["item_id"] = plink.external_id
        items.append(li)
    body["line_items"] = items
    return body


def _canonical_checksum(body: dict) -> str:
    """sha256 over the canonical serialization of the pushed (tool-owned) body
    — the three-way baseline anchor (spec §2 canonicalization)."""
    return hashlib.sha256(
        json.dumps(body, sort_keys=True, default=str).encode()
    ).hexdigest()


def _money_status_diffs(body: dict) -> dict:
    """{field: {old, new}} trail for monetary/status fields on every push
    (spec §2 field_diffs). old is None for the outbound direction — the tool is
    the author of the change."""
    watched = ("rate", "purchase_rate", "status", "poTotal")
    return {k: {"old": None, "new": body[k]} for k in watched if k in body}


async def _upsert_zoho_state(db, row, external_id, event, body):
    from app.models.zoho_sync import ZohoSyncState

    st = (await db.execute(select(ZohoSyncState).where(
        ZohoSyncState.tenantId == row.tenantId,
        ZohoSyncState.entity_type == row.entity_type,
        ZohoSyncState.entity_id == row.entity_id))).scalar_one_or_none()
    if st is None:
        st = ZohoSyncState(tenantId=row.tenantId, entity_type=row.entity_type,
                           entity_id=row.entity_id)
        db.add(st)
    if external_id:
        st.external_id = str(external_id)
    st.last_synced_at = datetime.now(UTC)
    st.last_direction = "outbound"
    st.local_checksum = _canonical_checksum(body)
    st.status = "in_sync"
    st.last_error = None
    # Seed the monetary baseline only from what we actually pushed (create only).
    if event == "push_create" and "purchase_rate" in body:
        st.last_cost = body["purchase_rate"]
    return st


async def _deliver_zoho_books(db, conn, row, client):
    """Push one entity to Zoho Books. Create-vs-update is decided by the
    presence of an IntegrationExternalLink (the primary idempotency key):
    link present -> PUT/update, absent -> POST/create then store the returned
    Zoho id. Idempotent and honest (raises on any Books-side failure)."""
    mod = ZOHO_MODULES.get(row.entity_type)
    if mod is None:
        raise ZohoValidationError(f"unsupported entity_type {row.entity_type}")

    # "test" deliveries + sentinel ids never create a persistent mapping.
    persist_link = row.action != "test" and (row.entity_id or 0) > 0
    link = await _zoho_link(db, row.tenantId, row.entity_type, row.entity_id) if persist_link else None
    is_update = link is not None

    p = row.payload or {}
    if row.entity_type == "part":
        body = _zoho_item_body(p, is_update=is_update)
    elif row.entity_type == "vendor":
        body = _zoho_contact_body(p, is_update=is_update)
    else:  # purchase_order
        body = await _zoho_po_body(db, conn, row, is_update=is_update)

    if is_update:
        await client.update_record(mod["module"], link.external_id, body)
        external_id = link.external_id
        event = "push_update"
    else:
        resp = await client.create_record(mod["module"], body)
        record = resp.get(mod["record"], {}) if isinstance(resp, dict) else {}
        external_id = record.get(mod["id_field"])
        if persist_link and external_id:
            db.add(IntegrationExternalLink(
                tenantId=row.tenantId, provider="zoho_books",
                entity_type=row.entity_type, entity_id=row.entity_id,
                external_id=str(external_id)))
        event = "push_create"

    if persist_link:
        from app.models.zoho_sync import ZohoSyncLog

        await _upsert_zoho_state(db, row, external_id, event, body)
        db.add(ZohoSyncLog(
            tenantId=row.tenantId, entity_type=row.entity_type, entity_id=row.entity_id,
            external_id=str(external_id) if external_id else None, direction="outbound",
            event=event, status="ok", field_diffs=_money_status_diffs(body),
            actor="system-sync"))


def _classify_zoho_failure(e: Exception) -> str:
    """auth | validation | transient — the retry class for a Zoho failure
    (spec §4.3). Only applied to zoho_books rows so ClickUp/Cliq keep today's
    behavior."""
    if isinstance(e, ZohoAuthError):
        return "auth"
    if isinstance(e, ZohoValidationError):
        return "validation"
    if isinstance(e, httpx.HTTPStatusError):
        code = e.response.status_code
        if code in (401, 403):
            return "auth"
        if 400 <= code < 500 and code not in (408, 429):
            return "validation"
        return "transient"
    return "transient"


async def _log_zoho_terminal(db, row, err):
    """Record a non-retryable Zoho push failure to the audit log (spec §4.3)."""
    from app.models.zoho_sync import ZohoSyncLog

    db.add(ZohoSyncLog(
        tenantId=row.tenantId, entity_type=row.entity_type, entity_id=row.entity_id,
        direction="outbound", event="error", status="error", actor="system-sync",
        message=err))


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
        # Establish this row's tenant context so BOTH isolation layers engage:
        # the app-layer auto-filter/insert-stamp (contextvar) and, on Postgres
        # with ENABLE_RLS, the SET LOCAL tenant pin. The shared drainer runs
        # cross-tenant with no request context, so without this every write
        # would be RLS-unsafe (spec §4.0/§10-O — also hardens ClickUp/Cliq).
        ctx = TenantContext.set(row.tenantId)
        try:
            await apply_rls_tenant_context(db, row.tenantId)
            conn = None
            try:
                conn = await _connection(db, row.tenantId, row.provider)
                if clients and row.provider in clients:
                    client = clients[row.provider]
                else:
                    if conn is None:
                        # Kill switch (spec §4.3): a DISABLED connection holds its
                        # queued rows as pending (never flushed, never dead); a
                        # truly ABSENT connection dead-letters.
                        if await _connection_exists(db, row.tenantId, row.provider):
                            row.status = "pending"; row.last_error = "connection disabled"
                            counts["failed"] += 1
                            await db.commit()
                            continue
                        row.status = "dead"; row.last_error = "no enabled connection"
                        counts["dead"] += 1
                        await db.commit()
                        continue
                    client = _build_client(conn, row.provider)
                if row.provider == "clickup":
                    await _deliver_clickup(db, conn, row, client)
                elif row.provider == "zoho_books":
                    await _deliver_zoho_books(db, conn, row, client)
                else:
                    await _deliver_cliq(db, conn, row, client)
                row.status = "sent"; counts["sent"] += 1
                _mark_health(conn, ok=True)
            except Exception as e:  # noqa: BLE001
                err = _sanitize_error(e)
                # Zoho gets honest retry classification; every other provider
                # keeps today's attempts++/backoff/dead-letter behavior.
                if row.provider == "zoho_books":
                    cls = _classify_zoho_failure(e)
                    if cls == "auth":
                        # HOLD: do not consume an attempt; the queue resumes on
                        # reconnect. Surface auth_failed on the connection.
                        row.status = "pending"; row.last_error = err
                        _mark_health(conn, ok=False, error="auth_failed")
                        counts["failed"] += 1
                        await db.commit()
                        continue
                    if cls == "validation":
                        # Non-retryable 4xx: log once, mark error, never retry.
                        row.attempts = (row.attempts or 0) + 1
                        row.status = "error"; row.last_error = err
                        _mark_health(conn, ok=False, error=err)
                        await _log_zoho_terminal(db, row, err)
                        counts["failed"] += 1
                        await db.commit()
                        continue
                # transient (429/5xx/network) OR any non-zoho failure:
                row.attempts = (row.attempts or 0) + 1
                row.last_error = err
                _mark_health(conn, ok=False, error=err)
                if row.attempts >= max_attempts:
                    row.status = "dead"; counts["dead"] += 1
                else:
                    row.status = "pending"
                    row.next_attempt_at = now + timedelta(seconds=2 ** row.attempts)
                    counts["failed"] += 1
            await db.commit()
        finally:
            TenantContext.reset(ctx)
    return counts


async def drain_integration_outbox_once(session_maker=None, limit=50):
    """Drain pending outbox rows using an OWNED async session (never a request-scoped
    dependency). Intended to be called from the background drainer on an interval."""
    if session_maker is None:
        from app.db.session import get_session_maker
        session_maker = await get_session_maker()
    async with session_maker() as db:
        return await deliver_pending(db, limit=limit)
