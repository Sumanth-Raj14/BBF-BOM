# WS3 — Cliq + ClickUp Integration (Design Spec)

**Date:** 2026-07-11
**Status:** Approved design → ready for implementation plan
**Workstream:** WS3 of the Blackbox BOM enterprise transformation

## Summary

Add first-class, built-in connectors that mirror actionable work from the BOM/PLM
app into **ClickUp** (as tasks) and post notifications to **Zoho Cliq** (as
messages). The app remains the single source of truth; the flow is **one-way**
(app → ClickUp/Cliq). Delivery is asynchronous and reliable.

## Decisions (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| Q1 | Core behavior | **One-way mirror + notify** (app is source of truth) |
| Q2 | Trigger scope | **Broad** — all actionable entities (Work Orders, CAPAs, ECO/ECR, NCR, Approvals, POs) |
| Q3 | Connection model | **Per-tenant admin connection** (one ClickUp OAuth/token + one Cliq webhook per tenant) |
| Q4 | Mapping model | **Convention + light config** (per-entity-type ClickUp lists; assignee by email; default Cliq channel + per-team overrides) |
| — | Delivery | **Async queue + worker** with retries/backoff + idempotency |

## Goals

- On a domain change (assignment or status/lifecycle), create or update a matching
  ClickUp task and post a Cliq message — without blocking the user's action.
- Survive ClickUp/Cliq downtime (retries, dead-letter, health surfacing).
- Idempotent: re-delivering an event updates the same ClickUp task, never duplicates.
- Admin-configurable per tenant via an Integrations settings screen.

## Non-goals (YAGNI — explicitly out of scope)

- Inbound / two-way sync (ClickUp changes flowing back into the app).
- Per-user OAuth to ClickUp.
- A managed iPaaS (Nango/Merge/Paragon) — direct connectors only.
- Any connector beyond ClickUp and Cliq.

## Architecture (isolated units)

