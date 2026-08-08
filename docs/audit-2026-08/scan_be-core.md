# Audit: backend/app/core, db, monitoring, scripts, main.py, __init__.py

Scope read in full (41 files): app/main.py, app/__init__.py, and every file under
app/core, app/db, app/monitoring, app/scripts (excluding node_modules/dist/build/
release/__pycache__/.venv/_archive/"reference ui" — none of which exist in this
scope anyway).

Overall impression: this module has clearly already been through prior audit
passes — many files carry inline comments referencing specific fixed findings
("Audit finding A13", "Audit finding A7", RLS bootstrap notes, HMAC webhook
signature fix, tar-slip fix, WS rate-limit member-collision fix, etc). The
remaining issues found below are either (a) the *same class* of bug fixed in
one place but left unfixed in a sibling code path, or (b) unauthenticated/
fabricated-data exposure that slipped through.

---

## 1. [HIGH] Unauthenticated `/api/v1/health/detailed` leaks internal data AND fabricates security-status fields

**Files:**
- `backend/app/api/api_v1.py:373-375`
- `backend/app/monitoring/health.py:15-157`

```python
# api_v1.py
@api_router.get("/health/detailed")
async def detailed_health(db: AsyncSession = Depends(get_db)):
    return await get_detailed_health(db)
```

No `Depends(get_current_user)` — contrast with the sibling endpoint two lines
above:

```python
@api_router.get("/metrics")
async def prometheus_metrics(user: User = Depends(get_current_user)):
```

`get_detailed_health()` returns, to any unauthenticated caller:
- Row counts for `users`, `parts`, `boms`, `bom_items_master`, `projects`,
  `vendors`, `po_headers`, `work_orders`, `eco_headers`, `backup_history`
  (`_check_db_integrity`, health.py:132-157) — business-volume data (how many
  customers/parts/POs a tenant has) with no auth at all.
- Memory/disk/platform details, Redis connectivity.
- A block of **hardcoded** fields that are never actually derived from live
  config, so they always claim protections are on even when they are not:

```python
health["authentication"] = {
    "mfa_available": True,
    "mfa_enforced_for_superusers": True,
    "session_timeout_minutes": 60,
    "sso_providers": ["google", "github", "microsoft"],
}
health["security"] = {
    "csrf_protection": True,
    "security_headers_enabled": True,
    "rate_limiting_enabled": True,
    "ws_rate_limiting_enabled": True,
}
```

`sso_providers` lists all three regardless of whether
`GOOGLE_CLIENT_ID`/`GITHUB_CLIENT_ID`/`MICROSOFT_CLIENT_ID` are actually
configured (they default to `""` in config.py). `rate_limiting_enabled`/
`csrf_protection` are compile-time constants, not checks — this is fabricated
data presented as a real status to whatever calls this endpoint (a monitoring
dashboard, a security scanner, or literally anyone on the network since it
needs no auth).

The existing test confirms the auth gap was not intentional — it *sends*
`auth_headers` even though the endpoint doesn't require them:

```python
# app/tests/test_monitoring.py:20-25
async def test_detailed_health(client, auth_headers):
    resp = await client.get("/api/v1/health/detailed", headers=auth_headers)
```

**Failure scenario:** any unauthenticated actor on the network calls
`GET /api/v1/health/detailed` and receives internal business metrics plus a
"security: all green" attestation that isn't actually checked.

**Fix hint:** add `Depends(get_current_superuser)` (matching `/metrics`) and
compute the `authentication`/`security` fields from actual `settings` values
instead of hardcoding `True`/provider lists.

---

## 2. [HIGH] `create_admin.py` always crashes — breaks the documented bootstrap flow

**File:** `backend/app/scripts/create_admin.py:23,54`

```python
from app.db.session import AsyncSessionLocal
...
async def main():
    ...
    async with AsyncSessionLocal() as db:
```

`app/db/session.py` defines:

```python
# Placeholder — replaced by init_engine()
AsyncSessionLocal = None
```

`AsyncSessionLocal` is only ever reassigned *inside* `init_engine()`
(`_module.AsyncSessionLocal = _session_maker`, session.py:69), which this
script never calls. `from app.db.session import AsyncSessionLocal` binds the
name in `create_admin.py`'s namespace to whatever value it had **at import
time** — always `None`, since nothing in this script's process ever runs
`init_engine()`. Even if some other code later reassigned
`app.db.session.AsyncSessionLocal`, this script's own copy of the name would
still be `None` (plain `from x import y` does not create a live binding).

