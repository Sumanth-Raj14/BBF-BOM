# Infra + Governance Docs Audit — bom-tool

Scope: docker-compose.yml, docker-compose.prod.yml (absent), .github/, deploy/ (absent),
.env.example, PROJECT_REFERENCE.md, README.md, SYSTEM_WORKFLOW.md, MODULE_REFERENCE.md,
OPEN_ITEMS.md, RELEASE_NOTES.md, TESTING_AND_VALIDATION.md, RECOMMENDED_MAJOR_IMPROVEMENTS.md

Note: `docker-compose.prod.yml` and `deploy/` do not exist anywhere in the repo (verified via
`ls`), despite both README.md and MODULE_REFERENCE.md-adjacent docs referencing them.

## Findings

### 1. ci.yml `test-backend` job runs `alembic upgrade head` against an empty Postgres — documented to fail
`.github/workflows/ci.yml:96-97`
```
- name: Run migrations
  run: alembic upgrade head
```
This runs directly against a brand-new `postgres:15` service container with no prior bootstrap.
`.github/workflows/postgres-ci.yml:4-13` (that workflow's own header comment) states in so many
words that this exact pattern fails on a truly empty database because "migrations 004+ reference
tables (po_headers and ~73 others) that only ever existed via `Base.metadata.create_all()` and
weren't formalized into migrations until revision 022" — which is precisely why `postgres-ci.yml`
exists as the real gate (it uses `python -m scripts.init_db` instead). `RECOMMENDED_MAJOR_IMPROVEMENTS.md:504`
independently flags the same job as "appear broken as written" for the same reason. Unfixed as of
the current `ci.yml`.
Severity: high (CI job fails/misleads on every run; masks real signal behind `postgres-ci.yml`).

### 2. ci.yml `build-and-push` builds from repo root with no Dockerfile there
`.github/workflows/ci.yml:254-260`
```
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
```
No `file:`/dockerfile parameter is given, so buildx looks for `./Dockerfile`. Verified: there is
no `Dockerfile` at the repository root — only `backend/Dockerfile` and `frontend/Dockerfile`
exist. This job runs on every push to `main`/`develop` (`if: github.event_name == 'push'`) and
will fail every time. Also flagged independently in `RECOMMENDED_MAJOR_IMPROVEMENTS.md:504`.
Severity: high.

### 3. ci.yml deploy jobs target a Compose service (`api`) that doesn't exist
`.github/workflows/ci.yml:283-289` (deploy-staging) and `:313-317` (deploy-production):
```
docker compose pull api &&
docker compose up -d --no-deps api &&
docker compose exec api alembic upgrade head &&
```
Every compose/Make artifact actually in this repo names the service `backend`:
- `docker-compose.yml:54` — `backend:` service.
- `Makefile:59` — `migrate: docker compose exec backend python -m scripts.init_db`.
There is no `api` service anywhere. If the staging/production host's compose file mirrors this
repo's (the deploy `cd`'s into `/opt/bom-tool`, the same project), both deploy jobs fail with
"no such service: api". Also independently flagged in `RECOMMENDED_MAJOR_IMPROVEMENTS.md:504,520`
("align the deploy job's compose service name to `backend`") — a known, still-unfixed issue.
Severity: high (production/staging deploy path is broken as written).

### 4. RELEASE_NOTES.md fabricates a fix that isn't in the file it names
`RELEASE_NOTES.md:296-297` (Known Issues, v2.0.0):
> "**Workaround**: Automated in `docker-compose.yml` via `docker/postgres/init.sql`, which runs
> `ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64)` on DB init."

