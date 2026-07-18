# Infrastructure Design Brief â€” WS5 (Performance & Scale) + WS6 (Local-First Packaging)

## Summary

Both workstreams start from a weak base. **Performance** audited at 33/100 and the code confirms it: BOM explosion and where-used are Python N+1 recursions with one SELECT per node (`bom_service.py:103-170`, `:424`), Redis caching exists but `cache_invalidate` is defined and never called (`cache.py:83`) so every read cache serves stale trees for up to 5 minutes after any edit, hot search paths run leading-wildcard `ILIKE '%q%'` and query-time `to_tsvector` with no supporting indexes, the materialized views + refresh function are dead weight (`025`, never scheduled), and the asyncpg/pgbouncer pooling is doubly broken (prepared statements incompatible with transaction pooling **and** the app silently bypasses pgbouncer because it reads `DATABASE_URI` while compose only sets `DATABASE_URL`). **Packaging** has no installer at all â€” the only launcher runs bare-metal uvicorn on Windows (`start_servers.bat:10-13`), no compose serves the React SPA, secrets are hard-required (blocking zero-config first run), migrations are manual, and document storage defaults to S3 and mislabels local writes.

**Headline moves.** WS5: introduce a **closure table** (keyed on the X1 canonical node id) for O(1) explosion + where-used, wire up cache invalidation on every write path, add pg_trgm/tsvector + composite indexes, fix the pooling/routing mismatch, and stand up a real **Postgres benchmark harness** in CI to gate regressions. WS6: build a **one-command, idempotent first-run flow** (per-OS launcher â†’ Docker check â†’ `.env` secret generation â†’ compose up â†’ auto-migrate â†’ tenant+admin bootstrap â†’ open browser), flip the default to a **first-class local storage backend**, and make the dev stack zero-config and local-first with MinIO/object-storage strictly opt-in. Both workstreams follow the P0 core-correctness fix and the X1 canonical-BOM/RLS design; **WS6 lands last, once the app is stable**.

---

## WS5 â€” Performance & scale

### Current state

- **Explosion is O(N) recursive, no closure.** `get_bom_explosion` â†’ `_build_explosion_tree` (`bom_service.py:103-170`) issues one SELECT per parent node (N+1 across the whole tree). `get_quantity_rollup` (`:211`) and `get_cost_rollup` (`:259`) load all items then walk in Python; `where_used` (`:313`) and `where_used_tree` (`:385`) walk ancestors with a per-level query loop (`:424`). Indexes for the recursion exist â€” `idx_bom_items_master_parent(parent_item_id,bom_id)` and `_bom_part(bom_id,part_id)` (`013:71-74`, `025:110-111`) â€” but recursion still costs a round trip per node.
- **Caching present, invalidation absent.** `cache.py` implements `cache_get/set/invalidate` + a fail-fast Redis pool (`cache.py:14-45`) and compose ships Redis (`yml:34`), but `cache_invalidate` is only ever defined (`cache.py:83`) and **never called**. Stale-serving keys: `bom:{id}` 300s (`bom_service:59`), `bom:explosion:{id}:{level}` 300s (`:162`), cost-rollup (`:260`), where-used (`:314`), where-used-tree (`:386`), and `parts:list:...` 120s (`part_service:24`). A module-level `_part_cache` dict capped at 10k (`bom_service:22-27`) is never invalidated on rename and silently stops caching once full â€” useless at 100k parts.
- **Missing hot-path indexes.** Parts list/search uses leading-wildcard `ILIKE '%q%'` (`part_service.list_parts:29-47`) â€” no btree can help, no pg_trgm GIN exists. `search_service.advanced_search` (`:58-266`) computes `to_tsvector` at query time with no FTS index despite a docstring claiming otherwise â€” full seq scans. Dashboards run 10-15 tenant-filtered COUNT/GROUP BY over `work_orders`/`po_headers`/`eco_headers`/`parts` without matching composites (e.g. `work_orders` only has `idx_work_orders_assigned(assigned_to,status)` `012:135`; `po_headers` group-by `"vendorName"` unindexed). Materialized views `mv_part_category_summary` / `mv_bom_status_summary` / `mv_inventory_summary` + `refresh_materialized_views()` exist (`025:29-126`) but are never scheduled/called and the dashboards query base tables â€” dead weight that goes stale.
- **Pooling doubly broken.** `create_async_engine` has no `connect_args` (`session.py:51-59`) â†’ asyncpg default `statement_cache_size=100`; both composes route through pgbouncer in **transaction mode** (`yml:97`, `prod:158`) â€” the known fatal incompatibility. Worse, the app reads case-sensitive `settings.DATABASE_URI` assembled from `POSTGRES_*` (`config.py:96-113`, `session.py:47`) while compose only sets `DATABASE_URL`, so pgbouncer is **silently bypassed** and the app connects directly to Postgres. Pool sizing 10+20 = 30 conns/worker will exceed sane `max_connections` when pgbouncer isn't actually fronting.
- **Pagination / N+1.** `pagination.py` does OFFSET/LIMIT + a `COUNT(*)` over `query.subquery()` every call (`paginate:95-99`); `list_parts` SQL has **no tenant filter** (only in the cache key, `part_service:24-47`). Dashboards fire ~10-15 sequential awaited COUNTs each â€” serialized round-trip N+1.
- **Benchmark is a smoke script.** `scripts/benchmark_bom.py` runs against in-memory SQLite (`:14`) while printing "PostgreSQL", inserts a hardcoded 100k **flat** rows, reports only wall-clock totals (no warmup, no percentiles, no explosion/scoped timing), and is not CI-wired. `locustfile.py` and seeders (`load_bom_data.py`, `seed_enterprise_data.py`, `seed_db.py`, `seed_po.py`) exist.

