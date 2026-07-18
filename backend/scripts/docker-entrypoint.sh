#!/bin/sh
# Backend container entrypoint for local-first Docker deployment (WS6).
#
# Order of operations:
#   1. Wait for Postgres to accept connections (pg_isready poll, bounded retries).
#   2. Export DATABASE_URL (built from POSTGRES_* env vars) so both `alembic`
#      and `seed_rbac.py` connect to the same database the app itself uses.
#   3. Run `alembic upgrade head` — idempotent, safe to run on every start.
#   4. On a genuinely empty database only (roles table has 0 rows), seed the
#      default RBAC catalog via seed_rbac.py. This is a ONE-TIME bootstrap:
#      seed_rbac.py deletes and recreates role/permission rows (and the
#      user_roles links to them) for the tenant it seeds, so re-running it
#      against a database that already has roles would silently wipe any
#      user-role assignments made since. Gating on "0 roles" keeps container
#      restarts safe without touching seed_rbac.py's own idempotency contract.
#   5. exec the real container command (uvicorn), replacing this shell so it
#      becomes PID 1's direct child and receives signals correctly under tini.
#
# Non-behavioral deployment glue only — no application logic lives here.
set -e

: "${POSTGRES_SERVER:=db}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_USER:=bom_user}"
: "${POSTGRES_PASSWORD:=}"
: "${POSTGRES_DB:=bom_db}"
: "${SEED_RBAC_ON_START:=true}"
: "${DB_WAIT_TIMEOUT_SECONDS:=60}"

# app.core.config assembles DATABASE_URI from POSTGRES_* at import time, but
# alembic/env.py and seed_rbac.py both look for DATABASE_URL/DATABASE_URI in
# the environment first. Export one here so all three agree on the same DB.
export DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_SERVER}:${POSTGRES_PORT}/${POSTGRES_DB}}"
export PGPASSWORD="${POSTGRES_PASSWORD}"

echo "[entrypoint] waiting for postgres at ${POSTGRES_SERVER}:${POSTGRES_PORT} (timeout ${DB_WAIT_TIMEOUT_SECONDS}s)..."
waited=0
until pg_isready -h "${POSTGRES_SERVER}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
  waited=$((waited + 1))
  if [ "${waited}" -ge "${DB_WAIT_TIMEOUT_SECONDS}" ]; then
    echo "[entrypoint] ERROR: postgres not ready after ${DB_WAIT_TIMEOUT_SECONDS}s — giving up." >&2
    exit 1
  fi
  sleep 1
done
echo "[entrypoint] postgres is ready."

echo "[entrypoint] running database migrations (alembic upgrade head)..."
alembic upgrade head

if [ "${SEED_RBAC_ON_START}" = "true" ]; then
  role_count=$(psql -h "${POSTGRES_SERVER}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "SELECT COUNT(*) FROM roles;" 2>/dev/null || true)
  case "${role_count}" in
    0)
      echo "[entrypoint] no roles found — seeding default RBAC catalog (first run only)..."
      python seed_rbac.py || echo "[entrypoint] WARNING: seed_rbac.py failed; continuing startup without RBAC seed." >&2
      ;;
    *)
      echo "[entrypoint] roles already present (or role count unknown: '${role_count}') — skipping RBAC seed to avoid clobbering existing role assignments."
      ;;
  esac
else
  echo "[entrypoint] SEED_RBAC_ON_START=false — skipping RBAC seed."
fi

echo "[entrypoint] starting: $*"
exec "$@"
