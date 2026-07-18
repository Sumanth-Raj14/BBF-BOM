All critique claims verify against the live tree (`worker.py` dispatch/retry/`_LIST_NAMES`, `tenant_events.py:47,76` None early-returns, `rls.py:72` `apply_rls_tenant_context`, `tenant_context.py:43` `TenantContext.set`, `crypto.py:11` SECRET_KEY note, `events.py` only reads `enabled_entity_types`, `040` dynamic `information_schema` discovery). Here is the final corrected spec.

# Design Spec â€” Two-Way Zoho Books Integration for the BOM/PLM Tool

All backend paths are relative to `bom tool v1/bom-tool/backend/`; frontend paths relative to `bom tool v1/bom-tool/frontend/`. This connector is an **optional, per-tenant opt-in**: with `integration_connections.provider='zoho_books'` absent or `is_enabled=False`, the app functions fully â€” no outbound events, no polling, no UI dependency. The integration is a pure additive layer on the existing WS3 integration framework (`IntegrationConnection` / `IntegrationOutbox` / `IntegrationExternalLink` + outbox drainer).

**One correctness invariant governs the whole design:** the existing background drainer runs with `get_tenant_id() == None` (`deliver_pending`/`drain_integration_outbox_once`, `worker.py:110,154`). Under that context the app-layer isolation in `tenant_events.py` is **inert** (the SELECT auto-filter early-returns at `:47`, the UPDATE/DELETE guard early-returns at `:76`) and, with `ENABLE_RLS=True` on Postgres, `current_setting('app.current_tenant')` is NULL so every `tenant_isolation` policy matches **zero rows**. Every new sync code path that touches tenant data â€” inbound upserts to the shared `parts`/`vendors`/`po_headers` tables and all writes to the three new tables â€” MUST therefore establish tenant context explicitly (see Â§4). The blanket claim "app-layer isolation is enforcement-of-record on both dialects" is false for background workers and is not relied upon here.

---

## 1. Scope & Goals

**Ship (v1):**
- OAuth 2.0 per-tenant connect (region/DC selection, org selection, encrypted refresh-token storage + rotation), plugged into the existing `/integrations` cred + `test-connection` framework.
- **Parts â†” Items** two-way, with field-level ownership.
- **Vendors â†” Contacts (`contact_type=vendor`)** two-way, field-level ownership.
- **Purchase Orders â†’ Zoho PO** outbound push (tool-authoritative); inbound **pull of Books-side status + cost actuals** only (see Â§4 and Â§10-E).
- **Cost/pricing pull** (Books â†’ tool) for `purchase_rate` and `rate`, monetary-conflict-guarded with canonical-decimal + epsilon comparison.
- Outbound via the existing outbox+drainer (with per-tenant context and a terminal-vs-transient retry classifier); inbound via **incremental poll** with a fixed field-ownership conflict spine and a conflict-review queue.
- Per-record ID cross-reference, three-way baseline store, per-entity high-water cursor, and a conflict/sync/audit log.
- Initial-link reconciliation (unique-match dedupe by natural key), idempotency, rate-limit backoff, per-tenant isolation, RLS gating.

**Deferred (v2+):**
- **Webhook (low-latency) inbound channel.** The 300 s incremental poll is the mandatory spine and covers v1 fully; the webhook only trades latency and cannot be auto-provisioned (Â§4). Its design is documented under Â§4 so v2 can pick it up, but it is not built in v1.
- **Per-field `config.conflict_policy` override map and the `field_merge` resolution mode.** v1 uses the fixed field-ownership spine + monetaryâ†’manual review only.
- **Manual link/unlink UI + endpoints.** v1 auto-links via reconciliation and exposes read-only mappings; hand-editing links is v2.
- Automatic **Bill** creation on PO receipt/close (close the full cost loop). v1 only *reads* Bill-derived actuals if the admin links them; auto-`POST /bills` is deferred (Â§10-G).
- Sales-side objects (invoices, sales orders, customers/`contact_type=customer`).
- Bulk import of *unmatched* Books masters into the tool (opt-in, off by default â€” Â§10-F).
- Structured address parsing beyond a best-effort split; multi-currency FX normalization.

---

## 2. Data Model

**Reuse (no new table) for credentials, ID xref, and outbound queue:**

- **OAuth credential/connection â†’ reuse `IntegrationConnection`** (`app/models/integration.py:10`), `provider='zoho_books'`, unique `(tenantId, provider)`. Inherits `TenantAwareMixin`, health fields, and `_public()` redaction (`auth` never serialized).
  - `auth` (`Text`, encrypted via `app/integrations/crypto.py encrypt_secret`) holds a JSON blob: `{refresh_token, client_id, client_secret, access_token, access_token_expires_at}`. Client secret is per-DC when Multi-DC is used. The whole blob is one Fernet ciphertext â€” no plaintext token at rest. **Key-derivation caveat:** `crypto._fernet()` derives the Fernet key from `settings.SECRET_KEY` (`crypto.py:12`), and the source note at `crypto.py:11` already anticipates a dedicated key. Because the refresh token is a permanent, high-value credential, rotating `SECRET_KEY` (a routine security action) would make every tenant's refresh token undecryptable â†’ mass silent disconnect. Introduce `settings.INTEGRATION_ENCRYPTION_KEY` (falling back to the SECRET_KEY-derived key only when unset) and encrypt this blob under it â€” see Â§10-J.
  - `config` (`JSON`, non-secret) holds: `region` (us|eu|in|au|jp|ca|sa|cn), `accounts_host`, `api_domain` and `location` (persisted from the token response, never hardcoded), `organization_id`, `scopes[]`, `enabled_entity_types[]` (the existing allowlist read by `emit_integration_event`, `events.py:21-23`), `sync_cadence_seconds`, `default_purchase_account_id` / `default_tax_id` (required-account defaults for item/PO create â€” Â§4/Â§10-L), and `webhook_token` (v2). `conflict_policy` (per-entity/field override map) is a **v2** field.
  - `status` / `last_error` / `last_checked_at` updated by the shared `_mark_health()` (`worker.py:46`).

