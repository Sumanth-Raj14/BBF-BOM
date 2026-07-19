Prioritized critique. I verified the load-bearing codebase claims (migration head, tenant-isolation mechanism, worker dispatch) against the live tree at `bom tool v1/bom-tool/backend/`; findings noted inline.

# P0 â€” DATA-SAFETY / TENANT-ISOLATION (silent corruption or leakage)

**1. [isolation] Background sync sessions carry NO tenant context â†’ app-layer isolation is inert and RLS fails closed. (VERIFIED)**
The spec says poll/webhook/reconcile "mirror `_run_integration_drainer`." But `drain_integration_outbox_once`/`deliver_pending` (`worker.py:110,154`) run with `get_tenant_id()==None`, and `tenant_events.py` both auto-SELECT-filter (`:47`) and UPDATE/DELETE guard (`:76`) *early-return when tenant is None*, and it never calls `apply_rls_tenant_context` (`db/rls.py:72`). Consequences: (a) inbound upserts to the **shared** tables (`parts`/`vendors`/`po_headers`) run with zero tenant safety net â€” a mis-scoped query reads/writes the wrong tenant with nothing to catch it; (b) under `ENABLE_RLS=True` on Postgres, `current_setting('app.current_tenant')` is NULL â†’ policy matches **zero rows** â†’ poll (and the existing drainer) silently see nothing and do nothing. Why it matters: the spec's claim "app-layer isolation remains enforcement-of-record" is false for exactly the new code paths it adds. Fix: process **one tenant per transaction**; wrap each tenant's inbound work with `TenantContext.set(tid)` *and* `await apply_rls_tenant_context(session, tid)`; do not batch cross-tenant in one session for inbound. Also flag the pre-existing cross-tenant drainer as RLS-unsafe.

**2. [conflict] Resolution never re-baselines â†’ permanent conflict loop / re-overwrite.**
`conflict_resolved` writes `resolution` but the spec never says it re-seeds `zoho_sync_state.local_checksum/last_cost/last_price/zoho_last_modified_time` to the accepted values. Next three-way compare re-detects the same conflict forever (or re-applies the same overwrite). Fix: resolution must atomically re-write the baseline snapshot to the resolved state.

**3. [race] No per-entity serialization between the 15s drainer, 300s poll, and webhook â†’ lost update.**
The single-flight lock is per-org HTTP throttling only; nothing serializes concurrent outbound-push vs inbound-pull on one record. Fix: `SELECT â€¦ FOR UPDATE` the `zoho_sync_state` row (or a `syncing` status gate) before any apply.

**4. [poll] Second-granularity `last_modified_time` at a page boundary can permanently skip records.**
If N records share one second and straddle a 200-row page, advancing the cursor with strict-`>` semantics drops the unprocessed ones. Fix: filter **inclusive (`>=`)** from high-water and rely on the per-record newer-than dedupe; never advance the cursor past a partially-consumed timestamp.

**5. [inbound] "Upsert by mapped ID" is undefined when no mapping exists â†’ pollution or silent drop.**
Records born in Books, customer contacts on `/contacts`, or Books-only POs have no local entity. Ambiguous whether inbound creates (violates decision F, catalog pollution) or drops (silent loss). Fix: unmatched inbound â†’ log `skipped`, never auto-create unless opt-in import is on; always add `&contact_type=vendor` on inbound contact reads; PO with no local entity â†’ status-pull no-op, logged.

**6. [dedupe] Initial-link natural-key match has no collision guard â†’ binds to the WRONG Books record, then two-way sync overwrites it.**
Duplicate `sku`s, duplicate vendor names/emails, or null keys (item without sku) can match many/all. Fix: auto-link only on a **unique 1:1** match; ambiguous/multi/empty-key â†’ manual review, never auto-link.

**7. [lifecycle] No delete/void/deactivate propagation either direction; `ZohoSyncState.entity_id` has no FK â†’ orphaned state.**
Local Part/Vendor delete, Books "Deleted" webhook, PO void â€” none handled; stale mappings later mis-drive a create. Fix: define delete/deactivate semantics (prefer soft-deactivate for financial masters) and cascade-clean `zoho_sync_state`/`IntegrationExternalLink` on local hard-delete.

# P1 â€” CORRECTNESS / ZOHO API

**8. [scope] `ZohoBooks.settings.READ` cannot CREATE/UPDATE items, but Partsâ†”Items is two-way; `bills.ALL` is over-broad for a read-only v1.**
`settings.READ` blocks all outbound item writes if items live under settings. Fix: resolve the item **write** scope in the console pre-build; request least-privilege (`bills.READ`, an item-write scope, `purchaseorders.ALL`, `contacts.ALL`).

**9. [api] Client "always appends `?organization_id`" breaks `GET /organizations`.**
`/organizations` (used by `verify()`/test-connection *and* the post-callback org list) must be called **without** org_id and before it's known. Fix: exempt `/organizations` from the injection; build it from `api_domain` alone.

**10. [finance] Currency/tax/GL mapping gap on outbound create.**
Vendor has no currency/tax-id field; `POHeader.currency` is an ISO string but Zoho wants opaque `currency_id`; item create for purchasable/inventory items typically requires `purchase_account_id`/`tax_id`. Pushing an ISO string as `currency_id`, or an item with no GL account, fails or posts to the wrong account. Fix: resolve `currency_id`/`tax_id`/`account_id` via `GET /settings/currencies|taxes|chartofaccounts` into a per-org lookup; define required-account defaults; treat as blocking-validation, not silent.

