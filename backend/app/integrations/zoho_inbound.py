"""Zoho Books INBOUND sync (Books -> tool) + conflict engine + reconciliation
(spec §4.4/§4.5/§4.6 — increment 2b).

Three responsibilities, all running INSIDE a per-tenant context (the poller is
tenant-less like the outbox drainer, so every unit of work re-establishes
`TenantContext.set` + `apply_rls_tenant_context` before touching tenant data —
spec §4.0):

  1. Incremental poll — `GET /{module}` sorted ascending by `last_modified_time`,
     filtered inclusively (>=) from the per-entity `ZohoSyncCursor` high-water,
     paged, with idempotent per-record application. Local rows are resolved ONLY
     via `IntegrationExternalLink`; an unmapped Books record is logged `skipped`
     and never auto-created (spec §4.4).

  2. Conflict resolution — a three-way compare (baseline = `ZohoSyncState`
     last_cost/last_price, vs current local, vs incoming Books) using a canonical
     Decimal + epsilon money compare (never float ==). CONFIRMED field-ownership
     policy:
       * TOOL owns identity (pn/sku, name, description, uom) + vendor identity:
         Books changes are IGNORED inbound (tool wins) — never overwrite local.
       * BOOKS owns money (purchase_rate->cost, rate->selling price): applied
         inbound (Books wins) when only Books changed since the baseline.
       * TRUE monetary conflict (Books-owned money changed AND local also changed
         since baseline): NOT silently overwritten — a `ZohoSyncLog`
         status='conflict' review row is written and local is left UNCHANGED
         pending manual resolution.

  3. Initial-link reconciliation — match local rows to Books records by natural
     key (SKU/name/number); create `IntegrationExternalLink` for UNIQUE 1:1
     matches only (seeding the baseline); ambiguous / duplicate-key / empty-key
     matches go to a review log and are never auto-linked. Never POSTs to Books
     (no duplicate creation).
"""

import logging
from collections import Counter
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import delete, select

from app.core.tenant_context import TenantContext
from app.db.rls import apply_rls_tenant_context
from app.integrations.worker import _sanitize_error
from app.integrations.zoho_client import ZOHO_MODULES, ZohoBooksClient
from app.models.integration import IntegrationConnection, IntegrationExternalLink
from app.models.part import Part
from app.models.po_models import POHeader
from app.models.vendor import Vendor
from app.models.zoho_sync import ZohoSyncCursor, ZohoSyncLog, ZohoSyncState

logger = logging.getLogger(__name__)

PROVIDER = "zoho_books"
_ENTITY_TYPES = ("part", "vendor", "purchase_order")
_PER_PAGE = 200
_MAX_PAGES = 100  # hard stop so a runaway/never-terminating page_context can't loop forever

# Money equality tolerance — Zoho rounds server-side, so a strict compare would
# fabricate conflicts. 1e-4 matches the Numeric(18,4) scale (spec §2).
_MONEY_EPSILON = Decimal("0.0001")
_MONEY_QUANT = Decimal("0.0001")  # canonical fixed 4-dp money serialization (spec §2)

# Books PO status -> a local POHeader.status allowed by ck_po_headers_status.
# Books owns PO status transitions inbound (pull-only, Books wins — spec §4.5).
_PO_STATUS_MAP = {
    "draft": "draft",
    "open": "Open",
    "billed": "closed",
    "closed": "closed",
    "cancelled": "cancelled",
    "canceled": "cancelled",
}


def _now() -> datetime:
    return datetime.now(UTC)


def _to_decimal(v) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _money_eq(a, b, *, eps: Decimal = _MONEY_EPSILON) -> bool:
    """Canonical Decimal + epsilon equality (never float ==). None==None true;
    None vs a value is a real difference."""
    da, dbv = _to_decimal(a), _to_decimal(b)
    if da is None and dbv is None:
        return True
    if da is None or dbv is None:
        return False
    return abs(da - dbv) <= eps


# --- local-row resolution ---------------------------------------------------

async def _local_id_for_external(db, tenant_id, entity_type, external_id):
    if not external_id:
        return None
    r = await db.execute(select(IntegrationExternalLink.entity_id).where(
        IntegrationExternalLink.tenantId == tenant_id,
        IntegrationExternalLink.provider == PROVIDER,
        IntegrationExternalLink.entity_type == entity_type,
        IntegrationExternalLink.external_id == str(external_id)))
    return r.scalar_one_or_none()