Every other place in the codebase that needs a session lazily calls
`await get_session_maker()` (which calls `init_engine()` if needed) — e.g.
`app/core/cache.py:183`, `app/core/job_queue.py:99`, `app/core/backup.py:332`.
This script is the one place that skips that and uses the raw placeholder.

This is also the **documented** way to create the initial admin:

```
# backend/docs/admin-guide.md:38-39
# Create initial admin user
docker compose exec api python -m app.scripts.create_admin
```

Running it as documented spawns a fresh process where `init_engine()` has
never run, so `AsyncSessionLocal` is `None` and
`async with AsyncSessionLocal() as db:` raises `TypeError: 'NoneType' object
is not callable` — the script cannot ever succeed as written/documented.

**Fix hint:** call `await get_session_maker()` (or `await init_engine()`)
before opening the session, e.g.
`async with (await get_session_maker())() as db:`.

---

## 3. [MEDIUM] Redis rate-limit sorted-set member collision — same bug fixed elsewhere, left open here

**File:** `backend/app/core/deps.py:29-47` (used by `_check_api_key_rate_limit`
and `_check_user_rate_limit`, i.e. the 120/min API-key and 300/min per-user
limits enforced on every authenticated request)

```python
async def _check_redis_rate_limit(key: str, max_requests: int, window: int = 60) -> bool:
    ...
    now = int(time.time())
    window_start = now - window
    pipe = r.pipeline()
    pipe.zremrangebyscore(key, 0, window_start)
    pipe.zcard(key)
    pipe.zadd(key, {str(now): now})
    pipe.expire(key, window)
    results = await pipe.execute()
    count = results[1]
    return not count >= max_requests
```

The sorted-set *member* is `str(now)` where `now = int(time.time())` — i.e.
member and score are both the truncated-to-the-second timestamp. Every request
that lands within the same wall-clock second writes the **same member**, so
`ZADD` just re-scores an existing member instead of adding a new one; the set
never grows past one entry per second no matter how many requests arrive in
that second. `ZCARD` (taken *before* the `ZADD` in the same pipeline, so it's
already a per-second undercount for bursts) therefore permanently undercounts
burst traffic, and the limiter allows far more than `max_requests`/window for
clients that fire requests faster than 1/second — which is the normal case for
any interactive UI.

This is the *exact* bug already identified and fixed in the WebSocket rate
limiter in `main.py`, with this comment:

```python
# main.py:608-611
# A13: this used int(time.time()) as BOTH score and member. Every
# connection within the same second wrote the identical member, so
# the sorted set collapsed them into one entry and a burst counted
# as a single attempt. Use a float score and a unique member.
now = time.time()
...
member = f"{now:.6f}:{uuid.uuid4().hex}"
```

`deps.py`'s `_check_redis_rate_limit` — the function backing the per-API-key
and per-user Redis rate limits — was never given the same fix.

**Failure scenario:** with Redis enabled, a burst of e.g. 50 requests from one
user within the same second is undercounted to ~1 in the sorted set, so the
300/min (or 120/min API-key) limit doesn't trigger anywhere near where it
should — the fix applied to the WS path (A13) does not cover this shared
authenticated-request path.

**Fix hint:** apply the same fix as `main.py`'s `_check_ws_redis_rate_limit`:
score by float `time.time()` and use a unique member (e.g.
`f"{now:.6f}:{uuid.uuid4().hex}"`).

---

## 4. [MEDIUM] Audit log records the proxy's IP, not the real client IP, behind a proxy

**File:** `backend/app/core/audit_middleware.py:92`

```python
client_ip = request.client.host if request.client else "unknown"
```

The codebase has a dedicated, proxy-aware helper for exactly this
(`app/core/client_ip.py`), used by the rate limiter (`app/core/rate_limit.py`)
and by the WS endpoint in `main.py` (with an explicit comment about why raw
`.client.host` is wrong behind a proxy — see the A13 comment at
`main.py:676-683`). `AuditLogMiddleware` was not updated to use it and still
reads `request.client.host` directly.

**Failure scenario:** with `settings.BEHIND_PROXY=True` (the documented nginx
deployment), every row written to `audit_logs.userIp` records the reverse
proxy's address instead of the real client — the audit trail (used for
security/compliance investigation) cannot attribute any action to an actual
source IP once behind a proxy.

**Fix hint:** `client_ip = get_client_ip(request)` (same helper already used
elsewhere).

---

## 5. [LOW] `MetricsMiddleware.EXCLUDED_PATHS` never matches the real routes it's meant to exclude

**File:** `backend/app/monitoring/metrics.py:272,289`