- **Entity mapping / cross-reference â†’ reuse `IntegrationExternalLink`** (`app/models/integration.py:44`) as the **primary** `bom entity_id â†” zoho external_id` map, keyed `entity_type âˆˆ {part, vendor, purchase_order}` and `external_id = zoho_item_id | zoho_contact_id | zoho_purchaseorder_id`. Already consulted by the outbox worker for create-vs-update. Migration 041 adds a reverse-lookup index for inbound resolution (below). `external_url` stores the Books deep link.

**New tables (3)** â€” all inherit `TenantAwareMixin` (`app/models/mixins.py:5`, injects indexed non-null `tenantId` FKâ†’`tenants.id` `ON DELETE CASCADE`). Proposed model file: `app/models/zoho_sync.py`. Money = `Numeric(18,4)` throughout.

**`ZohoSyncState` â€” `zoho_sync_state`** (per-record three-way baseline & status â€” the version/checksum store Zoho cannot give us, since it exposes no ETag):

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | |
| `tenantId` | (mixin) | |
| `entity_type` | String(50), not null | `part` \| `vendor` \| `purchase_order` |
| `entity_id` | Integer, not null | local row id (polymorphic â€” no hard FK; see cascade-clean below) |
| `external_id` | String(100), **nullable** | null while locally-created & not yet pushed |
| `last_synced_at` | DateTime(tz) | |
| `last_direction` | String(10) | `outbound` \| `inbound` |
| `local_checksum` | String(64) | sha256 over the **canonical serialization** of the tool-owned field subset at last sync (three-way base) â€” see canonicalization note |
| `zoho_last_modified_time` | String(40) | ISO-8601-with-offset per-record newer-than anchor |
| `last_cost` | Numeric(18,4) | last-synced `purchase_rate` baseline (monetary conflict detection) |
| `last_price` | Numeric(18,4) | last-synced `rate` baseline |
| `sync_lock` | String(20), nullable | `syncing` gate for per-record serialization (paired with `SELECT â€¦ FOR UPDATE`) |
| `status` | String(20) | `in_sync` \| `pending_out` \| `pending_in` \| `conflict` \| `error` |
| `last_error` | Text | |
| `createdAt/updatedAt` | DateTime(tz) | mirror integration models |

The `zoho_etag` column from the draft is **dropped** â€” it documented a non-feature (Zoho has no version token); `zoho_last_modified_time` is the anchor.

Constraints: `UniqueConstraint("tenantId","entity_type","entity_id", name="uq_zoho_state_local")`; **partial unique index for the nullable key**: `Index("uq_zoho_state_ext", "tenantId","entity_type","external_id", unique=True, postgresql_where=text("external_id IS NOT NULL"))` (SQLite honors partial indexes; a plain unique would reject multiple null-external rows).

**Canonicalization (load-bearing â€” see Â§10-H):** `local_checksum` and all money comparisons use a single canonical serializer: `Numeric` rendered as fixed-scale decimal strings quantized to 4 dp (`10.5` and `10.5000` collapse to one form), JSON keys sorted, nulls explicit. Money equality is a `quantize`-to-scale compare with an epsilon (never exact float/string equality), so Zoho's server-side rounding never fabricates a conflict or a false "in sync".

**`ZohoSyncCursor` â€” `zoho_sync_cursor`** (per-entity-type incremental poll high-water):

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | |
| `tenantId` | (mixin) | |
| `entity_type` | String(50), not null | |
| `high_water` | String(40) | last fully-processed `last_modified_time`; polled **inclusively** (`>=`) and advanced only after a full page commits, never past a partially-consumed timestamp (Â§4) |
| `last_run_at` | DateTime(tz) | |
| `last_run_status` | String(20) | `ok` \| `partial` \| `error` |
| `records_seen` | Integer, default 0 | |
| `last_error` | Text | |

Constraint: `UniqueConstraint("tenantId","entity_type", name="uq_zoho_cursor")`.

**`ZohoSyncLog` â€” `zoho_sync_log`** (conflict + full mutation audit; doubles as the conflict-review queue â€” rows where `event='conflict_detected' AND resolution IS NULL`):

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | |
| `tenantId` | (mixin) | |
| `entity_type` | String(50), not null | |
| `entity_id` | Integer, **nullable** | null for batch/cursor-level events |
| `external_id` | String(100), nullable | |
| `direction` | String(10) | `outbound` \| `inbound` |
| `event` | String(30) | `push_create` \| `push_update` \| `pull_create` \| `pull_update` \| `conflict_detected` \| `conflict_resolved` \| `skipped` \| `error` |
| `status` | String(20) | `ok` \| `error` \| `open` (unresolved conflict) |
| `field_diffs` | JSON | `{field: {old, new}}` on **every** monetary/status mutation (`push_update`/`pull_update`), and three-way `{field: {base, local, zoho}}` for conflicts â€” so cost/price/status changes always have a value trail (Â§18 fix) |
| `actor` | String(40) | `system-sync` for automated mutations; a username for manual resolutions |
| `resolution` | String(20), nullable | `tool_wins` \| `books_wins` \| `manual` \| `deferred` (`field_merge` is v2) |
| `resolved_by` | Integer FKâ†’`users.id`, nullable | |
| `resolved_at` | DateTime(tz), nullable | |
| `message` | Text | sanitized via `_sanitize_error` (`worker.py:35`) before persist |

Index: `Index("idx_zoho_log_tenant_status","tenantId","entity_type","status")`.

> Not reusing `ERPSyncLog` (`app/models/erp_connector.py:58`): it has a mandatory FK to `erp_connectors.id`, which this connector does not populate.

**Orphan-state prevention (lifecycle â€” Â§7-critique, Â§10-K):** `ZohoSyncState.entity_id` is polymorphic with no FK. On local **hard-delete** of a Part/Vendor/PO, the corresponding `zoho_sync_state` and `IntegrationExternalLink` rows MUST be cascade-cleaned (an app-layer hook keyed by `(tenantId, entity_type, entity_id)`), or a stale mapping later mis-drives a create/update. Financial masters should prefer **soft-deactivate** over delete (push `active=false` / mark inactive) rather than removing the mapping â€” see Â§4 lifecycle and Â§10-K.