> Scope note: prior references to `010_covering_indexes` / `010_backup_and_schema_fixes` do not match the repo â€” actual perf/index migrations are `009_backup_and_schema_fixes`, `012_data_normalization_and_search`, `013_enterprise_audit_fixes`, `025_materialized_views_and_indexes` (`010` is `010_po_consolidation`).

### Plan

| Item | Approach | Targets | Effort | Dependency |
|---|---|---|---|---|
| Closure table for O(1) explosion + where-used | Add `bom_closure(ancestor_item_id, descendant_item_id, depth, path_qty_multiplier, tenantId)`, PK(ancestor,descendant), indexes (descendant,depth) for where-used and (ancestor,depth) for explosion, self-rows depth=0. Serve explosion/where-used/rollup via a single join instead of Python recursion. Keep the P0-corrected recursive `_build_explosion_tree` as feature-flagged fallback/verifier and as the closure rebuilder; add a nightly/manual "rebuild + diff vs recursive" consistency check. | New alembic migration; new `explosion_via_closure` / `where_used_via_closure` in `bom_service`; built on X1 node ids | **XL** | **X1 canonical BOM model + P0 explosion-scoping fix** (closure must key on X1 node identity and inherit its tenant scoping) |
| Closure maintenance hooks/triggers | Maintain closure incrementally via PL/pgSQL triggers on the canonical item table (insert: ancestors(parent)Ã—descendants(self)+depth+1; delete: remove pairs; reparent: delete subtree pairs then re-insert) so it is DB-authoritative for out-of-band writes. Provide idempotent full-rebuild SQL for bulk import (disable trigger â†’ bulk load â†’ rebuild). Reject an edge if the descendant is already an ancestor (cycle guard). | Trigger fn in migration; `bulk_import` calls rebuild; cycle-check constraint | **L** | Closure table; coordinate trigger ownership with RLS design (SECURITY DEFINER-safe under row security) |
| Covering / search indexes for hot paths | Enable pg_trgm; GIN trigram on `parts(pn,name,mpn)` for `ILIKE '%q%'`; stored `tsvector` column + GIN per searched table (parts, vendors, po_headers, eco_headers, work_orders) to back `search_service` FTS. Composites: `work_orders(tenantId,status)`, `(tenantId,due_date,status)`, `po_headers(tenantId,status)`, `(tenantId,"vendorName")`, `audit_logs(tenantId,"createdAt" DESC)`, `parts(tenantId,category)`. Verify each with EXPLAIN in the harness. | New migration (e.g. `032_perf_indexes`); pg_trgm extension; `search_service.py` queries the tsvector column | **L** | None for parts/WO/PO; tsvector columns should align with X1 field names |
| Wire up + schedule (or drop) materialized views | Either (a) point dashboards at the MVs and schedule `REFRESH MATERIALIZED VIEW CONCURRENTLY` via an **on-prem** background job (APScheduler / celery_worker already in prod compose) every N min, or (b) delete the dead MVs + refresh fn and keep tuned base-table queries. Recommend (a) for the 10-15-count dashboards; CONCURRENTLY reuses existing unique indexes (`025:44/62/83`). | `dashboard_service.py`, `analytics.py`; new scheduled task | **M** | None; scheduler must run in-process/on-prem, not cloud cron |
| Redis cache invalidation on writes | Call `cache_invalidate` on every mutating path: part create/update/delete/bulk â†’ `parts:list:{tenant}:*` and where-used-driven `bom:*` trees; BOM item add/update/delete/template-apply/import â†’ `bom:{id}*`, `bom:explosion:{id}:*`, `bom:cost_rollup:{id}`, `bom:where_used*:{part}`. Standardize on raw namespaced keys so SCAN patterns work. Replace the broken `_part_cache` dict with Redis (or remove it). Keep Redis strictly optional â€” all paths already no-op when it's down (`cache.py:63`). | `part_service.py`, `bom_service.py`, `bom_items.py`, `bulk_import.py`; `cache.py` | **M** | P0 explosion fix (cache correct trees before caching/invalidating) |
| Fix asyncpg/pgbouncer pooling + real routing | Add `connect_args={"statement_cache_size":0,"prepared_statement_cache_size":0}` (or SQLAlchemy `prepared_statement_cache_size=0`) so prepared statements survive transaction pooling. Fix `DATABASE_URL` vs `DATABASE_URI` mismatch (accept `DATABASE_URL` alias, or set `POSTGRES_SERVER=pgbouncer` / `PORT=6432`). When fronted by pgbouncer use a small app pool or NullPool to avoid double-pooling; size pgbouncer `default_pool_size` + Postgres `max_connections` for ~100 concurrent sessions. **Local-first: direct-to-Postgres (no pgbouncer) remains a valid config.** | `session.py`, `config.py`, `docker-compose*.yml`, `postgresql.conf` | **M** | None â€” but must land before load-testing or benchmarks error out |
| Pagination hardening + N+1 reduction | Keep OFFSET for UI; add **keyset (seek)** pagination for large/deep lists (parts, audit_logs) on indexed `(id)` or `(createdAt,id)`; skip/estimate COUNT on deep pages. Collapse the 10-15 sequential dashboard COUNTs into grouped `FILTER`/`GROUP BY` queries or `asyncio.gather` the independent ones. Ensure `list_parts` SQL actually filters `tenantId` (currently only in cache key) â€” coordinate with RLS. | `pagination.py`, `dashboard_service.py`, `analytics.py`, `part_service.py` | **M** | RLS/X1 for tenant-filter placement |
| Repeatable benchmark harness in CI | Replace the SQLite script with a Postgres harness (below). | `scripts/benchmark_bom.py` rewrite, `docker-compose.test.yml`, CI workflow, `tests/load/locustfile.py` | **L** | Closure + indexes + pooling fix must exist to measure target state; needs Postgres in CI |