async def _link_for_entity(db, tenant_id, entity_type, entity_id):
    r = await db.execute(select(IntegrationExternalLink).where(
        IntegrationExternalLink.tenantId == tenant_id,
        IntegrationExternalLink.provider == PROVIDER,
        IntegrationExternalLink.entity_type == entity_type,
        IntegrationExternalLink.entity_id == entity_id))
    return r.scalar_one_or_none()


async def _load_local(db, entity_type, entity_id):
    model = {"part": Part, "vendor": Vendor, "purchase_order": POHeader}[entity_type]
    r = await db.execute(select(model).where(model.id == entity_id))
    return r.scalar_one_or_none()


async def _get_or_create_state(db, tenant_id, entity_type, entity_id, external_id):
    st = (await db.execute(select(ZohoSyncState).where(
        ZohoSyncState.tenantId == tenant_id,
        ZohoSyncState.entity_type == entity_type,
        ZohoSyncState.entity_id == entity_id))).scalar_one_or_none()
    if st is None:
        st = ZohoSyncState(tenantId=tenant_id, entity_type=entity_type, entity_id=entity_id)
        db.add(st)
    if external_id and not st.external_id:
        st.external_id = str(external_id)
    return st


async def _get_or_create_cursor(db, tenant_id, entity_type):
    cur = (await db.execute(select(ZohoSyncCursor).where(
        ZohoSyncCursor.tenantId == tenant_id,
        ZohoSyncCursor.entity_type == entity_type))).scalar_one_or_none()
    if cur is None:
        cur = ZohoSyncCursor(tenantId=tenant_id, entity_type=entity_type, records_seen=0)
        db.add(cur)
    return cur


# --- per-entity inbound application (field-ownership + three-way conflict) ---

def _three_way_money(*, zoho, base, local):
    """Return one of 'unchanged' | 'apply' | 'conflict' for a Books-owned money
    field, per the CONFIRMED policy. `base` None (no baseline yet) degrades to
    the current local value so an unmatched value defaults to Books-wins rather
    than a false conflict (spec §4.5)."""
    zoho_d = _to_decimal(zoho)
    if zoho_d is None:
        return "unchanged"
    eff_base = base if base is not None else local
    if _money_eq(zoho_d, eff_base):
        return "unchanged"           # Books did not change vs baseline
    if _money_eq(local, eff_base):
        return "apply"               # only Books changed -> Books wins
    return "conflict"                # both changed since baseline


def _apply_part_inbound(part, state, record):
    """Books Item -> local Part. Returns (applied_diffs, conflict_diffs).
    Identity fields are intentionally NOT touched (tool wins)."""
    applied, conflict = {}, {}

    # cost  <- purchase_rate  (baseline: state.last_cost)
    base_c = _to_decimal(state.last_cost)
    local_c = _to_decimal(part.cost)
    outcome = _three_way_money(zoho=record.get("purchase_rate"), base=base_c, local=local_c)
    zoho_c = _to_decimal(record.get("purchase_rate"))
    if outcome == "apply":
        applied["cost"] = {"base": _money_str(base_c), "local": _money_str(local_c),
                           "zoho": _money_str(zoho_c)}
        part.cost = zoho_c
        state.last_cost = zoho_c
    elif outcome == "conflict":
        conflict["cost"] = {"base": _money_str(base_c), "local": _money_str(local_c),
                            "zoho": _money_str(zoho_c)}
    elif base_c is None and zoho_c is not None:
        state.last_cost = local_c  # seed baseline on first sight of an unchanged value

    # selling price  <- rate  ->  Part.customFields.zoho_rate (Part has no price col)
    cf = dict(part.customFields or {})
    base_p = _to_decimal(state.last_price)
    local_p = _to_decimal(cf.get("zoho_rate"))
    outcome = _three_way_money(zoho=record.get("rate"), base=base_p, local=local_p)
    zoho_p = _to_decimal(record.get("rate"))
    if outcome == "apply":
        applied["rate"] = {"base": _money_str(base_p), "local": _money_str(local_p),
                           "zoho": _money_str(zoho_p)}
        cf["zoho_rate"] = _money_str(zoho_p)
        part.customFields = cf
        state.last_price = zoho_p
    elif outcome == "conflict":
        conflict["rate"] = {"base": _money_str(base_p), "local": _money_str(local_p),
                            "zoho": _money_str(zoho_p)}
    elif base_p is None and zoho_p is not None:
        state.last_price = local_p

    return applied, conflict


