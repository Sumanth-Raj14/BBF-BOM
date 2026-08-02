"""Regression tests for audit finding A13 — WebSocket per-IP rate limiting.

Three compounding weaknesses in the /ws/{channel} limiter:

1. The in-memory fallback called `_ws_rate_limit.clear()` once
   `_WS_RATE_LIMIT_MAX_IPS` IPs were tracked. Every tracked IP's window was
   reset, so an attacker cycling source IPs past the cap could wipe the
   counters for *everyone* on demand and disable the limit.
2. The endpoint read `websocket.client.host` directly. Behind a reverse proxy
   every user shares the proxy's address, so the 30/min cap became a global
   cap and one user could lock everybody out.
3. The Redis path used `int(time.time())` as BOTH the sorted-set score and the
   member. Connections landing in the same second wrote the identical member,
   collapsing into one entry — a burst counted as a single attempt.

The in-memory path runs whenever Redis is absent, which is the case here, so
it is exercised directly. The Redis path is exercised against a minimal fake
sorted set rather than a live server.
"""

import inspect

import pytest

from app import main
from app.core.client_ip import get_client_ip
from app.main import (
    _WS_RATE_LIMIT_MAX_IPS,
    _WS_RATE_LIMIT_PER_MINUTE,
    _WS_RATE_LIMIT_WINDOW,
    _check_ws_rate_limit,
    _check_ws_redis_rate_limit,
    _ws_rate_limit,
)


@pytest.fixture(autouse=True)
def _isolated_limiter(monkeypatch):
    """Empty limiter table, and no Redis, so the in-memory path is taken."""

    async def _no_redis():
        return None

    monkeypatch.setattr("app.core.cache.get_redis", _no_redis)
    _ws_rate_limit.clear()
    yield
    _ws_rate_limit.clear()


# ── Weakness: the per-minute cap itself ────────────────────────────────────


async def test_cap_allows_exactly_the_budget_then_blocks():
    for i in range(_WS_RATE_LIMIT_PER_MINUTE):
        assert await _check_ws_rate_limit("198.51.100.1") is True, f"attempt {i} blocked early"
    assert await _check_ws_rate_limit("198.51.100.1") is False


async def test_cap_is_per_ip_not_global():
    for _ in range(_WS_RATE_LIMIT_PER_MINUTE + 1):
        await _check_ws_rate_limit("198.51.100.1")
    assert await _check_ws_rate_limit("198.51.100.2") is True


async def test_expired_timestamps_free_the_budget_again():
    _ws_rate_limit["198.51.100.3"] = [0.0] * _WS_RATE_LIMIT_PER_MINUTE  # epoch = long expired
    assert await _check_ws_rate_limit("198.51.100.3") is True


async def test_unknown_ip_is_not_rate_limited():
    # Un-resolvable peers all collapse to "unknown"; limiting that would be a
    # shared bucket, i.e. the very bug fixed in weakness 2.
    for _ in range(_WS_RATE_LIMIT_PER_MINUTE * 2):
        assert await _check_ws_rate_limit("unknown") is True
    assert "unknown" not in _ws_rate_limit


# ── Weakness 1: filling the IP table must not reset live windows ───────────


async def test_filling_the_ip_table_preserves_an_active_ip_window():
    """The core of weakness 1.

    Fill the table to capacity with older IPs, exhaust one victim's budget last
    (so the victim is the most-recently-active entry), then force an eviction by
    introducing a brand new IP. The old `clear()` wiped the victim's window and
    handed the attacker — and the victim — a fresh budget.
    """
    victim = "203.0.113.9"
    for i in range(_WS_RATE_LIMIT_MAX_IPS - 1):
        assert await _check_ws_rate_limit(f"10.{i // 65536}.{i // 256 % 256}.{i % 256}") is True

    for _ in range(_WS_RATE_LIMIT_PER_MINUTE):
        assert await _check_ws_rate_limit(victim) is True
    assert await _check_ws_rate_limit(victim) is False
    assert len(_ws_rate_limit) == _WS_RATE_LIMIT_MAX_IPS

    # Attacker's fresh IP: allowed, and it must evict someone — but not the
    # victim, who is the most recently active entry.
    assert await _check_ws_rate_limit("192.0.2.77") is True
    assert len(_ws_rate_limit) <= _WS_RATE_LIMIT_MAX_IPS
    assert victim in _ws_rate_limit
    assert len(_ws_rate_limit[victim]) >= _WS_RATE_LIMIT_PER_MINUTE
    assert await _check_ws_rate_limit(victim) is False, (
        "eviction reset an active IP's window — cycling source IPs disables the limit"
    )


