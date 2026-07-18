#!/usr/bin/env bash
# Export the running local-first stack's DATA (Postgres database + uploaded
# files + RSA signing keys) to a timestamped folder under ./backups, so it
# can be copied to a NEW PC and loaded there with scripts/restore-data.sh.
#
# This is the "move existing data to a new machine" story. For a fresh,
# empty install on a new machine, `docker compose up --build` alone is
# enough (see README) — this script is only needed when you want to bring
# your existing data with you.
#
# Usage:
#   docker compose up -d          # stack must already be running
#   ./scripts/backup-data.sh
#
# Non-behavioral deployment glue — does not touch application code.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-bom_user}"
POSTGRES_DB="${POSTGRES_DB:-bom_db}"

if [ -z "$(docker compose ps -q db 2>/dev/null)" ] || [ -z "$(docker compose ps -q backend 2>/dev/null)" ]; then
  echo "ERROR: the stack isn't up. Run 'docker compose up -d' first, then retry." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/${STAMP}"
mkdir -p "${OUT}"

echo "[backup] dumping Postgres database '${POSTGRES_DB}'..."
docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD:-}" db \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc -f /tmp/ws6-backup.dump
docker compose cp db:/tmp/ws6-backup.dump "${OUT}/db.dump"
docker compose exec -T db rm -f /tmp/ws6-backup.dump

echo "[backup] archiving uploaded files (backend_uploads volume)..."
docker compose exec -T backend tar czf /tmp/ws6-uploads.tar.gz -C /app/uploads .
docker compose cp backend:/tmp/ws6-uploads.tar.gz "${OUT}/uploads.tar.gz"
docker compose exec -T backend rm -f /tmp/ws6-uploads.tar.gz

echo "[backup] archiving RSA signing keys (rsa_keys volume)..."
docker compose exec -T backend tar czf /tmp/ws6-rsa_keys.tar.gz -C /rsa_keys .
docker compose cp backend:/tmp/ws6-rsa_keys.tar.gz "${OUT}/rsa_keys.tar.gz"
docker compose exec -T backend rm -f /tmp/ws6-rsa_keys.tar.gz

echo "[backup] done -> ${OUT}/"
echo
echo "To move to a new PC: copy the repo + your .env + this '${OUT}' folder"
echo "there, install Docker, run 'docker compose up --build -d', then:"
echo "  ./scripts/restore-data.sh ${OUT}"