**Money-precision note (downgraded â€” Â§10-H):** `POHeader.subtotal/tax_total/freight_total` are `Numeric(12,2)` (`po_models.py:40-42`) while other money columns are `Numeric(18,4)`. These are **push-only PO totals that Zoho recomputes server-side from `line_items`**, so they are not part of any two-way monetary compare â€” the real bidirectional money fields are `Part.cost`/`purchase_rate`, already `Numeric(18,4)`. Widening the three columns in migration 041 is fine hygiene, but the **load-bearing** fix is the canonical-decimal + epsilon comparison above, not the column width.

---

## 3. Migrations

**New revision `041_zoho_books_sync_tables.py`** chained after the current head:
- `revision = "041_zoho_books_sync_tables"`, `down_revision = "040_postgres_rls_tenant_isolation"` (confirmed: `040` has `revision="040_postgres_rls_tenant_isolation"`, `down_revision="039_bom_closure_table"`).
- `upgrade()`: `create_table` for `zoho_sync_state`, `zoho_sync_cursor`, `zoho_sync_log`; create partial-unique index `uq_zoho_state_ext`; add the reverse-lookup index on `integration_external_links` for inbound resolution: `Index("idx_extlink_reverse","tenantId","provider","entity_type","external_id")`; (optional hygiene) `alter_column` widen the three `POHeader` money columns to `Numeric(18,4)`.
- **RLS gating** â€” mirror `040`'s exact gate and policy shape:
  ```
  bind = op.get_bind()
  if bind.dialect.name != "postgresql": return   # SQLite/others: no-op
  if not settings.ENABLE_RLS: return              # opt-in per deploy
  for table in ("zoho_sync_state","zoho_sync_cursor","zoho_sync_log"):
      ENABLE + FORCE ROW LEVEL SECURITY
      CREATE POLICY tenant_isolation USING ("tenantId" = current_setting('app.current_tenant', true)::int)
  ```
  `040` discovers tenant tables dynamically via `information_schema.columns` (not a static list), so a future re-run/backfill of its enablement would also cover these three tables automatically; `041` enrolling them explicitly is belt-and-suspenders so deploys that already ran `040` under `ENABLE_RLS=True` get immediate coverage without a re-run. The three tables are **not** auth-bootstrap tables, so no `FOR SELECT` bootstrap policy. Note that RLS here is only meaningful **because Â§4 sets `app.current_tenant` per tenant in the background workers** â€” without that, these policies (like every other) match zero rows for the drainer/poller.
- `downgrade()`: drop policies + `NO FORCE`/`DISABLE RLS` (dialect-only gate), drop indexes, drop the three tables. Do not revert the money-column widening if data already round-tripped at higher precision (or make it a separate reversible step).

`IntegrationConnection` / `IntegrationExternalLink` / `IntegrationOutbox` already exist (migration `031`) and need no schema change; the reverse index is the only alteration to `integration_external_links`.

---

## 4. Sync Engine â€” Two-Way Mechanics

### 4.0 Tenant context in background workers (correctness prerequisite)

Both the outbound drain and the inbound poll run in owned sessions with no request context. Every unit of tenant work MUST be wrapped so both isolation layers engage:

```
token = TenantContext.set(tid)                       # app/core/tenant_context.py:43
try:
    await apply_rls_tenant_context(session, tid)     # app/db/rls.py:72
    ... do this tenant's work, commit ...
finally:
    TenantContext.reset(token)
```

- **Inbound poll/reconcile:** process **one tenant per transaction** â€” never batch cross-tenant in one session. Each enabled `IntegrationConnection` is exactly one tenant, so iterate connections, set context per connection, and commit before moving on.
- **Outbound:** `deliver_pending` (`worker.py:110`) currently loops rows of many tenants with `tenant_id=None`, so writes to `zoho_sync_state`/`IntegrationExternalLink` would (a) get no app-layer guard and (b) hit zero-row RLS on Postgres. Wrap per-row processing in `TenantContext.set(row.tenantId)` + `apply_rls_tenant_context` (reset in `finally`). This also hardens the pre-existing ClickUp/Cliq paths. **Flag:** the existing cross-tenant drainer is RLS-unsafe today; this change fixes it â€” call it out in the PR (Â§10-O).

### 4.1 Provider client

New `app/integrations/zoho_client.py::ZohoBooksClient`, constructed by a branch in `_build_client(conn, provider)` (`worker.py:67`) and by adding `"zoho_books"` to `_PROVIDERS` (`app/api/endpoints/integrations.py:25`). The client:
- decrypts the `auth` blob, lazily refreshes the access token (Â§5) with a ~5-min skew, caches it the full hour, sets `Authorization: Zoho-oauthtoken {token}`;
- targets `config.api_domain + /books/v3`;
- **appends `?organization_id={config.organization_id}` to every call EXCEPT `GET /organizations`** â€” that endpoint is used by `verify()`/`test-connection` and by the post-callback org listing, both **before** an org id exists, so injecting it there would break the call. Build `/organizations` from `api_domain` (and, on the accounts host, the OAuth token/revoke endpoints) with no org param;
- exposes `verify()` = read-only `GET /organizations` (honest, never falsy-success);
- keeps a token-bucket (~1.5 req/s) and single-flight lock per `(tenantId, organization_id)` under Zoho's 100 req/min/org;
- exposes a per-org **settings lookup** (`GET /settings/currencies|taxes|chartofaccounts`) cached for the run, used to resolve `currency_id`/`tax_id`/`account_id` on create (Â§4.2/Â§10-L), and a **custom-field check** for `cf_bom_id` (Â§4.2/Â§10-M).

### 4.2 Outbound (tool â†’ Books) â€” reuse the outbox pipeline

