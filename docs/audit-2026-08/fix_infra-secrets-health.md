# Cluster: infra-secrets-health

## Finding 1 — Dockerfile bakes crypto material into image (CONFIRMED, fixed)

`backend/Dockerfile` does `COPY . .` and `backend/.dockerignore` did not exclude
`backend/rsa_keys/private.pem`, `backend/rsa_keys/public.pem`, or `backend/.secret_key`
(confirmed present on disk via Glob — `rsa_keys/private.pem`, `rsa_keys/public.pem`,
`.secret_key` 54B). Only `test.db`/`bom.db` were excluded, and no `test_*.db` pattern
existed (repo has 15 stray `test_*.db` files from prior sessions that would also get
baked in).

**Fix** — `backend/.dockerignore`: added `test_*.db`, `private.pem`, `public.pem`,
`.secret_key`, `rsa_keys/` (unanchored, so they match at any depth, covering both a
root-level `private.pem` and the actual `rsa_keys/private.pem` location). Existing
entries untouched.

No automated test possible for a `.dockerignore` (no Docker available in this
environment); verified by reading the file back and confirming all four names/patterns
present alongside the untouched originals.

## Finding 2 — `/health/detailed` has no auth and lies about security status (CONFIRMED, fixed)

`app/api/api_v1.py`:
- `/metrics` requires `Depends(get_current_user)`; `/health/detailed` (two lines below)
  had no auth dependency at all and delegates to `get_detailed_health(db)`
  (`app/monitoring/health.py`), which runs `_check_db_integrity` — literal `SELECT
  COUNT(*)` over `users`, `parts`, `boms`, `vendors`, `po_headers`, etc. — visible to
  any anonymous caller.
- The same function also always returns `health["security"] = {"csrf_protection":
  True, "security_headers_enabled": True, "rate_limiting_enabled": True,
  "ws_rate_limiting_enabled": True}` and `health["authentication"] = {"mfa_available":
  True, ...}` — hardcoded literals, never actually probed.

**Fix** — kept inside the allowed file (`app/api/api_v1.py`; `app/monitoring/health.py`
was not in my touch list): added `user: User = Depends(get_current_user)` to
`detailed_health`, matching `/metrics` immediately above it. Then, since I can't edit
`health.py` to stop it from *computing* the fabricated blocks, the endpoint now pops
`"security"` and `"authentication"` off the dict before returning it, so the fabricated
values are never surfaced to a caller. `/health` (the plain liveness probe) was left
untouched — still open, still just `{"status": "healthy", ...}`.

**Test** — `app/tests/test_health_auth.py::test_detailed_health_requires_auth` and
`::test_detailed_health_ok_with_auth`.
- RED (confirmed): temporarily reverted the `api_v1.py` edit and ran
  `test_detailed_health_requires_auth` — failed with `assert 200 in (401, 403)`
  (`200 = <Response [200 OK]>.status_code`), proving the endpoint was open.
- GREEN: restored the fix, endpoint now returns 401 without auth, 200 with auth, and
  the response body no longer contains `"security"` or `"authentication"` keys.

Note: pre-existing `app/tests/test_monitoring.py::test_detailed_health` already sends
`auth_headers` on every call, so it stays green unaffected by the new auth requirement.

## Finding 3 — `create_admin.py` crashes on `AsyncSessionLocal` (CONFIRMED, fixed)

`app/scripts/create_admin.py` did `from app.db.session import AsyncSessionLocal` then
`async with AsyncSessionLocal() as db:`. In `app/db/session.py`, `AsyncSessionLocal =
None` is only a placeholder (line 99) until `init_engine()` runs and rebinds the module
attribute (line 69: `_module.AsyncSessionLocal = _session_maker`) — which only happens
via app startup (`app/main.py` calls `init_engine()` in its lifespan). A standalone
script run (`python -m app.scripts.create_admin`) never triggers that, so
`AsyncSessionLocal()` was always `None()` → `TypeError: 'NoneType' object is not
callable`, immediately after password validation, before any DB work.

**Fix** — swapped the import for `get_session_maker` (the same lazy-init accessor
`app/db/session.py` exposes: it calls `init_engine()` itself if `_session_maker` is
still `None`, then returns the real `sessionmaker`), and changed the body to `session_maker
= await get_session_maker(); async with session_maker() as db:`.

**Test** — `app/tests/test_health_auth.py::test_create_admin_uses_real_session_maker`.
Monkeypatches `create_admin.get_session_maker` to hand back a session factory bound to
the test engine (no real/bom_db touched), pre-seeds an existing user via the standard
`test_user`/`test_tenant` fixtures, sets `ADMIN_EMAIL`/`ADMIN_USERNAME` to that existing
user's identity, and calls `create_admin.main()`, asserting it raises `SystemExit(0)`
(the "already exists" branch) rather than crashing.
- RED (confirmed): temporarily reverted `create_admin.py` to the old
  `AsyncSessionLocal` import/usage and ran the test — failed with `AttributeError`
  because the old module has no `get_session_maker` attribute to monkeypatch (i.e. it
  never referenced the lazy-init accessor at all — exactly the bug). This is red
  evidence specific to the finding: the old code path never reaches a session-maker
  call.
- GREEN: restored the fix, test passes — `main()` now reaches the DB query and exits
  cleanly via the existing-user branch instead of crashing on `None()`.

Deliberately did **not** invoke the "create new admin" insert branch of `main()` in the
test — `create_admin.py`'s `User(...)` construction omits `tenantId` (NOT NULL FK on
`users.tenantId`), which is a separate, unrelated latent bug outside this cluster's
scope; forcing that branch would fail on that unrelated constraint and muddy the
regression signal for the actual finding (the `AsyncSessionLocal` crash). Not fixed
here — flagging it for a separate ticket if admin bootstrapping is exercised for real.

## Test execution

Ran (with a private `TEST_DATABASE_URL` sqlite file to avoid lock contention with a
concurrent sibling agent's test run against the shared default `./test.db` — confirmed
via `rm: cannot remove 'test.db': Device or resource busy` and a `401 == 200` transient
failure that only reproduced against the shared file, not in isolation):

```
cd backend
TEST_DATABASE_URL="sqlite+aiosqlite:///./test_healthauth_isolated2.db" \
  python -m pytest app/tests/test_health_auth.py -q
```

Result: **4 passed** (`test_detailed_health_requires_auth`,
`test_detailed_health_ok_with_auth`, `test_plain_health_stays_unauth`,
`test_create_admin_uses_real_session_maker`). Only `app/tests/test_health_auth.py` was
run, per instructions — no other test files, no bom_db.

Temp sqlite files created during isolated runs were deleted afterward.

## Files touched

- `backend/.dockerignore`
- `backend/app/api/api_v1.py`
- `backend/app/scripts/create_admin.py`
- `backend/app/tests/test_health_auth.py` (new)

No other files modified.