### Benchmark-harness design

- **Target engine:** containerized Postgres (`docker-compose.test.yml`), never SQLite. Fully runnable on-prem â€” no cloud services.
- **Deterministic seed:** drive `seed_enterprise_data.py` + `load_bom_data.py` (+ `seed_db.py`) to produce **100k parts / 1M multi-level `bom_items_master` rows** with controlled depth/fanout so explosion and where-used are genuinely exercised (not flat rows). Parameterize size for a smaller CI tier vs. a periodic full-scale run.
- **Scenarios (record p50/p95/p99 with warmup):** deep-assembly explosion, widely-used-part where-used, parts search (trigram `ILIKE` **and** FTS), each of the 4 dashboards, and paginated list at high offset.
- **Query proof:** capture `EXPLAIN ANALYZE` for hot queries and **assert index usage** (fail if a seq scan appears where an index is expected).
- **Soak:** run the existing `locustfile.py` at 100 concurrent for a soak pass.
- **CI gate:** regression thresholds â€” fail if p95 exceeds target/baseline. Cache/parameterize seed data so 1M-row seeding doesn't make CI slow/flaky.

### Decisions (WS5)

1. **Explosion structure:** closure table (recommended â€” O(1) explosion **and** where-used) vs. stored materialized path vs. `WITH RECURSIVE` CTE (no extra table but O(depth) per call).
2. **Closure maintenance:** DB triggers (authoritative, handles out-of-band writes, couples to RLS/SECURITY DEFINER) vs. application-layer hooks (simpler, bypassed by bulk SQL). Recommendation: triggers + idempotent bulk-rebuild.
3. **Materialized views:** wire dashboards onto the MVs + scheduled CONCURRENTLY refresh, or delete them and keep tuned base-table queries.
4. **pgbouncer posture:** keep transaction mode + fix asyncpg (`statement_cache_size=0`) and route through it, or drop pgbouncer and pool direct-to-Postgres. Is pgbouncer required at all for single-node local-first installs?
5. **Cache-key convention:** raw namespaced keys (so SCAN invalidation works) vs. hashed `_make_cache_key` (SCAN can't target). Confirm removing the in-process `_part_cache` dict.
6. **Search backend:** in-DB stored `tsvector` + pg_trgm (recommended, local-first) vs. trigram-only vs. external search engine.
7. **Pagination:** introduce keyset for the largest lists + estimate/skip deep COUNTs, or keep OFFSET everywhere.
8. **Concurrency sizing:** confirm worker count so app `pool_size` + pgbouncer `default_pool_size` + Postgres `max_connections` reconcile for 100 concurrent sessions.

### Risks (WS5)

- Closure correctness **depends on the P0 explosion-scoping fix and X1**; building it early risks persisting the same scoping bug into a structure that is expensive to rebuild.
- Closure triggers add write amplification on edits/imports; without the disable-trigger+rebuild path, large imports could be very slow â€” and a buggy trigger corrupts explosion for everyone.
- Cache invalidation must be **exhaustive**; a missed write path re-introduces the stale-tree bug, and where-used invalidation is **cross-BOM** (editing one BOM must invalidate other BOMs' where-used for shared parts).
- `statement_cache_size=0` removes prepared-statement plan caching â†’ per-query planning overhead; confirm it doesn't regress explosion/search under load.
- The `DATABASE_URL`/`DATABASE_URI` mismatch means prod has **likely never actually run through pgbouncer**; enabling it may surface latent transaction-pooling issues (session-level `SET`, advisory locks, `LISTEN/NOTIFY`, RLS `SET LOCAL`) â€” coordinate with the RLS design.
- Stored tsvector + trigram GIN slow writes and grow storage at 100k/1M scale â€” validate in the harness, not just read latency.
- CONCURRENTLY-refreshed MVs lag â†’ slightly stale dashboard KPIs; acceptable only with stakeholder sign-off.
- The harness needs Postgres in CI; 1M-row seeding per run risks slow/flaky CI unless cached or split into CI tier + periodic full run.
- **Local-first constraint:** any scheduler/queue (MV refresh, closure rebuild) must run on-prem (celery_worker / APScheduler in-process), never a cloud cron, or single-node installs silently stop refreshing.

---

## WS6 â€” Packaging (local-first, cross-platform)

### Current state

- **No installer.** Glob for `install.bat/.command/.sh` returns nothing; the only launcher is `scripts/start_servers.bat`, which runs bare-metal uvicorn + `python serve.py` (`start_servers.bat:10-13`), Windows-only. "One-command install" must be built from scratch.
- **Docker topology.** `backend/docker-compose.yml` (dev) has postgres/redis/api/pgbouncer/nginx; `docker-compose.prod.yml` adds MinIO, pgbackrest, celery, prometheus/grafana/loki/alertmanager. **Neither builds or runs the frontend** â€” `frontend/Dockerfile` is unreferenced, nginx serves `./static`, and `main.py` mounts no StaticFiles/SPA. So "open http://localhost:8000" lands on the API only (`/api/docs`); there is **no wired path serving the React app** to a fresh user.
- **Secrets hard-required (blocks zero-config).** Compose uses fail-if-unset for `POSTGRES_PASSWORD` (`docker-compose.yml:11`) and `SECRET_KEY` (`:60`). `config.py` `model_post_init` (`config.py:330-338`) hard-requires `POSTGRES_PASSWORD`, `ENCRYPTION_KEY`, **and `S3_SECRET_KEY` even when object storage is unused** â€” a local-first blocker; `SECRET_KEY` required in-container (`:286-290`); weak-secret/entropy gate rejects trivial values (`:246-364`). Good news: RSA keys auto-generate on first use via `security.py:_ensure_rsa_keys()` (`:21-67`), so only `SECRET_KEY/ENCRYPTION_KEY/POSTGRES_PASSWORD/REDIS_PASSWORD/S3_SECRET_KEY` need generating. A committed `backend/.env` holds real-looking secrets (`.env:9,16,17,20`) â€” must be gitignored, not shipped.
- **Migrations manual, not wired into startup.** 31 Alembic revisions exist (`001..031`). The container CMD is plain uvicorn (`Dockerfile:25`, `Dockerfile.prod:45`) with no `alembic upgrade head` entrypoint; the lifespan calls the **deprecated** `Base.metadata.create_all()` unless `SKIP_CREATE_ALL=true` (`main.py:81-90`). Both runbooks tell operators to run `docker compose exec api alembic upgrade head` by hand (`deployment-runbook.md:88-98`).
- **Bootstrap primitives exist but unorchestrated.** `seed_db.py` creates the default tenant ("Blackbox Factories"/"BBF") + seed data, creating an admin only if `SEED_ADMIN_PASSWORD` is set and not production (`seed_db.py:220-304`). `app/scripts/create_admin.py` creates a superuser from `ADMIN_EMAIL/ADMIN_PASSWORD` with a 12-char complexity gate (`create_admin.py:27-73`). Both idempotent; neither is invoked by any installer.
- **Storage defaults to S3 and misreports local writes.** `Document.storage_type` defaults to `'s3'` (`document.py:55`); `local_fallback_path`/`checksum` columns exist (`:56-57`) with a CHECK allowing `'local'` (`:41-44`). The upload path always calls `s3_storage.upload_file` (`documents.py:158`), which silently writes a hashed file under `UPLOAD_DIR/s3_fallback` on any S3 error (`s3_storage.py:122-136`) â€” but the handler **never sets** `storage_type`/`local_fallback_path`/`checksum` (`documents.py:165-179`), so even a local fallback is recorded as `'s3'` with no local path. There is no first-class local backend.
- **Backup/DR is mature and reusable.** `backup.py` does `pg_dump` (custom format) â†’ gzip â†’ Fernet-encrypt, defaults `storage_type='local'` (`:279-283`), S3 opt-in/dual-storage (`:876-939`), best-effort Redis lock with no-Redis fallback (`:244-260`), and locates `pg_dump`/`pg_restore` across Windows+Linux paths (`:34-49`). `scripts/backup_cron.py --daemon` runs in prod compose; `DISASTER_RECOVERY_RUNBOOK.md` is comprehensive. Surfaceable as the on-prem update/backup story with little new code.

### One-command first-run / install flow (idempotent)

1. **Launch** â€” user runs the per-OS launcher (`install.bat` / `install.command` / `install.sh`).
2. **Verify Docker** â€” detect Docker CLI + running daemon (Docker Desktop on Win/Mac, Engine on Linux); print install guidance and exit if absent.
3. **Generate `.env` (first run only)** â€” if `backend/.env` is absent, generate `SECRET_KEY`, `ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD` (+ placeholder `S3_ACCESS_KEY`/`S3_SECRET_KEY`) via `secrets.token_urlsafe(32)` (satisfies the `config.py` entropy gate), write from `.env.example`, set `ENVIRONMENT=development` and `STORAGE_BACKEND=local`. **Never overwrite an existing `.env`.**
4. **Bring up the stack** â€” `docker compose up -d --build`.
5. **Wait for health** â€” poll `GET /api/v1/health` until 200, reusing the healthcheck contract (`docker-compose.yml:70`).
6. **Migrate** â€” container entrypoint (or orchestrator) runs the bootstrap (`python -m scripts.init_db`) with a DB-wait/retry, with `SKIP_CREATE_ALL=true` to bypass the deprecated `create_all` (`main.py:81-90`); a greenfield DB is built via `Base.metadata.create_all()` + `alembic stamp head` (the historical chain can't replay from empty) while an existing managed DB runs `alembic upgrade head`.
7. **Bootstrap** â€” run `seed_db.py` (default tenant BBF, optional sample data) then `create_admin.py` (superuser from generated `ADMIN_EMAIL`/`ADMIN_PASSWORD`).
8. **Finish** â€” print URL + credentials once and open the browser to the **frontend** URL (per the serving decision), not bare `/api/docs`.

**Re-run safety:** `.env` preserved (never rotated â€” rotating `SECRET_KEY` would invalidate JWTs/encrypted data), compose converges declaratively, the bootstrap (`python -m scripts.init_db`) no-ops on repeat runs, seed/admin skip when data/user already exist (`seed_db.py:220-304`, `create_admin.py:59-61`). Partial-failure resume must be safe.

### Plan

| Item | Approach | Targets | Effort | Dependency |
|---|---|---|---|---|
| Per-OS launcher scripts | Thin wrappers: verify Docker CLI+daemon (guidance+exit if absent) â†’ invoke the shared bootstrap orchestrator â†’ open browser (`start`/`open`/`xdg-open`). Keep OS logic thin; push real work into the orchestrator. | NEW repo-root `install.bat`, `install.command`, `install.sh` | **M** | Bootstrap orchestrator |
| First-run bootstrap orchestrator (idempotent) | Single cross-platform script (Python 3, already required): ensure `.env` â†’ `docker compose up -d --build` â†’ poll `/api/v1/health` â†’ `python -m scripts.init_db` â†’ tenant+admin bootstrap â†’ print URL + open browser. Guard every step for no-op re-runs. | NEW `backend/scripts/bootstrap.py`; consumed by all three launchers | **L** | `.env` generator, entrypoint/migrate, admin bootstrap |
| `.env` generator with auto-generated secrets | First run only: generate secrets via `secrets.token_urlsafe(32)`, write from `.env.example`, set `ENVIRONMENT=development`, `STORAGE_BACKEND=local`. Never overwrite. Gitignore `backend/.env` and remove the committed one from packaging. | NEW generator (in `bootstrap.py`); `backend/.env.example` (add STORAGE/local keys); `.gitignore` | **M** | Local-first storage item (defines which keys are needed) |
| Container entrypoint that migrates before serving | Entrypoint runs the bootstrap `python -m scripts.init_db` (with DB-wait/retry) then execs uvicorn; set `SKIP_CREATE_ALL=true` in compose to disable deprecated `create_all` (`main.py:81-90`). Self-migrating image; removes the manual `docker compose exec` step. | `backend/Dockerfile` & `Dockerfile.prod` (ENTRYPOINT), NEW `backend/scripts/docker-entrypoint.sh`, `docker-compose.yml` | **M** | None |
| Make dev compose local-first & zero-config | Safe defaults for `POSTGRES_PASSWORD`/`SECRET_KEY`/`REDIS_PASSWORD` sourced from generated `.env` (drop hard `:?` fails in dev compose); add `minio` under a compose `profile: [s3]` so object storage is **opt-in**; default api to local storage. Confirm named volumes persist across restarts (`docker-compose.yml:126-133`). | `backend/docker-compose.yml` | **M** | `.env` generator |
| Serve the React frontend from the local stack | Wire one path (see decision). Recommended: add a `frontend` service using `frontend/Dockerfile` (e.g. `:3000`), or build the SPA into nginx `./static` and route `:8000/` via nginx. The launcher must open the URL that actually serves the app. | `backend/docker-compose.yml`, `frontend/Dockerfile`, `nginx.conf`/static | **M** | Compose local-first item; serving decision |
| First-class LOCAL storage backend + correct `storage_type` | Storage abstraction with a local filesystem backend (write under configurable `local_fallback_path`/`UPLOAD_DIR`), selected via `STORAGE_BACKEND` (default `'local'`); change `Document.storage_type` server_default to `'local'`; set `storage_type`/`local_fallback_path`/`checksum` on the row in the upload handler (`documents.py:165-179`). Relax `config.py` so `S3_SECRET_KEY` is required only when S3 is in use (`config.py:330-338`). | NEW `app/core/local_storage.py`, `backend/app/api/endpoints/documents.py`, `backend/app/models/document.py:55`, NEW alembic migration, `config.py` | **L** | Coordinate with X1 (Document may be touched there) |
| Idempotent tenant+admin bootstrap step | Wrap `seed_db.py` (tenant + optional seed) then `create_admin.py`, driven by first-run `ADMIN_EMAIL` + generated-or-prompted `ADMIN_PASSWORD`; print creds/URL once. Reuse existing idempotency. Offer `--with-sample-data`. | `bootstrap.py` wrapping `seed_db.py` + `create_admin.py` | **S** | Orchestrator |
| On-prem update + backup story (docs + reuse) | Document `git pull â†’ docker compose build â†’ entrypoint auto-migrates â†’ restart`; surface the existing backup engine (`backup_cron.py --daemon` in prod compose, or a documented `docker compose exec` call), pointing at `DISASTER_RECOVERY_RUNBOOK.md`. Emphasize named-volume persistence + a pre-update `create_backup`. | NEW `docs/local-install.md`; references `backup.py`, `scripts/backup_cron.py`, `DISASTER_RECOVERY_RUNBOOK.md` | **S** | Entrypoint/migrate |
| Per-OS caveats + packaging docs | Prereqs: Docker Desktop license caveat for large orgs (>250 staff / >$10M revenue) with free alternatives (Docker Engine + Compose plugin on Linux; Colima/Rancher Desktop on Mac); WSL2 on Windows; file-sharing/volume perms; port conflicts (8000/5432/6379). | NEW `docs/local-install.md`; `README.md` Quick Start rewrite | **S** | None |
| OPTIONAL: Electron single-user alternative (spike only) | Time-boxed eval of bundling API (PyInstaller/embedded Python) + managed Postgres (or SQLite compat) + built SPA in an Electron shell for a no-Docker install. Document tradeoffs (loses Postgres-only features: RLS, pgcrypto `019`, MVs `025`; heavy packaging; per-OS code signing). **Recommend NOT building now; keep Docker primary.** | NEW `docs/electron-spike.md` (design note only) | **L** | X1 + DB RLS decisions gate feasibility |

### Local-first storage default change

Today `Document.storage_type` defaults to `'s3'` (`document.py:55`) and the upload path always routes through `s3_storage.upload_file` (`documents.py:158`), silently degrading to a hashed local file under `UPLOAD_DIR/s3_fallback` on error (`s3_storage.py:122-136`) **without recording** `storage_type`/`local_fallback_path`/`checksum` (`documents.py:165-179`). The change: introduce a first-class **local filesystem backend** selected by `STORAGE_BACKEND` (default `'local'`), flip the model server_default to `'local'` via a new migration, and populate `storage_type`/`local_fallback_path`/`checksum` on every upload so DB rows reflect where files actually live. MinIO becomes an opt-in compose profile. This must be sequenced against X1 to avoid a `document.py`/migration collision.

### Secrets / first-run generation

All required secrets (`SECRET_KEY`, `ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, placeholder `S3_*`) are generated once with `secrets.token_urlsafe(32)` (matching the `config.py:246-364` entropy gate) and written to a fresh `backend/.env` from `.env.example`. RSA JWT keys need no env â€” `security.py:_ensure_rsa_keys()` (`:21-67`) auto-generates a 4096-bit keypair on first use. The committed `backend/.env` (`.env:9-20`) must be gitignored and removed from any artifact so no two installs share identical keys. The generator must **never overwrite** an existing `.env` (rotation invalidates JWTs and encrypted data). Open question: relax `config.py`'s hard requirement on `S3_SECRET_KEY`/`ENCRYPTION_KEY` for local-only mode, or keep supplying generated placeholders to satisfy the validator.

### Per-OS notes

- **Windows:** requires WSL2 backend for Docker Desktop; `install.bat` launcher; `start`/browser open; watch ports 8000/5432/6379.
- **macOS:** Docker Desktop or the free **Colima/Rancher Desktop** alternative; `install.command`; `open` for browser; file-sharing/volume perms.
- **Linux:** **Docker Engine + Compose plugin** (no Docker Desktop license concern); `install.sh`; `xdg-open`.
- **All:** Docker Desktop paid-license caveat for large orgs (>250 employees or >$10M revenue) must be surfaced in docs; preflight port check for 5432/6379/8000/80/443 or a documented remap; named-volume persistence across restarts.

### Decisions (WS6)

1. **Frontend serving model:** (a) `frontend` container on `:3000`, (b) build SPA into nginx `./static` and serve everything on `:8000`, or (c) mount the built SPA into the api via StaticFiles. Determines which URL the launcher opens.
2. **Admin credential UX:** auto-generate a strong password and print once, vs. interactive prompt (breaks the one-command promise on non-TTY/GUI launches), vs. fixed default (rejected â€” 12-char gate + prod refuses defaults).
3. **Config relaxation:** relax the hard requirement that `S3_SECRET_KEY`/`ENCRYPTION_KEY` be non-empty in local-only mode, or keep generating placeholders.
4. **Object storage default:** MinIO as an opt-in compose profile (recommended) vs. always-on â€” confirms uploads default to local filesystem.
5. **Migration execution point:** bake `alembic upgrade head` into the container entrypoint (self-migrating) vs. a discrete orchestrator step; confirm `SKIP_CREATE_ALL=true` to retire deprecated `create_all`.
6. **Bootstrap language/runtime:** Python (recommended, already a dependency, cross-platform) vs. duplicated shell/batch.
7. **Electron path scope:** spike-only now, or drop entirely given conflicts with Postgres-only features.
8. **Storage-change ownership:** ship the local storage backend in WS6 now, or defer the `Document.storage_type='local'` change to X1 to avoid a `document.py`/migration merge collision.

### Risks (WS6)

- **Docker Desktop licensing:** silently assuming Docker Desktop violates paid-license terms for large orgs; the installer must detect and message Engine/Colima/Rancher alternatives or become a compliance liability.
- **Committed secrets:** `backend/.env` ships real-looking secrets (`.env:9-20`); if packaged to a new PC, every install shares identical keys. Must gitignore, remove from the artifact, always generate fresh.
- **Frontend gap:** no compose service serves the SPA and `main.py` mounts no static files, so a naive "open :8000" shows only `/api/docs`. Must be resolved before shipping the launcher.
- **Storage mislabeling:** uploads record `storage_type='s3'` even when written locally and never set the local path/checksum (`documents.py:158-179`) â€” a local-first install would have DB rows that don't reflect where files live, breaking future document migration/backup.
- **Config hard-fail:** `config.py:330-338` requires `S3_SECRET_KEY`/`ENCRYPTION_KEY`, so a truly zero-config run crashes at startup unless the generator or a config change supplies values.
- **Migration not automated:** without the entrypoint change the first run leaves an empty/deprecated-`create_all` schema; the app boots but Alembic constructs (pgcrypto `019`, MVs/indexes `025`, tenant NOT NULL `026`, FK cascades `028`) may be missing, causing subtle runtime failures.
- **Cross-workstream collision:** the local-storage change touches `app/models/document.py`, which the X1 canonical-BOM/RLS design may also modify â€” uncoordinated edits risk conflicting migrations.
- **Idempotency edge cases:** partial first-run failure (compose up succeeds, alembic fails) must be resumable; a naive re-run that regenerates `.env` would rotate `SECRET_KEY` and invalidate JWTs/encrypted data. Generator must never overwrite `.env`.
- **Port conflicts** (5432/6379/8000/80/443 already bound) break `compose up`; the launcher needs a preflight check or documented remap.
- **Electron path** (if pursued) conflicts with Postgres-only features (RLS, pgcrypto, MVs); a SQLite/embedded substitution would fork behavior and undermine multi-tenant isolation.

---

## Decisions needed from the stakeholder

1. **Explosion structure (WS5):** closure table (recommended) vs. materialized path vs. `WITH RECURSIVE` CTE.
2. **Closure maintenance (WS5):** DB triggers + idempotent bulk-rebuild (recommended) vs. application-layer hooks.
3. **Materialized views (WS5):** wire dashboards onto MVs + scheduled CONCURRENTLY refresh, or delete them and tune base-table queries.
4. **pgbouncer posture (WS5):** transaction mode + `statement_cache_size=0` and route through it, vs. drop pgbouncer and pool direct â€” and whether pgbouncer is required at all for single-node local-first.
5. **Cache-key convention (WS5):** raw namespaced keys (SCAN-friendly, recommended) vs. hashed keys; confirm removing the `_part_cache` dict.
6. **Search backend (WS5):** in-DB `tsvector` + pg_trgm (recommended, local-first) vs. trigram-only vs. external engine.
7. **Pagination (WS5):** add keyset + estimate/skip deep COUNTs, or keep OFFSET everywhere.
8. **Concurrency sizing (WS5):** confirm worker count to reconcile app pool + pgbouncer `default_pool_size` + Postgres `max_connections` for 100 concurrent sessions.
9. **Frontend serving model (WS6):** `frontend` container `:3000` vs. SPA-into-nginx-`:8000` vs. StaticFiles-in-api â€” sets the launcher URL.
10. **Admin credential UX (WS6):** auto-generate + print once (recommended) vs. interactive prompt vs. fixed default (rejected).
11. **Config relaxation (WS6):** relax `S3_SECRET_KEY`/`ENCRYPTION_KEY` hard requirement in local-only mode vs. keep generating placeholders.
12. **Object storage default (WS6):** MinIO opt-in profile (recommended) vs. always-on; confirms local-filesystem default for uploads.
13. **Migration execution point (WS6):** self-migrating entrypoint vs. discrete orchestrator step; confirm `SKIP_CREATE_ALL=true`.
14. **Bootstrap runtime (WS6):** Python (recommended) vs. duplicated shell/batch.
15. **Electron single-user path (WS6):** spike-only now vs. drop entirely.
16. **Storage-change ownership (WS6):** ship local storage backend now vs. defer `storage_type='local'` to X1 to avoid a `document.py` merge collision.

---

## Sequencing

Both workstreams sit **after core-correctness**. Neither should start before the P0 workstream stabilizes the core logic (including scoping the BOM explosion) and before the X1 canonical-BOM-model + DB-RLS design lands, because those define the node identity, tenant scoping, and row-security semantics that WS5 and WS6 build on.

1. **P0 â€” core correctness (prerequisite).** Fixes the explosion logic and scoping. Nothing below should encode structure until this is stable.
2. **X1 â€” canonical BOM model + DB RLS (prerequisite / XL).** Defines node identity, tenant scoping, and RLS. The **closure table (WS5 XL) depends directly on X1** â€” it must key on X1 node identity and inherit X1 tenant scoping; the closure triggers must be coordinated with the RLS design (SECURITY DEFINER under row security). WS6's local-storage change must also be sequenced against X1 to avoid a `document.py`/migration collision.
3. **WS5 â€” Performance & scale (after P0 + X1).** Independent, non-XL items (pooling/routing fix, cache invalidation, pg_trgm/tsvector + composite indexes, MV wiring, pagination hardening) can proceed once P0 lands and can partly overlap X1. The **closure table + maintenance triggers** wait for X1. The **benchmark harness** lands after closure + indexes + pooling fix so it measures the target state. The pooling/routing fix should be prioritized early because load-testing and benchmarks will error out until it is done.
4. **WS6 â€” Local-first packaging (last, once the app is stable).** The installer, first-run orchestrator, entrypoint auto-migration, zero-config compose, frontend serving, and local-storage backend should be built only after the schema (X1/RLS), core logic (P0), and the WS5 performance changes are settled â€” so the one-command install ships a stable, correct, performant app rather than packaging a moving target. The Electron spike, if pursued at all, is a design note gated on the finalized X1 + RLS decisions.