```python
EXCLUDED_PATHS: frozenset = frozenset({"/metrics", "/health", "/health/detailed"})
...
if path not in self.EXCLUDED_PATHS:
    metrics.record_request(method, path, status_code, duration)
```

`/metrics` and `/health/detailed` are only ever registered under the API
prefix (`api_v1.py`, prefix `settings.API_V1_STR` = `/api/v1`), so the actual
request paths are `/api/v1/metrics` and `/api/v1/health/detailed` — neither
matches the bare strings in `EXCLUDED_PATHS`. Only the root `/health` (which
main.py registers unprefixed) actually gets excluded. Comment says "Paths to
exclude from metrics (e.g. the /metrics endpoint itself)" but `/metrics`
itself is not excluded.

**Failure scenario:** every Prometheus scrape of `/api/v1/metrics` (typically
every 15s, forever) adds an entry to `http_requests_total`/
`http_request_duration_seconds` for `GET /api/v1/metrics`, and the same for
polling of `/api/v1/health/detailed` — self-referential noise in the metrics
the endpoint is supposed to be excluded from. Harmless functionally, just
contradicts the stated intent.

**Fix hint:** compare against `f"{settings.API_V1_STR}/metrics"` etc., or
match by suffix.

---

## 6. [LOW] Dead code: `app/core/job_queue.py`'s job queue has no producer

**File:** `backend/app/core/job_queue.py`

`enqueue_job()` (line 36) and the two registered handlers in `_JOB_HANDLERS`
(`bulk_import` → `_handle_bulk_import`, `email` → `_handle_email_notification`)
are never called anywhere in the codebase (verified via repo-wide search —
the only reference to `enqueue_job` is its own definition). The bulk-import
endpoint (`app/api/endpoints/bulk_import.py`) processes imports synchronously
and never touches this queue.

`start_queue_worker()` / `stop_queue_worker()` *are* wired into
`main.py`'s `lifespan()` (started/stopped on app startup/shutdown), so the
app spends the whole process lifetime running a `while True: ... await
asyncio.sleep(5)` loop that scans an always-empty `_job_queue` list. Harmless
(negligible CPU), but it's fully-built, wired-up infrastructure with zero
callers — worth deleting or wiring up, since as-is it can silently mislead
anyone who assumes bulk imports or emails run through it.

---

## 7. [LOW] Dead code: unregistered duplicate tenant-id listener

**File:** `backend/app/core/tenant_events.py:108-113`

```python
def auto_populate_tenant_id(mapper, connection, target):
    """Direct listener compatible with all SQLAlchemy versions."""
    if hasattr(target, "tenantId") and target.tenantId is None:
        tid = get_tenant_id()
        if tid is not None:
            target.tenantId = tid
```

This free function is never passed to `event.listens_for`/`event.listen`
anywhere, and has no other caller in the repo (only its own definition
matches a repo-wide search for `auto_populate_tenant_id`). The actually-active
tenant-populating listener is the inner `set_tenant_id` closure registered
inside `_register_insert_listener` a few lines above. This one is a leftover
duplicate that does nothing.

---

## Also reviewed, no issues found worth flagging

- `app/core/security.py` — JWT create/verify: algorithm confusion is blocked
  (`alg != settings.ALGORITHM` check in `verify_token`), blacklist + bulk
  per-user revocation both checked in `verify_token_with_blacklist`.
- `app/core/deps.py` — API-key scope enforcement defaults to `"write"` for any
  unrecognized HTTP method (deny-by-default), `isinstance` guard on
  `api_key.scopes` prevents the `"read" in "read,write"` substring-truthiness
  trap explicitly called out in the code comment.
- `app/core/csrf.py`, `app/core/auth_cookie.py` — double-submit cookie CSRF
  with HMAC signing and `hmac.compare_digest`; cookie flags look correct for
  the stated threat model.
- `app/db/rls.py`, `app/db/session.py` — RLS bootstrap/pin flow and DB
  connection retry logic are consistent and well-documented; no gaps found.
- `app/core/backup.py` — tar-slip fix (`filter="data"`), real HMAC-SHA256
  webhook signatures, streamed chunked encryption for large dumps, Redis-
  backed backup lock with graceful no-Redis fallback. No new issues found
  beyond what's already flagged/fixed in comments.
- `app/core/rate_limit.py` — `_check_redis_available()`'s early `return True`
  for any non-localhost URL (skips the actual ping for exactly the case
  — a real/remote Redis — where connectivity most needs verifying) is a minor
  doc/behavior mismatch with the function's own docstring ("Check if Redis is
  reachable"), but I could not trace a concrete resulting crash within this
  file's scope, so I'm not elevating it beyond this note.
