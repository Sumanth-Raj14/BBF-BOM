# Changelog — PATCHES_APPLIED.md refresh (2026-08-09)

## What changed

- Preserved the entire existing 2026-07-19 fix-cycle record (sections 1-8) verbatim — it was still accurate against current code and did not describe anything superseded.
- Updated the document's opening scope blurb to describe *two* fix cycles (07-19 and 08-02) instead of one, and added a cross-reference to `docs/audit-2026-08/` and `frontend/OPENBOM_GAP_ANALYSIS.md`.
- Added TOC entry and appended a new top-level **Section 9 — "2026-08-02 — Full-repo scan fix campaign"** covering all 43 findings fixed in that campaign, grouped by the 4 fix commits named in the task (`c6d4565`, `dbcab0d`, `12f0736`, `d351863`), further sub-grouped by the same file-level clusters the underlying `docs/audit-2026-08/fix_*.md` / `fix2_*.md` / `fixfe_*.md` write-ups used (tenant-security, infra-secrets-health, migrations-ci-build, schema-gates, final-polish, power-features, ModalsHost, AppCtx, auth-onboarding, bom-editor-screen, low-trio, tenant-insert-valuation, bom-integrity, api-key-security, plus the 3-file doc-corrections commit).
- Each cluster documents Problem / Root cause / Impact / Files modified / Reason for change / Previous behaviour / New behaviour / Risk level / Testing performed, matching the spec's requested template, plus a per-commit "full finding-level ledger" table mapping every one of the 43 fixed findings (by file:line) back to `FIX_COVERAGE.md`, so nothing in the 43 is undocumented even though clusters (not individual one-line findings) are the unit of write-up — matching how the fix agents themselves organized the work.
- Added a new Mermaid flowchart showing the 5-commit sequence (scan → 4 fix commits → ledger commit) for section 9.
- Added section 9.5 — an explicit, non-fabricated list of what the campaign deliberately did NOT fix (the 31 deferred findings), split into "dead layer, safe but unreached" vs "needs a design decision," cross-referencing `FIX_COVERAGE.md` and `OPENBOM_GAP_ANALYSIS.md` so the document doesn't imply more got fixed than actually did.
- Added a short "Update, 2026-08-02" note directly under the old section 8's residual-issues table, since two of its rows (part of "Mock inventory" and part of "CI") were partially addressed by the new campaign — pointed forward to section 9 rather than silently editing the historical section 8 record.

## Corrections made vs. what an 8-month-stale doc would have implied

- Migration head is `050_rfq_headers_created_by_nullable` (not 049) — this migration itself is one of the fixes documented (schema-gates cluster, section 9.1.4) and is now correctly identified as the current Alembic head.
- `/health/detailed` is now auth-gated (was previously open — documented as still-open in the old section 8 table; superseded, noted with a forward-pointer rather than deleted, since section 8 is a historical record of the 07-19 cycle's *known-issues-at-the-time* list).
- API keys no longer share a single collision-prone prefix; plugin-login now enforces scope.
- CI `test-backend` job (flagged broken in the old section 8 "CI" row) was deleted in favor of the already-correct `postgres-ci.yml` gate — documented in 9.1.3.
- `printPO`'s GST tax math (8% computed vs. 18% labeled) and its fabricated vendor/cost/signatory fallbacks are now fixed — this generalizes/supersedes nothing in the old doc (07-19 cycle didn't touch this file) but is new, accurate content.
- Did not touch or reinterpret anything in sections 1-8; verified against `git log --oneline -12` and the actual `docs/audit-2026-08/*.md` write-ups rather than assuming FIX_COVERAGE.md's one-line summaries were complete.

## Notes

- Only `PATCHES_APPLIED.md` was edited. No other files, code, or git operations were touched.
- Section 9 organizes by cluster (not literally all 43 one-line findings as separate template blocks) because many findings in the same file share one root cause and one diff — this matches how the source `fix_*.md` files themselves were organized. Full traceability to all 43 individual findings is preserved via the per-commit ledger tables (file:line, reproduced from `FIX_COVERAGE.md`).
- File is now ~1026 lines, 10 top-level sections (added 1), 6 Mermaid diagrams (added 1).
