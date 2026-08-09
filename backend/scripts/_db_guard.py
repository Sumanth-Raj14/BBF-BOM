"""Safety rail for destructive/seeding scripts.

INCIDENT (2026-08-09): scripts/seed_e2e_fixture.py wrote test fixtures and
reset a user's password against the LIVE Postgres database because the URL
resolution it relied on (app.db.session) ignored DATABASE_URL/TEST_DATABASE_URL.
That resolution is now fixed (see app/db/session.resolve_database_url), but a
misconfigured environment can still legitimately resolve to a real-looking
Postgres URL. Any script that writes fixture/test data or resets credentials
must call `require_non_production_db()` before touching the database.
"""
from __future__ import annotations

import os
import re

from app.db.session import redact_url, resolve_database_url

_TEST_MARKERS = ("test", "e2e", "scratch", "sweep")
# Markers must appear as their own alnum-delimited token (e.g. "bom_test_db",
# "e2e-fixtures"), not merely as a substring of some other word. A naive
# `marker in name` check would wrongly wave through a plausible production
# name like "bomtest_prod" (contains "test" as a substring of "bomtest") or
# "attestation_prod" ("test" inside "attestation"). Underscore/hyphen count
# as separators; letters/digits do not.
_MARKER_RE = re.compile(
    r"(?<![a-z0-9])(" + "|".join(_TEST_MARKERS) + r")(?![a-z0-9])",
    re.IGNORECASE,
)


def _looks_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes", "on")


def require_non_production_db(url: str | None = None) -> str:
    """Raise unless the resolved DB URL is safe for destructive test/seed writes.

    Allowed:
      - any sqlite URL
      - a Postgres (or other) URL whose database name contains an obvious
        test marker: "test", "e2e", "scratch", "sweep"
      - ALLOW_SEED_ON_LIVE_DB set to an explicit truthy value (opt-in override)

    Returns the resolved URL (so callers don't have to resolve it twice).
    """
    url = url or resolve_database_url()
    db_name = url.rsplit("/", 1)[-1].split("?", 1)[0]

    if url.startswith("sqlite"):
        return url
    if _MARKER_RE.search(db_name):
        return url
    if _looks_truthy(os.environ.get("ALLOW_SEED_ON_LIVE_DB")):
        return url

    raise RuntimeError(
        f"Refusing to run against database '{db_name}' ({redact_url(url)}): "
        "it does not look like a test/e2e database (not sqlite, and its name "
        "has no test/e2e/scratch/sweep marker). This script writes fixture "
        "data and/or resets credentials — running it here would corrupt real "
        "data (see the 2026-08-09 incident). "
        "If this really is a throwaway database, set "
        "ALLOW_SEED_ON_LIVE_DB=true to override."
    )