async def test_eviction_reclaims_expired_entries_and_spares_live_ones():
    """Expired IPs are reclaimed wholesale; a live window is left alone."""
    for i in range(_WS_RATE_LIMIT_MAX_IPS - 1):
        _ws_rate_limit[f"10.1.{i // 256}.{i % 256}"] = [0.0]  # epoch = expired
    live = "203.0.113.20"
    for _ in range(_WS_RATE_LIMIT_PER_MINUTE):
        assert await _check_ws_rate_limit(live) is True

    assert await _check_ws_rate_limit("192.0.2.78") is True
    assert set(_ws_rate_limit) == {live, "192.0.2.78"}
    assert len(_ws_rate_limit[live]) == _WS_RATE_LIMIT_PER_MINUTE
    assert await _check_ws_rate_limit(live) is False


# ── Weakness 2: honour the proxy instead of the peer address ───────────────


class _FakeWebSocket:
    """Duck-types the bits of starlette's WebSocket that get_client_ip touches."""

    def __init__(self, peer, headers=None):
        self.client = type("C", (), {"host": peer})()
        self.headers = headers or {}


def test_get_client_ip_distinguishes_users_behind_a_proxy(monkeypatch):
    monkeypatch.setattr(main.settings, "BEHIND_PROXY", True)
    proxy = "10.0.0.1"
    a = _FakeWebSocket(proxy, {"X-Forwarded-For": "203.0.113.10, 10.0.0.1"})
    b = _FakeWebSocket(proxy, {"X-Forwarded-For": "203.0.113.11"})

    assert get_client_ip(a) == "203.0.113.10"
    assert get_client_ip(b) == "203.0.113.11"


def test_get_client_ip_ignores_spoofed_headers_without_a_proxy(monkeypatch):
    monkeypatch.setattr(main.settings, "BEHIND_PROXY", False)
    ws = _FakeWebSocket("198.51.100.5", {"X-Forwarded-For": "1.2.3.4"})
    assert get_client_ip(ws) == "198.51.100.5"


def test_ws_endpoint_resolves_the_ip_through_get_client_ip():
    """Source-level: the endpoint needs a live WS handshake to exercise."""
    source = inspect.getsource(main.websocket_endpoint)
    code = "\n".join(l for l in source.splitlines() if not l.lstrip().startswith("#"))
    assert "get_client_ip(websocket)" in code
    assert "websocket.client.host" not in code, (
        "the WS endpoint must not read the peer address directly — it ignores the proxy"
    )


# ── Weakness 3: Redis entries must not collapse within one second ──────────


class _FakePipeline:
    def __init__(self, store):
        self._store = store
        self._ops = []

    def zremrangebyscore(self, key, lo, hi):
        self._ops.append(("zremrangebyscore", key, lo, hi))

    def zcard(self, key):
        self._ops.append(("zcard", key))

    def zadd(self, key, mapping):
        self._ops.append(("zadd", key, dict(mapping)))

    def expire(self, key, seconds):
        self._ops.append(("expire", key, seconds))

    async def execute(self):
        results = []
        for op in self._ops:
            zset = self._store.setdefault(op[1], {})
            if op[0] == "zremrangebyscore":
                stale = [m for m, s in zset.items() if op[2] <= s <= op[3]]
                for m in stale:
                    del zset[m]
                results.append(len(stale))
            elif op[0] == "zcard":
                results.append(len(zset))
            elif op[0] == "zadd":
                zset.update(op[2])
                results.append(len(op[2]))
            else:
                results.append(True)
        self._ops = []
        return results


class _FakeRedis:
    def __init__(self):
        self.zsets = {}

    def pipeline(self):
        return _FakePipeline(self.zsets)


@pytest.fixture
def fake_redis(monkeypatch):
    redis = _FakeRedis()

    async def _get_redis():
        return redis

    monkeypatch.setattr("app.core.cache.get_redis", _get_redis)
    # Freeze the clock: every attempt lands in the same second, which is exactly
    # the case the int(time.time()) member collapsed into one entry.
    monkeypatch.setattr(main.time, "time", lambda: 1_700_000_000.0)
    return redis


async def test_redis_counts_every_attempt_within_the_same_second(fake_redis):
    for i in range(_WS_RATE_LIMIT_PER_MINUTE):
        assert await _check_ws_redis_rate_limit("198.51.100.7") is True, f"attempt {i} blocked early"
    assert await _check_ws_redis_rate_limit("198.51.100.7") is False

    # One member per attempt, including the rejected one (it is recorded before
    # the count is evaluated). With the old int(time.time()) member they all
    # shared a key and the set never grew past 1.
    key = f"{main._WS_RATE_LIMIT_REDIS_PREFIX}198.51.100.7"
    assert len(fake_redis.zsets[key]) == _WS_RATE_LIMIT_PER_MINUTE + 1, (
        "same-second attempts collapsed into fewer sorted-set members"
    )


async def test_redis_scores_are_floats_so_the_window_slides(fake_redis):
    await _check_ws_redis_rate_limit("198.51.100.8")
    key = f"{main._WS_RATE_LIMIT_REDIS_PREFIX}198.51.100.8"
    (score,) = fake_redis.zsets[key].values()
    assert isinstance(score, float)
    assert score == pytest.approx(1_700_000_000.0)
    # The trim range must be the sliding window, not "everything before now".
    assert _WS_RATE_LIMIT_WINDOW == 60.0
