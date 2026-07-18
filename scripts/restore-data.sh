#!/usr/bin/env bash
# Load a backup produced by scripts/backup-data.sh (Postgres database +
# uploaded files + RSA signing keys) into a running local-first stack — the
# other half of "move existing data to a new PC" (see README).
#
# Run this AFTER a fresh `docker compose up --build -d` has already created
# the (empty, migrated) stack on the new machine.
#
# Usage:
#   ./scripts/restore-data.sh backups/20260718-120000
#
# WARNING: this REPLACES the current database contents, uploaded files, and
# RSA signing keys. Only run it right after a fresh install you intend to
# populate from the backup.
#
# Non-behavioral deployment glue — does not touch application code.
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="${1:-}"
if [ -z "${SRC}" ] || [ ! -d "${SRC}" ]; then
  echo "Usage: $0 <backup-folder>   (e.g. backups/20260718-120000)" >&2
  exit 1
fi
for f in db.dump uploads.tar.gz rsa_keys.tar.gz; do
  if [ ! -f "${SRC}/${f}" ]; then
    echo "ERROR: ${SRC}/${f} not found — is this a folder produced by backup-data.sh?" >&2
    exit 1
  fi
done

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-bom_user}"
POSTGRES_DB="${POSTGRES_DB:-bom_db}"

if [ -z "$(docker compose ps -q db 2>/dev/null)" ] || [ -z "$(docker compose ps -q backend 2>/dev/null)" ]; then
  echo "ERROR: the stack isn't up. Run 'docker compose up --build -d' first, then retry." >&2
  exit 1
fi

echo "[restore] restoring Postgres database '${POSTGRES_DB}' from ${SRC}/db.dump..."
docker compose cp "${SRC}/db.dump" db:/tmp/ws6-restore.dump
docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD:-}" db \
  pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists --no-owner /tmp/ws6-restore.dump
docker compose exec -T db rm -f /tmp/ws6-restore.dump

echo "[restore] restoring uploaded files..."
docker compose cp "${SRC}/uploads.tar.gz" backend:/tmp/ws6-uploads.tar.gz
docker compose exec -T backend sh -c \
  "rm -rf /app/uploads/* && tar xzf /tmp/ws6-uploads.tar.gz -C /app/uploads && rm -f /tmp/ws6-uploads.tar.gz"

echo "[restore] restoring RSA signing keys..."
docker compose cp "${SRC}/rsa_keys.tar.gz" backend:/tmp/ws6-rsa_keys.tar.gz
docker compose exec -T backend sh -c \
  "rm -rf /rsa_keys/* && tar xzf /tmp/ws6-rsa_keys.tar.gz -C /rsa_keys && rm -f /tmp/ws6-rsa_keys.tar.gz"

echo "[restore] restarting backend so it picks up the restored RSA keys..."
docker compose restart backend

echo "[restore] done. Open http://localhost and sign in with your existing account(s)."
