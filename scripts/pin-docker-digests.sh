#!/usr/bin/env bash
set -euo pipefail

# Enterprise Docker Image SHA256 Digest Pinning Script
# Usage: bash scripts/pin-docker-digests.sh
#
# This script resolves and pins all Docker images to SHA256 digests.
# Run after updating image versions to ensure reproducible builds.

pin_image() {
    local image="$1"
    local tag="${2:-latest}"
    local full="${image}:${tag}"
    echo "Resolving ${full}..."
    local digest
    digest=$(docker pull "${full}" 2>/dev/null && docker inspect "${full}" --format '{{index .RepoDigests 0}}')
    if [ -n "$digest" ]; then
        echo "  → ${digest}"
        echo "${digest}"
    else
        echo "  ERROR: Could not resolve ${full}" >&2
        return 1
    fi
}

resolve_dockerfile_digest() {
    local dockerfile="$1"
    local base_image="$2"
    local digest
    digest=$(pin_image "${base_image}")
    if [ -n "$digest" ]; then
        # Replace either an unpinned "FROM image:tag" or a previously-pinned
        # "FROM image:tag@sha256:..." with the freshly resolved digest.
        sed -i -E "s|(^FROM[[:space:]]+)${base_image}(@sha256:[a-f0-9]+)?|\1${digest}|g" "$dockerfile"
        echo "  Updated ${dockerfile}"
    fi
}

# Resolve a real digest for a compose image and rewrite "image: repo:tag" (or an
# already-pinned "image: repo:tag@sha256:...") in place. NEVER writes a placeholder,
# so re-running this script cannot reintroduce the invalid-digest ship blocker.
pin_compose_image() {
    local file="$1"
    local repo="$2"
    local tag="$3"
    local digest
    digest=$(pin_image "${repo}" "${tag}") || { echo "  SKIP ${repo}:${tag} (unresolved)"; return 0; }
    # pin_image echoes progress lines too; keep only the final repo@sha256 line.
    digest=$(printf '%s\n' "$digest" | grep -Eo '[^[:space:]]+@sha256:[a-f0-9]+' | tail -n1)
    if [ -z "$digest" ]; then echo "  SKIP ${repo}:${tag} (no digest)"; return 0; fi
    local esc_repo="${repo//\//\\/}"
    sed -i -E "s|(image:[[:space:]]*)${esc_repo}:${tag}(@sha256:[a-f0-9]+)?|\1${digest}|g" "$file"
    echo "  Pinned ${repo}:${tag} -> ${digest} in ${file}"
}

echo "=== Pinning Python base images ==="
resolve_dockerfile_digest "backend/Dockerfile" "python:3.12-slim"
resolve_dockerfile_digest "backend/Dockerfile.prod" "python:3.11-slim"

echo ""
echo "=== Pinning docker-compose images (resolving real digests) ==="
# Backend dev compose
pin_compose_image backend/docker-compose.yml postgres 15
pin_compose_image backend/docker-compose.yml redis 7-alpine
pin_compose_image backend/docker-compose.yml bitnami/pgbouncer 1.23
pin_compose_image backend/docker-compose.yml nginx stable-alpine

# Production compose
pin_compose_image backend/docker-compose.prod.yml postgres 16-alpine
pin_compose_image backend/docker-compose.prod.yml pgbackrest/pgbackrest 2.53
pin_compose_image backend/docker-compose.prod.yml redis 7-alpine
pin_compose_image backend/docker-compose.prod.yml bitnami/pgbouncer 1.23
pin_compose_image backend/docker-compose.prod.yml minio/minio RELEASE.2024-06-11T01-11-33Z
pin_compose_image backend/docker-compose.prod.yml nginx stable-alpine

# Monitoring compose
pin_compose_image backend/docker-compose.monitoring.yml prom/prometheus v2.53.0
pin_compose_image backend/docker-compose.monitoring.yml grafana/grafana 11.1.0

# Root compose
pin_compose_image docker-compose.yml postgres 15-alpine
pin_compose_image docker-compose.yml redis 7-alpine
pin_compose_image docker-compose.yml edoburu/pgbouncer 1.23

echo ""
echo "=== Summary ==="
echo "All images pinned to resolved repo@sha256 digests (requires a working Docker daemon + registry access)."
echo "Any image that could not be resolved was left at its current tag and reported as SKIP above."