def _apply_vendor_inbound(vendor, state, record):
    """Books Contact -> local Vendor. Identity is tool-owned (ignored). Books
    owns payment_terms (non-monetary, last-writer Books)."""
    applied = {}
    terms = record.get("payment_terms_label") or record.get("payment_terms")
    if terms is not None:
        terms = str(terms)
        if terms != (vendor.terms or None):
            applied["terms"] = {"old": vendor.terms, "new": terms}
            vendor.terms = terms
    return applied, {}


def _apply_po_inbound(header, state, record):
    """Books Purchase Order -> local POHeader. Pull-only: Books-side status
    transition wins (spec §4.5-E). No two-way money editing in v1."""
    applied = {}
    zstatus = (record.get("status") or "").lower()
    mapped = _PO_STATUS_MAP.get(zstatus)
    if mapped and mapped != header.status:
        applied["status"] = {"old": header.status, "new": mapped}
        header.status = mapped
    return applied, {}


_APPLY = {
    "part": _apply_part_inbound,
    "vendor": _apply_vendor_inbound,
    "purchase_order": _apply_po_inbound,
}


def _s(v):
    return None if v is None else str(v)


def _money_str(v):
    """Canonical fixed-scale (4-dp) money string so a baseline read back from
    Numeric(18,4) and an incoming int/float serialize identically in field_diffs
    (spec §2 canonicalization) — '10', 10.0 and Decimal('10.0000') all -> '10.0000'."""
    d = _to_decimal(v)
    return None if d is None else str(d.quantize(_MONEY_QUANT))


async def _apply_inbound_record(db, conn, entity_type, record):
    """Apply one Books record to its mapped local row. Never auto-creates:
    an unmapped record is logged `skipped` (spec §4.4)."""
    tenant_id = conn.tenantId
    mod = ZOHO_MODULES[entity_type]
    external_id = str(record.get(mod["id_field"]) or "")
    lmt = record.get("last_modified_time")

    local_id = await _local_id_for_external(db, tenant_id, entity_type, external_id)
    if local_id is None:
        db.add(ZohoSyncLog(
            tenantId=tenant_id, entity_type=entity_type, external_id=external_id or None,
            direction="inbound", event="skipped", status="ok", actor="system-sync",
            message="no local mapping (Books-born record, not auto-created)"))
        return "skipped"

    obj = await _load_local(db, entity_type, local_id)
    if obj is None:
        db.add(ZohoSyncLog(
            tenantId=tenant_id, entity_type=entity_type, entity_id=local_id,
            external_id=external_id or None, direction="inbound", event="skipped",
            status="ok", actor="system-sync", message="mapped local entity missing"))
        return "skipped"

    state = await _get_or_create_state(db, tenant_id, entity_type, local_id, external_id)
    applied, conflict = _APPLY[entity_type](obj, state, record)

    state.last_synced_at = _now()
    state.last_direction = "inbound"
    if lmt:
        state.zoho_last_modified_time = lmt

    if conflict:
        # TRUE monetary conflict: leave local UNCHANGED, do NOT advance the
        # baseline (so it re-detects until resolved), queue for manual review.
        state.status = "conflict"
        state.last_error = "monetary conflict pending manual review"
        db.add(ZohoSyncLog(
            tenantId=tenant_id, entity_type=entity_type, entity_id=local_id,
            external_id=external_id or None, direction="inbound",
            event="conflict_detected", status="conflict", field_diffs=conflict,
            actor="system-sync", message="two-sided monetary change"))
    else:
        state.status = "in_sync"
        state.last_error = None

    if applied:
        db.add(ZohoSyncLog(
            tenantId=tenant_id, entity_type=entity_type, entity_id=local_id,
            external_id=external_id or None, direction="inbound", event="pull_update",
            status="ok", field_diffs=applied, actor="system-sync"))

    if conflict:
        return "conflict"
    return "applied" if applied else "in_sync"


# --- incremental poll -------------------------------------------------------