- **Producers:** `emit_integration_event(...)` (`app/integrations/events.py:10`) fans out one `IntegrationOutbox` row per enabled connection, skipping entity types not in `config.enabled_entity_types` (`events.py:21-23`). PO already emits; **add emit calls** at Part and Vendor create/update endpoints with entity types `part` and `vendor`. **Do not touch `_LIST_NAMES` (`worker.py:25-30`)** â€” that dict holds ClickUp list names, not a general entity registry, and `emit_integration_event` never reads it. The Zoho module map (`partâ†’/items`, `vendorâ†’/contacts`, `purchase_orderâ†’/purchaseorders`) lives in the Zoho deliver/client; the producer only needs the entity-type string to appear in `config.enabled_entity_types`.
- **Consumer:** add `_deliver_zoho_books(db, conn, row, client)` and refactor the binary dispatch at `worker.py:133-136` into a provider dict/elif. It:
  1. `SELECT â€¦ FOR UPDATE` the `zoho_sync_state` row (or set `sync_lock='syncing'`) to serialize against the poller/other drains (Â§3-critique lost-update fix);
  2. looks up `IntegrationExternalLink` for `(tenantId,'zoho_books',entity_type,entity_id)` â†’ **`PUT /{module}/{external_id}`** if present else **`POST /{module}`**;
  3. resolves required Books foreign keys via the cached settings lookup â€” `currency_id` (Zoho wants an opaque id, not the ISO string in `POHeader.currency`), `tax_id`, and `purchase_account_id` for purchasable/inventory items â€” treating a missing required account as **blocking validation** (route to `zoho_sync_log` `error`, do **not** POST to the wrong/default account); see Â§10-L;
  4. on create, writes the `IntegrationExternalLink` (primary idempotency key) and, only if the `cf_bom_id` custom field is provisioned for that module, stamps it as a **secondary** anchor â€” arbitrary custom fields cannot be written via the record API unless pre-created, so `cf_bom_id` is belt-and-suspenders, never the primary key (Â§10-M);
  5. upserts `zoho_sync_state` (canonical checksum, `zoho_last_modified_time`, monetary baselines, `status='in_sync'`) and writes a `zoho_sync_log` `push_create`/`push_update` with `{field:{old,new}}` for monetary/status fields, `actor='system-sync'`.
