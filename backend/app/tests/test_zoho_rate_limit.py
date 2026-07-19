"""Zoho Books outbound rate limiter — PROACTIVE client-side token bucket
(app.integrations.zoho_client.TokenBucket / ZohoBooksClient._rate_limiter).

Covers:
  * an initial burst is NOT throttled (acquire() returns immediately up to
    the bucket's capacity);
  * a caller that exceeds the burst is made to wait (awaits a real, positive
    delay) before the next token is granted;
  * a 429 response's Retry-After is honored: the limiter backs off and holds
    the bucket empty until the deadline, then resumes normal refill — proven
    both at the TokenBucket level and end-to-end through ZohoBooksClient.

These tests inject their own TokenBucket (small rate/burst) so they run fast
and deterministically, and never touch the process-wide shared limiter that
ZohoBooksClient uses by default (so other Zoho test modules are unaffected).
"""

import time

import httpx
import pytest

from app.integrations.zoho_client import TokenBucket, ZohoBooksClient, _parse_retry_after


# --- TokenBucket: burst / throttle -----------------------------------------

@pytest.mark.asyncio
async def test_initial_burst_is_not_throttled():
    bucket = TokenBucket(rate_per_min=60, burst=3)
    start = time.monotonic()
    for _ in range(3):
        await bucket.acquire()
    elapsed = time.monotonic() - start
    # Three acquires within capacity must not wait on the refill clock at all.
    assert elapsed < 0.25


@pytest.mark.asyncio
async def test_throttles_once_burst_is_exhausted():
    # 10 tokens/sec, burst of 2: the 3rd acquire must wait for a refill.
    bucket = TokenBucket(rate_per_min=600, burst=2)
    await bucket.acquire()
    await bucket.acquire()  # burst exhausted, 0 tokens left

    start = time.monotonic()
    await bucket.acquire()
    elapsed = time.monotonic() - start
    # Expected wait ~= 1/10s; assert it actually awaited a real, positive
    # delay (not an immediate return) but didn't stall unreasonably.
    assert elapsed >= 0.05
    assert elapsed < 2.0


@pytest.mark.asyncio
async def test_acquire_is_asyncio_safe_under_concurrency():
    """Multiple concurrent acquire() callers must each get exactly one token
    and never oversubscribe the bucket (no lost updates / double-spends)."""
    import asyncio

    bucket = TokenBucket(rate_per_min=600, burst=5)
    granted = []

    async def taker(i):
        await bucket.acquire()
        granted.append(i)

    await asyncio.gather(*(taker(i) for i in range(5)))
    assert sorted(granted) == list(range(5))
    # Bucket should now be (near) empty — no tokens manufactured out of thin air.
    assert bucket._tokens < 1


# --- Retry-After parsing -----------------------------------------------------

def test_parse_retry_after_seconds():
    assert _parse_retry_after("5") == 5.0
    assert _parse_retry_after("0") == 0.0
    assert _parse_retry_after(None) is None
    assert _parse_retry_after("not-a-number-or-date") is None


# --- Retry-After honored: TokenBucket.penalize ------------------------------

@pytest.mark.asyncio
async def test_penalize_holds_bucket_empty_until_deadline_then_refills():
    bucket = TokenBucket(rate_per_min=6000, burst=5)  # fast refill so the
    # test isolates the penalty window, not the normal refill rate.
    await bucket.penalize(0.15)

    start = time.monotonic()
    await bucket.acquire()
    elapsed = time.monotonic() - start
    # Must have waited out (most of) the penalty window before granting a token.
    assert elapsed >= 0.1

    # After the penalty, normal refill resumes — a second acquire should be fast.
    start2 = time.monotonic()
    await bucket.acquire()
    elapsed2 = time.monotonic() - start2
    assert elapsed2 < 0.5


# --- Retry-After honored end-to-end via ZohoBooksClient ---------------------

def _client_with_bucket(handler, bucket):
    return ZohoBooksClient(
        auth_blob={"access_token": "tok", "access_token_expires_at": time.time() + 3600},
        api_domain="https://api.test",
        organization_id="org1",
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        rate_limiter=bucket,
    )


@pytest.mark.asyncio
async def test_client_429_retry_after_backs_off_rate_limiter():
    bucket = TokenBucket(rate_per_min=6000, burst=5)

    def handler(request):
        return httpx.Response(429, headers={"Retry-After": "0.2"}, json={"code": 429})

    client = _client_with_bucket(handler, bucket)

    # The 429 must still raise (existing retry classification in
    # app.integrations.worker is untouched/preserved).
    with pytest.raises(httpx.HTTPStatusError):
        await client.create_record("items", {"name": "Widget"})

    # But the shared bucket must now be backed off: the NEXT acquire has to
    # wait out the server's Retry-After instead of firing immediately.
    start = time.monotonic()
    await bucket.acquire()
    elapsed = time.monotonic() - start
    assert elapsed >= 0.15


@pytest.mark.asyncio
async def test_client_success_does_not_penalize_bucket():
    bucket = TokenBucket(rate_per_min=6000, burst=5)

    def handler(request):
        return httpx.Response(200, json={"item": {"item_id": "ZI-1"}})

    client = _client_with_bucket(handler, bucket)
    await client.create_record("items", {"name": "Widget"})

    # A normal 200 must not trip the penalty path.
    start = time.monotonic()
    await bucket.acquire()
    elapsed = time.monotonic() - start
    assert elapsed < 0.2