async def poll_entity(db, conn, client, entity_type, *, per_page=_PER_PAGE, max_pages=_MAX_PAGES):
    """Incrementally poll ONE entity type for this connection. Advances the
    high-water cursor only after a full page commits, to the max processed
    `last_modified_time`; combined with the inclusive (>=) filter + per-record
    three-way dedupe, no record is lost or destructively reprocessed
    (spec §4.4 cursor safety)."""
    mod = ZOHO_MODULES[entity_type]
    cursor = await _get_or_create_cursor(db, conn.tenantId, entity_type)
    high_water = cursor.high_water
    max_lmt = high_water
    seen = 0
    page = 1
    try:
        while page <= max_pages:
            params = {
                "sort_column": "last_modified_time",
                "sort_order": "A",
                "per_page": per_page,
                "page": page,
            }
            if high_water:
                params["last_modified_time"] = high_water  # inclusive (>=) anchor
            if entity_type == "vendor":
                params["contact_type"] = "vendor"  # never pull customer contacts

            body = await client.list_records(mod["module"], params=params)
            records = body.get(mod["list"], []) or []
            for rec in records:
                await _apply_inbound_record(db, conn, entity_type, rec)
                seen += 1
                lmt = rec.get("last_modified_time")
                if lmt and (max_lmt is None or lmt > max_lmt):
                    max_lmt = lmt

            cursor.records_seen = (cursor.records_seen or 0) + len(records)
            cursor.high_water = max_lmt
            cursor.last_run_at = _now()
            cursor.last_run_status = "ok"
            cursor.last_error = None
            await db.commit()

            pc = body.get("page_context") or {}
            if not pc.get("has_more_page"):
                break
            page += 1
    except Exception as e:  # noqa: BLE001 — record honest cursor failure, re-raise
        cursor.last_run_status = "error"
        cursor.last_error = _sanitize_error(e)
        cursor.last_run_at = _now()
        await db.commit()
        raise
    return seen


async def poll_connection(db, conn, client, *, entity_types=None):
    """Poll all entity types for ONE connection, inside its tenant context
    (spec §4.0). Returns per-entity processed counts."""
    entity_types = entity_types or _ENTITY_TYPES
    token = TenantContext.set(conn.tenantId)
    try:
        await apply_rls_tenant_context(db, conn.tenantId)
        return {et: await poll_entity(db, conn, client, et) for et in entity_types}
    finally:
        TenantContext.reset(token)


async def _connection_due(db, conn) -> bool:
    """True if this connection's per-tenant `sync_cadence_seconds` (default 300s)
    has elapsed since its most recent cursor run — the scheduler ticks faster than
    the smallest cadence and gates here (spec §4.4 / §10-C)."""
    cadence = int((conn.config or {}).get("sync_cadence_seconds", 300) or 300)
    r = await db.execute(select(ZohoSyncCursor.last_run_at).where(
        ZohoSyncCursor.tenantId == conn.tenantId).order_by(
        ZohoSyncCursor.last_run_at.desc()))
    last = r.scalars().first()
    if last is None:
        return True
    if last.tzinfo is None:
        last = last.replace(tzinfo=UTC)
    return (_now() - last).total_seconds() >= cadence


async def poll_zoho_inbound_once(session_maker=None, *, clients=None, respect_cadence=False):
    """Poll every ENABLED zoho_books connection once (the scheduler entry).

    Runs tenant-less like the outbox drainer and establishes per-tenant context
    per connection (spec §4.0). `clients` (tenantId -> ZohoBooksClient) is a test
    seam; production builds a client per connection from its stored creds.
    `respect_cadence=True` (the scheduler) skips connections polled more recently
    than their `sync_cadence_seconds`.
    """
    if session_maker is None:
        from app.db.session import get_session_maker
        session_maker = await get_session_maker()
    async with session_maker() as db:
        conns = (await db.execute(select(IntegrationConnection).where(
            IntegrationConnection.provider == PROVIDER,
            IntegrationConnection.is_enabled.is_(True)))).scalars().all()
        results = {}
        for conn in conns:
            if respect_cadence and not await _connection_due(db, conn):
                continue
            client = (clients or {}).get(conn.tenantId) or ZohoBooksClient.from_connection(conn)
            try:
                results[conn.tenantId] = await poll_connection(db, conn, client)
            except Exception as e:  # noqa: BLE001 — one tenant's failure never blocks others
                logger.error("zoho inbound poll failed (tenant=%s): %s", conn.tenantId, e)
                results[conn.tenantId] = {"error": _sanitize_error(e)}
        return results


# --- initial-link reconciliation (spec §4.6) --------------------------------

def _recon_key(entity_type, record):
    """Natural key for matching a Books record to a local row."""
    if entity_type == "part":
        return (record.get("sku") or "").strip() or None
    if entity_type == "vendor":
        return (record.get("company_name") or record.get("contact_name") or "").strip() or None
    return (record.get("purchaseorder_number") or "").strip() or None