- **`app/integrations/clickup_client.py`** — thin ClickUp REST client: `ensure_list(space, name)`, `resolve_member_by_email(email)`, `create_task(...)`, `update_task(external_id, ...)`. No app/DB knowledge; takes a connection + payload.
- **`app/integrations/cliq_client.py`** — posts a formatted message card to a Cliq incoming-webhook URL. Stateless.
- **`app/integrations/events.py`** — `emit_integration_event(db, tenant_id, entity_type, entity_id, action, snapshot)`. Loads enabled connections and inserts outbox rows in the same transaction. **Never calls external APIs inline.**
- **`app/integrations/worker.py`** — drains `integration_outbox`: builds provider payload, calls the connector, upserts the external link, marks sent / schedules retry / dead-letters. Runs as a background task (reusing the app's existing background-task/queue mechanism; final wiring chosen in the plan).
- **`app/api/endpoints/integrations.py`** — admin API: connect/disconnect, get/update config, send-test, list recent deliveries + health.
- **Frontend** — `Integrations` settings screen (see UI section).

Each unit is independently testable: connectors via mocked HTTP; the emitter via
"event → outbox rows" assertions; the worker via "outbox row → connector called
with payload X" assertions.

## Data model (new tables, all tenant-scoped)

**`integration_connections`**
- `id`, `tenantId` (FK, not null)
- `provider` — `"clickup" | "cliq"`
- `auth` — encrypted credentials (ClickUp token/refresh; Cliq webhook URL + optional signing secret)
- `config` (JSON) — ClickUp Space id, per-entity-type list ids, enabled entity types; Cliq default channel + per-team channel overrides
- `is_enabled` (bool), `status` (`ok|error|unconfigured`), `last_checked_at`, `last_error`
- timestamps

**`integration_outbox`**
- `id`, `tenantId`, `provider`
- `entity_type`, `entity_id`, `action`
- `payload` (JSON snapshot used to build the external call)
- `status` — `pending | sent | failed | dead`
- `attempts` (int), `next_attempt_at`, `last_error`
- timestamps

**`integration_external_links`**
- `id`, `tenantId`, `provider`, `entity_type`, `entity_id`
- `external_id` (ClickUp task id), `external_url`
- `unique(tenantId, provider, entity_type, entity_id)`
- timestamps

> Open item for the plan: whether to reuse the existing `NotificationQueue` table
> for the outbox or add a dedicated `integration_outbox`. Leaning dedicated for a
> clean schema + independent retry semantics.

## Event catalogue (initial "broad" set)

| Entity | Actions that emit an event |
|--------|----------------------------|
| Work Order | assigned (person/team), status change |
| CAPA action | assigned, status change |
| ECO / ECR | submitted, approved, status change |
| NCR | opened, disposition set, status change |
| Approval | requested, approved/rejected |
| Purchase Order | status change (issued, received) |

Emission points are the existing service/endpoint paths that already mutate these
entities (e.g. `/work/assign`, work-order status update, ECO approve). Each enabled
entity type can be toggled off per tenant in config.

## Delivery pipeline

1. Domain change calls `emit_integration_event(...)`.
2. Emitter inserts one `integration_outbox` row **per enabled provider** (same DB txn as the change — atomic, fast).
3. Worker claims pending rows (ordered, with a claim/lease to avoid double-send):
   - **ClickUp**: look up `integration_external_links`. If found → `update_task`. Else → `create_task` in the entity-type list (auto-created via `ensure_list`) and store the link. Assignee = `resolve_member_by_email(app assignee email)`; team assignment → apply a team tag, leave unassigned. App status → ClickUp status via a status map.
   - **Cliq**: post a concise card (entity, action, ref, assignee/team, status, deep link back to the app) to the mapped channel (per-team override else default).
4. On success → `sent`. On failure → increment `attempts`, set `next_attempt_at` with exponential backoff; after N attempts → `dead` and surface in health.

## Mapping conventions

- **ClickUp lists**: one managed List per entity type ("BBOM · Work Orders", "BBOM · CAPAs", …) under the admin-chosen Space. Created on first use.
- **Assignee**: match app user email → ClickUp member; unmatched or team-only → task tagged with the team, left unassigned.
- **Status map**: explicit app→ClickUp status mapping per entity type (defaults provided; overridable in config later).
- **Cliq routing**: default channel for all messages; optional per-team channel overrides.

## Connection settings UI (built to the enterprise-UI bar)

- New nav item **Integrations** (System group), route `/integrations`.
- Two connection cards (ClickUp, Cliq): connect/disconnect, status pill, config fields (Space picker, default channel, per-team overrides, entity-type toggles), **Send test**, and a recent-delivery log + health sourced from `integration_outbox`.
- Follows the same visual standard as the rest of the app (consistent with the forthcoming UI-refinement workstream).

## Reliability & error handling

- Exponential backoff; dead-letter after N attempts; per-provider circuit breaker.
- Idempotency via `integration_external_links` + a stable idempotency key per (entity, action).
- Per-connection health (`status`, `last_error`, `last_checked_at`) shown in the UI.
- User-facing actions never blocked by external latency/failure.
- Secrets never written to logs.

## Security

- Strict tenant isolation on every query.
- Credentials **encrypted at rest** (mechanism — app-level Fernet vs pgcrypto — chosen in the plan).
- Minimal ClickUp token scope; Cliq webhook URL treated as a secret.
- One-way flow means no inbound webhook surface to secure for this spec.

## Testing / verification plan

**Now — no credentials required (mock-based, option b):**
- Emitter: asserting an event inserts the right outbox rows for enabled providers only.
- Worker: with mocked HTTP (respx/httpx MockTransport), assert correct ClickUp create vs update selection, payload shape, assignee-by-email resolution, Cliq message content, retry/backoff on 5xx, dead-letter after N.
- Idempotency: second delivery of the same event updates the stored `external_id`, no duplicate create.
- Runs on SQLite via `create_all` like the WS1/WS2 suites.

**Later — live (option a), when you provide creds:**
- ClickUp token + Cliq webhook → "Send test" from the UI + a real `assign → ClickUp task + Cliq message` round-trip.

**How to run the live round-trip once credentials are available:**
1. Obtain a ClickUp personal API token (with access to the target List) and a Zoho Cliq incoming webhook URL.
2. Sign in as a tenant admin and open the **Integrations** screen.
3. Add a ClickUp connection: paste the API token, pick/enter the target Space ID, save. Add a Cliq connection: paste the webhook URL, save. Both connections start `is_enabled = true`.
4. Click **Send test** on each connection and confirm: a test task appears in the configured ClickUp List, and a test message appears in the configured Cliq channel/webhook. If either fails, check `status` / `last_error` on the connection row (never logs the raw secret).
5. Assign a work order (or update a CAPA/ECO/ECR/NCR/PO/Approval) to trigger `emit_integration_event`.
6. Let the background worker drain the outbox (or invoke `deliver_pending` directly in a shell), then confirm: a ClickUp task now exists for that entity with the expected title/assignee, and a Cliq message was posted describing the change.
7. Re-trigger the same entity mutation again and confirm the **same** ClickUp task is updated in place (check `integration_external_links` for a single row, `external_id` unchanged) rather than a duplicate task being created.

## Acceptance criteria

- [ ] Enabling ClickUp + Cliq for a tenant and assigning/altering any of the six entity types enqueues outbox rows and (via worker) creates/updates a ClickUp task + posts a Cliq message.
- [ ] Re-delivery updates the same ClickUp task (no duplicates).
- [ ] External failures retry then dead-letter; user action is never blocked.
- [ ] Admin can connect, configure, test, and see delivery health in the Integrations screen.
- [ ] Full mock-based test suite green; live round-trip documented for credential drop-in.

## Migration

New Alembic migration for the three tables, chained after `030_teams_and_work_assignment`.