**11. [api] `cf_bom_id` must be pre-provisioned per module before it can be written.**
You can't stamp an arbitrary custom field via the record API; absent â†’ write rejected/dropped and the secondary dedupe anchor is lost. Fix: verify/create the field via settings API at connect (or document admin setup); keep `IntegrationExternalLink` as the **primary** idempotency key, `cf_bom_id` as belt-and-suspenders only.

**12. [ordering] PO push needs each line's Part already linked as an Item (`line_items[].item_id`); increment 2 gives no ordering guarantee.** Fix: before pushing a PO, ensure each line's Part has an external link (push those Parts first), else name-only line + log.

**13. [api] `poNumber â†’ purchaseorder_number` collides with Zoho org auto-numbering.**
If auto-numbering is ON, a supplied number is rejected or diverges. Fix: read the org PO auto-numbering setting; omit-and-store-back or require it off; handle the uniqueness error explicitly.

**14. [crypto] Refresh token encrypted under a key derived from `settings.SECRET_KEY` (crypto.py).**
A permanent, high-value credential tied to the app's JWT/signing key â€” rotating SECRET_KEY (a normal security action) makes every tenant's refresh token undecryptable â†’ mass silent disconnect. Fix: use a dedicated `INTEGRATION_ENCRYPTION_KEY` (the code note already anticipates this).

**15. [conflict] Checksum canonicalization undefined for `Numeric(18,4)` â†’ false conflicts / false in-sync.**
`10.5` vs `10.5000` hash differently; float/JSON ordering is non-deterministic; Zoho org rounding may differ from round-half-even. Fix: define canonical serialization (fixed-scale decimal strings, sorted keys, explicit nulls); compare money with quantize-to-scale + epsilon, not exact equality.

**16. [retry] Outbox does not distinguish terminal from transient failures â†’ silent financial-data loss. (VERIFIED)**
`deliver_pending` (`worker.py:139-149`) increments `attempts` on *any* exception and dead-letters at `max_attempts=5`. An auth_failed (dead refresh) or a 400 validation error (missing account, dup sku) burns 5 retries then marks the row `dead` â€” the change is never sent, silently. Fix: auth failure â†’ pause/hold the connection's queue (don't consume attempts) until reconnect; 4xx-validation â†’ route to error/conflict log immediately (non-retryable); only 429/5xx use exponential backoff.

**17. [honesty] Disabling a connection doesn't stop queued outbox rows or in-flight polls.**
`deliver_pending` selects pending rows regardless of current `is_enabled`; disabling after queueing still flushes to Zoho. Fix: check `is_enabled` at delivery time and gate the poll loop â€” make disable an immediate kill switch.

# P2 â€” MISSING PIECES

**18. [audit] Value trail only for conflicts.** `field_diffs` is populated for conflicts only; automated monetary `push_update`/`pull_update` that changes cost/price/status has no oldâ†’new record and no actor. Fix: capture `{field:{old,new}}` + a synthetic "system-sync" actor on every monetary mutation.

**19. [webhook] The "secret" is a static shared header, not an HMAC signature** (Zoho workflow webhooks offer only static custom headers) â€” replayable, identical across deliveries. Fix: treat as bearer â€” high-entropy per-tenant token, constant-time compare, TLS-only, rotatable; document it is not cryptographic signing.

**20. [auth] `prompt=consent` on every connect mints a new refresh token â†’ churns the 20-token/user/client cap; reconnect doesn't revoke the old one.** Fix: connect is one-time per tenant; revoke the prior refresh token on reconnect; force consent only when no valid refresh token exists.

# P3 â€” OVER-SCOPING / MINOR

**21. [scope] "Nightly full reconciliation" (decision C) contradicts incremental-is-mandatory and can blow the daily quota** (Free 1000/day) on large catalogs. Fix: nightly = incremental (`last_modified_time`); reserve full scans for the one-time initial link or a manual trigger.

**22. [scope] Webhook channel is over-scope for v1** â€” can't be auto-provisioned (manual admin workflow rule), needs receiver + dedupe + opaque-token routing, all for latency over a 300s poll that is already the mandatory spine. Ship poll-only v1; add webhook, the full `config.conflict_policy`/`field_merge` machinery, and manual link/unlink UI in v2.

**23. [yagni] `zoho_etag` "reserved/always-null" column** documents a non-feature â€” drop it.

**24. [fit] Adding `part`/`vendor` to `_LIST_NAMES` (worker.py:25) is a category error** â€” that dict holds ClickUp list names, not a general entity registry. Zoho's module map (partâ†’items, vendorâ†’contacts, poâ†’purchaseorders) belongs in the Zoho deliver/client. `emit_integration_event` only needs the entity-type strings to appear in `config.enabled_entity_types`.

**25. [precision] The Â§2/H `Numeric(12,2)` flag is over-weighted:** those columns are POHeader subtotal/tax_total/freight_total â€” push-only totals Zoho recomputes server-side from `line_items` anyway. The real two-way monetary compare is on `Part.cost`/`purchase_rate` (already 18,4). Widening is fine hygiene but the epsilon-compare (#15) is the load-bearing fix.

# Confirmed-correct (do NOT change)
Migration head **040 is confirmed** (`revision="040_postgres_rls_tenant_isolation"`, `down_revision="039_bom_closure_table"`) so the spec's `down_revision` is right; 040 discovers tenant tables dynamically via `information_schema`, so a later RLS re-enable auto-covers the 3 new tables. Correct reuse of `IntegrationConnection`/`ExternalLink`/`Outbox`; correct rejection of `ERPSyncLog` (mandatory FK); correct model names (`Vendor` not Supplier, `POHeader`/`POLineItem`); honest `verify()`/`test-connection` reuse; correct partial-unique index for the nullable `external_id`; sound "monetary conflict â†’ manual review, never whole-record LWW" spine; correct persist-`api_domain`/`location`; correct PO push-only decision.