async def _local_matches(db, tenant_id, entity_type, key):
    """Local row ids whose natural key equals `key` (tenant-scoped)."""
    if entity_type == "part":
        col, model = Part.pn, Part
    elif entity_type == "vendor":
        col, model = Vendor.name, Vendor
    else:
        col, model = POHeader.poNumber, POHeader
    r = await db.execute(select(model.id).where(
        model.tenantId == tenant_id, col == key))
    return list(r.scalars().all())


def _seed_baseline(state, entity_type, obj, record):
    """Seed the three-way baseline from the LOCAL values so the first subsequent
    poll compares cleanly (a differing Books money value then applies Books-wins;
    an equal one stays in_sync). Reconciliation itself never mutates financials."""
    state.last_direction = "inbound"
    state.last_synced_at = _now()
    state.status = "in_sync"
    if entity_type == "part":
        state.last_cost = _to_decimal(obj.cost)
        cf = obj.customFields or {}
        state.last_price = _to_decimal(cf.get("zoho_rate"))
    lmt = record.get("last_modified_time")
    if lmt:
        state.zoho_last_modified_time = lmt


async def _fetch_all(client, mod, entity_type, *, per_page=_PER_PAGE, max_pages=_MAX_PAGES):
    out = []
    page = 1
    while page <= max_pages:
        params = {"per_page": per_page, "page": page}
        if entity_type == "vendor":
            params["contact_type"] = "vendor"
        body = await client.list_records(mod["module"], params=params)
        out.extend(body.get(mod["list"], []) or [])
        pc = body.get("page_context") or {}
        if not pc.get("has_more_page"):
            break
        page += 1
    return out


async def reconcile_entity(db, conn, client, entity_type):
    """One-time natural-key reconciliation for ONE entity type. Auto-links only
    UNIQUE 1:1 matches; duplicate-key / multi-match / empty-key rows go to a
    review log. Never POSTs to Books (no duplicate creation) — spec §4.6."""
    tenant_id = conn.tenantId
    mod = ZOHO_MODULES[entity_type]
    records = await _fetch_all(client, mod, entity_type)

    # Books-side key frequency: a key shared by >1 Books record is ambiguous.
    key_counts = Counter(k for k in (_recon_key(entity_type, r) for r in records) if k)

    linked = review = 0
    for r in records:
        external_id = str(r.get(mod["id_field"]) or "")
        key = _recon_key(entity_type, r)
        if not key:
            db.add(ZohoSyncLog(
                tenantId=tenant_id, entity_type=entity_type, external_id=external_id or None,
                direction="inbound", event="skipped", status="open", actor="system-sync",
                message="reconcile: empty natural key — manual review"))
            review += 1
            continue
        if key_counts[key] > 1:
            db.add(ZohoSyncLog(
                tenantId=tenant_id, entity_type=entity_type, external_id=external_id or None,
                direction="inbound", event="skipped", status="open", actor="system-sync",
                message=f"reconcile: duplicate Books key '{key}' — manual review"))
            review += 1
            continue

        local_ids = await _local_matches(db, tenant_id, entity_type, key)
        if len(local_ids) == 0:
            continue  # Books-only record — do NOT create locally (spec §4.6/§10-F)
        if len(local_ids) > 1:
            db.add(ZohoSyncLog(
                tenantId=tenant_id, entity_type=entity_type, external_id=external_id or None,
                direction="inbound", event="skipped", status="open", actor="system-sync",
                message=f"reconcile: {len(local_ids)} local rows match '{key}' — manual review"))
            review += 1
            continue

        local_id = local_ids[0]
        if await _link_for_entity(db, tenant_id, entity_type, local_id):
            continue  # already linked
        if await _local_id_for_external(db, tenant_id, entity_type, external_id):
            continue  # this Books id is already mapped elsewhere

        db.add(IntegrationExternalLink(
            tenantId=tenant_id, provider=PROVIDER, entity_type=entity_type,
            entity_id=local_id, external_id=external_id))
        state = await _get_or_create_state(db, tenant_id, entity_type, local_id, external_id)
        obj = await _load_local(db, entity_type, local_id)
        _seed_baseline(state, entity_type, obj, r)
        db.add(ZohoSyncLog(
            tenantId=tenant_id, entity_type=entity_type, entity_id=local_id,
            external_id=external_id or None, direction="inbound", event="pull_create",
            status="ok", actor="system-sync", message="reconcile: unique natural-key link"))
        linked += 1

    await db.commit()
    return {"linked": linked, "review": review}


