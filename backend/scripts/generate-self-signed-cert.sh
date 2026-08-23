#!/bin/sh
# Generate a self-signed TLS certificate for an on-prem install.
#
# Why this exists: ENVIRONMENT=production makes the backend mark auth cookies
# Secure, so production mode without TLS means nobody can log in. An internal
# deployment on a hostname like bom.corp.local has no public CA to issue for it,
# and "just use HTTP" is not an option in production mode. A self-signed cert
# closes that gap.
#
# Browsers will warn on first visit; import the cert into your org's trust store
# (or use your internal CA) to remove it. For an internet-facing host use a real
# certificate from certbot or your CA instead — this is not that.
#
# Usage:  sh backend/scripts/generate-self-signed-cert.sh [hostname] [days]
set -eu

HOST="${1:-localhost}"
DAYS="${2:-825}"   # 825 is the max most browsers still accept
OUT="${CERT_DIR:-./certs}"

if ! command -v openssl >/dev/null 2>&1; then
    echo "error: openssl not found. Install it, or copy a cert pair into $OUT/ manually." >&2
    exit 1
fi

mkdir -p "$OUT"

if [ -f "$OUT/privkey.pem" ] || [ -f "$OUT/fullchain.pem" ]; then
    echo "refusing to overwrite an existing cert in $OUT/" >&2
    echo "delete privkey.pem and fullchain.pem first if you really mean to replace them." >&2
    exit 1
fi

# subjectAltName, not just CN: every current browser ignores CN for hostname
# matching, so a CN-only cert is rejected outright.
openssl req -x509 -newkey rsa:2048 -sha256 -nodes \
    -keyout "$OUT/privkey.pem" \
    -out "$OUT/fullchain.pem" \
    -days "$DAYS" \
    -subj "/CN=$HOST" \
    -addext "subjectAltName=DNS:$HOST,DNS:localhost,IP:127.0.0.1"

chmod 600 "$OUT/privkey.pem"

echo "Wrote $OUT/fullchain.pem and $OUT/privkey.pem for '$HOST' (valid $DAYS days)."
echo
echo "Next:"
echo "  docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d"
echo "  then open https://$HOST/"
