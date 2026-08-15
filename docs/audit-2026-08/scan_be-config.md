# Backend config/ops audit — backend/{Dockerfile,requirements*.txt,alembic.ini,pytest.ini,*.md,*.cfg,*.toml,*.ini}

Files read in full (7 in-scope + 4 adjacent verification reads):
- backend/Dockerfile
- backend/requirements.txt
- backend/alembic.ini
- backend/pytest.ini
- backend/ruff.toml
- backend/CHANGELOG.md
- backend/CLAUDE.md
- backend/.dockerignore (read to verify Dockerfile's `COPY . .` behavior — directly governs what the Dockerfile ships)
- backend/requirements-test.txt, requirements-e2e.txt, requirements-load.txt (exist as *.txt siblings, quick check)
- Not present in repo: requirements-dev.txt, pyproject.toml, setup.cfg, *.sh, *.ps1 — confirmed via Glob, nothing to read.

## Finding 1 — CRITICAL: Docker build bakes live RSA private key and app secret key into the image
`backend/Dockerfile:19` does `COPY . .` from the backend directory into the image.
`backend/.dockerignore:1-17` only excludes:
```
__pycache__, *.pyc, *.pyo, .env, .git, .gitignore, *.md, test.db, bom.db,
.DS_Store, .venv, venv, node_modules, dist, *.sqlite, backups/, uploads/*.gz
```
It does **not** exclude `rsa_keys/` or `.secret_key`. Verified both exist on disk:
- `backend/rsa_keys/private.pem` (3.4K) — the JWT-signing RSA private key (see `SECURITY_ROTATION_NOTES.md:23`, `app/core/security.py:_ensure_rsa_keys`)
- `backend/.secret_key` (54B)

Because neither is ignored, `docker build` copies them straight into the image filesystem/layer history. Anyone who can pull or `docker save`/`docker history` the image (including through a registry, a CI artifact, or a compromised host) gets the private JWT signing key and the app secret key — enough to forge valid JWTs / decrypt anything keyed off `SECRET_KEY`. This directly contradicts the intent of `SECURITY_ROTATION_NOTES.md`, which treats these as sensitive and rotates them, but the Dockerfile has no matching protection.
Fix: add `rsa_keys/`, `.secret_key`, `*.pem`, `*.log`, `*.pid`, `test_*.db` to `.dockerignore` (or mount keys at runtime via a volume/secret instead of baking them into the image).

## Finding 2 — MEDIUM: `.dockerignore` test-db exclusion is incomplete, bloats and leaks seed data into image
`.dockerignore:8` excludes only the literal `test.db`, but the directory contains 15+ other test databases matching `test_*.db` (e.g. `test_final.db`, `test_p0_full.db`, `test_rebaseline.db`, each 2.5-3.4MB) which are not excluded by any pattern (they don't match `*.sqlite` either — they're `.db`). These get copied into the image via `COPY . .` (Dockerfile:19), bloating the image and potentially shipping stale seeded/test data (which per CHANGELOG 1.2.0 previously included hardcoded credentials like `admin123`) into a build artifact.
Fix: add `test_*.db`, `*.db` (with an allow-list exception if a real db asset is needed) to `.dockerignore`.

## Finding 3 — LOW/informational: Dockerfile base image and dep pins are floating, contradicting CHANGELOG's "pinned" security claims
`backend/Dockerfile:1` — `# TODO: pin by digest in CI`, `backend/Dockerfile:2` — `FROM python:3.12-slim` (floating tag, not pinned to a digest or even a patch version).
`backend/CHANGELOG.md:55` (1.34.0) claims: *"Docker image tags pinned from `:latest` to specific versions across all compose files (pgbackrest:2.53, pgbouncer:1.23, minio:RELEASE.2024-06-11, etc.)"* and mentions a `scripts/pin-docker-digests.sh` helper (CHANGELOG.md:63) — but the backend's own application Dockerfile base image was never pinned; it's still a floating `python:3.12-slim` tag that can silently pick up a new Python 3.12.x point release (and thus a new glibc/openssl) on every rebuild. The TODO comment shows this is known/tracked, not hidden, so this is low severity, but it means the "hardened" changelog claim doesn't fully cover the backend app image itself.
Fix (already tracked via the TODO): pin `FROM python:3.12-slim@sha256:<digest>` in CI as planned.

## Finding 4 — LOW: `requirements.txt` uses open-ended range pins with no lockfile/hash pinning
`backend/requirements.txt:1-29` pins every dependency with a range like `fastapi>=0.111,<1.0`, `sqlalchemy[asyncio]>=2.0,<3.0`, etc. — no lockfile (no `requirements.lock`, no `pip-compile` output, no hashes), and `backend/Dockerfile:17` runs `pip install --no-cache-dir -r requirements.txt` without `--require-hashes`. Two `docker build`s run days apart can silently resolve to different transitive-dependency versions, so a build isn't reproducible and a compromised/broken point release can be pulled in without anyone bumping a version number. This matches the scope's "pinned-vs-floating deps" watch item — real but low severity since ranges are at least capped by major version.

## Non-findings checked and ruled out
- Dockerfile does NOT run as root at container-runtime: a dedicated `bom` user/group is created (`Dockerfile:6`), files are chowned to it (`Dockerfile:8`), and `USER bom` (`Dockerfile:28`) is set before `ENTRYPOINT`/`CMD` — correct, no root-execution issue.
- `alembic.ini:16` has a default dev-only Postgres URL with a blank password (`postgresql+asyncpg://bom_user:@localhost:5432/bom_db`); comment above it correctly states it's overridden by `DATABASE_URL`/`DATABASE_URI` env vars in `env.py` for real environments — not a committed secret, just a documented local default.
- No secrets are hardcoded/committed in the .ini/.toml/.md files themselves (checked alembic.ini, pytest.ini, ruff.toml, CHANGELOG.md, CLAUDE.md, SECURITY_ROTATION_NOTES.md line by line).
- `pytest.ini:7` scoping tests to `app/tests` (excluding legacy top-level `tests/`) is explained with a specific, credible rationale in the comments (shared-state leakage) — not a silent doc/code mismatch.
- `ruff.toml` ignore list is broad (`E501, B904, N815, ...`) but this is a lint-strictness style choice, not a correctness bug — not reported as a finding.