async def reconcile_connection(db, conn, client, *, entity_types=None):
    """Reconcile all entity types for ONE connection inside its tenant context."""
    entity_types = entity_types or _ENTITY_TYPES
    token = TenantContext.set(conn.tenantId)
    try:
        await apply_rls_tenant_context(db, conn.tenantId)
        return {et: await reconcile_entity(db, conn, client, et) for et in entity_types}
    finally:
        TenantContext.reset(token)


# --- conflict resolution (spec §4.5) ----------------------------------------

async def resolve_conflict(db, tenant_id, log_id, resolution, *, resolved_by=None):
    """Resolve one open conflict (`tool_wins` | `books_wins`), applying the
    chosen value, RE-BASELINING ZohoSyncState so the next three-way compare finds
    in_sync (spec §4.5), and writing a `conflict_resolved` audit row. Returns the
    resolved log row.

    Raises ValueError (mapped to 4xx by the router) on a bad id/resolution."""
    if resolution not in ("tool_wins", "books_wins"):
        raise ValueError("resolution must be tool_wins or books_wins")

    row = (await db.execute(select(ZohoSyncLog).where(
        ZohoSyncLog.tenantId == tenant_id,
        ZohoSyncLog.id == log_id,
        ZohoSyncLog.event == "conflict_detected"))).scalar_one_or_none()
    if row is None:
        raise ValueError("conflict not found")
    if row.resolution is not None:
        raise ValueError("conflict already resolved")

    state = (await db.execute(select(ZohoSyncState).where(
        ZohoSyncState.tenantId == tenant_id,
        ZohoSyncState.entity_type == row.entity_type,
        ZohoSyncState.entity_id == row.entity_id))).scalar_one_or_none()
    obj = await _load_local(db, row.entity_type, row.entity_id) if row.entity_id else None
    diffs = row.field_diffs or {}

    for field, three in diffs.items():
        zoho_v = _to_decimal(three.get("zoho"))
        local_v = _to_decimal(three.get("local"))
        chosen = zoho_v if resolution == "books_wins" else local_v

        if resolution == "books_wins" and obj is not None:
            if row.entity_type == "part" and field == "cost":
                obj.cost = zoho_v
            elif row.entity_type == "part" and field == "rate":
                cf = dict(obj.customFields or {})
                cf["zoho_rate"] = _s(zoho_v)
                obj.customFields = cf
        # tool_wins keeps local untouched; both paths re-baseline to `chosen`.

        if state is not None:
            if field == "cost":
                state.last_cost = chosen
            elif field == "rate":
                state.last_price = chosen

    if state is not None:
        state.status = "in_sync"
        state.last_error = None
        state.last_synced_at = _now()

    row.resolution = resolution
    row.status = "ok"
    row.resolved_by = resolved_by
    row.resolved_at = _now()

    db.add(ZohoSyncLog(
        tenantId=tenant_id, entity_type=row.entity_type, entity_id=row.entity_id,
        external_id=row.external_id, direction="inbound", event="conflict_resolved",
        status="ok", field_diffs=diffs, actor=str(resolved_by) if resolved_by else "system-sync",
        resolution=resolution, resolved_by=resolved_by, resolved_at=_now(),
        message=f"resolved {resolution}"))
    return row


# --- lifecycle cascade-clean (spec §4.7 / §10-K) ----------------------------

async def cascade_clean(db, tenant_id, entity_type, entity_id):
    """On local HARD-DELETE of a Part/Vendor/PO, remove the polymorphic
    ZohoSyncState + IntegrationExternalLink rows for that entity so a stale
    mapping can never later mis-drive a spurious create/update (spec §4.7/§10-K).

    ZohoSyncState.entity_id / IntegrationExternalLink.entity_id are polymorphic
    (no hard FK to the entity tables), so nothing else removes these rows when
    the local row is deleted — this app-layer hook is the cleanup of record.
    Idempotent no-op when nothing is mapped. Does NOT commit (the caller owns the
    transaction boundary)."""
    await db.execute(delete(ZohoSyncState).where(
        ZohoSyncState.tenantId == tenant_id,
        ZohoSyncState.entity_type == entity_type,
        ZohoSyncState.entity_id == entity_id))
    await db.execute(delete(IntegrationExternalLink).where(
        IntegrationExternalLink.tenantId == tenant_id,
        IntegrationExternalLink.provider == PROVIDER,
        IntegrationExternalLink.entity_type == entity_type,
        IntegrationExternalLink.entity_id == entity_id))