Actual contents of `docker/postgres/init.sql` (full file):
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```
No `ALTER TABLE alembic_version` statement exists in that file (or anywhere in `docker/`). The
actual fix (per `PROJECT_REFERENCE.md:72` and `MODULE_REFERENCE.md:518-521`) lives in
`backend/alembic/env.py`, which widens the column to VARCHAR(255) at migration-run time — a
different mechanism entirely from what RELEASE_NOTES.md describes. This is a concrete,
verifiable false claim about what a specific file does.
Severity: medium (historical/unrevised section per the doc's own disclaimer, but still presents
a specific, checkable, false technical claim to any reader/auditor).

### 5. MODULE_REFERENCE.md's "Known Limitations" section contradicts the rest of the current doc set
`MODULE_REFERENCE.md:1361-1373`:
> "⚠️ Alembic VARCHAR(32) Issue ... Status: Documented, not yet resolved"
> "⚠️ Alembic ENV VAR Handling ... Ignores app's `.env` file ... Status: Documented, workaround in place"

But `PROJECT_REFERENCE.md:71-74` and `OPEN_ITEMS.md:14-15,40-42` (both more current, dated
2026-08-02/2026-07-19 with explicit ✅ RESOLVED markers) state both issues were fixed in
`alembic/env.py` (auto-widening + `.env`/`POSTGRES_*` fallback) well before this snapshot. Since
MODULE_REFERENCE.md is one of the docs this project's own CLAUDE.md instructs be treated as
current (`OPEN_ITEMS.md` is the "primer" list, but MODULE_REFERENCE.md is listed in
PROJECT_REFERENCE.md §13 as a "deep-dive doc kept in sync"), a reader consulting it gets stale,
contradicted information presented as current status.
Severity: medium (doc-mismatch; no code impact, but actively misleading given the promise of
"kept in sync").

### 6. Broken cross-reference links in two top-level docs
`MODULE_REFERENCE.md:1396-1409` — Cross-Reference table links `API.md`, `DATABASE.md`,
`DEPLOYMENT.md`, `TESTING.md`, `OPERATIONS.md` — none of these files exist anywhere in the repo
(verified). Only `ARCHITECTURE.md` and (indirectly) `SECURITY.md` of the linked set actually exist.

`TESTING_AND_VALIDATION.md:799-808` — Cross-Reference table links `docs/ARCHITECTURE.md`,
`docs/TECH_STACK_AND_WORKING.md`, `docs/API_REFERENCE.md`, `docs/OPEN_ITEMS.md`,
`docs/MODULE_REFERENCE.md`, `docs/deployment-runbook.md`, `docs/RELEASE_NOTES.md`,
`docs/FEATURE_CATALOG.md` — none exist under `docs/`; the real files live under `backend/docs/`
with matching names, so every link in this table 404s.
Severity: low (navigation-only, no functional impact, but concretely broken as written).

### 7. README.md describes an infra topology that doesn't match this repo
`README.md:11,101-105,164-181` claims:
- Infra: "Docker Compose, Prometheus/Grafana, PgBouncer, MinIO, ngix" — but
  `docker-compose.yml:13-17` explicitly documents PgBouncer as *intentionally omitted*
  ("Direct-to-Postgres (no pgbouncer) is the supported local-first topology... it is
  intentionally omitted from this single-node deployment"), and `docker-compose.yml`'s four
  services (`db`, `redis`, `backend`, `frontend`) include no Prometheus, Grafana, PgBouncer, or
  MinIO container at all.
- `docker compose -f docker-compose.prod.yml up -d` — this file does not exist in the repo
  (verified: only `docker-compose.yml` at root).
- `cd "BOM and PRD"` and doc paths `BOM and PRD/RELEASE_NOTES.md` etc. — this directory does not
  exist; the current frontend lives at `frontend/` (per `PROJECT_REFERENCE.md` §4's authoritative
  layout).
- `pytest app/tests/ -v # 238+ tests` — stale; current suite collects 648 tests per
  `PROJECT_REFERENCE.md`/`OPEN_ITEMS.md`.
README.md reads as an old, unmaintained generation of the doc superseded by PROJECT_REFERENCE.md,
but it is still the file GitHub renders by default and the one a new contributor opens first.
Severity: medium (actively wrong setup instructions for anyone following README.md literally).

### 8. Orphaned/non-functional Prometheus scrape config (minor)
`docker/monitoring/prometheus.yml:21-30` configures scrape jobs for `db:5432` and `redis:6379`
with `metrics_path: /metrics`, `scheme: http` — but Postgres and Redis speak their own wire
protocols on those ports, not HTTP, and neither exposes `/metrics` without a
`postgres_exporter`/`redis_exporter` sidecar. No such exporter, and no `prometheus`/`grafana`
service at all, is defined in `docker-compose.yml` (only `db`, `redis`, `backend`, `frontend`).
This monitoring config is not wired into the shipped stack anywhere and would not work if it were
(the `backend:8000` job is fine — the app does expose `/metrics` itself).
Severity: low (dead/orphaned config; not reachable from the documented deploy path).

## Cross-checks that came back clean
- `docker-compose.yml` / `.env.example`: internally consistent; required-secret `:?` guards match
  variables documented in `.env.example`; comments about the no-pgbouncer decision and
  SKIP_CREATE_ALL bootstrap ownership are accurate against `PROJECT_REFERENCE.md`.
- `postgres-ci.yml`: internally consistent, its EXPECTED_HEAD (`049_restore_check_constraints`)
  is plausible as current (docs currently cite head `048`, i.e. one migration behind — not
  flagged as a defect since a `049` migration existing between doc passes is expected drift,
  not a bug).
- `solidworks-plugin.yml`: unusually well self-documented about what is/isn't a "real" build on
  a hosted runner; no fabricated success paths found.
- `OPEN_ITEMS.md`: internally consistent and honest about open work; no fabricated "done" claims
  found that don't match code.

## Files read in full (this scope)
docker-compose.yml, .env.example, .github/workflows/ci.yml, .github/workflows/postgres-ci.yml,
.github/workflows/solidworks-plugin.yml, docker/postgres/init.sql, docker/monitoring/prometheus.yml,
docker/monitoring/alerts.yml, docker/monitoring/grafana-dashboard.json (partial — static panel
JSON, confirmed no wiring issue beyond #8), PROJECT_REFERENCE.md, README.md, OPEN_ITEMS.md,
MODULE_REFERENCE.md, TESTING_AND_VALIDATION.md, RELEASE_NOTES.md.

## Files sampled via targeted grep rather than fully line-read (size / effort budget)
SYSTEM_WORKFLOW.md (61.5K), RECOMMENDED_MAJOR_IMPROVEMENTS.md (86.8K) — grepped for
docker-compose/CI/deploy/monitoring terms and read the directly-relevant sections (the
Improvement #7 CI section in RECOMMENDED_MAJOR_IMPROVEMENTS.md, ~line 490-540). No additional
infra-relevant contradictions surfaced in the grepped hits beyond what's captured above;
RECOMMENDED_MAJOR_IMPROVEMENTS.md independently corroborates findings #1-#3.
`docker-compose.prod.yml` and `deploy/` were confirmed absent, not skipped.