- **Field translation:** Partâ†’`/items` (`pnâ†’sku`, `costâ†’purchase_rate`, `uomâ†’unit`, `primary_vendor_idâ†’vendor_id`); Vendorâ†’`/contacts` with `contact_type=vendor`; POHeaderâ†’`/purchaseorders` (round-trip `line_item_id` on updates so lines aren't duplicated; status-vocabulary mapping tables for the divergent `status` enums).
- **PO line ordering (Â§12 fix):** a PO line references its Part as `line_items[].item_id`, so before pushing a PO ensure each line's Part already has a Zoho `IntegrationExternalLink` â€” push those Parts first. If a Part is still unlinked, fall back to a name-only line and log it.
- **PO auto-numbering (Â§13 fix):** if the org has PO auto-numbering ON, a supplied `purchaseorder_number` is rejected or diverges. Read the org numbering setting; either omit-and-store-back the Zoho-assigned number or require numbering off, and handle the uniqueness error explicitly rather than burning retries.
- **Idempotency:** `IntegrationExternalLink` makes create-vs-update deterministic; outbox `status`/`attempts` prevents double-send; `entity_id<=0`/`action=="test"` sentinel skips link creation (`worker.py:77`).

### 4.3 Retry classification + kill switch (outbox)

The current `deliver_pending` except block (`worker.py:139-149`) increments `attempts` on **any** exception and dead-letters at `max_attempts=5` â€” an auth failure or a 400 validation error silently burns 5 retries then loses the change. `_deliver_zoho_books` raises typed exceptions and the block is refactored to classify:
- **Auth failure** (dead refresh token / 401 `invalid_token`): **hold** â€” do not consume an attempt; leave rows `pending`; set connection `status='error'`/`auth_failed`; the queue resumes on reconnect.
- **4xx validation** (400/422 â€” missing account, duplicate `sku`, bad PO number): **non-retryable** â€” mark the row `error` and write a `zoho_sync_log error`/`conflict_detected` immediately; do not retry.
- **429 / 5xx / network:** exponential backoff `next_attempt_at = now + 2**attempts` (unchanged).
- Untyped exceptions retain today's behavior, so the ClickUp/Cliq paths are unaffected.

**Kill switch (Â§17 fix):** disabling a connection is immediate. `_connection` already filters `is_enabled.is_(True)` (`worker.py:59-64`) so the poll loop naturally skips disabled tenants; for the outbox, refine the current "no enabled connection â†’ dead" behavior to distinguish *disabled* (hold rows as `pending` until re-enable â€” never flushed, never dead-lettered) from *truly absent* (dead). Disabling after queueing therefore neither flushes to Zoho nor loses the rows.

### 4.4 Inbound (Books â†’ tool) â€” incremental poll (v1)

New lifespan task `_run_zoho_poll_scheduler()` in `app/main.py`, mirroring `_run_integration_drainer()` (`app/main.py:41-56`; started via `asyncio.create_task`, cancelled on shutdown). Default interval `config.sync_cadence_seconds=300`. Per enabled connection (â†’ per tenant, context set per Â§4.0), per entity type:
- `GET /{module}?sort_column=last_modified_time&sort_order=A&last_modified_time={cursor.high_water}`, page with `page/per_page=200` until `page_context.has_more_page=false`. **Contact reads always add `&contact_type=vendor`** so customer contacts are never pulled.
- **Cursor safety (Â§4 fix):** filter **inclusive (`>=`)** from `high_water` and rely on the per-record newer-than dedupe (`zoho_last_modified_time`) to drop already-seen rows; advance `zoho_sync_cursor.high_water` **only after a full page commits**, and **never past a partially-consumed second-granularity timestamp** â€” otherwise records sharing one second across a page boundary are permanently skipped.
- **Resolve by mapped ID only (Â§5 fix):** look up the local entity via `IntegrationExternalLink`/`zoho_sync_state` by `external_id`. If **no mapping exists**, log `skipped` â€” **never auto-create** unless the opt-in "import unmatched" mode is on (Â§10-F). A Books-side PO with no local entity is a **status-pull no-op**, logged. This prevents both catalog pollution and silent loss.
- Serialize each record with `SELECT â€¦ FOR UPDATE` on its `zoho_sync_state` row before applying (guards against a concurrent outbound push â€” lost-update fix).

### 4.5 Conflict detection & resolution (v1 spine)

Detection is a **three-way compare** using the canonical serializer + epsilon money compare (Â§2): base = `zoho_sync_state.local_checksum`/`last_cost`/`last_price`, vs current local, vs incoming Zoho. A conflict exists only when *both* sides changed since baseline.

| Entity | Tool owns (push-authoritative) | Books owns (pull-authoritative) | Conflict rule |
|---|---|---|---|
| **Part â†” Item** | `pn/sku`, `name`, `description`, `unit`, `mpn`, `manufacturer`, `weight`, `dimensions`, `status` (mapped) | `rate` (selling price â€” tool has no field; lands in `Part.customFields.zoho_rate` / `price_history`, Â§10-I), GL accounts, tax, stock/reorder | Non-monetary descriptive: **tool-wins** on push; inbound only fills tool-unowned fields. `purchase_rate`/`cost` two-way but **any two-sided monetary change â†’ `conflict_detected`** (never silent LWW). |
| **Vendor â†” Contact** | `name`, `contactEmail`, `contactPhone`, `address`, `active` | `payment_terms` (parsedâ†’days), `currency_id`, `tax_reg_no`, `is_taxable` | Identity tool-wins; terms/tax conflicts â†’ manual. |
| **PO â†” Purchase Order** | Everything (numbering, approval, lineâ†”part links) â€” **push-only** | Books-side `status` transitions (`open`/`billed`/`cancelled`) and Bill-derived cost actuals â†’ pull-only | No field two-way editing; inbound limited to status + actuals; conflicts on those â†’ log + status precedence to Books. |

**Resolution re-baselines (Â§2 fix â€” critical).** Resolving a conflict (`POST â€¦/conflicts/{id}/resolve`, Â§6) applies the chosen value AND atomically **re-writes the `zoho_sync_state` baseline** (`local_checksum`, `last_cost`, `last_price`, `zoho_last_modified_time`) to the accepted state, writing a `conflict_resolved` log row. Without this the next three-way compare re-detects the identical conflict forever (or re-applies the same overwrite).

v1 resolutions: `tool_wins` | `books_wins` | `manual` | `deferred`. The per-field `config.conflict_policy` override map and the `field_merge` mode are **v2**. Monetary fields (`rate`/`purchase_rate`/totals/tax/`status`) never use naive whole-record LWW.

### 4.6 Initial-link reconciliation (one-time, before ongoing sync)

A manual-trigger job pulls each entity fully (paged 200) and matches by natural key â€” Items by `sku`â†”`Part.pn`, Contacts by `company_name`/`contact_name`/`email`â†”`Vendor.name`/`contactEmail`, POs by `purchaseorder_number`â†”`poNumber`. **Auto-link only on a unique 1:1 match (Â§6 fix):** duplicate `sku`s, duplicate vendor names/emails, or null/empty keys (item without `sku`) can match many or all rows and would bind to the wrong Books record â€” which two-way sync then overwrites. Any ambiguous, multi-, or empty-key match is routed to manual review and **never auto-linked**. Confirmed unique matches write `IntegrationExternalLink`, stamp `cf_bom_id` (if provisioned), and seed the `zoho_sync_state` baseline. Only records with **no** match are created (subject to Â§10-F). `has_transaction=true` contacts and `billed`/`cancelled` POs are flagged read-mostly.

### 4.7 Lifecycle (delete / deactivate / void)

Define semantics both directions (Â§7-critique, Â§10-K): prefer **soft-deactivate** for financial masters (push `active=false` / mark inactive rather than delete). On local **hard-delete**, cascade-clean `zoho_sync_state` + `IntegrationExternalLink` so a stale mapping cannot later drive a spurious create. Books-side "Deleted" handling and PO voidâ†’tool are pull-only status effects; a Books record that disappears from the poll window is left as-is and logged (no destructive local action in v1).

### 4.8 Rate-limit handling

100 req/min/org, **no `Retry-After`**. Client token-bucket + single-flight per org; on HTTP 429 use the outbox exponential backoff; poll stays strictly incremental (never a full re-scan except the one-time reconciliation or a manual trigger). Access token cached its full hour (Zoho throttles refreshes to ~10 per refresh token per 10 min).

### 4.9 Webhook channel (design only â€” v2)

Documented so v2 can implement; **not built in v1.** Zoho has **no webhook-provisioning API** â€” a tenant admin configures a Workflow Rule â†’ Webhook manually. Payloads are partial/flattened and delivered **at-least-once with identical retry bodies**, so the receiver would treat a payload as a *change signal only*: validate a per-tenant **bearer token** (Zoho workflow webhooks offer only a static custom header, **not** an HMAC signature â€” so this is a high-entropy, per-tenant, rotatable token compared in constant time over TLS, explicitly documented as not cryptographic signing â€” Â§19 fix), dedupe on `(entity_type, external_id, last_modified_time)` against `zoho_sync_state`, then re-`GET` the entity by id and run the same inbound upsert as Â§4.4. Because the 300 s poll already covers correctness, this only reduces latency (Â§10-B).

---

## 5. Auth Flow (OAuth 2.0, per tenant)

Authorization-code flow (multi-tenant â†’ each tenant consents; self-client is unsuitable). New helper `app/integrations/zoho_oauth.py` holds the **DC table** (region â†’ accounts host + api base): US `accounts.zoho.com`/`zohoapis.com`, EU `.eu`, IN `.in`, AU `.com.au`, JP `.jp`, CA `zohocloud.ca`/`zohoapis.ca`, SA `.sa`, CN `.com.cn` â€” always append `/books/v3` to the API base.

1. **Start** (`POST /integrations/zoho_books/oauth/start`, superuser): body picks `region` (â†’ `accounts_host`) and supplies/uses app `client_id`+`client_secret` (per-DC if Multi-DC). Build the consent URL `{accounts_host}/oauth/v2/auth?response_type=code&access_type=offline&scope={csv}&client_id=&redirect_uri=&state={csrf+tenant}`. **`prompt=consent` only when no valid refresh token exists (Â§20 fix):** connect is one-time per tenant; forcing consent on every connect mints a new refresh token and churns the 20-tokens-per-user-per-client cap. On reconnect, revoke the prior refresh token first (`POST {accounts_host}/oauth/v2/token/revoke`). Scopes (least-privilege â€” Â§8 fix, avoid `fullaccess.all`): `ZohoBooks.contacts.ALL`, `ZohoBooks.purchaseorders.ALL`, `ZohoBooks.bills.READ` (read-only actuals in v1), the **item read+write scope** (Partsâ†”Items is two-way, so a read-only scope is insufficient â€” confirm the exact string in the console scope-picker, likely under `settings`/items), and `ZohoBooks.settings.READ` for the currency/tax/chart-of-accounts lookups; add a settings-write scope only if we auto-provision `cf_bom_id` rather than requiring admin setup (Â§10-M). Return `{authorize_url}`.
2. **Callback** (`GET /integrations/zoho_books/oauth/callback`): validate `state`, exchange `code` at `{accounts_host}/oauth/v2/token` for `refresh_token`+`access_token`+`expires_in`+`api_domain`+`location`. Persist `api_domain` and `location` (never hardcode). Encrypt `{refresh_token, client_id, client_secret, access_token, access_token_expires_at}` via `encrypt_secret` (under `INTEGRATION_ENCRYPTION_KEY`, Â§2/Â§10-J) into `IntegrationConnection.auth`; write metadata into `config`. Then `GET /organizations` (no org param) and return the org list for selection.
3. **Select org** (`POST /integrations/zoho_books/oauth/select-org`, superuser): persist `organization_id` in `config` (auto if single org). Set `is_enabled` only after this **and** a green `test-connection`.
4. **Refresh/rotation:** access token minted lazily inside `ZohoBooksClient` when within ~5 min of expiry (`grant_type=refresh_token`), cached the full hour. The refresh token is permanent until revoked â€” do **not** re-authorize needlessly. On refresh 401/invalid â†’ connection `status='error'`, surface `auth_failed`, hold the outbound queue (Â§4.3), require re-connect.
5. **Test-connection:** reuse `POST /integrations/{provider}/test-connection` (`integrations.py:99`) unchanged â€” it calls `client.verify()` (our `GET /organizations`), classifies 401/403â†’`auth_failed`/timeout/network, records via `_mark_health`, and returns honest `{ok, reason, detail, checked_at}` with no secret leakage. Missing refresh token â†’ `not_configured`.

---

## 6. API

Reuse existing `/integrations` endpoints unchanged: `GET /integrations/`, `PUT /integrations/{provider}` (config toggles: `enabled_entity_types`, cadence, `default_purchase_account_id`/`default_tax_id`), `DELETE /integrations/{provider}`, `POST /integrations/{provider}/test`, `POST /integrations/{provider}/test-connection`, `GET /integrations/deliveries`. Add `"zoho_books"` to `_PROVIDERS` (`integrations.py:25`).

New router `app/api/endpoints/zoho_books.py`, mounted under `/integrations/zoho_books` in `app/api/api_v1.py` (near the existing `/integrations` mount). Superuser-gated (`get_current_superuser`) except read-only status/list:
- `POST /integrations/zoho_books/oauth/start` â†’ `{authorize_url}`
- `GET  /integrations/zoho_books/oauth/callback` â†’ handles code, returns org list (redirects UI back with `?zoho=connected`)
- `POST /integrations/zoho_books/oauth/select-org` â†’ persists `organization_id`
- `POST /integrations/zoho_books/sync/{entity_type}?direction=push|pull|both` â†’ manual trigger; `?mode=reconcile` is the one-time reconciliation entrypoint
- `GET  /integrations/zoho_books/sync/status` â†’ `zoho_sync_cursor` rows + per-entity counts/last-run from `zoho_sync_state`
- `GET  /integrations/zoho_books/mappings/{entity_type}` â†’ read-only list of `IntegrationExternalLink` + `zoho_sync_state` for the entity
- `GET  /integrations/zoho_books/conflicts` â†’ open conflicts (`zoho_sync_log` where `event='conflict_detected' AND resolution IS NULL`)
- `POST /integrations/zoho_books/conflicts/{id}/resolve` â†’ body `{resolution}`; applies the choice, **re-baselines `zoho_sync_state`** (Â§4.5), writes `conflict_resolved` with `resolved_by`
- **v2:** `POST /integrations/zoho_books/webhook/{token}` (bearer-token receiver, Â§4.9); `POST /integrations/zoho_books/mappings/{entity_type}` / `DELETE .../{id}` (manual link/unlink); `field_merge` resolution + `config.conflict_policy` override.

All responses reuse the `_public()`-style redaction posture; error text passes through `_sanitize_error` (`worker.py:35`).

---

## 7. Frontend

Extend the **real WS3 screen** `frontend/src/components/screens/IntegrationsScreen.jsx` (the `/integrations`-backed one; **not** the older mock `frontend/src/root/integration-screens.jsx` â€” confirm the pattern with the user, but WS3 is correct). Reuse `Card`, `Field`, `Input`, `Button`, `StatusPill`, `DataTable`, `EmptyState` from `../ui`, and `apiRequest` from `frontend/api.js:108`.

- **Connector card:** add a `zoho_books` entry to the `PROVIDERS` array (`IntegrationsScreen.jsx:16`) with an `authType: "oauth"` marker; the generic card renderer branches so that instead of a token `Input` it shows a **region `<select>`**, a **"Connect with Zoho" button** (`POST oauth/start` â†’ `window.location = authorize_url`), an **org `<select>`** populated after callback (`?zoho=connected` reloads org options â†’ `oauth/select-org`), the `is_enabled` toggle, and the shared **Test connection** button (`testConnection()`, reusing `checkTone`/`checkLabel`) + `StatusPill`.
- **Sync / conflict view:** new lazy screen `frontend/src/components/screens/ZohoBooksScreen.jsx`, registered in `frontend/src/components/LazyScreens.jsx` and routed in `frontend/src/screens/App.jsx` (mirroring the existing `IntegrationsScreen` entries). Contents, all reusing the primitives: per-entity **manual-sync buttons** (`push`/`pull`/`reconcile`) + cursor `StatusPill` from `sync/status`; a **read-only mappings `DataTable`** (entity_type, bom id, zoho id + deep link, last_synced, status); a **conflict-review `DataTable`** (field diffs, "Tool wins" / "Books wins" / manual / defer buttons â†’ `conflicts/{id}/resolve`). Manual link/unlink controls are **v2**. The richer sync/logs UX in `integration-screens.jsx::ERPConnectorsScreen` is a useful *visual* reference only (different backend).

---

## 8. Test Plan

Per-file fresh-DB SQLite pattern (RLS is a no-op on SQLite, so app-layer isolation is exercised directly; a Postgres path covers RLS). Key cases:

- **Background tenant context (P0):** inbound poll/reconcile and the outbound drain set `TenantContext.set(tid)` + `apply_rls_tenant_context` per tenant; tenant A's poll never reads/writes tenant B's parts/vendors/POs; assert that with tenant context absent the guards are inert (documents why the wrapper is mandatory).
- **Conflict re-baseline:** after resolving a conflict, the next three-way compare finds `in_sync` (no re-detect / no re-overwrite) â€” baseline snapshot updated to the accepted value.
- **Per-record serialization:** concurrent outbound push + inbound pull on one record â†’ `SELECT â€¦ FOR UPDATE`/`sync_lock` prevents a lost update.
- **Poll cursor page boundary:** N records sharing one `last_modified_time` straddling a 200-row page are all processed; cursor never advances past a partially-consumed timestamp; inclusive `>=` + newer-than dedupe drop no records and reprocess none destructively.
- **Unmatched inbound:** a Books-born item / customer contact / Books-only PO with no mapping â†’ `skipped` log, no local create (unless opt-in import on); contact reads always carry `contact_type=vendor`.
- **Reconciliation collision guard:** duplicate `sku`/vendor name/email and null-key rows â†’ manual review, never auto-linked; a unique match links with no duplicate `POST` and seeds baseline.
- **Retry classification:** auth-failure holds the queue without consuming attempts (connection `auth_failed`); a 400 validation error logs `error` immediately and is not retried; 429 with no `Retry-After` grows `2**attempts`; single-flight per org enforced.
- **Kill switch:** disabling a connection holds queued outbox rows as `pending` (not flushed, not dead-lettered) and stops the poll immediately; re-enable resumes.
- **Money canonicalization:** `10.5` vs `10.5000` and Zoho server-rounded values compare equal (no false conflict / false in-sync); a genuine two-sided monetary change produces `conflict_detected` and leaves values untouched until resolved.
- **Finance FK resolution:** item/PO create resolves `currency_id`/`tax_id`/`account_id`; a missing required account is a blocking `error`, never a silent post to a default/wrong account; ISO `currency` is mapped to `currency_id`.
- **cf_bom_id:** absent custom field â†’ link still works via `IntegrationExternalLink` (primary key); provisioned field â†’ stamped as secondary anchor.
- **PO ordering & numbering:** a PO whose line Parts are unlinked pushes them first (or falls back to name-only line + log); org auto-numbering ON is handled (omit-and-store-back or explicit uniqueness error, no retry burn).
- **Crypto key:** blob decrypts under `INTEGRATION_ENCRYPTION_KEY`; rotating `SECRET_KEY` alone does not orphan refresh tokens.
- **Audit trail:** every automated monetary/status `push_update`/`pull_update` writes `field_diffs {old,new}` with `actor='system-sync'`.
- **OAuth token hygiene:** reconnect revokes the prior refresh token and does not force consent when a valid token exists; 20-token cap not tripped by normal use.
- **RLS gating:** `041` is a no-op on SQLite and on Postgres with `ENABLE_RLS=False`; with `ENABLE_RLS=True`, `tenant_isolation` exists on all three new tables and enforces `app.current_tenant` (which the workers now set).
- **Honest failure / local-first:** creds absent â†’ `test-connection`=`not_configured`; connector disabled/absent â†’ no outbox rows emitted, no poll runs, all part/vendor/PO flows work unchanged; invalid creds â†’ `auth_failed`, no partial writes.
- **Lifecycle:** local hard-delete cascade-cleans `zoho_sync_state` + `IntegrationExternalLink`; soft-deactivate pushes `active=false`.

---

## 9. Build Sequence & Rough Effort

Work in a `feat/zoho-books` worktree off `master`. Ordered, independently committable increments (poll-only v1):

1. **Auth + cred + test-connection (~3â€“4 d):** migration `041` (3 tables + indexes + gated RLS); `zoho_oauth.py` (DC table, exchange, refresh, revoke); `zoho_client.py` (`verify`, token cache, `/organizations` org-id exemption, rate limiter, settings lookup); `_build_client` branch + `_PROVIDERS` add; OAuth `start`/`callback`/`select-org`; `INTEGRATION_ENCRYPTION_KEY`. Ship: a tenant connects and sees green health.
2. **Outbound push (~5â€“6 d):** per-tenant context wrapper in `deliver_pending`; retry classifier + kill-switch refinement; `_deliver_zoho_books` + dispatch refactor at `worker.py:133`; add Part/Vendor `emit_integration_event` calls (no `_LIST_NAMES` change); Zoho module map in the deliver/client; external-link create-vs-update + settings-FK resolution + `cf_bom_id` (secondary); PO push with line-ordering + auto-numbering handling; `zoho_sync_state` baseline + audit log. Ship: toolâ†’Books create/update for all three entities.
3. **Inbound poll + conflict engine (~5â€“7 d):** `_run_zoho_poll_scheduler` lifespan task + per-tenant context + `zoho_sync_cursor` inclusive high-water; inbound upsert by mapped id (unmatched â†’ skipped) with `contact_type=vendor`; three-way detection with canonical/epsilon money compare; resolver with re-baseline + `zoho_sync_log`; one-time unique-match reconciliation; lifecycle cascade-clean. Ship: Booksâ†’tool status/cost pull with conflict queue.
4. **UI (~3â€“4 d):** OAuth connector card (region/org) in `IntegrationsScreen.jsx`; `ZohoBooksScreen.jsx` (sync-status + read-only mappings + conflict-review) wired via `LazyScreens.jsx` + `App.jsx`.
5. **Hardening (~2â€“3 d):** full test matrix (Â§8); live-sandbox verification of the item write scope string, the accepted `last_modified_time` format/timezone, PO auto-numbering behavior, and `cf_bom_id` provisioning; docs.
6. **v2 (separate track):** webhook receiver + bearer token; `config.conflict_policy` override + `field_merge`; manual link/unlink UI; auto-Bill; sales objects; bulk import.

---

## 10. Open Product Decisions (with recommended defaults)

- **A. Conflict policy per entity** â€” *Recommend:* the Â§4.5 field-ownership spine (tool owns identity, Books owns pricing/accounting) with **all monetary conflicts routed to manual review**. The per-field override map is v2. Rationale: financial-data safety; no silent overwrite of `rate`/`purchase_rate`/totals/tax.
- **B. Webhook vs poll vs both** â€” *Recommend:* **poll-only in v1** (300 s, incremental, ascending `last_modified_time`) as the mandatory correctness spine; **webhook deferred to v2** as an optional latency layer (can't be auto-provisioned; at-least-once/partial; bearer-token only, not HMAC). Poll already delivers full v1 correctness.
- **C. Sync cadence & full scans** â€” *Recommend:* incremental poll every **300 s** (`config.sync_cadence_seconds`); any "nightly" run is **also incremental** (`last_modified_time`), never a full re-scan â€” a nightly full scan contradicts the incremental invariant and can blow the daily quota (Free tier ~1000/day) on large catalogs. Reserve full scans for the one-time initial link or an explicit manual trigger. Access token cached its full hour.
- **D. Default region** â€” *Recommend:* prefill **US** (`accounts.zoho.com`/`zohoapis.com`) but always require explicit selection at connect, and always persist `api_domain`/`location` from the token response rather than the hardcoded default.
- **E. POs one-way despite overall two-way** â€” *Recommend:* **yes, PO is tool-authoritative push-only**; inbound limited to Books-side status transitions and Bill-derived cost actuals. Full bidirectional PO editing invites unresolvable financial conflicts.
- **F. Initial-import behavior** â€” *Recommend:* **unique-match link-only dedupe** on first connect (ambiguous/multi/empty-key â†’ manual review, never auto-link); create-missing happens only on toolâ†’Books push after admin confirmation. Do **not** bulk-import unmatched Books masters by default; offer an explicit opt-in "import unmatched Books items as `Draft` parts."
- **G. Bill / cost-loop closure** â€” *Recommend:* **defer auto-Bill creation to v2**; v1 pushes POs and pulls status + actuals only. Decide later whether `POHeader.status='received'/'closed'` should trigger `POST /bills`.
- **H. Money precision & comparison** â€” *Recommend:* the **canonical-decimal + epsilon comparison** (Â§2) is the load-bearing fix and is mandatory. Widening `POHeader.subtotal/tax_total/freight_total` to `Numeric(18,4)` in `041` is optional hygiene only â€” those are push-only totals Zoho recomputes server-side, not part of any two-way monetary compare.
- **I. Item selling-price landing field** â€” *Recommend:* since `Part` has no sale-price column, land Zoho `rate` in `Part.customFields.zoho_rate` (read-only display) and/or a `price_history` row; confirm whether a first-class `Part.listPrice Numeric(18,4)` column is wanted instead.
- **J. Refresh-token encryption key** â€” *Recommend:* introduce `settings.INTEGRATION_ENCRYPTION_KEY` and encrypt the OAuth blob under it (fall back to the SECRET_KEY-derived key only when unset), so rotating `SECRET_KEY` (JWT/signing) doesn't mass-orphan every tenant's permanent refresh token. `crypto.py:11` already anticipates this.
- **K. Delete / deactivate / void semantics** â€” *Recommend:* soft-deactivate financial masters (push `active=false`) rather than delete; on local hard-delete cascade-clean `zoho_sync_state`+`IntegrationExternalLink`; Books-side deletes and PO void are pull-only status effects with no destructive local action in v1. Confirm the desired behavior per entity.
- **L. Currency / tax / GL-account resolution** â€” *Recommend:* resolve `currency_id`/`tax_id`/`account_id` via cached `GET /settings/currencies|taxes|chartofaccounts`; require `default_purchase_account_id` (and `default_tax_id` where applicable) in `config`; treat a missing required account as blocking validation, never a silent post to a default. Confirm the default accounts with the admin at connect.
- **M. `cf_bom_id` provisioning ownership** â€” *Recommend:* verify/create the custom field per module via the settings API at connect (requires a settings-write scope) **or** document admin setup; keep `IntegrationExternalLink` the primary idempotency key and `cf_bom_id` belt-and-suspenders. Decide auto-provision vs manual.
- **N. PO auto-numbering** â€” *Recommend:* read the org's PO auto-numbering setting; if ON, omit-and-store-back the Zoho-assigned number (or require numbering off) and handle the uniqueness error explicitly. Confirm which behavior the business wants.
- **O. Background-worker tenant context (also fixes a pre-existing bug)** â€” *Recommend:* wrap all Zoho background work per tenant with `TenantContext.set` + `apply_rls_tenant_context`; extend the same wrapper to the shared `deliver_pending` loop, which today runs cross-tenant with `tenant_id=None` (RLS-unsafe for the existing ClickUp/Cliq paths too). Confirm scope to touch the shared drainer in this PR.
- **P. Precision/edge verification before increment 3** â€” Confirm against a live sandbox: the exact **item read+write scope** string (likely under `settings`, not a public `items` scope; avoid `fullaccess.all`), the precise accepted **`last_modified_time` format/timezone**, PO **auto-numbering** behavior, and whether **`cf_bom_id`** can be provisioned programmatically.
