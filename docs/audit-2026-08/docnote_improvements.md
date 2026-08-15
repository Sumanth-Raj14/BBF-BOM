# Changelog — RECOMMENDED_MAJOR_IMPROVEMENTS.md refresh

Verified against current code (not just the old audit) via direct reads of
`backend/app/core/tenant_events.py`, `backend/app/core/deps.py`,
`backend/app/api/endpoints/routing_api.py`, `backend/app/services/eco_service.py`,
`backend/app/services/email_service.py`, `backend/app/models/part.py`, and the
Alembic versions directory (head = `050_rfq_headers_created_by_nullable`).

## Corrections to stale claims

1. **Migration head:** doc said `047_solidworks_integration`; corrected to
   `050_rfq_headers_created_by_nullable` throughout (Improvement #6 intro,
   status header, Appendix note).
2. **Appendix A6 / tenant_events.py fix already shipped:** the doc's Improvement
   #6 item 6 and Appendix A6 described the `execute_state.mapper_` dead-code bug
   as still open. Direct read shows it is fixed — the file now reads
   `execute_state.bind_mapper` with an inline `# SECURITY` comment. Marked both
   as FIXED rather than leaving them as open recommendations; kept the record
   (not deleted) so the roadmap shows what shipped.
3. **Migration #6 item 3 (check-constraint parity) and item 8 (FK indexing)
   already landed:** `048_index_foreign_keys` (30 FK columns) and
   `049_restore_check_constraints` (85 model-declared CHECK constraints,
   added NOT VALID) both exist and match what the doc had recommended as
   future work. Marked DONE, with the remaining verification step (confirm the
   specific InventoryTransaction/InventoryReservation set matches) called out
   as the only open piece.
4. **Cascade-correction migration mislabeled `048`:** that number is now taken
   by the FK-index migration above, so the doc's "migration 048" cascade fix
   was renumbered to "next head after 050" and confirmed still NOT done —
   `parts.primary_vendor_id` is still `ondelete="CASCADE"` in
   `app/models/part.py` today.
5. **CI `EXPECTED_HEAD` claimed stale ("`041_...` vs real head `047_...`"):**
   checked `.github/workflows/postgres-ci.yml` — it is currently
   `050_rfq_headers_created_by_nullable`, correctly matching the real head.
   Corrected the doc to say the hardcoded-string *maintenance burden* is the
   issue, not that it is presently wrong (it isn't).
6. **eco_approvals creation:** FIX_COVERAGE.md's deferred list says "nothing
   creates eco_approvals rows" — checked `eco_service.py` directly and this is
   now false: `perform_eco_action`'s `"approve"` branch creates a real
   `EcoApproval` row with a computed `approval_order`. Documented this as
   fixed inside Improvement #1's backend-items list (item 4), while noting the
   queue-drain problem (`process_notification_queue` has no scheduler/caller)
   remains genuinely open — confirmed via grep that only the definition exists,
   no caller anywhere in the backend.
7. **Routing read-scoping still open:** confirmed `routing_api.py`'s
   `list_process_plans`/`get_process_plan` raw SQL reads have no tenant
   filter (writes in the same file are correctly scoped). Added as
   Improvement #6 step 1b and Improvement #1 backend item 5, matching the
   `FIX_COVERAGE.md` deferred note verbatim.

## Additions (new content per spec)

- **New Improvement #9 — "Close the Genuinely-Missing PLM Feature Gaps"**,
  with 5 sub-items (9a–9e), each carrying the full Problem / Why it matters /
  Current limitation / Recommended solution / Benefits / Risks / Effort /
  Priority / Dependencies template:
  - 9a Effectivity (date/serial/lot) on BOM lines — Critical/High
  - 9b Multi-UOM with conversion — Medium
  - 9c Real CSV/XLSX bulk import — High
  - 9d Non-SolidWorks CAD connectors (Fusion 360/Onshape/Altium) — High
  - 9e Requirements management — High
  Grounded in `frontend/OPENBOM_GAP_ANALYSIS.md`'s per-domain scoreboards and
  its Phase 8c "genuinely new work" list.
- Updated Table of Contents, Priority & Dependency scoreboard table, and the
  Mermaid dependency graph to include #9 (drawn with only soft/dotted edges,
  since it's independent new work, not a rewire gated on #1–#8).
- Added Appendix B rows for `docs/audit-2026-08/FINDINGS_FULL_SCAN.md`,
  `docs/audit-2026-08/FIX_COVERAGE.md`, and `frontend/OPENBOM_GAP_ANALYSIS.md`
  as the grounding sources for the corrections and for #9.
- Rewrote the "Final word" closing paragraph to reflect the mixed
  done/still-open state instead of presenting everything as 100% outstanding.
- Rewrote the doc's status/scope/grounding header block to state the current
  Alembic head, acknowledge partial completion honestly, and cross-reference
  all 8 sibling docs by filename per the task's cross-reference requirement.

## Preserved

All of Improvements #1–#8's still-accurate content (the MOCK/PARTIAL wiring
tables, the window.* migration plan, the OpenAPI-typed-client plan, state
management consolidation, performance work, the remaining #6 items that are
genuinely still open, the E2E/CI plan, and code-signing/auto-update hardening)
was left intact — verified nothing else in those sections contradicted current
code during spot checks.
