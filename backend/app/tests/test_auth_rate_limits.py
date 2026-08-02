"""Token refresh must not share the login rate-limit budget.

/auth/refresh carried @limiter.limit(RATE_LIMIT_AUTH_PER_MINUTE) — the same
5/minute allowance as /auth/login. Login is unauthenticated and a brute-force
target, so 5/minute is right for it. Refresh is authenticated session upkeep
that the client fires automatically whenever an access token expires, so two
tabs or a few reloads exhausted the budget and the resulting 429 reached users
as "Save failed — not synced to server ... Session temporarily unavailable".

Asserted at the configuration/decorator level because the test conftest raises
both limits to 100000, which would mask the difference at runtime.
"""

import inspect

from app.api.endpoints import auth as auth_endpoint
from app.core.config import Settings


def _default(name):
    """Declared default, not the live value.

    conftest exports RATE_LIMIT_AUTH_PER_MINUTE=100000 so unrelated tests are
    not throttled, so reading Settings() here would assert the test override
    rather than what ships.
    """
    return Settings.model_fields[name].default


def test_refresh_has_its_own_limit_and_it_is_larger_than_login():
    assert _default("RATE_LIMIT_REFRESH_PER_MINUTE") > _default(
        "RATE_LIMIT_AUTH_PER_MINUTE"
    ), (
        "refresh must be more permissive than login: it is routine session "
        "upkeep, not a password guess"
    )


def test_login_stays_strict():
    # Guards the other direction — 'fixing' the 429 by loosening LOGIN would
    # weaken brute-force protection.
    assert _default("RATE_LIMIT_AUTH_PER_MINUTE") <= 10


def test_refresh_endpoint_uses_the_refresh_budget():
    src = inspect.getsource(auth_endpoint)
    marker = src.index('@router.post("/refresh"')
    decorators = src[marker : marker + 400]
    assert "RATE_LIMIT_REFRESH_PER_MINUTE" in decorators, (
        "/auth/refresh must be limited by RATE_LIMIT_REFRESH_PER_MINUTE"
    )
    assert "RATE_LIMIT_AUTH_PER_MINUTE" not in decorators, (
        "/auth/refresh must not use the login budget"
    )


def test_login_endpoint_still_uses_the_login_budget():
    src = inspect.getsource(auth_endpoint)
    marker = src.index('@router.post("/login")')
    assert "RATE_LIMIT_AUTH_PER_MINUTE" in src[marker : marker + 300]
