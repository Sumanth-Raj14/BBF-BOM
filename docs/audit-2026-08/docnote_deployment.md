# DEPLOYMENT_GUIDE.md refresh — changelog

Verified against current code: backend/app/core/config.py, backend/scripts/init_db.py,
backend/alembic/versions (50 files, head 050_rfq_headers_created_by_nullable),
backend/app/core/backup.py, backend/app/core/tenant_events.py,
backend/app/tests/test_health_auth.py, docker-compose.yml, backend/Dockerfile[.prod],
frontend/Dockerfile, frontend/nginx.conf, .github/workflows/postgres-ci.yml,
.github/workflows/ci.yml, docker/.

## Corrections made (doc was stale vs. current code)

1. **Migration head 047 → 050.** Chain is now 50 files (not 47); head is
   `050_rfq_headers_created_by_nullable`. Updated §5.1, §5.2's numbering-trap
   chain listing, and §11.4.

2. **`postgres-ci.yml`'s `EXPECTED_HEAD` is no longer stale.** The doc claimed
   it was hardcoded to the old `041_zoho_books_sync_tables` head. Current code
   has it correctly set to `050_rfq_headers_created_by_nullable`. Reframed the
   §5.1 and §11.4 language from "this is stale, bump it" to "this is correctly
   in sync today, but must be bumped on every future head migration."

3. **`POSTGRES_PASSWORD` DSN encoding bug is fixed.** `config.py`'s
   `assemble_db_connection` now URL-encodes user/password via
   `urllib.parse.quote` before building the asyncpg DSN. The doc previously
   warned readers to avoid `@ : / #` in the password — that caution is now
   false and was removed from §3.2, §12.4, and the §13 checklist.

4. **Required secrets are stricter than "production only."** `Settings.
   model_post_init` unconditionally raises `ValueError` in *every*
   environment (including local dev) if `POSTGRES_PASSWORD`, `S3_SECRET_KEY`,
   or `ENCRYPTION_KEY` are empty. The doc's §3.1 intro implied this hard-fail
   behavior was production-only; rewrote it to explain the four-secret model
   precisely: three keys required everywhere, `SECRET_KEY` auto-generates
   only in dev outside a container and is a hard `RuntimeError` in production
   or inside any container.

5. **Backup-failure email alerts are fixed, not dead.** `config.py` now
   defines `APP_NAME: str = "Blackbox BOM"` as a real field, so
   `_send_email_alert`'s `settings.APP_NAME` reference no longer raises
   `AttributeError`. The doc's §6.2 defect table listed this as a live
   defect (with the webhook path as the only working channel) — removed it
   from the defect table, added a "fixed since last audit" note, and updated
   §6.3's recommended posture to say both email and webhook channels work.
   Renumbered the remaining defects (physical-backup decrypt mismatch stays
   #1; PITR Windows-unaware is now #2; tar-slip/OOM is #3; webhook HMAC
   weakness is #4) and fixed the internal cross-reference in §6.3 point 4
   (was "defect #3", now "defect #2").

6. **`GET /api/v1/health/detailed` is now auth-gated.** Confirmed via
   `backend/app/tests/test_health_auth.py`: unauthenticated requests now get
   401/403, and the endpoint no longer echoes fabricated hardcoded
   `"security"`/`"authentication"` status blocks. The doc's §10.1 table
   previously listed both `/health` and `/health/detailed` under a vague
   "Per router config" auth column with no mention of this fix — split them
   into two rows and documented the fix, including advice to give any
   external monitor a real session/API key.

7. **The ORM SELECT tenant-isolation auto-filter is fixed, not dead code.**
   `app/core/tenant_events.py` previously read the nonexistent
   `execute_state.mapper_` (swallowed `AttributeError`, silent no-op, cross-
   tenant read leak). It now uses the correct `execute_state.bind_mapper` and
   is deliberately left unwrapped by try/except so a future SQLAlchemy
   attribute move fails loudly instead of silently disabling isolation. This
   was a headline claim in the doc's §12.2 ("dead code... contributes
   nothing today") — rewrote the section to describe the fix, keep the
   legitimate remaining gaps (raw `text()` SELECTs are logged but not
   blocked; global reference tables sit outside tenant scoping by design),
   and reframe RLS as defense-in-depth on top of a now-working primary layer
   rather than as a backstop for a broken one.

## Sections added / structural changes

- Added a cross-reference row for `docs/audit-2026-08/FIX_COVERAGE.md` /
  `FINDINGS_FULL_SCAN.md` in the "related documents" table at the top, and
  updated the closing footer note to cite the 2026-08 audit refresh and
  migration head 050 instead of the stale "as of 2026-07" line.

## Content preserved unchanged (verified still accurate)

- Deployment models (desktop installer vs. Docker), system requirements,
  build process, `init_db.py` bootstrap strategy (create_all+stamp vs.
  upgrade head), `docker-compose.yml` service topology and required env vars,
  `backend/Dockerfile` / `Dockerfile.prod` details, nginx sample config,
  `BEHIND_PROXY` / CSRF / same-origin guidance, desktop launcher lifecycle
  and known gaps (PITR-on-Windows, `backend.exe` never stamping alembic_version,
  unread postgresql.conf.template), frontend mock/demo-surface inventory,
  multi-worker WebSocket in-process-state caution, repo hygiene note, and the
  pre-production checklist/appendix structure — all cross-checked against
  current code and still correct.

## Notes

- Did not find evidence of a "printPO GST 18%" change or an API-key
  "unique key prefix" change touching anything this deployment guide covers
  (no Dockerfile/compose/env-var/migration/health/backup surface referenced
  them); left those out rather than fabricating a deployment-relevant tie-in.
  They likely belong in DATA_HANDLING.md / PATCHES_APPLIED.md, not here.
- File edited in place only; no other doc or code file touched.
