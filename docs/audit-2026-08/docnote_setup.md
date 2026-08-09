# Changelog — FIRST_TIME_SETUP.md refresh

The existing doc was already extensive, accurate, and beginner-friendly (path A/B/C, secrets,
init_db greenfield/managed logic, troubleshooting, FAQ). Verified against current code and
corrected the following inaccuracies:

1. **Migration head was stale**: doc said "47 migration files, single head
   `047_solidworks_integration`". Current repo has 50 migration files, head is
   `050_rfq_headers_created_by_nullable` (verified via `backend/alembic/versions/`).
   Fixed in section 1.

2. **Secret validation nuance was oversimplified**: doc implied all four required secrets
   (`SECRET_KEY`, `ENCRYPTION_KEY`, `S3_SECRET_KEY`, `POSTGRES_PASSWORD`) hard-fail on a
   weak/low-entropy value only in production, and otherwise "you still need a real random
   value" in dev with no further detail. Actual code (`backend/app/core/config.py`):
   - `SECRET_KEY`'s weak/low-entropy check is a hard `ValueError` in **every** environment
     (`ensure_persistent_secret` field_validator), not gated by `ENVIRONMENT`.
   - `ENCRYPTION_KEY`, `S3_SECRET_KEY`, `POSTGRES_PASSWORD` are required to be non-empty in
     every environment, but a *weak value* (as opposed to missing) is only a logged warning
     outside `ENVIRONMENT=production` — it only becomes a hard failure in production
     (`model_post_init`).
   - Previously undocumented convenience/footgun: if `SECRET_KEY` is left unset in development
     (non-container), the backend auto-generates one and persists it to `backend/.secret_key`,
     with a warning that this value changes on interference with that file and invalidates
     JWTs. Added this to A4 and to the troubleshooting entry.

3. **`/health/detailed` auth-gating was missing**: FAQ previously listed `/health/detailed`
   alongside the public `/health` liveness probe without noting it requires authentication.
   Confirmed via `backend/app/api/api_v1.py` (`Depends(get_current_user)` on
   `GET /health/detailed`) and `backend/app/tests/test_health_auth.py`. Clarified in the FAQ
   that anonymous requests to it correctly 401.

No other factual corrections were needed — paths (`frontend/`, no "BOM and PRD"), the
three-path structure (manual/Docker/desktop installer), the `init_db` greenfield-vs-managed
split, `seed_db.py` behavior, RLS opt-in caveat, frontend real/partial/mock breakdown, and the
troubleshooting/FAQ content all still matched the current code and were left intact.

Nothing else in the file was rewritten; only the sections above were edited in place to
preserve the good existing material.
